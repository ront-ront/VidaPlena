import { createHash } from 'node:crypto'
import { mayAccess, type Principal } from '../../domain/rules/access'
import type { TerminologyKind } from '../../domain/rules/terminology'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  TerminologyQuery,
  TerminologySnapshot,
  TerminologyStore,
  TerminologyTransaction,
} from '../ports/terminologies'
import { parseTerminologyCatalog } from '../validation/terminology-catalog'
export class ManageTerminologies {
  constructor(
    private readonly store: TerminologyStore,
    private readonly audit: AuditWriter,
    private readonly environment: string,
  ) {}
  private get allowDemo() {
    return ['development', 'test'].includes(this.environment)
  }
  load(input: unknown, context: AuditContext) {
    if (!this.allowDemo) throw new ApplicationError('FORBIDDEN')
    const dataset = parseTerminologyCatalog(input)
    dataset.entries.sort((a, b) => a.code.localeCompare(b.code, 'en'))
    const checksum = createHash('sha256')
      .update(JSON.stringify(dataset))
      .digest('hex')
    return this.store.transaction(async (tx) => {
      await tx.lockTerminology(dataset.terminology)
      const prior = await tx.catalogVersion(
        dataset.terminology,
        dataset.version,
      )
      if (prior && prior.checksum !== checksum)
        throw new ApplicationError('CONFLICT')
      const catalog = prior ?? (await tx.createCatalog(dataset, checksum))
      await tx.activateCatalog(catalog)
      await tx.audit.append({
        ...context,
        action: 'terminology.loaded',
        resourceType: 'TerminologyCatalog',
        resourceId: catalog.id,
        authorizationBasis: 'development_catalog_loader',
        metadata: { source: 'demo', count: dataset.entries.length },
      })
      return {
        catalogId: catalog.id,
        terminology: catalog.terminology,
        version: catalog.version,
        demo: catalog.demo,
        loadedCount: prior ? 0 : dataset.entries.length,
      }
    })
  }
  async search(
    actor: Principal,
    kind: TerminologyKind,
    query: TerminologyQuery,
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
        const catalog = await tx.activeCatalog(kind, this.allowDemo)
        if (!catalog) {
          if (!this.allowDemo) throw new ApplicationError('SERVICE_UNAVAILABLE')
          return {
            items: [],
            nextCursor: null,
            catalogVersion: null,
            demo: true,
          }
        }
        const page = await tx.terminologyPage(catalog, query)
        return {
          ...page,
          items: page.items.map((item) => ({
            ...item,
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
          resourceType: 'TerminologyCatalog',
          resourceId: kind,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  async snapshot(
    tx: TerminologyTransaction,
    kind: TerminologyKind,
    selection: { code: string; version: string },
  ): Promise<TerminologySnapshot> {
    const catalog = await tx.activeCatalog(kind, this.allowDemo)
    if (!catalog) throw new ApplicationError('SERVICE_UNAVAILABLE')
    if (catalog.version !== selection.version)
      throw new ApplicationError('CONFLICT')
    const row = await tx.terminologyCode(catalog, selection.code)
    if (!row)
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: kind === 'CID10' ? 'diagnosisCodes' : 'tussCode',
          reason: 'Selecione um código ativo do catálogo vigente.',
        },
      ])
    return Object.freeze({
      ...row,
      version: catalog.version,
      source: catalog.source,
      demo: catalog.demo,
    })
  }
  async procedureSnapshot(
    tx: TerminologyTransaction,
    selection: { code: string; version: string } | null,
    privateVisit: boolean,
  ) {
    if (!selection) {
      if (privateVisit) return null
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'tussCode',
          reason: 'Informe um código de procedimento ativo.',
        },
      ])
    }
    return this.snapshot(tx, 'TUSS', selection)
  }
}
