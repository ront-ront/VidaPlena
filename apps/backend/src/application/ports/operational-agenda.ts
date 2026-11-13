import type { Principal } from '../../domain/rules/access'
import type {
  AppointmentStatus,
  appointmentSummary,
  BookingTransaction,
} from './booking'
import type { CheckInRecord } from './check-in'
export type AgendaQuery = {
  localDate?: string
  professionalId?: string
  specialtyId?: string
  status?: AppointmentStatus
  patientQuery?: string
  cursor?: string
  absenceEligibleOnly?: boolean
}
export type OperationalAppointment = ReturnType<typeof appointmentSummary> & {
  patientChangeDeadline: string
  lastChange: {
    action: 'rescheduled' | 'cancelled'
    origin: 'patient' | 'reception' | 'clinic' | null
    occurredAt: string
  } | null
  importOrigin: {
    sourceSystem: string
    externalId: string
    batchId: string
    importedAt: string
    importedBy: string
    historicalStatus: 'undated' | 'before_cutoff' | 'on_or_after_cutoff'
  } | null
  patient: {
    id: string
    name: string
    birthDate: string | null
    cpfMasked: string | null
    importOrigin?: {
      sourceSystem: string
      externalId: string
      batchId: string
      importedAt: string
      importedBy: string
      historicalStatus: 'undated'
    } | null
  }
  professional: { id: string; name: string }
  specialty: { id: string; name: string }
  room: { id: string; name: string } | null
  checkIn: { arrivedAt: string; recordedAt: string; lateFlag: boolean } | null
  administrativeFlags: string[]
  noShowEligible: boolean
  absence: {
    kind: import('../../domain/rules/absence').AbsenceKind
    version: number
    recordedAt: string
    decidedAt: string
  } | null
}
export interface OperationalTransaction extends BookingTransaction {
  checkIn(id: string, version: number): Promise<CheckInRecord | null>
  createCheckIn(input: Omit<CheckInRecord, 'id'>): Promise<CheckInRecord>
  administrativeFlags(patientId: string, now: Date): Promise<string[]>
  professionalFor(actor: Principal): Promise<string | null>
  day(
    query: AgendaQuery,
    from: Date,
    to: Date,
    identityFields: boolean,
    now: Date,
    absenceFields: boolean,
  ): Promise<{
    items: OperationalAppointment[]
    totals: { all: number; confirmed: number; noShow: number }
    nextCursor: string | null
  }>
}
export interface OperationalStore {
  transaction<T>(run: (tx: OperationalTransaction) => Promise<T>): Promise<T>
}
