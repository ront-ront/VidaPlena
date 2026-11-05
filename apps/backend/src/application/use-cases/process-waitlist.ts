import { randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import { localInstant } from '../../domain/rules/schedule'
import { matchesWaitlist } from '../../domain/rules/waitlist'
import { ApplicationError } from '../errors/application-error'
import type { Reservation } from '../ports/reservations'
import type { WaitlistStore } from '../ports/waitlist'
import { eligibleBookingSlot } from './booking-policy'
import { closeWaitlistOffer } from './manage-waitlist'
import { ReserveSlot } from './reserve-slot'

export class ProcessWaitlist {
  constructor(
    private readonly store: WaitlistStore,
    private readonly timeZone: string,
    private readonly ttlMinutes: number,
    private readonly batchSize: number,
    private readonly now = () => new Date(),
  ) {}
  async runOnce() {
    const ids = await this.store.due(this.now(), this.batchSize)
    let failures = 0
    for (const id of ids) {
      try {
        await this.process(id)
      } catch {
        failures++
      }
    }
    if (failures) throw new Error('waitlist.processing_failed')
    return ids.length
  }
  process(id: string) {
    return this.store.transaction(async (tx) => {
      await tx.lockQueue()
      const now = this.now(),
        event = await tx.opportunity(id)
      if (!event || event.processedAt || event.nextAttemptAt > now) return
      const context = {
        requestId: randomUUID(),
        actorRoles: [],
        authorizationBasis: 'system',
      }
      const active = await tx.activeOffer(id)
      if (active) {
        if (active.expiresAt > now) {
          await tx.scheduleOpportunity(id, active.expiresAt)
          return
        }
        await closeWaitlistOffer(tx, active, 'expired', now)
        await tx.audit.append({
          ...context,
          action: 'waitlist.offer_expired',
          resourceType: 'WaitlistOffer',
          resourceId: active.id,
          subjectPatientId: active.entry.patientId,
          metadata: { reasonCode: 'ttl' },
        })
      }
      if (event.endsAt.getTime() <= now.getTime() + 2 * 3_600_000) {
        await tx.finishOpportunity(id, now)
        return
      }
      const date = Temporal.Instant.from(event.startsAt.toISOString())
          .toZonedDateTimeISO(this.timeZone)
          .toPlainDate(),
        localDate = date.toString()
      const candidates = await tx.candidates(event, localDate, now)
      const target = await tx.target(event.professionalId, event.specialtyId)
      if (
        !target?.active ||
        !target.specialtyActive ||
        !target.linked ||
        !target.schedule ||
        !target.modalities.includes(event.modality) ||
        !target.specialtyModalities.includes(event.modality)
      ) {
        await tx.finishOpportunity(id, now)
        return
      }
      for (const entry of candidates) {
        const duration =
          entry.visitType === 'first'
            ? target.durationFirst
            : target.durationReturn
        const patient = await tx.candidatePatient(entry.patientId, now)
        if (!patient?.active || patient.consentState !== 'active') continue
        for (const rule of target.schedule.rules) {
          if (
            rule.weekday !== date.dayOfWeek ||
            rule.modality !== event.modality ||
            rule.effectiveFrom > localDate ||
            (rule.effectiveTo && rule.effectiveTo < localDate)
          )
            continue
          const [h, m] = rule.localStart.split(':').map(Number),
            [eh, em] = rule.localEnd.split(':').map(Number)
          for (
            let minute = h * 60 + m;
            minute + duration <= eh * 60 + em;
            minute += duration
          ) {
            let startsAt: Date
            try {
              startsAt = localInstant(
                localDate,
                `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
                target.schedule.clinicTimeZone,
              )
            } catch {
              continue
            }
            const endsAt = new Date(startsAt.getTime() + duration * 60_000)
            if (
              startsAt < event.startsAt ||
              endsAt > event.endsAt ||
              startsAt.getTime() <= now.getTime() + 2 * 3_600_000 ||
              !matchesWaitlist(entry, startsAt, endsAt, this.timeZone)
            )
              continue
            const input = {
              patientId: entry.patientId,
              specialtyId: entry.specialtyId,
              professionalId: event.professionalId,
              modality: event.modality,
              visitType: entry.visitType,
              startsAt: startsAt.toISOString(),
            }
            try {
              await eligibleBookingSlot(tx, input, true, now)
            } catch (error) {
              if (
                error instanceof ApplicationError &&
                [
                  'SLOT_UNAVAILABLE',
                  'BOOKING_LEAD_TIME',
                  'VALIDATION_ERROR',
                ].includes(error.code)
              )
                continue
              throw error
            }
            const offerId = randomUUID(),
              expiresAt = new Date(
                Math.min(
                  now.getTime() + this.ttlMinutes * 60_000,
                  startsAt.getTime() - 2 * 3_600_000,
                ),
              )
            let reservation: Reservation
            try {
              reservation = await new ReserveSlot(
                tx.reservations,
                () => now,
              ).reserve({
                requestKey: `offer:${offerId}`,
                professionalId: event.professionalId,
                modality: event.modality,
                startsAt,
                endsAt,
                state: 'held',
                offerId,
                expiresAt,
              })
            } catch (error) {
              if (
                error instanceof ApplicationError &&
                error.code === 'SLOT_UNAVAILABLE'
              )
                continue
              throw error
            }
            await tx.updateEntry(entry.id, 'offered')
            const offer = await tx.createOffer({
              id: offerId,
              entryId: entry.id,
              releaseEventId: id,
              slotReservationId: reservation.id,
              offeredAt: now,
              expiresAt,
              manualContactRequired:
                !!(patient.suspendedUntil && patient.suspendedUntil > now) ||
                !(await tx.recipients(entry.patientId, now)).length,
            })
            await tx.notifyOffer(offer, context.requestId)
            await tx.scheduleOpportunity(id, expiresAt)
            await tx.audit.append({
              ...context,
              action: 'waitlist.offered',
              resourceType: 'WaitlistOffer',
              resourceId: offerId,
              subjectPatientId: entry.patientId,
              metadata: { status: 'active' },
            })
            return
          }
        }
      }
      await tx.finishOpportunity(id, now)
    })
  }
}
