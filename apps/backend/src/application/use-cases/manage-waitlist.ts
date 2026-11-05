import { createHash, randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { civilWindow } from '../../domain/rules/schedule'
import {
  matchesWaitlist,
  normalizePreferences,
} from '../../domain/rules/waitlist'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  WaitlistInput,
  WaitlistOfferRecord,
  WaitlistQuery,
  WaitlistStore,
  WaitlistTransaction,
} from '../ports/waitlist'
import type { FindAvailability } from './find-availability'
import { ReserveSlot } from './reserve-slot'

export function offerSummary(offer: WaitlistOfferRecord) {
  return {
    id: offer.id,
    status: offer.status,
    offeredAt: offer.offeredAt.toISOString(),
    expiresAt: offer.expiresAt.toISOString(),
    startsAt: offer.reservation.startsAt.toISOString(),
    endsAt: offer.reservation.endsAt.toISOString(),
    professionalId: offer.reservation.professionalId,
    professionalName: offer.professionalName,
    modality: offer.reservation.modality,
    manualContactRequired: offer.manualContactRequired,
  }
}
export async function closeWaitlistOffer(
  tx: WaitlistTransaction,
  offer: WaitlistOfferRecord,
  status: 'expired' | 'cancelled',
  now: Date,
) {
  await new ReserveSlot(tx.reservations, () => now).release(
    offer.slotReservationId,
  )
  await tx.updateOffer(offer.id, status, now)
  await tx.updateEntry(offer.entryId, 'waiting')
  await tx.invalidateOfferNotification(offer.id)
  await tx.scheduleOpportunity(offer.releaseEventId, now)
}
export class ManageWaitlist {
  constructor(
    private readonly store: WaitlistStore,
    private readonly audit: AuditWriter,
    private readonly availability: FindAvailability,
    private readonly timeZone: string,
    private readonly maxWindowDays: number,
    private readonly availabilityWindowDays: number,
    private readonly now = () => new Date(),
  ) {}
  private async authorized<T>(
    actor: Principal,
    context: AuditContext,
    resourceId: string,
    run: (tx: WaitlistTransaction, actor: Principal) => Promise<T>,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
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
        return run(tx, current)
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
          resourceType: 'WaitlistEntry',
          resourceId,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  private async requirePatient(
    tx: WaitlistTransaction,
    actor: Principal,
    patientId: string,
    now: Date,
    requireConsent: boolean,
  ) {
    const p = await tx.patient(actor, patientId, now)
    if (!p || (actor.roles.includes('patient') && !p.owned))
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    if (!p.active) throw new ApplicationError('CONFLICT')
    if (requireConsent && p.consentState !== 'active')
      throw new ApplicationError('CONSENT_REQUIRED')
    return p
  }
  async enter(actor: Principal, input: WaitlistInput, context: AuditContext) {
    const now = this.now(),
      today = Temporal.Instant.from(now.toISOString())
        .toZonedDateTimeISO(this.timeZone)
        .toPlainDate()
    try {
      civilWindow(
        input.dateFrom,
        input.dateTo,
        this.timeZone,
        this.maxWindowDays,
      )
      if (input.dateFrom < today.toString()) throw new RangeError()
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'dateFrom',
          reason:
            'Confira o período futuro e o limite configurado da lista de espera.',
        },
      ])
    }
    const normalized = {
      ...input,
      patientId: input.patientId.toLowerCase(),
      specialtyId: input.specialtyId.toLowerCase(),
      timePreferences: normalizePreferences(input.timePreferences),
    }
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          normalized.patientId,
          normalized.specialtyId,
          normalized.modality,
          normalized.visitType,
          normalized.dateFrom,
          normalized.dateTo,
          normalized.timePreferences,
        ]),
      )
      .digest('hex')
    return this.authorized(
      actor,
      context,
      input.patientId,
      async (tx, current) => {
        await this.requirePatient(tx, current, normalized.patientId, now, true)
        const specialty = await tx.specialty(normalized.specialtyId)
        if (
          !specialty?.active ||
          !specialty.modalities.includes(normalized.modality)
        )
          throw new ApplicationError('VALIDATION_ERROR')
        for (
          let day = Temporal.PlainDate.from(normalized.dateFrom),
            end = Temporal.PlainDate.from(normalized.dateTo);
          Temporal.PlainDate.compare(day, end) <= 0;
          day = day.add({ days: this.availabilityWindowDays })
        ) {
          const to = day.add({ days: this.availabilityWindowDays - 1 }),
            upper = Temporal.PlainDate.compare(to, end) > 0 ? end : to
          const available = await this.availability
            .withStore(tx.availability, this.now)
            .execute(current, {
              specialtyId: normalized.specialtyId,
              modality: normalized.modality,
              visitType: normalized.visitType,
              from: day.toString(),
              to: upper.toString(),
            })
          const eligible = available.days
            .flatMap((d) => d.slots)
            .filter(
              (slot) =>
                new Date(slot.startsAt).getTime() >=
                  now.getTime() + 2 * 3_600_000 &&
                matchesWaitlist(
                  normalized,
                  new Date(slot.startsAt),
                  new Date(slot.endsAt),
                  this.timeZone,
                ),
            )
          if (eligible.length)
            throw new ApplicationError('WAITLIST_NOT_NEEDED', undefined, {
              alternatives: eligible.slice(0, 3),
            })
        }
        const entry = await tx.createEntry(
          normalized,
          randomUUID(),
          fingerprint,
          current.userId,
          now,
        )
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: 'waitlist.entered',
          resourceType: 'WaitlistEntry',
          resourceId: entry.id,
          subjectPatientId: entry.patientId,
          metadata: { status: entry.status },
        })
        return {
          entryId: entry.id,
          queuedAt: entry.queuedAt.toISOString(),
          status: entry.status,
        }
      },
    )
  }
  list(actor: Principal, query: WaitlistQuery, context: AuditContext) {
    return this.authorized(
      actor,
      context,
      query.patientId ?? actor.userId,
      async (tx, current) => {
        const operational = mayAccess(current, 'operational_waitlist')
        if (query.patientId)
          await this.requirePatient(
            tx,
            current,
            query.patientId,
            this.now(),
            false,
          )
        const page = await tx.listEntries(current, query, operational)
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: 'waitlist.viewed',
          resourceType: 'WaitlistEntry',
          resourceId: query.patientId ?? actor.userId,
          metadata: {
            count: page.items.length,
            scope: operational ? 'operational' : 'own',
          },
        })
        return {
          items: page.items.map(({ entry, position, patientName, offer }) => ({
            id: entry.id,
            patientId: entry.patientId,
            specialtyId: entry.specialtyId,
            modality: entry.modality,
            visitType: entry.visitType,
            dateFrom: entry.dateFrom,
            dateTo: entry.dateTo,
            timePreferences: entry.timePreferences,
            queuedAt: entry.queuedAt.toISOString(),
            status: entry.status,
            position,
            ...(patientName ? { patientName } : {}),
            offer: offer ? offerSummary(offer) : null,
          })),
          nextCursor: page.nextCursor,
        }
      },
    )
  }
  leave(actor: Principal, id: string, context: AuditContext) {
    return this.authorized(actor, context, id, async (tx, current) => {
      const entry = await tx.entry(id)
      if (!entry) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      await this.requirePatient(tx, current, entry.patientId, this.now(), false)
      if (entry.status === 'cancelled') return
      if (entry.status === 'fulfilled') throw new ApplicationError('CONFLICT')
      const offer = await tx.entryOffer(id)
      if (offer) await closeWaitlistOffer(tx, offer, 'cancelled', this.now())
      await tx.updateEntry(id, 'cancelled')
      await tx.audit.append({
        ...context,
        actorUserId: current.userId,
        actorRoles: current.roles,
        action: 'waitlist.left',
        resourceType: 'WaitlistEntry',
        resourceId: id,
        subjectPatientId: entry.patientId,
        metadata: { status: 'cancelled' },
      })
    })
  }
}
