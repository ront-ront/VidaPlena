import { mayAccess, type Principal } from '../../domain/rules/access'
import { civilWindow, validSchedule } from '../../domain/rules/schedule'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext } from '../ports/audit-writer'
import type {
  ScheduleInput,
  ScheduleStore,
  ScheduleTarget,
  ScheduleTransaction,
} from '../ports/schedule'

export class ManageSchedule {
  constructor(
    private readonly store: ScheduleStore,
    private readonly timeZone: string,
    private readonly maxWindowDays: number,
  ) {}
  private async authorized<T>(
    actor: Principal,
    id: string,
    context: AuditContext,
    run: (tx: ScheduleTransaction, target: ScheduleTarget) => Promise<T>,
  ) {
    const outcome = await this.store.transaction(async (tx) => {
      const currentActor = await tx.principal(actor)
      const target = await tx.professional(id)
      const allowed =
        currentActor &&
        mayAccess(currentActor, 'manage_schedule') &&
        (currentActor.roles.some(
          (r) => r === 'admin' || r === 'manager' || r === 'receptionist',
        ) ||
          (currentActor.roles.includes('professional') &&
            target?.userId === currentActor.userId))
      if (!allowed) {
        await tx.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: 'authorization.denied',
          resourceType: 'ProfessionalSchedule',
          resourceId: id,
          authorizationBasis: 'denied',
        })
        return { kind: 'denied' } as const
      }
      if (!target?.active) return { kind: 'missing' } as const
      return { kind: 'ok', result: await run(tx, target) } as const
    })
    if (outcome.kind !== 'ok')
      throw new ApplicationError(
        outcome.kind === 'denied' ? 'FORBIDDEN' : 'NOT_FOUND_OR_FORBIDDEN',
      )
    return outcome.result
  }
  read(
    actor: Principal,
    id: string,
    from: string,
    to: string,
    context: AuditContext,
  ) {
    let window: { startsAt: Date; endsAt: Date }
    try {
      window = civilWindow(from, to, this.timeZone, this.maxWindowDays)
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'from',
          reason: 'Confira as datas e o limite configurado da janela.',
        },
      ])
    }
    return this.authorized(actor, id, context, async (tx) => {
      const snapshot = (await tx.current(id)) ?? {
        professionalId: id,
        version: 0,
        clinicTimeZone: this.timeZone,
        rules: [],
        blocks: [],
      }
      const impacts = await tx.impacts(id, snapshot, snapshot.clinicTimeZone)
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'schedule.viewed',
        resourceType: 'ProfessionalSchedule',
        resourceId: id,
        metadata: { version: snapshot.version },
      })
      return {
        ...snapshot,
        rules: snapshot.rules.filter(
          (r) =>
            r.effectiveFrom <= to && (!r.effectiveTo || r.effectiveTo >= from),
        ),
        blocks: snapshot.blocks.filter(
          (b) =>
            new Date(b.startsAt) < window.endsAt &&
            new Date(b.endsAt) > window.startsAt,
        ),
        affectedAppointments: impacts
          .filter(
            (i) =>
              new Date(i.startsAt) < window.endsAt &&
              new Date(i.endsAt) > window.startsAt,
          )
          .map(({ emergencyOnly: _, ...impact }) => impact),
      }
    })
  }
  publish(
    actor: Principal,
    id: string,
    expectedVersion: number,
    input: ScheduleInput,
    context: AuditContext,
  ) {
    if (!validSchedule(input.rules, input.blocks, this.timeZone))
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'rules',
          reason: 'Revise faixas sobrepostas, datas e horários locais.',
        },
      ])
    return this.authorized(actor, id, context, async (tx, target) => {
      if (input.rules.some((r) => !target.modalities.includes(r.modality)))
        throw new ApplicationError('VALIDATION_ERROR', [
          {
            field: 'rules',
            reason: 'A modalidade não está habilitada para o profissional.',
          },
        ])
      const current = await tx.current(id)
      if ((current?.version ?? 0) !== expectedVersion)
        throw new ApplicationError('CONFLICT')
      const impacts = await tx.impacts(id, input, this.timeZone)
      if (impacts.some((i) => !i.emergencyOnly))
        throw new ApplicationError('SCHEDULE_IMPACT_REVIEW', undefined, {
          affectedAppointments: impacts.map(
            ({ emergencyOnly: _, ...impact }) => impact,
          ),
        })
      const version = expectedVersion + 1
      await tx.publish(id, version, input, this.timeZone, actor.userId)
      if (impacts.length)
        await tx.notifyImpacts(
          impacts.map((i) => i.id),
          version,
          context.requestId,
        )
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'schedule.published',
        resourceType: 'ProfessionalSchedule',
        resourceId: id,
        metadata: { version, count: input.rules.length },
      })
      return {
        version,
        affectedAppointments: impacts.map(
          ({ emergencyOnly: _, ...impact }) => impact,
        ),
        affectedAppointmentsResolved: impacts.length === 0,
      }
    })
  }
}
