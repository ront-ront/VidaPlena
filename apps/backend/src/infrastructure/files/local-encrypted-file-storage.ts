import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  randomUUID,
} from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { appendFile, mkdir, open, stat, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline, Transform } from 'node:stream'
import { promisify } from 'node:util'
import { ApplicationError } from '../../application/errors/application-error'
import type { FileCategory, FileStorage } from '../../application/ports/files'

const pipelineAsync = promisify(pipeline)
const validKey = /^[a-f0-9-]{36}$/i

export class LocalEncryptedFileStorage implements FileStorage {
  private readonly root: string
  constructor(
    root: string,
    private readonly masterKey: Buffer,
  ) {
    if (masterKey.length !== 32) throw new Error('Chave de arquivos inválida.')
    this.root = resolve(root)
  }
  private path(category: FileCategory, storageKey: string) {
    if (!validKey.test(storageKey)) throw new Error('Identificador inválido.')
    return join(this.root, category, storageKey)
  }
  private key(category: FileCategory) {
    return Buffer.from(
      hkdfSync('sha256', this.masterKey, 'vidaplena-files-v1', category, 32),
    )
  }
  async write(category: FileCategory, source: Readable, maxBytes: number) {
    const storageKey = randomUUID()
    const directory = join(this.root, category)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const path = this.path(category, storageKey)
    const iv = randomBytes(12)
    const handle = await open(path, 'wx', 0o600)
    try {
      await handle.writeFile(iv)
    } finally {
      await handle.close()
    }
    let size = 0
    const prefix: Buffer[] = []
    let prefixBytes = 0
    const hash = createHash('sha256')
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        if (size > maxBytes) {
          callback(
            new ApplicationError('UNPROCESSABLE_FILE', [
              { field: 'file', reason: 'O arquivo excede o limite permitido.' },
            ]),
          )
          return
        }
        hash.update(chunk)
        if (prefixBytes < 8192) {
          const part = chunk.subarray(0, 8192 - prefixBytes)
          prefix.push(part)
          prefixBytes += part.length
        }
        callback(null, chunk)
      },
    })
    const cipher = createCipheriv('aes-256-gcm', this.key(category), iv)
    try {
      await pipelineAsync(
        source,
        meter,
        cipher,
        createWriteStream(path, { flags: 'a', mode: 0o600 }),
      )
      await appendFile(path, cipher.getAuthTag())
      return {
        category,
        storageKey,
        size,
        sha256: hash.digest('hex'),
        firstBytes: Buffer.concat(prefix),
      }
    } catch (error) {
      await unlink(path).catch(() => undefined)
      throw error
    }
  }
  async read(category: FileCategory, storageKey: string) {
    const path = this.path(category, storageKey)
    const file = await stat(path)
    if (file.size < 28) throw new Error('Arquivo cifrado inválido.')
    const handle = await open(path, 'r')
    const iv = Buffer.alloc(12)
    const tag = Buffer.alloc(16)
    try {
      await handle.read(iv, 0, 12, 0)
      await handle.read(tag, 0, 16, file.size - 16)
    } finally {
      await handle.close()
    }
    const decrypt = () => {
      const decipher = createDecipheriv('aes-256-gcm', this.key(category), iv)
      decipher.setAuthTag(tag)
      return createReadStream(path, { start: 12, end: file.size - 17 }).pipe(
        decipher,
      )
    }
    // GCM authenticates at EOF. Verify once before any plaintext is handed to HTTP.
    for await (const _chunk of decrypt()) {
      // Streaming verification keeps memory bounded for recordings.
    }
    return decrypt()
  }
  async remove(category: FileCategory, storageKey: string) {
    await unlink(this.path(category, storageKey)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    })
  }
}
