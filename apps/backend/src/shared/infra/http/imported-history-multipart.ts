import { Readable } from 'node:stream'
import Busboy from 'busboy'
import type { Request } from 'express'
import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditContext } from '../../../application/ports/audit-writer'
import type { ImportedHistoryIntent } from '../../../application/ports/imported-history'
import type { ManageFiles } from '../../../application/use-cases/manage-files'
import type { ManageImportedHistory } from '../../../application/use-cases/manage-imported-history'
import type { Principal } from '../../../domain/rules/access'
import { importedHistoryMetadata } from './contracts/imported-history'
import { parseInput } from './parse-input'

export async function parseImportedHistoryMultipart(
  req: Request,
  actor: Principal,
  patientId: string,
  service: ManageImportedHistory,
  files: ManageFiles,
  context: AuditContext,
  maxBytes: number,
) {
  const invalid = () =>
    new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'multipart',
        reason: 'Envie a parte data com os metadados e depois a parte file.',
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
  let prepared: Promise<ImportedHistoryIntent> | null = null,
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
            patientId,
            parseInput(importedHistoryMetadata, JSON.parse(value)),
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
        if (failure || name !== 'file' || !prepared || upload) {
          failure = invalid()
          stream.resume()
          return
        }
        const preparation = prepared
        upload = (async () => {
          const intent = await preparation
          const saved = await files.upload({
            actor,
            category: 'attachment',
            ownerPatientId: patientId,
            linkedResourceType: 'ImportedHistory',
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
