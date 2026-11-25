import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  MedicationCatalog,
  MedicationQuery,
  MedicationStore,
  MedicationTransaction,
} from '../ports/medications'
import type { CanonicalDocuments } from '../ports/signature-provider'
import { parseMedicationDataset } from '../validation/medication-catalog'
export class ManageMedications {
  constructor(
    private readonly store: MedicationStore,
    private readonly audit: AuditWriter,
    private readonly canonical: CanonicalDocuments,
    private readonly environment: string,
  ) {}
  get allowDemo() {
    return ['development', 'test'].includes(this.environment)
  }
  load(input: unknown, context: AuditContext) {
    if (!this.allowDemo) throw new ApplicationError('FORBIDDEN')
    const data = parseMedicationDataset(input)
    data.entries.sort((a, b) => a.code.localeCompare(b.code, 'en'))
    const checksum = this.canonical.sha256(this.canonical.serialize(data))
    return this.store.transaction(async (tx) => {
      await tx.lockMedications()
      const previous = await tx.medicationCatalogVersion(data.version)
      if (previous && previous.checksum !== checksum)
        throw new ApplicationError('CONFLICT')
      const catalog =
        previous ?? (await tx.createMedicationCatalog(data, checksum))
      await tx.activateMedicationCatalog(catalog)
      await tx.audit.append({
        ...context,
        action: 'medication.catalog_loaded',
        resourceType: 'MedicationCatalog',
        resourceId: catalog.id,
        authorizationBasis: 'development_catalog_loader',
        metadata: { source: 'demo', count: data.entries.length },
      })
      return {
        catalogId: catalog.id,
        version: catalog.version,
        demo: catalog.demo,
        loadedCount: previous ? 0 : data.entries.length,
      }
    })
  }
  async search(
    actor: Principal,
    query: MedicationQuery,
    context: AuditContext,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        const current = await tx.principal(actor)
        if (
          !current ||
          !mayAccess(current, 'clinical_actor') ||
          !(await tx.professional(current))
        )
          throw new ApplicationError('FORBIDDEN')
        const catalog = await tx.activeMedicationCatalog(this.allowDemo)
        if (!catalog) {
          if (!this.allowDemo) throw new ApplicationError('SERVICE_UNAVAILABLE')
          return {
            items: [],
            nextCursor: null,
            catalogVersion: null,
            demo: true,
          }
        }
        const page = await tx.medicationPage(catalog, query)
        return {
          ...page,
          items: page.items.map((row) => ({
            ...row,
            version: catalog.version,
            source: catalog.source,
            demo: catalog.demo,
          })),
          catalogVersion: catalog.version,
          demo: catalog.demo,
        }
      })
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN'].includes(error.code)
      )
        await this.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: 'authorization.denied',
          resourceType: 'MedicationCatalog',
          resourceId: 'medications',
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  async snapshot(
    tx: MedicationTransaction,
    catalog: MedicationCatalog,
    code: string,
    version: string,
    reusing = false,
  ) {
    if (!reusing && catalog.version !== version)
      throw new ApplicationError('CONFLICT')
    const row = await tx.medicationEntry(catalog, code)
    if (!row)
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'items',
          reason: 'Selecione um medicamento ativo do catálogo vigente.',
        },
      ])
    return {
      ...row,
      version: catalog.version,
      source: catalog.source,
      demo: catalog.demo,
    }
  }
}
