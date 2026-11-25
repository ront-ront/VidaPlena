import type { AuditContext } from './audit-writer'
import type {
  ClinicalDocument,
  ClinicalDocumentTransaction,
} from './clinical-documents'
import type { DocumentSigner } from './signature-provider'
export type ClinicalDocumentFile = {
  id: string
  contentType: string
  size: number
  sha256: string
}
export interface DocumentArtifactWriter {
  stage(
    tx: ClinicalDocumentTransaction,
    document: ClinicalDocument,
    input: {
      signer: DocumentSigner
      issuedAt: Date
      verificationCode: string
      developmentOnly: boolean
      context: AuditContext
    },
  ): Promise<{ fileId: string; discard(): Promise<void> } | null>
}
