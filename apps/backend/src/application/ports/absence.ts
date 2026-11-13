import type { AbsenceKind } from '../../domain/rules/absence'
import type { BookingTransaction } from './booking'
export type AbsenceInput = {
  kind: AbsenceKind
  explanation?: string
  expectedVersion?: number
}
export type AbsenceRecord = {
  id: string
  appointmentId: string
  appointmentVersion: number
  patientId: string
  occurredAt: Date
  penaltyExpiresAt: Date
  clinicTimeZone: string
  kind: AbsenceKind
  explanation: string | null
  recordedBy: string
  recordedAt: Date
  decidedBy: string
  decidedAt: Date
  version: number
}
export interface AbsenceTransaction extends BookingTransaction {
  absence(appointmentId: string): Promise<AbsenceRecord | null>
  saveAbsence(
    input: AbsenceRecord,
    previous: AbsenceRecord | null,
  ): Promise<void>
  recalculate(
    patientId: string,
    now: Date,
    requestId: string,
  ): Promise<{ unjustifiedCount: number; suspendedUntil: Date | null }>
}
export interface AbsenceStore {
  transaction<T>(run: (tx: AbsenceTransaction) => Promise<T>): Promise<T>
}
