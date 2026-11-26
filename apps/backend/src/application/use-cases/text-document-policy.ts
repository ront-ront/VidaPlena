import { ApplicationError } from '../errors/application-error'
import type {
  ClinicalDocument,
  ClinicalDocumentTransaction,
  DocumentContentPolicy,
} from '../ports/clinical-documents'
import { parseTextDocument } from '../validation/text-document'
export class TextDocumentPolicy implements DocumentContentPolicy {
  readonly allowCompletedEncounter = true
  validate(payload: unknown, templateVersion: string) {
    if (templateVersion !== '1')
      throw new ApplicationError('SERVICE_UNAVAILABLE')
    const value = parseTextDocument(payload)
    if (value.templateVersion !== templateVersion)
      throw new ApplicationError('VALIDATION_ERROR')
    return value
  }
  summary() {
    return 'Documento clínico demonstrativo — sem validade jurídica'
  }
  async beforeIssue(
    _tx: ClinicalDocumentTransaction,
    document: ClinicalDocument,
  ) {
    if (
      !this.validate(
        document.payload,
        document.type.templateVersion,
      ).body.trim()
    )
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'body',
          reason: 'Preencha o conteúdo do documento antes de emitir.',
        },
      ])
  }
}
