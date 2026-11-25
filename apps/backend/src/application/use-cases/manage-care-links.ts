import { mayAccess, type Principal } from '../../domain/rules/access'
import { type CareLinkPolicy, carePhase } from '../../domain/rules/care-link'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  CareLinkQuery,
  CareLinkRecord,
  CareLinkStore,
  CareLinkTransaction,
  ClinicalBasis,
} from '../ports/care-links'
export const careLinkSummary = (row: CareLinkRecord, status = row.status) => ({
  id: row.id,
  patientId: row.patientId,
  professionalId: row.professionalId,
  source: row.source,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  status,
})
export class ManageCareLinks {
  constructor(
    private readonly store: CareLinkStore,
    private readonly audit: AuditWriter,
    readonly policy: CareLinkPolicy,
    private readonly now = () => new Date(),
  ) {}
  private async actor(
    tx: CareLinkTransaction,
    actor: Principal,
    manager = false,
  ) {
    const current = await tx.principal(actor)
    if (
      !current ||
      !mayAccess(current, manager ? 'grant_substitution' : 'clinical_actor')
    )
      throw new ApplicationError('FORBIDDEN')
    const professional = manager ? null : await tx.professional(current)
    if (!manager && !professional) throw new ApplicationError('FORBIDDEN')
    return { current, professional }
  }
  private phase(row: CareLinkRecord, now: Date): ClinicalBasis['phase'] | null {
    if (row.status !== 'active' || now < row.startsAt || now >= row.endsAt)
      return null
    if (row.source === 'appointment') {
      if (
        !row.appointment ||
        row.appointment.professionalId !== row.professionalId ||
        row.appointment.patientId !== row.patientId
      )
        return null
      return carePhase(row.appointment, this.policy, now)
    }
    if (
      row.source === 'shared_case' &&
      (!row.parent ||
        row.parent.patientId !== row.patientId ||
        row.parent.source !== 'appointment' ||
        !this.phase(row.parent, now) ||
        this.phase(row.parent, now) === 'pre')
    )
      return null
    return 'post'
  }
  async basis(
    tx: CareLinkTransaction,
    actor: Principal,
    patientId: string,
    appointmentId?: string,
  ): Promise<ClinicalBasis> {
    const { professional } = await this.actor(tx, actor)
    if (!professional) throw new ApplicationError('FORBIDDEN')
    const now = this.now(),
      links = await tx.links(professional.id, patientId)
    const candidates = links.flatMap((row) => {
      if (
        appointmentId &&
        (row.source !== 'appointment' ||
          row.sourceAppointmentId !== appointmentId)
      )
        return []
      const phase = this.phase(row, now)
      return phase
        ? [
            {
              id: row.id,
              professionalId: professional.id,
              patientId,
              phase,
              expiresAt: row.endsAt,
              source: row.source,
            },
          ]
        : []
    })
    candidates.sort(
      (a, b) =>
        ({ during: 0, post: 1, pre: 2 })[a.phase] -
          { during: 0, post: 1, pre: 2 }[b.phase] ||
        b.expiresAt.getTime() - a.expiresAt.getTime(),
    )
    if (!candidates[0]) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    return candidates[0]
  }
  async authorize(
    actor: Principal,
    patientId: string,
    context: AuditContext,
    operation = 'clinical.access_checked',
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        const basis = await this.basis(tx, actor, patientId)
        await tx.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: operation,
          resourceType: 'PatientProfile',
          resourceId: patientId,
          subjectPatientId: patientId,
          authorizationBasis: `care_link:${basis.id}`,
          metadata: { scope: basis.phase },
        })
        return basis
      })
    } catch (error) {
      return this.denied(actor, context, patientId, error)
    }
  }
  private async denied(
    actor: Principal,
    context: AuditContext,
    resourceId: string,
    error: unknown,
  ): Promise<never> {
    if (
      error instanceof ApplicationError &&
      ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN'].includes(error.code)
    )
      await this.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'authorization.denied',
        resourceType: 'CareLink',
        resourceId,
        authorizationBasis: 'denied',
      })
    throw error
  }
  async list(actor: Principal, query: CareLinkQuery, context: AuditContext) {
    try {
      return await this.store.transaction(async (tx) => {
        const { current, professional } = await this.actor(tx, actor)
        if (!professional) throw new ApplicationError('FORBIDDEN')
        const now = this.now()
        const page = await tx.page(professional.id, query, now)
        const items = page.items.map((row) =>
          careLinkSummary(
            row,
            row.status === 'revoked' ||
              (row.source === 'appointment' &&
                row.appointment?.status === 'cancelled')
              ? 'revoked'
              : this.phase(row, now)
                ? 'active'
                : now < row.startsAt
                  ? 'scheduled'
                  : 'expired',
          ),
        )
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: 'care_link.listed',
          resourceType: 'CareLink',
          resourceId: professional.id,
          authorizationBasis: 'professional_self',
          metadata: { count: Math.min(items.length, 30) },
        })
        return {
          items: items.slice(0, 30),
          nextCursor: page.nextCursor,
        }
      })
    } catch (error) {
      return this.denied(actor, context, actor.userId, error)
    }
  }
  async grant(
    actor: Principal,
    input: {
      patientId: string
      targetProfessionalId: string
      reason: string
      endsAt: string
      startsAt?: string
    },
    context: AuditContext,
    substitution = false,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        const { current, professional } = await this.actor(
            tx,
            actor,
            substitution,
          ),
          now = this.now()
        await tx.lock(input.patientId)
        if (
          !(await tx.target(input.targetProfessionalId)) ||
          !(await tx.patientExists(input.patientId))
        )
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        let parent: CareLinkRecord | undefined
        if (!substitution) {
          if (
            !this.policy.sharedCaseEnabled ||
            !professional ||
            professional.id === input.targetProfessionalId
          )
            throw new ApplicationError('FORBIDDEN')
          parent = (await tx.links(professional.id, input.patientId))
            .filter(
              (row) =>
                row.source === 'appointment' &&
                this.phase(row, now) &&
                this.phase(row, now) !== 'pre',
            )
            .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0]
          if (!parent) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        }
        const startsAt =
            substitution && input.startsAt ? new Date(input.startsAt) : now,
          endsAt = new Date(input.endsAt)
        if (
          !input.reason.trim() ||
          input.reason.trim().length > 1000 ||
          !Number.isFinite(startsAt.getTime()) ||
          !Number.isFinite(endsAt.getTime()) ||
          startsAt < now ||
          endsAt <= startsAt ||
          (parent && endsAt > parent.endsAt)
        )
          throw new ApplicationError('VALIDATION_ERROR')
        const row = await tx.grant({
          patientId: input.patientId,
          professionalId: input.targetProfessionalId,
          source: substitution ? 'substitution' : 'shared_case',
          parentLinkId: parent?.id ?? null,
          startsAt,
          endsAt,
          reason: input.reason.trim(),
          grantedBy: current.userId,
        })
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: substitution ? 'care_link.substituted' : 'care_link.shared',
          resourceType: 'CareLink',
          resourceId: row.id,
          subjectPatientId: row.patientId,
          authorizationBasis: parent
            ? `care_link:${parent.id}`
            : 'manager_grant',
          metadata: { source: row.source },
        })
        return careLinkSummary(row)
      })
    } catch (error) {
      return this.denied(actor, context, input.patientId, error)
    }
  }
  reconcile(context: AuditContext) {
    return this.store.reconcile(context)
  }
}
