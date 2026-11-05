import type { Principal } from '../../domain/rules/access'
import type { AuditWriter } from './audit-writer'
import type { Modality } from './catalog'
import type { ReservationTransaction } from './reservations'
import type { ScheduleSnapshot } from './schedule'
export type AppointmentStatus =
  | 'confirmed'
  | 'waiting'
  | 'in_service'
  | 'completed'
  | 'no_show'
  | 'cancelled'
export type AppointmentRecord = {
  id: string
  patientId: string
  professionalId: string
  specialtyId: string
  roomId: string | null
  modality: Modality
  visitType: 'first' | 'return'
  startsAt: Date
  endsAt: Date
  durationMinutes: number
  specialtyVersion: number
  status: AppointmentStatus
  version: number
  bookingSource: 'portal' | 'reception' | 'fit_in' | 'imported'
  createdBy: string
  parentAppointmentId: string | null
  reason: string | null
  notificationAttention: boolean
}
export type BookInput = {
  patientId: string
  professionalId: string
  specialtyId: string
  modality: Modality
  visitType: 'first' | 'return'
  startsAt: string
  roomId?: string | null
  confirmDuplicateSpecialty?: boolean
}
export type BookingTarget = {
  professionalId: string
  professionalUserId: string
  active: boolean
  linked: boolean
  modalities: Modality[]
  specialtyActive: boolean
  specialtyModalities: Modality[]
  specialtyVersion: number
  durationFirst: number
  durationReturn: number
  schedule: ScheduleSnapshot | null
}
export type BookingPatient = {
  id: string
  active: boolean
  owned: boolean
  consentState: 'active' | 'pending' | 'revoked'
  suspendedUntil: Date | null
}
export interface BookingTransaction {
  lock(key: string, patientId: string): Promise<void>
  principal(actor: Principal): Promise<Principal | null>
  patient(
    actor: Principal,
    id: string,
    now: Date,
  ): Promise<BookingPatient | null>
  target(
    professionalId: string,
    specialtyId: string,
  ): Promise<BookingTarget | null>
  command(
    key: string,
  ): Promise<{ inputHash: string; appointmentId: string } | null>
  recordCommand(
    key: string,
    actorId: string,
    operation: string,
    inputHash: string,
    appointmentId: string,
  ): Promise<void>
  appointment(id: string): Promise<AppointmentRecord | null>
  duplicateAppointments(
    patientId: string,
    specialtyId: string,
    now: Date,
    exceptId?: string,
  ): Promise<{ id: string; startsAt: Date }[]>
  create(input: AppointmentRecord): Promise<AppointmentRecord>
  history(
    appointment: AppointmentRecord,
    actor: Principal,
    action: string,
    previous?: AppointmentRecord,
    reason?: string,
  ): Promise<void>
  notify(
    appointment: AppointmentRecord,
    type: 'appointment.confirmed',
    requestId: string,
  ): Promise<'queued' | 'unreachable'>
  reservations: ReservationTransaction
  audit: AuditWriter
}
export interface BookingStore {
  transaction<T>(run: (tx: BookingTransaction) => Promise<T>): Promise<T>
}
export const appointmentSummary = (row: AppointmentRecord) => ({
  id: row.id,
  patientId: row.patientId,
  professionalId: row.professionalId,
  specialtyId: row.specialtyId,
  roomId: row.roomId,
  modality: row.modality,
  visitType: row.visitType,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  durationMinutes: row.durationMinutes,
  specialtyVersion: row.specialtyVersion,
  status: row.status,
  version: row.version,
  bookingSource: row.bookingSource,
  parentAppointmentId: row.parentAppointmentId,
  notificationAttention: row.notificationAttention,
})
