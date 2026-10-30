import Busboy from 'busboy'
import type { Request } from 'express'
import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditContext } from '../../../application/ports/audit-writer'
import type { ManageFiles } from '../../../application/use-cases/manage-files'
import type { Principal } from '../../../domain/rules/access'

export async function parseOnsiteEvidence(
  req: Request,
  actor: Principal,
  files: ManageFiles,
  context: AuditContext,
  eventId: string,
  maxBytes: number,
) {
  let parser: ReturnType<typeof Busboy>
  try {
    parser = Busboy({
      headers: req.headers,
      limits: {
        fields: 2,
        files: 2,
        parts: 3,
        fieldSize: 200_000,
        fileSize: maxBytes + 1,
      },
    })
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', [
      { field: 'multipart', reason: 'Envie dados e termo assinado.' },
    ])
  }
  let data: unknown
  let fileId: string | null = null
  let upload: Promise<void> | null = null
  let failure: Error | null = null
  const invalid = () =>
    new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'multipart',
        reason: 'Envie primeiro a parte data e depois signedTerm.',
      },
    ])
  try {
    await new Promise<void>((resolve, reject) => {
      parser.on('field', (name, value, info) => {
        if (name !== 'data' || info.valueTruncated || data !== undefined) {
          failure = invalid()
          return
        }
        try {
          data = JSON.parse(value)
        } catch {
          failure = invalid()
        }
      })
      parser.on('file', (name, stream, info) => {
        if (failure || name !== 'signedTerm' || data === undefined || upload) {
          failure = invalid()
          stream.resume()
          return
        }
        upload = files
          .upload({
            actor,
            category: 'attachment',
            ownerPatientId: null,
            linkedResourceType: 'ConsentEvent',
            linkedResourceId: eventId,
            filename: info.filename,
            source: stream,
            context,
          })
          .then((saved) => {
            fileId = saved.fileId
          })
          .catch((error) => {
            failure = error as Error
            stream.resume()
          })
      })
      parser.once('error', reject)
      parser.once('filesLimit', () => {
        failure = invalid()
      })
      parser.once('fieldsLimit', () => {
        failure = invalid()
      })
      parser.once('partsLimit', () => {
        failure = invalid()
      })
      parser.once('close', resolve)
      req.pipe(parser)
    })
    if (upload) await upload
    if (failure) throw failure
    if (!fileId || data === undefined)
      throw new ApplicationError('UNPROCESSABLE_FILE')
    return { data, fileId }
  } catch (error) {
    if (upload) await upload.catch(() => undefined)
    if (fileId) await files.discardUnlinked(fileId)
    throw error
  }
}
