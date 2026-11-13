import type { Principal } from '../../domain/rules/access'
import type { AuditWriter } from './audit-writer'
export type ImportPatient = {
  externalId: string
  fullName: string
  birthDate: string
  cpf: string
  email: string | null
  phone: string | null
  sourceSystem: string
}
export type ParsedCsv = {
  rows: { line: number; values: string[] }[]
  fileErrors: string[]
}
export interface PatientCsvParser {
  parse(file: Buffer, maxRows: number): ParsedCsv
}
export type ImportRowResult = {
  line: number
  status: 'accepted' | 'rejected' | 'imported' | 'existing'
  errors: string[]
  duplicateOf?: string
  targetId?: string
  externalId?: string
  fullName?: string
  cpfMasked?: string
  startsAt?: string
  endsAt?: string
  modality?: 'onsite' | 'remote'
  appointmentStatus?: 'confirmed' | 'cancelled' | 'completed'
}
export type StoredImportRow = {
  line: number
  previewStatus: ImportRowResult['status']
  previewErrors: string[]
  previewDuplicateOf: string | null
  finalStatus: ImportRowResult['status'] | null
  finalErrors: string[] | null
  finalDuplicateOf: string | null
  targetId: string | null
}
export type ImportBatch = {
  id: string
  sourceSystem: string
  fileHash: string
  file: Buffer
  fileErrors: string[]
  status: 'preview' | 'invalid' | 'processing' | 'confirmed'
  createdBy: string
  createdAt: Date
  expiresAt: Date
  cutoffDate: Date | null
  confirmedAt: Date | null
  rows: StoredImportRow[]
}
export type ImportReport = {
  batchId: string
  kind: 'patients' | 'appointments'
  sourceSystem: string
  fileHash: string
  status: ImportBatch['status']
  createdAt: string
  createdBy: string
  expiresAt: string
  confirmedAt: string | null
  cutoffDate: string | null
  fileErrors: string[]
  accepted: number
  rejected: number
  imported: number
  existing: number
  replayed: boolean
  rows: ImportRowResult[]
}
export interface PatientImportTransaction {
  principal(actor: Principal): Promise<Principal | null>
  batch(id: string, ownerId: string): Promise<ImportBatch | null>
  saveBatch(batch: ImportBatch): Promise<void>
  identity(
    sourceSystem: string,
    externalId: string,
  ): Promise<{ patientId: string; rowHash: string } | null>
  patient(cpf: string): Promise<{ id: string } | null>
  createPatient(data: ImportPatient): Promise<string | null>
  identify(
    data: ImportPatient,
    rowHash: string,
    patientId: string,
    batch: ImportBatch,
    now: Date,
  ): Promise<void>
  finalize(batchId: string, rows: ImportRowResult[], now: Date): Promise<void>
  command(key: string): Promise<{ inputHash: string; batchId: string } | null>
  recordCommand(
    key: string,
    inputHash: string,
    actorId: string,
    batchId: string,
  ): Promise<void>
  audit: AuditWriter
}
export interface PatientImportStore {
  transaction<T>(
    run: (tx: PatientImportTransaction) => Promise<T>,
    confirm?: boolean,
  ): Promise<T>
}
