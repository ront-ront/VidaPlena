import { Readable } from 'node:stream'
import Busboy from 'busboy'
import type { Request } from 'express'
import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditContext } from '../../../application/ports/audit-writer'
import type { ExamResultIntent } from '../../../application/ports/exam-results'
import type { ManageExamResults } from '../../../application/use-cases/manage-exam-results'
import type { ManageFiles } from '../../../application/use-cases/manage-files'
import type { Principal } from '../../../domain/rules/access'
import { examResultMetadata } from './contracts/exam-results'
import { parseInput } from './parse-input'

export async function parseExamResultMultipart(
  req: Request,
  actor: Principal,
  service: ManageExamResults,
  files: ManageFiles,
  context: AuditContext,
  maxBytes: number,
) {
  const invalid = () =>
    new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'multipart',
        reason:
          'Envie a parte data com os metadados e depois a parte resultFile.',
      },
    ])
  let parser: ReturnType<typeof Busboy>
  try {
    parser = Busboy({
      headers: req.headers,
      limits: {
        fields: 2,
        files: 2,
        parts: 3,
        fieldSize: 10000,
        fileSize: maxBytes + 1,
      },
    })
  } catch {
    throw invalid()
  }
  let prepared: Promise<ExamResultIntent> | null = null,
    upload: Promise<void> | null = null,
    fileId: string | null = null,
    failure: unknown = null,
    fileStream: Readable | null = null
  const aborted = () => {
    fileStream?.destroy()
    parser.destroy(invalid())
  }
  req.once('aborted', aborted)
  try {
    await new Promise<void>((resolve, reject) => {
      parser.on('field', (name, value, info) => {
        if (name !== 'data' || info.valueTruncated || prepared || failure) {
          failure = invalid()
          return
        }
        try {
          prepared = service.prepare(
            actor,
            parseInput(examResultMetadata, JSON.parse(value)),
            context,
          )
          void prepared.catch((error) => {
            failure = error
          })
        } catch (error) {
          failure = error instanceof ApplicationError ? error : invalid()
        }
      })
      parser.on('file', (name, stream, info) => {
        fileStream = stream
        if (failure || name !== 'resultFile' || !prepared || upload) {
          failure = invalid()
          stream.resume()
          return
        }
        const preparation = prepared
        upload = (async () => {
          const intent = await preparation
          const saved = await files.upload({
            actor,
            category: 'result',
            ownerPatientId: intent.patientId,
            linkedResourceType: 'ExamResult',
            linkedResourceId: intent.id,
            filename: info.filename,
            // Storage pipeline errors must leave Busboy free to drain the request.
            source: Readable.from(stream.iterator({ destroyOnReturn: false })),
            context,
          })
          fileId = saved.fileId
        })().catch((error) => {
          failure = error
          stream.resume()
        })
      })
      parser.once('error', reject)
      for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const)
        parser.once(event, () => {
          failure = invalid()
        })
      parser.once('close', resolve)
      req.pipe(parser)
    })
    if (upload) await upload
    if (prepared) await prepared
    if (failure) throw failure
    if (!prepared || !fileId) throw new ApplicationError('UNPROCESSABLE_FILE')
    return { intent: await prepared, fileId }
  } catch (error) {
    fileStream?.destroy()
    if (upload) await upload
    if (fileId) await files.discardUnlinked(fileId)
    throw error
  } finally {
    req.off('aborted', aborted)
  }
}
