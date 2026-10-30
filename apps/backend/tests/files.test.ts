import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { after, before, test } from 'node:test'
import { DevMalwareScanner } from '../src/infrastructure/files/dev-malware-scanner'
import { LocalEncryptedFileStorage } from '../src/infrastructure/files/local-encrypted-file-storage'

let directory = ''
const key = randomBytes(32)
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vida-files-'))
})
after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

test('arquivo é cifrado, classificado pelo conteúdo e extensão; excesso não fica no disco', async () => {
  const storage = new LocalEncryptedFileStorage(directory, key)
  const scanner = new DevMalwareScanner('test')
  const pdf = Buffer.from(
    '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
  )
  const saved = await storage.write('attachment', Readable.from([pdf]), 1024)
  const classification = await scanner.scan({
    category: 'attachment',
    filename: 'termo.pdf',
    firstBytes: saved.firstBytes,
    size: saved.size,
    maxBytes: 1024,
  })
  assert.equal(classification.detectedType, 'application/pdf')
  assert.equal(classification.status, 'skipped_dev')
  const ciphertext = await readFile(
    join(directory, 'attachment', saved.storageKey),
  )
  assert.ok(!ciphertext.includes(pdf))
  const chunks: Buffer[] = []
  for await (const chunk of await storage.read('attachment', saved.storageKey))
    chunks.push(Buffer.from(chunk))
  assert.deepEqual(Buffer.concat(chunks), pdf)
  for (const filename of ['termo.jpg', 'termo.pdf.exe'])
    await assert.rejects(
      scanner.scan({
        category: 'attachment',
        filename,
        firstBytes: saved.firstBytes,
        size: saved.size,
        maxBytes: 1024,
      }),
      { code: 'UNPROCESSABLE_FILE' },
    )
  await assert.rejects(
    storage.write('attachment', Readable.from([Buffer.alloc(1025)]), 1024),
    { code: 'UNPROCESSABLE_FILE' },
  )
  assert.deepEqual(await readdir(join(directory, 'attachment')), [
    saved.storageKey,
  ])
  await storage.remove('attachment', saved.storageKey)
  assert.deepEqual(await readdir(join(directory, 'attachment')), [])
})

test('scanner de desenvolvimento é bloqueado em produção', () => {
  assert.throws(() => new DevMalwareScanner('production'))
})
