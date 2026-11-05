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
  // Slot eligibility is revalidated in the same reservation transaction.
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
export type AppointmentOrigin = 'patient' | 'reception' | 'clinic'
export type RescheduleInput = {
  startsAt: string
  professionalId?: string
  modality?: Modality
  roomId?: string | null
  reason?: string
  origin?: AppointmentOrigin
  expectedVersion: number
}
export type OwnAppointmentsQuery = {
  patientId?: string
  status?: AppointmentStatus
  from?: Date
  to?: Date
  cursor?: string
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
  update(
    id: string,
    version: number,
    input: Partial<
      Pick<
        AppointmentRecord,
        | 'professionalId'
        | 'roomId'
        | 'modality'
        | 'startsAt'
        | 'endsAt'
        | 'durationMinutes'
        | 'specialtyVersion'
        | 'status'
        | 'reason'
      >
    >,
  ): Promise<AppointmentRecord>
  confirmedReservation(appointmentId: string): Promise<{ id: string } | null>
  invalidateNotifications(appointmentId: string): Promise<void>
  ownAppointments(
    actor: Principal,
    query: OwnAppointmentsQuery,
  ): Promise<{ items: AppointmentRecord[]; nextCursor: string | null }>
  history(
    appointment: AppointmentRecord,
    actor: Principal,
    action: string,
    previous?: AppointmentRecord,
    reason?: string,
    origin?: AppointmentOrigin,
  ): Promise<void>
  notify(
    appointment: AppointmentRecord,
    type:
      | 'appointment.confirmed'
      | 'appointment.rescheduled'
      | 'appointment.rescheduled_by_clinic',
    requestId: string,
    previousProfessionalId?: string,
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
