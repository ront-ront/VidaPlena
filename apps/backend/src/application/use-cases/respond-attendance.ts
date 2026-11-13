import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type { BookingStore } from '../ports/booking'

export class RespondAttendance {
  constructor(
    private readonly store: BookingStore,
    private readonly audit: AuditWriter,
    private readonly now = () => new Date(),
  ) {}
  async execute(
    actor: Principal,
    id: string,
    response: 'confirm' | 'cannot_attend',
    context: AuditContext,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        const initial = await tx.appointment(id)
        if (!initial) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        await tx.lock(`attendance:${id}`, initial.patientId)
        const current = await tx.principal(actor)
        if (
          !current?.roles.includes('patient') ||
          !mayAccess(current, 'session')
        )
          throw new ApplicationError('FORBIDDEN')
        const now = this.now()
        const patient = await tx.patient(current, initial.patientId, now)
        if (!patient?.owned)
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (!patient.active || patient.consentState !== 'active')
          throw new ApplicationError('FORBIDDEN')
        const row = await tx.appointment(id)
        if (row?.status !== 'confirmed' || row.startsAt <= now)
          throw new ApplicationError('CONFLICT')
        const result = await tx.attendanceResponse(row, current, response, now)
        if (result.created)
          await tx.audit.append({
            ...context,
            actorUserId: current.userId,
            actorRoles: current.roles,
            action: 'appointment.attendance_responded',
            resourceType: 'Appointment',
            resourceId: id,
            subjectPatientId: row.patientId,
            metadata: { status: response, version: row.version },
          })
        const requiresCancellation = response === 'cannot_attend'
        // RN-004 is a fixed DRS rule, shared with the cancellation use case.
        const receptionContactRequired =
          requiresCancellation &&
          row.startsAt.getTime() - now.getTime() < 4 * 3_600_000
        return {
          appointmentId: id,
          appointmentVersion: row.version,
          response,
          respondedAt: result.respondedAt.toISOString(),
          requiresCancellation,
          cancellationPath:
            requiresCancellation && !receptionContactRequired
              ? `/v1/appointments/${id}/cancel`
              : null,
          receptionContactRequired,
          waitlistTriggered: false as const,
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
          resourceType: 'Appointment',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
}
