import { mayAccess, type Principal } from '../../domain/rules/access'
import {
  isPatientChangeLate,
  patientChangeDeadline,
} from '../../domain/rules/patient-change-window'
import { localInstant } from '../../domain/rules/schedule'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import {
  type AppointmentStatus,
  appointmentSummary,
  type BookingStore,
} from '../ports/booking'

export class ListMyAppointments {
  constructor(
    private readonly store: BookingStore,
    private readonly timeZone: string,
    private readonly audit: AuditWriter,
    private readonly now = () => new Date(),
  ) {}
  async execute(
    actor: Principal,
    query: {
      view?: 'upcoming' | 'history'
      patientId?: string
      status?: AppointmentStatus
      from?: string
      to?: string
      cursor?: string
    },
    context: AuditContext,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        // Reuse the identity/consent lock so a concurrent revocation cannot authorize this read.
        await tx.lock(
          `list:${context.requestId}`,
          query.patientId ?? actor.userId,
        )
        const current = await tx.principal(actor)
        if (
          !current?.roles.includes('patient') ||
          !mayAccess(current, 'session')
        )
          throw new ApplicationError('FORBIDDEN')
        if (
          query.patientId &&
          !(await tx.patient(current, query.patientId, new Date()))?.owned
        )
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (query.from && query.to && query.from > query.to)
          throw new ApplicationError('VALIDATION_ERROR')
        let from: Date | undefined, to: Date | undefined
        try {
          from = query.from
            ? localInstant(query.from, '00:00', this.timeZone)
            : undefined
          to = query.to
            ? localInstant(query.to, '24:00', this.timeZone)
            : undefined
        } catch {
          throw new ApplicationError('VALIDATION_ERROR')
        }
        const now = this.now()
        const page = await tx.ownAppointments(current, {
          referenceAt: now,
          ...query,
          from,
          to,
        })
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: 'appointment.listed',
          resourceType: 'PatientAppointments',
          resourceId: query.patientId ?? current.userId,
          subjectPatientId: query.patientId,
          metadata: { count: page.items.length },
        })
        return {
          clinicTimeZone: this.timeZone,
          serverNow: now.toISOString(),
          items: page.items.map((row) => ({
            ...appointmentSummary(row),
            selfService: {
              deadline: patientChangeDeadline(row.startsAt).toISOString(),
              rescheduleAllowed:
                row.status === 'confirmed' &&
                !isPatientChangeLate(row.startsAt, now),
              cancelAllowed:
                ['confirmed', 'waiting'].includes(row.status) &&
                !isPatientChangeLate(row.startsAt, now),
            },
            lastChange: row.lastChange
              ? {
                  ...row.lastChange,
                  occurredAt: row.lastChange.occurredAt.toISOString(),
                }
              : null,
          })),
          nextCursor: page.nextCursor,
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
          resourceType: 'PatientAppointments',
          resourceId: query.patientId ?? actor.userId,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
}
