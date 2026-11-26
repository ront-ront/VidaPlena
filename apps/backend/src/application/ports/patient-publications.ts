import type { ClinicalDocumentTransaction } from './clinical-documents'
import type { ClinicalEvolutionTransaction } from './clinical-evolutions'
import type { ExamResultTransaction } from './exam-results'
import type { TerminologySnapshot } from './terminologies'
export type PublicationResourceType =
  | 'ClinicalDocument'
  | 'ExamResult'
  | 'ClinicalEvolution'
export type PublicationKind =
  | 'document'
  | 'result'
  | 'orientation'
  | 'confirmed_summary'
export type PublicationProjection = {
  text: string
  diagnosisConfirmed?: true
  diagnosisCodes?: { code: string; version: string }[]
}
export type PublicationInput = {
  patientId: string
  resourceType: PublicationResourceType
  resourceId: string
  visibilityKind: PublicationKind
  reviewedForPatient: true
  projection?: PublicationProjection
}
export type PublishedProjection = {
  text: string
  diagnoses?: TerminologySnapshot[]
  diagnosisConfirmed?: true
}
export type PublicationSource = {
  patientId: string
  recordId: string
  encounterId: string | null
  authorProfessionalId: string | null
  occurredAt: Date | null
  specialtyId: string | null
  modality: 'onsite' | 'remote' | null
  timelineType: string
  eligible: boolean
  importedOrigin: {
    origin: string
    importedAt: string
    importedBy: string
  } | null
}
export type PatientPublication = {
  id: string
  patientId: string
  resourceType: PublicationResourceType
  resourceId: string
  visibilityKind: PublicationKind
  publishedByProfessionalId: string
  publishedAt: Date
  occurredAt: Date
  timelineType: string
  professional: { id: string; name: string }
  specialty: { id: string; name: string } | null
  modality: 'onsite' | 'remote' | null
  projection: PublishedProjection | null
  importedOrigin: PublicationSource['importedOrigin']
  revokedAt: Date | null
}
export type PublicationQuery = {
  cursor?: string
  from?: string
  to?: string
  specialtyId?: string
  type?: string
  state?: 'active' | 'revoked' | 'all'
}
export interface PatientPublicationTransaction
  extends ClinicalDocumentTransaction,
    ClinicalEvolutionTransaction,
    ExamResultTransaction {
  publicationSource(
    type: PublicationResourceType,
    id: string,
  ): Promise<PublicationSource | null>
  publication(id: string): Promise<PatientPublication | null>
  activePublication(
    type: PublicationResourceType,
    id: string,
    kind: PublicationKind,
  ): Promise<PatientPublication | null>
  publicationPage(
    patientId: string,
    query: PublicationQuery,
  ): Promise<{ items: PatientPublication[]; nextCursor: string | null }>
  createPublication(
    input: PublicationInput,
    source: PublicationSource,
    projection: PublishedProjection | null,
    professionalId: string,
    now: Date,
  ): Promise<PatientPublication>
  revokePublication(
    id: string,
    professionalId: string,
    reason: string,
    now: Date,
  ): Promise<PatientPublication>
}
export interface PatientPublicationStore {
  transaction<T>(
    run: (tx: PatientPublicationTransaction) => Promise<T>,
  ): Promise<T>
}
