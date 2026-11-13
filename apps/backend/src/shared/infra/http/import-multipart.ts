import Busboy from 'busboy'
import type { Request } from 'express'
import { ApplicationError } from '../../../application/errors/application-error'
export async function parseImportMultipart(req: Request, maxBytes: number) {
  const invalid = () =>
    new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'multipart',
        reason: 'Envie um arquivo file e a origem sourceSystem.',
      },
    ])
  let parser: ReturnType<typeof Busboy>
  try {
    parser = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fields: 1,
        parts: 3,
        fileSize: maxBytes + 1,
        fieldSize: 1024,
      },
    })
  } catch {
    throw invalid()
  }
  let sourceSystem: string | undefined,
    file: Buffer | undefined,
    failure: Error | undefined
  await new Promise<void>((resolve, reject) => {
    const aborted = () => {
      parser.destroy()
      reject(invalid())
    }
    req.once('aborted', aborted)
    parser.on('field', (name, value, info) => {
      if (
        name !== 'sourceSystem' ||
        sourceSystem !== undefined ||
        info.valueTruncated
      )
        failure = invalid()
      else sourceSystem = value
    })
    parser.on('file', (name, stream) => {
      if (name !== 'file' || file !== undefined) {
        failure = invalid()
        stream.resume()
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      file = Buffer.alloc(0)
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBytes) {
          failure = new ApplicationError('IMPORT_TOO_LARGE')
          chunks.length = 0
        } else if (!failure) chunks.push(chunk)
      })
      stream.on('limit', () => {
        failure = new ApplicationError('IMPORT_TOO_LARGE')
        chunks.length = 0
      })
      stream.once('error', reject)
      stream.on('end', () => {
        if (!failure) file = Buffer.concat(chunks)
      })
    })
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'])
      parser.once(event, () => {
        failure = invalid()
      })
    parser.once('error', () => reject(invalid()))
    parser.once('close', () => {
      req.off('aborted', aborted)
      resolve()
    })
    req.pipe(parser)
  })
  if (failure) throw failure
  if (sourceSystem === undefined || file === undefined) throw invalid()
  return { sourceSystem, file }
}
