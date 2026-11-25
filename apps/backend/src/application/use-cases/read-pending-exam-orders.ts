import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  ExamOrderStore,
  PendingExamOrderQuery,
} from '../ports/exam-orders'
import { type AuthorizeClinical, clinicalBasisId } from './authorize-clinical'
export class ReadPendingExamOrders {
  constructor(
    private readonly store: ExamOrderStore,
    private readonly authorization: AuthorizeClinical,
    private readonly audit: AuditWriter,
    private readonly thresholdDays: number,
    private readonly now = () => new Date(),
  ) {}
  async list(
    actor: Principal,
    query: PendingExamOrderQuery,
    context: AuditContext,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        const current = await tx.principal(actor)
        if (!current || !mayAccess(current, 'clinical_actor'))
          throw new ApplicationError('FORBIDDEN')
        const professional = await tx.professional(current)
        if (
          !professional ||
          (query.professionalId && query.professionalId !== professional.id)
        )
          throw new ApplicationError('FORBIDDEN')
        const now = this.now(),
          cutoff = new Date(+now - this.thresholdDays * 86400000),
          page = await tx.pendingExamOrders(professional.id, query, cutoff, now)
        for (const row of page.items) {
          const basis = await this.authorization.basis(
            tx,
            current,
            row.patient.id,
          )
          if (basis.phase === 'pre')
            throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
          await tx.audit.append({
            ...context,
            actorUserId: actor.userId,
            actorRoles: current.roles,
            action: 'exam.pending_viewed',
            resourceType: 'ExamOrder',
            resourceId: row.orderId,
            subjectPatientId: row.patient.id,
            authorizationBasis: clinicalBasisId(basis),
          })
        }
        await tx.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: current.roles,
          action: 'exam.pending_listed',
          resourceType: 'ProfessionalProfile',
          resourceId: professional.id,
          authorizationBasis: 'professional_self',
          metadata: { count: page.items.length },
        })
        return {
          ...page,
          thresholdDays: this.thresholdDays,
          asOf: now.toISOString(),
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
          resourceType: 'ExamOrder',
          resourceId: query.cursor ?? actor.userId,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
}
