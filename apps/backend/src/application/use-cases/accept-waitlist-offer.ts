import { createHash, randomUUID } from 'node:crypto'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import { type AppointmentRecord, appointmentSummary } from '../ports/booking'
import type { WaitlistStore } from '../ports/waitlist'
import { eligibleBookingSlot } from './booking-policy'
import { closeWaitlistOffer } from './manage-waitlist'
import { ReserveSlot } from './reserve-slot'

export class AcceptWaitlistOffer {
  constructor(
    private readonly store: WaitlistStore,
    private readonly audit: AuditWriter,
    private readonly now = () => new Date(),
  ) {}
  async execute(
    actor: Principal,
    id: string,
    input: { patientId: string; confirmDuplicateSpecialty?: boolean },
    key: string,
    context: AuditContext,
  ) {
    const requestKey = createHash('sha256')
      .update(`${actor.userId}:waitlist_accept:${key.toLowerCase()}`)
      .digest('hex')
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          id.toLowerCase(),
          input.patientId.toLowerCase(),
          input.confirmDuplicateSpecialty ?? false,
        ]),
      )
      .digest('hex')
    try {
      const result = await this.store.transaction(async (tx) => {
        await tx.lockQueue()
        const current = await tx.principal(actor)
        if (!current) throw new ApplicationError('UNAUTHENTICATED')
        if (
          current.roles.includes('patient') &&
          current.consentState !== 'active'
        )
          throw new ApplicationError('CONSENT_REQUIRED')
        if (!mayAccess(current, 'book_appointment'))
          throw new ApplicationError('FORBIDDEN')
        const offer = await tx.offer(id)
        if (!offer || offer.entry.patientId !== input.patientId.toLowerCase())
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        await tx.lock(requestKey, offer.entry.patientId)
        const now = this.now()
        const patient = await tx.patient(current, offer.entry.patientId, now),
          portal = current.roles.includes('patient')
        if (!patient || (portal && !patient.owned))
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (!patient.active) throw new ApplicationError('CONFLICT')
        if (patient.consentState !== 'active')
          throw new ApplicationError('CONSENT_REQUIRED')
        if (portal && patient.suspendedUntil && patient.suspendedUntil > now)
          throw new ApplicationError('AUTO_BOOKING_SUSPENDED')
        const replay = await tx.command(requestKey)
        if (replay) {
          if (
            replay.inputHash !== hash ||
            replay.appointmentId !== offer.reservation.appointmentId
          )
            throw new ApplicationError('CONFLICT')
          const row = await tx.appointment(replay.appointmentId)
          if (!row) throw new ApplicationError('CONFLICT')
          return {
            kind: 'ok' as const,
            appointment: appointmentSummary(row),
            notificationState: row.notificationAttention
              ? ('unreachable' as const)
              : ('queued' as const),
          }
        }
        if (offer.status !== 'active' || offer.entry.status !== 'offered')
          return { kind: 'expired' as const }
        if (offer.expiresAt <= now) {
          await closeWaitlistOffer(tx, offer, 'expired', now)
          await tx.audit.append({
            ...context,
            actorUserId: current.userId,
            actorRoles: current.roles,
            action: 'waitlist.offer_expired',
            resourceType: 'WaitlistOffer',
            resourceId: id,
            subjectPatientId: patient.id,
            metadata: { reasonCode: 'ttl' },
          })
          return { kind: 'expired' as const }
        }
        const slot = {
          patientId: patient.id,
          specialtyId: offer.entry.specialtyId,
          professionalId: offer.reservation.professionalId,
          modality: offer.entry.modality,
          visitType: offer.entry.visitType,
          startsAt: offer.reservation.startsAt.toISOString(),
        }
        let eligible: Awaited<ReturnType<typeof eligibleBookingSlot>>
        try {
          eligible = await eligibleBookingSlot(tx, slot, true, now)
          if (eligible.endsAt.getTime() !== offer.reservation.endsAt.getTime())
            throw new ApplicationError('SLOT_UNAVAILABLE')
          if (
            offer.reservation.roomId &&
            !(await tx.reservations.roomActive(offer.reservation.roomId))
          )
            throw new ApplicationError('SLOT_UNAVAILABLE')
        } catch (error) {
          if (
            !(error instanceof ApplicationError) ||
            ![
              'SLOT_UNAVAILABLE',
              'BOOKING_LEAD_TIME',
              'VALIDATION_ERROR',
            ].includes(error.code)
          )
            throw error
          await closeWaitlistOffer(tx, offer, 'cancelled', now)
          await tx.audit.append({
            ...context,
            actorUserId: current.userId,
            actorRoles: current.roles,
            action: 'waitlist.offer_invalidated',
            resourceType: 'WaitlistOffer',
            resourceId: id,
            subjectPatientId: patient.id,
            metadata: { reasonCode: 'eligibility_changed' },
          })
          return { kind: 'unavailable' as const }
        }
        const duplicates = await tx.duplicateAppointments(
          patient.id,
          offer.entry.specialtyId,
          now,
        )
        if (duplicates.length && !input.confirmDuplicateSpecialty)
          throw new ApplicationError('DUPLICATE_SPECIALTY_WARNING', undefined, {
            duplicateAppointments: duplicates.map((a) => ({
              id: a.id,
              startsAt: a.startsAt.toISOString(),
            })),
          })
        const appointmentId = randomUUID()
        const reservation = await new ReserveSlot(
          tx.reservations,
          this.now,
        ).confirmHold(offer.slotReservationId, appointmentId)
        const data: AppointmentRecord = {
          id: appointmentId,
          patientId: patient.id,
          professionalId: slot.professionalId,
          specialtyId: slot.specialtyId,
          roomId: reservation.roomId,
          modality: slot.modality,
          visitType: slot.visitType,
          startsAt: eligible.startsAt,
          endsAt: eligible.endsAt,
          durationMinutes: eligible.durationMinutes,
          specialtyVersion: eligible.target.specialtyVersion,
          status: 'confirmed',
          version: 1,
          bookingSource: portal ? 'portal' : 'reception',
          createdBy: current.userId,
          parentAppointmentId: null,
          reason: null,
          notificationAttention: false,
        }
        const row = await tx.create(data)
        await tx.updateOffer(id, 'accepted', now)
        await tx.updateEntry(offer.entryId, 'fulfilled')
        await tx.finishOpportunity(offer.releaseEventId, now)
        await tx.invalidateOfferNotification(id)
        const notificationState = await tx.notify(
          row,
          'appointment.confirmed',
          context.requestId,
        )
        await tx.history(row, current, 'confirmed')
        await tx.recordCommand(
          requestKey,
          current.userId,
          'waitlist_accept',
          hash,
          row.id,
        )
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: 'waitlist.accepted',
          resourceType: 'WaitlistOffer',
          resourceId: id,
          subjectPatientId: patient.id,
          metadata: { source: 'waitlist', version: 1 },
        })
        const persisted = await tx.appointment(row.id)
        return {
          kind: 'ok' as const,
          appointment: appointmentSummary(persisted ?? row),
          notificationState,
        }
      })
      if (result.kind !== 'ok')
        throw new ApplicationError(
          result.kind === 'expired' ? 'OFFER_EXPIRED' : 'SLOT_UNAVAILABLE',
          undefined,
          result.kind === 'unavailable' ? { alternatives: [] } : undefined,
        )
      const { kind: _, ...response } = result
      return response
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
          resourceType: 'WaitlistOffer',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
}
