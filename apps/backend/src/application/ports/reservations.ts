import type { AuditWriter } from './audit-writer'
import type { Modality } from './catalog'
export type ReservationInput = {
  requestKey: string
  professionalId: string
  roomId?: string | null
  modality: Modality
  startsAt: Date
  endsAt: Date
  state: 'held' | 'confirmed'
  appointmentId?: string | null
  offerId?: string | null
  expiresAt?: Date | null
}
export type Reservation = {
  id: string
  professionalId: string
  roomId: string | null
  modality: Modality
  startsAt: Date
  endsAt: Date
  state: string
  appointmentId: string | null
  offerId: string | null
  expiresAt: Date | null
  requestKey: string
  requestHash: string
}
export interface ReservationTransaction {
  lockRequest(key: string): Promise<void>
  lockResources(professionalIds: string[], roomIds: string[]): Promise<void>
  get(id: string): Promise<Reservation | null>
  byRequest(key: string): Promise<Reservation | null>
  professionalActive(id: string): Promise<boolean>
  activeRooms(): Promise<string[]>
  roomActive(id: string): Promise<boolean>
  expire(
    now: Date,
    professionalIds: string[],
    roomIds: string[],
  ): Promise<number>
  occupied(
    professionalId: string,
    roomId: string | null,
    startsAt: Date,
    endsAt: Date,
    ignoreId?: string,
  ): Promise<boolean>
  create(
    input: ReservationInput,
    roomId: string | null,
    requestHash: string,
  ): Promise<Reservation>
  confirm(id: string, appointmentId: string): Promise<Reservation>
  release(id: string): Promise<Reservation>
  audit: AuditWriter
}
export interface ReservationStore {
  transaction<T>(run: (tx: ReservationTransaction) => Promise<T>): Promise<T>
}
