import type { AppointmentRecord, BookingTransaction } from './booking'
import type {
  ImportBatch,
  ImportRowResult,
  PatientImportTransaction,
  StoredImportRow,
} from './patient-imports'
export type ImportAppointment = {
  externalId: string
  patientCpf: string
  professionalExternalId: string
  specialtyCode: string
  roomName: string
  startsAt: string
  endsAt: string
  modality: 'onsite' | 'remote'
  visitType: 'first' | 'return'
  status: 'confirmed' | 'cancelled' | 'completed'
  sourceSystem: string
}
export interface AppointmentImportTransaction
  extends Pick<
    PatientImportTransaction,
    'principal' | 'batch' | 'saveBatch' | 'command' | 'recordCommand' | 'audit'
  > {
  kind(id: string, ownerId: string): Promise<'patients' | 'appointments' | null>
  occupied(data: AppointmentRecord, now: Date): Promise<boolean>
  row(batchId: string, line: number): Promise<StoredImportRow | null>
  patient(
    cpf: string,
  ): Promise<{ id: string; active: boolean; revoked: boolean } | null>
  references(data: ImportAppointment): Promise<{
    professionalId: string | null
    specialtyId: string | null
    roomId: string | null
  }>
  identity(
    sourceSystem: string,
    externalId: string,
  ): Promise<{ appointmentId: string; rowHash: string } | null>
  start(batchId: string): Promise<void>
  finishRow(batchId: string, row: ImportRowResult): Promise<void>
  complete(batchId: string, now: Date): Promise<void>
  identify(
    data: ImportAppointment,
    rowHash: string,
    appointmentId: string,
    batch: ImportBatch,
    now: Date,
    historicalStatus: string,
  ): Promise<void>
  booking: BookingTransaction
}
export interface AppointmentImportStore {
  transaction<T>(
    run: (tx: AppointmentImportTransaction) => Promise<T>,
  ): Promise<T>
}
