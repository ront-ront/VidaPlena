import type { ClinicalRecordTransaction } from './clinical-records'
export type ImportedHistoryMetadata = {
  origin: string
  originalDate?: string
  originalAuthor?: string
}
export type ImportedHistoryIntent = ImportedHistoryMetadata & {
  id: string
  patientId: string
}
export type HistoryProfessional = { id: string; name: string }
export type ImportedHistoryCheck = {
  id: string
  professional: HistoryProfessional
  checkedAt: Date
}
export type ImportedHistoryAddendum = {
  id: string
  professional: HistoryProfessional
  reason: string
  correctionText: string
  createdAt: Date
}
export type ImportedHistoryRecord = {
  id: string
  patientId: string
  originalDate: Date | null
  origin: string
  originalAuthor: string | null
  importedBy: string
  importedAt: Date
  file: { id: string; contentType: string; size: number; scanStatus: string }
  check: ImportedHistoryCheck | null
  addenda: ImportedHistoryAddendum[]
}
export interface ImportedHistoryTransaction extends ClinicalRecordTransaction {
  historySubject(
    id: string,
  ): Promise<{ patientId: string; recordId: string } | null>
  lockHistory(id: string): Promise<void>
  history(id: string): Promise<ImportedHistoryRecord | null>
  historyFileMatches(
    intent: ImportedHistoryIntent,
    fileId: string,
    userId: string,
  ): Promise<boolean>
  createHistory(
    intent: ImportedHistoryIntent,
    recordId: string,
    fileId: string,
    userId: string,
    now: Date,
  ): Promise<void>
  checkHistory(
    id: string,
    professionalId: string,
    now: Date,
  ): Promise<ImportedHistoryCheck>
  addHistoryAddendum(
    id: string,
    professionalId: string,
    input: { reason: string; correctionText: string },
    now: Date,
  ): Promise<ImportedHistoryAddendum>
}
export interface ImportedHistoryStore {
  transaction<T>(
    run: (tx: ImportedHistoryTransaction) => Promise<T>,
  ): Promise<T>
}
