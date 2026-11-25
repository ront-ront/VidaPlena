import type { Principal } from '../../domain/rules/access'
import type { ClinicalRecordTransaction } from './clinical-records'
import type {
  DocumentSigner,
  SignatureEvidence,
  SignatureLevel,
} from './signature-provider'
export const documentTypeCodes = [
  'prescription',
  'certificate',
  'exam_order',
  'declaration',
  'report',
  'referral',
] as const
export type DocumentTypeCode = (typeof documentTypeCodes)[number]
export type DocumentTypeVersion = {
  id: string
  typeId: string
  version: number
  code: DocumentTypeCode
  label: string
  requiredSignatureLevel: SignatureLevel
  templateVersion: string
  active: boolean
  reason: string | null
  changedBy: { id: string; name: string } | null
  createdAt: Date
}
export type ClinicalDocument = {
  id: string
  recordId: string
  patientId: string
  encounterId: string
  authorProfessionalId: string
  type: DocumentTypeVersion
  payloadVersion: number
  payload: unknown
  version: number
  status: 'draft' | 'issued_dev' | 'issued_valid'
  createdAt: Date
  savedAt: Date
  canonical: string | null
  signature: SignatureEvidence | null
  verificationCode: string | null
  verificationCodeHash: string | null
  sha256: string | null
  issuedAt: Date | null
  voidEvent: {
    id: string
    reason: string
    replacementDocumentId: string | null
    createdAt: Date
    authorProfessionalId: string
  } | null
}
export type DocumentSubject = Pick<
  ClinicalDocument,
  'id' | 'patientId' | 'encounterId' | 'authorProfessionalId' | 'status'
>
export type DocumentEncounter = {
  id: string
  recordId: string
  patientId: string
  professionalId: string
  status: string
  appointmentId: string
  appointmentStatus: string
  specialtyId: string
  modality: 'onsite' | 'remote'
}
export interface ClinicalDocumentTransaction extends ClinicalRecordTransaction {
  documentTypes(): Promise<
    { type: DocumentTypeVersion; history: DocumentTypeVersion[] }[]
  >
  documentType(idOrCode: string): Promise<DocumentTypeVersion | null>
  lockDocumentType(typeId: string): Promise<void>
  changeDocumentType(
    type: DocumentTypeVersion,
    actorUserId: string,
    input: {
      requiredSignatureLevel: SignatureLevel
      templateVersion: string
      active: boolean
      reason: string
    },
    now: Date,
  ): Promise<DocumentTypeVersion>
  documentSubject(id: string): Promise<DocumentSubject | null>
  document(id: string): Promise<ClinicalDocument | null>
  documentByVerificationHash(hash: string): Promise<string | null>
  documentEncounter(id: string): Promise<DocumentEncounter | null>
  documentSigner(id: string): Promise<DocumentSigner | null>
  lockDocument(id: string): Promise<void>
  createDocument(
    encounter: DocumentEncounter,
    type: DocumentTypeVersion,
    payload: unknown,
    now: Date,
  ): Promise<ClinicalDocument>
  updateDocument(
    id: string,
    typeVersionId: string,
    payload: unknown,
    expectedVersion: number,
    now: Date,
  ): Promise<ClinicalDocument>
  issueDocument(
    id: string,
    input: {
      canonical: string
      signature: SignatureEvidence
      verificationCode: string
      verificationCodeHash: string
      issuedAt: Date
      status: 'issued_dev' | 'issued_valid'
    },
  ): Promise<ClinicalDocument>
  voidDocument(
    id: string,
    authorProfessionalId: string,
    reason: string,
    replacementDocumentId: string | null,
    now: Date,
  ): Promise<ClinicalDocument>
}
export interface ClinicalDocumentStore {
  transaction<T>(
    run: (tx: ClinicalDocumentTransaction) => Promise<T>,
  ): Promise<T>
}
export interface DocumentContentPolicy {
  validate(payload: unknown, templateVersion: string): unknown
  summary(payload: unknown): string
  beforeIssue(
    tx: ClinicalDocumentTransaction,
    document: ClinicalDocument,
    actor: Principal,
    acknowledgedAllergyIds: string[],
  ): Promise<void>
}
export interface DocumentPolicies {
  get(typeCode: DocumentTypeCode): DocumentContentPolicy | null
}
