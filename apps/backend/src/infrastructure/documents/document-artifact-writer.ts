import { Readable } from 'node:stream'
import { ApplicationError } from '../../application/errors/application-error'
import type { DocumentArtifactWriter } from '../../application/ports/document-artifacts'
import type {
  FileRepository,
  FileStorage,
  MalwareScanner,
} from '../../application/ports/files'
import type { ClinicalDocumentPdfRenderer } from './clinical-document-pdf-renderer'
export class LocalDocumentArtifactWriter implements DocumentArtifactWriter {
  constructor(
    private readonly renderer: ClinicalDocumentPdfRenderer,
    private readonly storage: FileStorage,
    private readonly scanner: MalwareScanner,
    private readonly files: FileRepository,
    private readonly maxBytes: number,
    private readonly maxPerRecord: number,
  ) {}
  async stage(
    ...[tx, document, input]: Parameters<DocumentArtifactWriter['stage']>
  ) {
    if (!['prescription', 'exam_order'].includes(document.type.code))
      return null
    const patient = await tx.identification(document.patientId),
      record = await tx.record(document.patientId)
    if (!patient) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    const bytes = await this.renderer.render(
      document,
      patient,
      record.recordNumber,
      input,
    )
    const stored = await this.storage.write(
      'attachment',
      Readable.from([bytes]),
      this.maxBytes,
    )
    try {
      const scan = await this.scanner.scan({
        category: 'attachment',
        filename: 'documento-demonstrativo.pdf',
        firstBytes: stored.firstBytes,
        size: stored.size,
        maxBytes: this.maxBytes,
      })
      const file = await tx.attachDocumentFile(
        document,
        stored,
        scan,
        this.maxPerRecord,
        input.context,
      )
      return {
        fileId: file.id,
        discard: async () => {
          // A lost commit acknowledgement must never delete an already committed file.
          if (!(await this.files.get(file.id)))
            await this.storage.remove('attachment', stored.storageKey)
        },
      }
    } catch (error) {
      await this.storage
        .remove('attachment', stored.storageKey)
        .catch(() => undefined)
      throw error
    }
  }
}
