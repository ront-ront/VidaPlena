import { createHash } from 'node:crypto'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { clinicDate } from '../../domain/rules/arrival'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import {
  type AppointmentOrigin,
  appointmentSummary,
  type BookInput,
  type BookingStore,
  type RescheduleInput,
} from '../ports/booking'
import { bookingAlternatives, eligibleBookingSlot } from './booking-policy'
import type { FindAvailability } from './find-availability'
import { ReserveSlot } from './reserve-slot'

export class RescheduleAppointment {
  constructor(
    private readonly store: BookingStore,
    private readonly audit: AuditWriter,
    private readonly availability: FindAvailability,
    private readonly now = () => new Date(),
  ) {}
  async execute(
    actor: Principal,
    id: string,
    input: RescheduleInput,
    key: string,
    context: AuditContext,
  ) {
    const requestKey = createHash('sha256')
      .update(`${actor.userId}:reschedule:${key.toLowerCase()}`)
      .digest('hex')
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          id,
          new Date(input.startsAt).toISOString(),
          input.professionalId ?? null,
          input.modality ?? null,
          input.roomId ?? null,
          input.reason ?? null,
          input.origin ?? null,
          input.expectedVersion,
        ]),
      )
      .digest('hex')
    let slot: BookInput | undefined
    let origin: AppointmentOrigin = 'patient'
    try {
      const result = await this.store.transaction(async (tx) => {
        const initial = await tx.appointment(id)
        if (!initial) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        await tx.lock(requestKey, initial.patientId)
        const currentActor = await tx.principal(actor)
        if (!currentActor) throw new ApplicationError('UNAUTHENTICATED')
        if (
          currentActor.roles.includes('patient') &&
          currentActor.consentState !== 'active'
        )
          throw new ApplicationError('CONSENT_REQUIRED')
        if (!mayAccess(currentActor, 'book_appointment'))
          throw new ApplicationError('FORBIDDEN')
        const row = await tx.appointment(id)
        if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const now = this.now(),
          portal = currentActor.roles.includes('patient')
        const patient = await tx.patient(currentActor, row.patientId, now)
        if (!patient || (portal && !patient.owned))
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (patient.consentState !== 'active')
          throw new ApplicationError('CONSENT_REQUIRED')
        if (!patient.active) throw new ApplicationError('CONFLICT')
        origin = input.origin ?? (portal ? 'patient' : 'reception')
        if (portal && origin !== 'patient')
          throw new ApplicationError('FORBIDDEN')
        const replay = await tx.command(requestKey)
        if (replay) {
          if (replay.inputHash !== hash || replay.appointmentId !== id)
            throw new ApplicationError('CONFLICT')
          return {
            appointment: appointmentSummary(row),
            previousSlotReleased: true as const,
            notificationState: row.notificationAttention
              ? ('unreachable' as const)
              : ('queued' as const),
            origin,
          }
        }
        const arrival =
          row.status === 'waiting' ? await tx.checkIn(id, row.version) : null
        const waitingToday =
          !portal &&
          !!arrival &&
          clinicDate(arrival.arrivedAt, arrival.clinicTimeZone) ===
            clinicDate(now, arrival.clinicTimeZone)
        if (
          row.version !== input.expectedVersion ||
          (row.status !== 'confirmed' && !waitingToday) ||
          (row.startsAt <= now && !waitingToday)
        )
          throw new ApplicationError('CONFLICT')
        const late = row.startsAt.getTime() - now.getTime() < 4 * 3_600_000
        if (portal && late) throw new ApplicationError('BOOKING_CHANGE_WINDOW')
        if (
          (waitingToday || (!portal && late) || origin === 'clinic') &&
          !input.reason
        )
          throw new ApplicationError('VALIDATION_ERROR', [
            {
              field: 'reason',
              reason: 'Informe o motivo da remarcação assistida.',
            },
          ])
        if (input.roomId && !currentActor.roles.includes('receptionist'))
          throw new ApplicationError('FORBIDDEN')
        slot = {
          patientId: row.patientId,
          professionalId: input.professionalId ?? row.professionalId,
          specialtyId: row.specialtyId,
          modality: input.modality ?? row.modality,
          visitType: row.visitType,
          startsAt: input.startsAt,
          roomId: input.roomId,
        }
        const eligible = await eligibleBookingSlot(tx, slot, portal, now)
        const previous = await tx.confirmedReservation(id)
        if (!previous) throw new ApplicationError('CONFLICT')
        const reservation = await new ReserveSlot(
          tx.reservations,
          () => now,
        ).replace(previous.id, {
          requestKey: `reschedule:${requestKey}`,
          appointmentId: id,
          professionalId: slot.professionalId,
          roomId: slot.roomId,
          modality: slot.modality,
          startsAt: eligible.startsAt,
          endsAt: eligible.endsAt,
          state: 'confirmed',
        })
        const changed = await tx.update(id, row.version, {
          status: 'confirmed',
          professionalId: slot.professionalId,
          roomId: reservation.roomId,
          modality: slot.modality,
          startsAt: eligible.startsAt,
          endsAt: eligible.endsAt,
          durationMinutes: eligible.durationMinutes,
          specialtyVersion: eligible.target.specialtyVersion,
        })
        await tx.invalidateNotifications(id)
        await tx.slotReleased(row, changed.version, 'rescheduled')
        await tx.history(
          changed,
          currentActor,
          'rescheduled',
          row,
          input.reason,
          origin,
        )
        const notificationState = await tx.notify(
          changed,
          origin === 'clinic'
            ? 'appointment.rescheduled_by_clinic'
            : 'appointment.rescheduled',
          context.requestId,
          row.professionalId,
        )
        await tx.recordCommand(
          requestKey,
          currentActor.userId,
          'reschedule',
          hash,
          id,
        )
        await tx.audit.append({
          ...context,
          actorUserId: currentActor.userId,
          actorRoles: currentActor.roles,
          action: 'appointment.rescheduled',
          resourceType: 'Appointment',
          resourceId: id,
          subjectPatientId: row.patientId,
          metadata: { version: changed.version, source: origin },
        })
        const persisted = await tx.appointment(id)
        return {
          appointment: appointmentSummary(persisted ?? changed),
          previousSlotReleased: true as const,
          notificationState,
          origin,
        }
      })
      return {
        ...result,
        alternatives:
          origin === 'clinic' && slot
            ? await bookingAlternatives(this.availability, actor, slot)
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
      if (
        error instanceof ApplicationError &&
        error.code === 'SLOT_UNAVAILABLE'
      )
        throw new ApplicationError('SLOT_UNAVAILABLE', undefined, {
          alternatives: slot
            ? await bookingAlternatives(this.availability, actor, slot)
            : [],
        })
      throw error
    }
  }
}
