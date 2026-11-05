import type { Principal } from '../../domain/rules/access'
import type { TimePreference } from '../../domain/rules/waitlist'
import type { AvailabilityStore } from './availability'
import type { BookingPatient, BookingTransaction } from './booking'
import type { Modality } from './catalog'
import type { Reservation } from './reservations'

export type { TimePreference } from '../../domain/rules/waitlist'
export type WaitlistInput = {
  patientId: string
  specialtyId: string
  modality: Modality
  visitType: 'first' | 'return'
  dateFrom: string
  dateTo: string
  timePreferences: TimePreference[]
}
export type WaitlistEntryRecord = WaitlistInput & {
  id: string
  status: 'waiting' | 'offered' | 'fulfilled' | 'cancelled'
  queuedAt: Date
  createdBy: string
}
export type WaitlistOfferRecord = {
  id: string
  entryId: string
  releaseEventId: string
  slotReservationId: string
  offeredAt: Date
  expiresAt: Date
  status: 'active' | 'accepted' | 'expired' | 'cancelled'
  acceptedAt: Date | null
  manualContactRequired: boolean
  entry: WaitlistEntryRecord
  reservation: Reservation
  professionalName: string
}
export type ReleaseOpportunity = {
  id: string
  appointmentId: string
  professionalId: string
  specialtyId: string
  modality: Modality
  startsAt: Date
  endsAt: Date
  processedAt: Date | null
  attempts: number
  nextAttemptAt: Date
}
export type WaitlistQuery = {
  patientId?: string
  specialtyId?: string
  status?: WaitlistEntryRecord['status']
  cursor?: string
}
export interface WaitlistTransaction extends BookingTransaction {
  availability: AvailabilityStore
  lockQueue(): Promise<void>
  specialty(
    id: string,
  ): Promise<{ active: boolean; modalities: Modality[] } | null>
  createEntry(
    input: WaitlistInput,
    id: string,
    fingerprint: string,
    actorId: string,
    now: Date,
  ): Promise<WaitlistEntryRecord>
  entry(id: string): Promise<WaitlistEntryRecord | null>
  updateEntry(id: string, status: WaitlistEntryRecord['status']): Promise<void>
  listEntries(
    actor: Principal,
    query: WaitlistQuery,
    operational: boolean,
  ): Promise<{
    items: Array<{
      entry: WaitlistEntryRecord
      patientName?: string
      position: number
      offer: WaitlistOfferRecord | null
    }>
    nextCursor: string | null
  }>
  offer(id: string): Promise<WaitlistOfferRecord | null>
  activeOffer(eventId: string): Promise<WaitlistOfferRecord | null>
  entryOffer(entryId: string): Promise<WaitlistOfferRecord | null>
  createOffer(input: {
    id: string
    entryId: string
    releaseEventId: string
    slotReservationId: string
    offeredAt: Date
    expiresAt: Date
    manualContactRequired: boolean
  }): Promise<WaitlistOfferRecord>
  updateOffer(
    id: string,
    status: WaitlistOfferRecord['status'],
    now: Date,
  ): Promise<void>
  invalidateOfferNotification(id: string): Promise<void>
  recipients(patientId: string, now: Date): Promise<string[]>
  notifyOffer(offer: WaitlistOfferRecord, requestId: string): Promise<void>
  opportunity(id: string): Promise<ReleaseOpportunity | null>
  finishOpportunity(id: string, now: Date): Promise<void>
  scheduleOpportunity(id: string, nextAt: Date): Promise<void>
  candidates(
    opportunity: ReleaseOpportunity,
    localDate: string,
    now: Date,
  ): Promise<WaitlistEntryRecord[]>
  candidatePatient(id: string, now: Date): Promise<BookingPatient | null>
}
export interface WaitlistStore {
  transaction<T>(run: (tx: WaitlistTransaction) => Promise<T>): Promise<T>
  due(now: Date, limit: number): Promise<string[]>
}
