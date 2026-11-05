import { createHash } from 'node:crypto'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import {
  appointmentSummary,
  type BookInput,
  type BookingStore,
  type CancelInput,
} from '../ports/booking'
import { bookingAlternatives } from './booking-policy'
import type { FindAvailability } from './find-availability'
import { ReserveSlot } from './reserve-slot'

export class CancelAppointment {
  constructor(
    private readonly store: BookingStore,
    private readonly audit: AuditWriter,
    private readonly availability: FindAvailability,
    private readonly now = () => new Date(),
  ) {}
  async execute(
    actor: Principal,
    id: string,
    input: CancelInput,
    key: string,
    context: AuditContext,
  ) {
    const requestKey = createHash('sha256')
      .update(`${actor.userId}:cancel:${key.toLowerCase()}`)
      .digest('hex')
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          id,
          input.origin,
          input.reason ?? null,
          input.expectedVersion,
        ]),
      )
      .digest('hex')
    let previousSlot: BookInput | undefined
    try {
      const result = await this.store.transaction(async (tx) => {
        const initial = await tx.appointment(id)
        if (!initial) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        await tx.lock(requestKey, initial.patientId)
        const current = await tx.principal(actor)
        if (!current) throw new ApplicationError('UNAUTHENTICATED')
        if (
          current.roles.includes('patient') &&
          current.consentState !== 'active'
        )
          throw new ApplicationError('CONSENT_REQUIRED')
        if (!mayAccess(current, 'cancel_appointment'))
          throw new ApplicationError('FORBIDDEN')
        const row = await tx.appointment(id)
        if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const now = this.now(),
          portal = current.roles.includes('patient')
        const staff = current.roles.some(
          (r) => r === 'admin' || r === 'receptionist',
        )
        if (
          !portal &&
          !staff &&
          !(await tx.professionalOwned(row.professionalId, current))
        )
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const patient = await tx.patient(current, row.patientId, now)
        if (!patient || (portal && !patient.owned))
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (portal && patient.consentState !== 'active')
          throw new ApplicationError('CONSENT_REQUIRED')
        if (
          (portal && input.origin !== 'patient') ||
          (!portal && !staff && input.origin !== 'clinic')
        )
          throw new ApplicationError('FORBIDDEN')
        const replay = await tx.command(requestKey)
        if (replay) {
          if (replay.inputHash !== hash || replay.appointmentId !== id)
            throw new ApplicationError('CONFLICT')
          return {
            appointment: appointmentSummary(row),
            status: 'cancelled' as const,
            waitlistTriggered: true as const,
            notificationState: row.notificationAttention
              ? ('unreachable' as const)
              : ('queued' as const),
            origin: input.origin,
          }
        }
        if (
          row.version !== input.expectedVersion ||
          !['confirmed', 'waiting'].includes(row.status) ||
          row.startsAt <= now
        )
          throw new ApplicationError('CONFLICT')
        const late = row.startsAt.getTime() - now.getTime() < 4 * 3_600_000
        if (portal && late) throw new ApplicationError('BOOKING_CHANGE_WINDOW')
        if (
          ((!portal && late) ||
            input.origin === 'clinic' ||
            patient.consentState !== 'active') &&
          !input.reason
        )
          throw new ApplicationError('VALIDATION_ERROR', [
            {
              field: 'reason',
              reason: 'Informe o motivo do cancelamento assistido.',
            },
          ])
        const reservation = await tx.confirmedReservation(id)
        if (!reservation) throw new ApplicationError('CONFLICT')
        await new ReserveSlot(tx.reservations, () => now).release(
          reservation.id,
        )
        const cancelled = await tx.update(id, row.version, {
          status: 'cancelled',
          notificationAttention: patient.consentState !== 'active',
        })
        await tx.invalidateNotifications(id)
        await tx.slotReleased(row, cancelled.version, 'cancelled')
        await tx.history(
          cancelled,
          current,
          'cancelled',
          row,
          input.reason,
          input.origin,
        )
        const notificationState =
          patient.consentState === 'active'
            ? await tx.notify(
                cancelled,
                input.origin === 'clinic'
                  ? 'appointment.cancelled_by_clinic'
                  : 'appointment.cancelled',
                context.requestId,
              )
            : ('unreachable' as const)
        await tx.recordCommand(requestKey, current.userId, 'cancel', hash, id)
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: 'appointment.cancelled',
          resourceType: 'Appointment',
          resourceId: id,
          subjectPatientId: row.patientId,
          metadata: { version: cancelled.version, source: input.origin },
        })
        const persisted = await tx.appointment(id)
        previousSlot = {
          patientId: row.patientId,
          professionalId: row.professionalId,
          specialtyId: row.specialtyId,
          modality: row.modality,
          visitType: row.visitType,
          startsAt: row.startsAt.toISOString(),
        }
        return {
          appointment: appointmentSummary(persisted ?? cancelled),
          status: 'cancelled' as const,
          waitlistTriggered: true as const,
          notificationState,
          origin: input.origin,
        }
      })
      return {
        ...result,
        alternatives:
          input.origin === 'clinic' && previousSlot
            ? await bookingAlternatives(this.availability, actor, previousSlot)
            : [],
      }
    } catch (error) {
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
          resourceType: 'Appointment',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
}
