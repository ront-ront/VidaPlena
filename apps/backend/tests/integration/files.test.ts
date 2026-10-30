import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { after, before, test } from 'node:test'
import type { FileAccessPolicy } from '../../src/application/ports/files'
import { ManageFiles } from '../../src/application/use-cases/manage-files'
import type { Principal } from '../../src/domain/rules/access'
import { DevMalwareScanner } from '../../src/infrastructure/files/dev-malware-scanner'
import { LocalEncryptedFileStorage } from '../../src/infrastructure/files/local-encrypted-file-storage'
import { ConsentEvidenceReconciler } from '../../src/infrastructure/jobs/consent-evidence-reconciler'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { PrismaFileRepository } from '../../src/infrastructure/persistence/prisma/file-repository'
import { HmacFileDownloadTokens } from '../../src/infrastructure/security/file-download-tokens'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use TEST_DATABASE_URL de um banco isolado _test.')
const db = createPrismaClient(url)
const pdf = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
)
let directory = ''
let actor: Principal
let stranger: Principal
let files: ManageFiles
const signedTokens = new HmacFileDownloadTokens(randomBytes(32))
const policy: FileAccessPolicy = {
  async canUpload(principal) {
    return principal?.userId === actor.userId
  },
  async canDownload(principal) {
    return principal.userId === actor.userId
  },
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vp-files-integration-'))
  const owner = await db.user.create({
    data: { email: `${randomUUID()}@example.test`, fullName: 'Autor fictício' },
  })
  const other = await db.user.create({
    data: { email: `${randomUUID()}@example.test`, fullName: 'Outro fictício' },
  })
  actor = {
    userId: owner.id,
    sessionId: randomUUID(),
    roles: ['admin'],
    permissions: [],
    mfaVerified: true,
  }
  stranger = { ...actor, userId: other.id }
  files = new ManageFiles(
    new LocalEncryptedFileStorage(directory, randomBytes(32)),
    new DevMalwareScanner('test'),
    new PrismaFileRepository(db),
    policy,
    signedTokens,
    {
      attachmentMaxMb: 1,
      resultMaxMb: 1,
      recordingMaxMb: 1,
      maxPerRecord: 1,
      signedUrlTtlSeconds: 120,
    },
  )
})
after(async () => {
  await db.$disconnect()
  if (directory) await rm(directory, { recursive: true, force: true })
})

test('upload atômico e link limitado à sessão, permissão vigente e auditoria', async () => {
  const resourceId = randomUUID()
  const context = {
    requestId: randomUUID(),
    authorizationBasis: 'test:explicit',
  }
  const upload = (filename: string, source: Buffer) =>
    files.upload({
      actor,
      category: 'attachment',
      ownerPatientId: null,
      linkedResourceType: 'ConsentRecord',
      linkedResourceId: resourceId,
      filename,
      source: Readable.from([source]),
      context,
    })
  await assert.rejects(upload('falso.jpg', pdf), {
    code: 'UNPROCESSABLE_FILE',
  })
  assert.equal(
    await db.fileObject.count({ where: { linkedResourceId: resourceId } }),
    0,
  )
  await assert.rejects(upload('grande.pdf', Buffer.alloc(1024 * 1024 + 1)), {
    code: 'UNPROCESSABLE_FILE',
  })
  assert.equal(
    await db.fileObject.count({ where: { linkedResourceId: resourceId } }),
    0,
  )

  const saved = await upload('termo.pdf', pdf)
  await assert.rejects(upload('outro.pdf', pdf), { code: 'UNPROCESSABLE_FILE' })
  const row = await db.fileObject.findUniqueOrThrow({
    where: { id: saved.fileId },
  })
  assert.equal(row.scanStatus, 'skipped_dev')
  assert.equal(
    await db.fileObject.count({ where: { linkedResourceId: resourceId } }),
    1,
  )
  const encrypted = await readFile(
    join(directory, 'attachment', row.storageKey),
  )
  assert.ok(!encrypted.includes(pdf))
  const link = await files.downloadLink(actor, saved.fileId, context)
  const token = link.url.split('/').at(-1) ?? ''
  await assert.rejects(files.download(stranger, token, context), {
    code: 'FORBIDDEN',
  })
  const output = await files.download(actor, token, context)
  const chunks: Buffer[] = []
  for await (const chunk of output.stream) chunks.push(Buffer.from(chunk))
  assert.deepEqual(Buffer.concat(chunks), pdf)
  assert.equal(
    await db.auditEvent.count({
      where: { action: 'file.downloaded', resourceId: saved.fileId },
    }),
    1,
  )
  const expiry = new Date(link.expiresAt.getTime() + 1)
  assert.equal(signedTokens.verify(token, expiry), null)
  await new PrismaFileRepository(db).revoke(saved.fileId, new Date())
  await assert.rejects(files.download(actor, token, context), {
    code: 'NOT_FOUND_OR_FORBIDDEN',
  })
})

test('reconciliação remove evidência sem evento após interrupção', async () => {
  const saved = await files.upload({
    actor,
    category: 'attachment',
    ownerPatientId: null,
    linkedResourceType: 'ConsentEvent',
    linkedResourceId: randomUUID(),
    filename: 'termo.pdf',
    source: Readable.from([pdf]),
    context: { requestId: randomUUID(), authorizationBasis: 'test:explicit' },
  })
  const row = await db.fileObject.update({
    where: { id: saved.fileId },
    data: { createdAt: new Date(Date.now() - 120 * 60_000) },
  })
  const reconciler = new ConsentEvidenceReconciler(db, files, 60)
  assert.equal(await reconciler.runOnce(), 1)
  assert.equal(
    await db.fileObject.findUnique({ where: { id: saved.fileId } }),
    null,
  )
  await assert.rejects(readFile(join(directory, 'attachment', row.storageKey)))
})
