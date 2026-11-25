import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  EmergencyAccessStore,
  EmergencyAccessTransaction,
  EmergencyGrant,
  EmergencyQuery,
  EmergencyReviewOutcome,
} from '../ports/emergency-access'

export function emergencySummary(row: EmergencyGrant, now: Date) {
  return {
    grantId: row.id,
    patientId: row.patientId,
    professionalId: row.professionalId,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status:
      row.review?.outcome === 'rejected'
        ? 'revoked'
        : now >= row.expiresAt
          ? 'expired'
          : 'active',
    reviewed: !!row.review,
  }
}
export class ManageEmergencyAccess {
  constructor(
    private readonly store: EmergencyAccessStore,
    private readonly audit: AuditWriter,
    private readonly durationMinutes: number,
    private readonly now = () => new Date(),
  ) {}
  private async actor(
    tx: EmergencyAccessTransaction,
    actor: Principal,
    review = false,
  ) {
    const current = await tx.principal(actor)
    if (!current || !mayAccess(current, review ? 'audit' : 'clinical_actor'))
      throw new ApplicationError('FORBIDDEN')
    return current
  }
  private async run<T>(
    actor: Principal,
    context: AuditContext,
    resourceId: string,
    action: (tx: EmergencyAccessTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.store.transaction(action)
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
          resourceType: 'EmergencyAccessGrant',
          resourceId,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  request(
    actor: Principal,
    input: { patientId: string; justification: string },
    context: AuditContext,
  ) {
    return this.run(actor, context, input.patientId, async (tx) => {
      const current = await this.actor(tx, actor),
        professional = await tx.professional(current)
      if (!professional) throw new ApplicationError('FORBIDDEN')
      const justification = input.justification.trim()
      if (!justification || justification.length > 1000)
        throw new ApplicationError('VALIDATION_ERROR')
      await tx.lock(input.patientId)
      if (!(await tx.patientExists(input.patientId)))
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const now = this.now(),
        row = await tx.emergencyGrant({
          patientId: input.patientId,
          professionalId: professional.id,
          justification,
          grantedAt: now,
          expiresAt: new Date(+now + this.durationMinutes * 60000),
        })
      const notification = await tx.notifyEmergency(row, context.requestId)
      await tx.audit.append({
        ...context,
        actorUserId: current.userId,
        actorRoles: current.roles,
        action: 'emergency_access.granted',
        resourceType: 'EmergencyAccessGrant',
        resourceId: row.id,
        subjectPatientId: row.patientId,
        authorizationBasis: `emergency_access:${row.id}`,
        metadata: {
          count: notification.count,
          reasonCode: notification.dpoMissing ? 'no_dpo' : 'dpo_notified',
        },
      })
      return { grantId: row.id, expiresAt: row.expiresAt.toISOString() }
    })
  }
  detail(actor: Principal, id: string, context: AuditContext) {
    return this.run(actor, context, id, async (tx) => {
      const current = await tx.principal(actor)
      if (!current) throw new ApplicationError('FORBIDDEN')
      const row = await tx.emergencyById(id),
        reviewer = mayAccess(current, 'audit')
      const professional = mayAccess(current, 'clinical_actor')
        ? await tx.professional(current)
        : null
      if (!row || (!reviewer && row.professionalId !== professional?.id))
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      await tx.audit.append({
        ...context,
        actorUserId: current.userId,
        actorRoles: current.roles,
        action: 'emergency_access.inspected',
        resourceType: 'EmergencyAccessGrant',
        resourceId: id,
        subjectPatientId: row.patientId,
        authorizationBasis: reviewer
          ? 'emergency_reviewer'
          : 'professional_self',
      })
      return {
        ...emergencySummary(row, this.now()),
        justification: row.justification,
        review: row.review
          ? { ...row.review, reviewedAt: row.review.reviewedAt.toISOString() }
          : null,
      }
    })
  }
  list(actor: Principal, query: EmergencyQuery, context: AuditContext) {
    return this.run(actor, context, actor.userId, async (tx) => {
      const current = await this.actor(tx, actor, true),
        page = await tx.emergencyPage(query)
      await tx.audit.append({
        ...context,
        actorUserId: current.userId,
        actorRoles: current.roles,
        action: 'emergency_access.queue_read',
        resourceType: 'EmergencyAccessGrant',
        resourceId: current.userId,
        authorizationBasis: 'emergency_reviewer',
        metadata: { count: page.items.length },
      })
      return {
        items: page.items.map((row) => emergencySummary(row, this.now())),
        nextCursor: page.nextCursor,
      }
    })
  }
  review(
    actor: Principal,
    id: string,
    input: { outcome: EmergencyReviewOutcome; notes: string },
    context: AuditContext,
  ) {
    return this.run(actor, context, id, async (tx) => {
      const current = await this.actor(tx, actor, true),
        notes = input.notes.trim()
      if (
        !notes ||
        notes.length > 1000 ||
        !['approved', 'requires_follow_up', 'rejected'].includes(input.outcome)
      )
        throw new ApplicationError('VALIDATION_ERROR')
      await tx.lockEmergency(id)
      const row = await tx.emergencyById(id)
      if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (row.review) throw new ApplicationError('CONFLICT')
      const review = await tx.reviewEmergency(id, {
        reviewerUserId: current.userId,
        outcome: input.outcome,
        notes,
        reviewedAt: this.now(),
      })
      await tx.audit.append({
        ...context,
        actorUserId: current.userId,
        actorRoles: current.roles,
        action: 'emergency_access.reviewed',
        resourceType: 'EmergencyAccessGrant',
        resourceId: id,
        subjectPatientId: row.patientId,
        authorizationBasis: 'emergency_reviewer',
        metadata: { status: input.outcome },
      })
      return { ...review, reviewedAt: review.reviewedAt.toISOString() }
    })
  }
}
