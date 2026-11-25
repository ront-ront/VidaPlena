import { ApplicationError } from '../errors/application-error'
import type {
  ClinicalDocument,
  ClinicalDocumentTransaction,
  DocumentContentPolicy,
} from '../ports/clinical-documents'
import type { CanonicalDocuments } from '../ports/signature-provider'
import { parseExamOrder } from '../validation/exam-order'
import type { ManageTerminologies } from './manage-terminologies'
export class ExamOrderPolicy implements DocumentContentPolicy {
  constructor(
    private readonly terminologies: ManageTerminologies,
    private readonly canonical: CanonicalDocuments,
    private readonly now = () => new Date(),
  ) {}
  validate(payload: unknown, templateVersion: string) {
    if (templateVersion !== '1')
      throw new ApplicationError('SERVICE_UNAVAILABLE')
    return parseExamOrder(payload)
  }
  summary() {
    return 'Pedido de exames demonstrativo — sem validade jurídica'
  }
  async prepare(
    tx: ClinicalDocumentTransaction,
    payload: unknown,
    templateVersion: string,
    context: { reusing: boolean },
  ) {
    await tx.lockTerminology('TUSS', true)
    const value = this.validate(payload, templateVersion),
      exams = []
    for (const e of value.exams) {
      const catalog =
        context.reusing && e.tussCode
          ? await tx.activeCatalog('TUSS', true)
          : null
      const snapshot = await this.terminologies.procedureSnapshot(
        tx,
        e.tussCode
          ? {
              code: e.tussCode,
              version: catalog?.version ?? (e.tussVersion as string),
            }
          : null,
        value.privateVisit,
      )
      exams.push({
        ...e,
        description: snapshot?.description ?? e.description,
        tussCode: snapshot?.code,
        tussVersion: snapshot?.version,
        procedureSnapshot: snapshot,
      })
    }
    return { privateVisit: value.privateVisit, exams }
  }
  async beforeIssue(
    tx: ClinicalDocumentTransaction,
    document: ClinicalDocument,
  ) {
    await tx.lockTerminology('TUSS', true)
    const value = this.validate(document.payload, document.type.templateVersion)
    for (const e of value.exams) {
      const snapshot = await this.terminologies.procedureSnapshot(
        tx,
        e.tussCode
          ? { code: e.tussCode, version: e.tussVersion as string }
          : null,
        value.privateVisit,
      )
      if (
        this.canonical.serialize(snapshot) !==
          this.canonical.serialize(e.procedureSnapshot ?? null) ||
        (snapshot && e.description !== snapshot.description)
      )
        throw new ApplicationError('CONFLICT')
    }
    await tx.registerExamOrder(document.id, this.now())
  }
}
