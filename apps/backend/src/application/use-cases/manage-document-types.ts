import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  ClinicalDocumentStore,
  ClinicalDocumentTransaction,
  DocumentTypeVersion,
} from '../ports/clinical-documents'
import type {
  SignatureLevel,
  SignatureProvider,
} from '../ports/signature-provider'

const view = (type: DocumentTypeVersion) => ({
  id: type.typeId,
  code: type.code,
  label: type.label,
  version: type.version,
  requiredSignatureLevel: type.requiredSignatureLevel,
  templateVersion: type.templateVersion,
  active: type.active,
  source: type.changedBy ? 'admin' : 'seed',
  changedBy: type.changedBy,
  changedAt: type.createdAt.toISOString(),
})
export class ManageDocumentTypes {
  constructor(
    private readonly store: ClinicalDocumentStore,
    private readonly provider: SignatureProvider,
    private readonly audit: AuditWriter,
    private readonly now = () => new Date(),
  ) {}
  private async actor(
    tx: ClinicalDocumentTransaction,
    actor: Principal,
    admin = false,
  ) {
    const current = await tx.principal(actor)
    if (
      !current ||
      !mayAccess(current, admin ? 'admin_users' : 'document_types')
    )
      throw new ApplicationError('FORBIDDEN')
    if (!current.roles.includes('admin') && !(await tx.professional(current)))
      throw new ApplicationError('FORBIDDEN')
    return current
  }
  private async run<T>(
    actor: Principal,
    id: string,
    context: AuditContext,
    run: (tx: ClinicalDocumentTransaction) => Promise<T>,
  ) {
    try {
      return await this.store.transaction(run)
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
          resourceType: 'DocumentType',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  list(actor: Principal, active: boolean | undefined, context: AuditContext) {
    return this.run(actor, actor.userId, context, async (tx) => {
      const current = await this.actor(tx, actor),
        rows = await tx.documentTypes(),
        admin = current.roles.includes('admin')
      await tx.audit.append({
        ...context,
        actorUserId: current.userId,
        actorRoles: current.roles,
        action: 'document.types_read',
        resourceType: 'DocumentType',
        resourceId: current.userId,
        authorizationBasis: admin ? 'admin' : 'professional',
        metadata: { count: rows.length },
      })
      return {
        items: rows
          .filter(({ type }) => active === undefined || type.active === active)
          .map(({ type, history }) => ({
            ...view(type),
            ...(admin
              ? {
                  history: history.map((t) => ({
                    ...view(t),
                    reason: t.reason,
                  })),
                }
              : {}),
          })),
        provider: {
          kind: this.provider.kind,
          developmentOnly: this.provider.developmentOnly,
          legalValidity: false,
        },
      }
    })
  }
  change(
    actor: Principal,
    id: string,
    input: {
      expectedVersion: number
      requiredSignatureLevel: SignatureLevel
      templateVersion: string
      active: boolean
      reason: string
    },
    context: AuditContext,
  ) {
    return this.run(actor, id, context, async (tx) => {
      await this.actor(tx, actor, true)
      await tx.lockDocumentType(id)
      const type = await tx.documentType(id)
      if (!type) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (type.version !== input.expectedVersion)
        throw new ApplicationError('CONFLICT')
      const reason = input.reason.trim()
      if (!reason || reason.length > 1000)
        throw new ApplicationError('VALIDATION_ERROR')
      const next = await tx.changeDocumentType(
        type,
        actor.userId,
        { ...input, reason },
        this.now(),
      )
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'document.type_changed',
        resourceType: 'DocumentType',
        resourceId: id,
        authorizationBasis: 'admin',
        metadata: { version: next.version },
      })
      return view(next)
    })
  }
}
