import type { AuditContext } from './audit-writer'
import type { ClinicalRecordTransaction } from './clinical-records'
export type ExamResultInput = {
  patientId: string
  origin: 'ordered' | 'external'
  orderId?: string
}
export type ExamResultIntent = ExamResultInput & { id: string }
export type ExamResultQuery = { orderId?: string; cursor?: string }
export type ResultOrder = {
  id: string
  documentId: string
  recordId: string
  patientId: string
  requesterId: string
  requesterUserId: string
  specialtyId: string
  modality: 'onsite' | 'remote'
  issued: boolean
  voided: boolean
}
export type ExamResultRecord = {
  id: string
  patientId: string
  recordId: string
  orderId: string | null
  submittedBy: string
  receivedAt: Date
  origin: 'ordered' | 'external'
  file: {
    id: string
    contentType: string
    size: number
    sha256: string
    scanStatus: string
  }
}
export interface ExamResultTransaction extends ClinicalRecordTransaction {
  uploadSubject(
    userId: string,
    patientId: string,
  ): Promise<{
    exists: boolean
    owns: boolean
    consentState: 'active' | 'pending' | 'revoked'
  }>
  resultOrder(id: string): Promise<ResultOrder | null>
  lockResultOrder(id: string): Promise<void>
  resultSubject(
    id: string,
  ): Promise<{ patientId: string; recordId: string } | null>
  result(id: string): Promise<ExamResultRecord | null>
  results(
    recordId: string,
    query: ExamResultQuery,
  ): Promise<{ items: ExamResultRecord[]; nextCursor: string | null }>
  resultFileMatches(
    intent: ExamResultIntent,
    fileId: string,
    userId: string,
  ): Promise<boolean>
  createResult(
    intent: ExamResultIntent,
    recordId: string,
    fileId: string,
    userId: string,
    now: Date,
  ): Promise<void>
  markOrderReceived(orderId: string, now: Date): Promise<void>
  retainResult(
    resultId: string,
    recordId: string,
    now: Date,
    years: number,
    retainUntil: Date,
  ): Promise<void>
  queueResultNotice(
    order: ResultOrder,
    resultId: string,
    context: AuditContext,
  ): Promise<void>
}
export interface ExamResultStore {
  transaction<T>(run: (tx: ExamResultTransaction) => Promise<T>): Promise<T>
}
