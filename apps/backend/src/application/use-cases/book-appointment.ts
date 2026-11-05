import { createHash, randomUUID } from 'node:crypto'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import {
  type AppointmentRecord,
  appointmentSummary,
  type BookInput,
  type BookingStore,
} from '../ports/booking'
import { bookingAlternatives, eligibleBookingSlot } from './booking-policy'
import type { FindAvailability } from './find-availability'
import { ReserveSlot } from './reserve-slot'

export class BookAppointment {
  constructor(
    private readonly store: BookingStore,
    private readonly audit: AuditWriter,
    private readonly availability: FindAvailability,
    private readonly now = () => new Date(),
    private readonly newId = () => randomUUID(),
  ) {}
  fitIn(
    actor: Principal,
    input: BookInput & { reason: string },
    key: string,
    context: AuditContext,
  ) {
    if (!input.reason.trim()) throw new ApplicationError('VALIDATION_ERROR')
    return this.execute(actor, input, key, context, {
      reason: input.reason.trim(),
    })
  }
  async execute(
    actor: Principal,
    input: BookInput,
    idempotencyKey: string,
    context: AuditContext,
    fitIn?: { reason: string },
  ) {
    const operation = fitIn ? 'fit_in' : 'confirm'
    const requestKey = createHash('sha256')
      .update(`${actor.userId}:${operation}:${idempotencyKey.toLowerCase()}`)
      .digest('hex')
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          input.patientId,
          input.professionalId,
          input.specialtyId,
          input.modality,
          input.visitType,
          input.startsAt,
          input.roomId ?? null,
          input.confirmDuplicateSpecialty ?? false,
          ...(fitIn ? [fitIn.reason] : []),
        ]),
      )
      .digest('hex')
    const now = this.now()
    try {
      return await this.store.transaction(async (tx) => {
        await tx.lock(requestKey, input.patientId)
        const currentActor = await tx.principal(actor)
        if (!currentActor) throw new ApplicationError('UNAUTHENTICATED')
        if (
          currentActor.roles.includes('patient') &&
          currentActor.consentState !== 'active'
        )
          throw new ApplicationError('CONSENT_REQUIRED')
        if (
          !mayAccess(currentActor, fitIn ? 'create_fit_in' : 'book_appointment')
        )
          throw new ApplicationError('FORBIDDEN')
        const patient = await tx.patient(currentActor, input.patientId, now)
        if (
          !patient ||
          (!patient.owned && currentActor.roles.includes('patient'))
        )
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (!patient.active) throw new ApplicationError('CONFLICT')
        if (patient.consentState !== 'active')
          throw new ApplicationError('CONSENT_REQUIRED')
        const portal = currentActor.roles.includes('patient')
        if (portal && patient.suspendedUntil && patient.suspendedUntil > now)
          throw new ApplicationError('AUTO_BOOKING_SUSPENDED')
        if (input.roomId && !currentActor.roles.includes('receptionist'))
          throw new ApplicationError('FORBIDDEN')
        const replay = await tx.command(requestKey)
        if (replay) {
          if (replay.inputHash !== hash) throw new ApplicationError('CONFLICT')
          const row = await tx.appointment(replay.appointmentId)
          if (!row) throw new ApplicationError('CONFLICT')
          return {
            appointment: appointmentSummary(row),
            notificationState: row.notificationAttention
              ? ('unreachable' as const)
              : ('queued' as const),
          }
        }
        const { target, startsAt, endsAt, durationMinutes } =
          await eligibleBookingSlot(tx, input, portal, now, !!fitIn)
        const duplicates = await tx.duplicateAppointments(
          patient.id,
          input.specialtyId,
          now,
        )
        if (duplicates.length && !input.confirmDuplicateSpecialty)
          throw new ApplicationError('DUPLICATE_SPECIALTY_WARNING', undefined, {
            duplicateAppointments: duplicates.map((a) => ({
              id: a.id,
              startsAt: a.startsAt.toISOString(),
            })),
          })
        const id = this.newId()
        const reservation = await new ReserveSlot(
          tx.reservations,
          () => now,
        ).reserve({
          requestKey: `booking:${requestKey}`,
          professionalId: input.professionalId,
          roomId: input.roomId,
          modality: input.modality,
          startsAt,
          endsAt,
          state: 'confirmed',
          appointmentId: id,
        })
        const data: AppointmentRecord = {
          id,
          patientId: patient.id,
          professionalId: input.professionalId,
          specialtyId: input.specialtyId,
          roomId: reservation.roomId,
          modality: input.modality,
          visitType: input.visitType,
          startsAt,
          endsAt,
          durationMinutes,
          specialtyVersion: target.specialtyVersion,
          status: 'confirmed',
          version: 1,
          bookingSource: fitIn ? 'fit_in' : portal ? 'portal' : 'reception',
          createdBy: actor.userId,
          parentAppointmentId: null,
          reason: fitIn?.reason ?? null,
          notificationAttention: false,
        }
        const row = await tx.create(data)
        const notificationState = await tx.notify(
          row,
          'appointment.confirmed',
          context.requestId,
        )
        await tx.history(
          row,
          currentActor,
          fitIn ? 'fit_in' : 'confirmed',
          undefined,
          fitIn?.reason,
        )
        await tx.recordCommand(requestKey, actor.userId, operation, hash, id)
        await tx.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: currentActor.roles,
          action: fitIn
            ? 'appointment.fit_in_confirmed'
            : 'appointment.confirmed',
          resourceType: 'Appointment',
          resourceId: id,
          subjectPatientId: patient.id,
          metadata: { version: 1, source: data.bookingSource },
        })
        const result = await tx.appointment(id)
        return {
          appointment: appointmentSummary(result ?? row),
          notificationState,
        }
      })
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
          resourceId: input.patientId,
          authorizationBasis: 'denied',
        })
      if (
        error instanceof ApplicationError &&
        error.code === 'SLOT_UNAVAILABLE'
      ) {
        const alternatives = await bookingAlternatives(
          this.availability,
          actor,
          input,
        )
        throw new ApplicationError('SLOT_UNAVAILABLE', undefined, {
          alternatives,
        })
      }
      throw error
    }
  }
}
