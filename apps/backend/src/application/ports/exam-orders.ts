import type { ClinicalDocumentTransaction } from './clinical-documents'
export type PendingExamOrderQuery = {
  professionalId?: string
  patientId?: string
  cursor?: string
}
export type PendingExamOrder = {
  orderId: string
  documentId: string
  patient: { id: string; name: string }
  orderedAt: string
  signatureStatus: 'issued_dev' | 'issued_valid'
}
export interface ExamOrderTransaction extends ClinicalDocumentTransaction {
  pendingExamOrders(
    professionalId: string,
    query: PendingExamOrderQuery,
    cutoff: Date,
    now: Date,
  ): Promise<{ items: PendingExamOrder[]; nextCursor: string | null }>
}
export interface ExamOrderStore {
  transaction<T>(run: (tx: ExamOrderTransaction) => Promise<T>): Promise<T>
}
