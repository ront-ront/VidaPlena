import type { Principal } from '../../domain/rules/access'
import { mayAccess } from '../../domain/rules/access'
import { clinicDate, isLateArrival } from '../../domain/rules/arrival'
import { localInstant } from '../../domain/rules/schedule'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type { AgendaQuery, OperationalStore } from '../ports/operational-agenda'

export class ManageArrivals {
  constructor(
    private readonly store: OperationalStore,
    private readonly audit: AuditWriter,
    private readonly policy: { timeZone: string; lateToleranceMinutes: number },
    private readonly now = () => new Date(),
  ) {}
  private async denied(
    actor: Principal,
    context: AuditContext,
    id: string,
    error: unknown,
  ) {
    if (
      error instanceof ApplicationError &&
      ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN', 'CONSENT_REQUIRED'].includes(
        error.code,
      )
    )
      await this.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'authorization.denied',
        resourceType: 'OperationalAgenda',
        resourceId: id,
        authorizationBasis: 'denied',
      })
    throw error
  }
  async checkIn(
    actor: Principal,
    id: string,
    arrivedAt: string | undefined,
    context: AuditContext,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        const initial = await tx.appointment(id)
        if (!initial) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        await tx.lock(`check-in:${id}`, initial.patientId)
        const current = await tx.principal(actor)
        if (!current || !mayAccess(current, 'check_in'))
          throw new ApplicationError('FORBIDDEN')
        const row = await tx.appointment(id)
        if (
          row?.modality !== 'onsite' ||
          !['confirmed', 'waiting'].includes(row.status)
        )
          throw new ApplicationError('CONFLICT')
        const now = this.now()
        const patient = await tx.patient(current, row.patientId, now)
        if (!patient?.active) throw new ApplicationError('CONFLICT')
        if (patient.consentState === 'revoked')
          throw new ApplicationError('CONSENT_REQUIRED')
        const existing = await tx.checkIn(id, row.version)
        if (existing && row.status === 'waiting') {
          if (
            arrivedAt &&
            new Date(arrivedAt).getTime() !== existing.arrivedAt.getTime()
          )
            throw new ApplicationError('CONFLICT')
          return {
            appointmentId: id,
            appointmentVersion: row.version,
            status: 'waiting' as const,
            arrivedAt: existing.arrivedAt.toISOString(),
            recordedAt: existing.recordedAt.toISOString(),
            lateFlag: existing.lateFlag,
            administrativeFlags: await tx.administrativeFlags(
              row.patientId,
              now,
            ),
          }
        }
        if (
          row.status !== 'confirmed' ||
          clinicDate(row.startsAt, this.policy.timeZone) !==
            clinicDate(now, this.policy.timeZone)
        )
          throw new ApplicationError('CONFLICT')
        const arrival = arrivedAt ? new Date(arrivedAt) : now
        if (
          !Number.isFinite(arrival.getTime()) ||
          arrival > now ||
          clinicDate(arrival, this.policy.timeZone) !==
            clinicDate(now, this.policy.timeZone)
        )
          throw new ApplicationError('VALIDATION_ERROR', [
            {
              field: 'arrivedAt',
              reason: 'Informe horário já ocorrido no dia da consulta.',
            },
          ])
        const changed = await tx.update(id, row.version, { status: 'waiting' })
        const checkIn = await tx.createCheckIn({
          appointmentId: id,
          appointmentVersion: changed.version,
          arrivedAt: arrival,
          recordedAt: now,
          recordedBy: current.userId,
          lateFlag: isLateArrival(
            arrival,
            row.startsAt,
            this.policy.lateToleranceMinutes,
          ),
          toleranceMinutes: this.policy.lateToleranceMinutes,
          clinicTimeZone: this.policy.timeZone,
        })
        await tx.invalidateNotifications(id)
        await tx.history(
          changed,
          current,
          'checked_in',
          row,
          undefined,
          'reception',
        )
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: 'appointment.checked_in',
          resourceType: 'Appointment',
          resourceId: id,
          subjectPatientId: row.patientId,
          metadata: {
            version: changed.version,
            status: 'waiting',
            source: arrivedAt ? 'manual_arrival_time' : 'server_time',
          },
        })
        return {
          appointmentId: id,
          appointmentVersion: changed.version,
          status: 'waiting' as const,
          arrivedAt: checkIn.arrivedAt.toISOString(),
          recordedAt: checkIn.recordedAt.toISOString(),
          lateFlag: checkIn.lateFlag,
          administrativeFlags: await tx.administrativeFlags(row.patientId, now),
        }
      })
    } catch (error) {
      return this.denied(actor, context, id, error)
    }
  }
  async list(
    actor: Principal,
    query: AgendaQuery,
    context: AuditContext,
    queue = false,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        await tx.lock(`agenda:${context.requestId}`, actor.userId)
        const current = await tx.principal(actor)
        if (
          !current ||
          !mayAccess(current, queue ? 'own_queue' : 'operational_agenda')
        )
          throw new ApplicationError('FORBIDDEN')
        const staff =
          // The review list never grants its mutation authority to other agenda readers.
          !queue &&
          current.roles.some((r) =>
            ['receptionist', 'manager', 'admin'].includes(r),
          )
        if (query.absenceEligibleOnly && !mayAccess(current, 'record_absence'))
          throw new ApplicationError('FORBIDDEN')
        let professionalId = query.professionalId
        if (!staff) {
          const own = await tx.professionalFor(current)
          if (!own || (professionalId && professionalId !== own))
            throw new ApplicationError('FORBIDDEN')
          professionalId = own
        }
        let from: Date, to: Date
        try {
          from = localInstant(query.localDate, '00:00', this.policy.timeZone)
          to = localInstant(query.localDate, '24:00', this.policy.timeZone)
        } catch {
          throw new ApplicationError('VALIDATION_ERROR')
        }
        const page = await tx.day(
          {
            ...query,
            professionalId,
            status: queue ? 'waiting' : query.status,
          },
          from,
          to,
          !queue &&
            current.roles.some((r) => r === 'receptionist' || r === 'admin'),
          this.now(),
          staff,
        )
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: queue ? 'appointment.queue_read' : 'appointment.agenda_read',
          resourceType: 'OperationalAgenda',
          resourceId: professionalId ?? current.userId,
          metadata: {
            count: page.items.length,
            scope: queue
              ? 'own_queue'
              : staff
                ? 'administrative'
                : 'own_agenda',
          },
        })
        return queue ? { items: page.items, nextCursor: page.nextCursor } : page
      })
    } catch (error) {
      return this.denied(
        actor,
        context,
        query.professionalId ?? actor.userId,
        error,
      )
    }
  }
}
