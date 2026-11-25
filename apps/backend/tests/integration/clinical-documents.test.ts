import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import request from 'supertest'
import { z } from 'zod'
import type { AuditWriter } from '../../src/application/ports/audit-writer'
import type { AuthStore } from '../../src/application/ports/authentication'
import type {
  DocumentPolicies,
  DocumentTypeCode,
} from '../../src/application/ports/clinical-documents'
import type { SessionVerifier } from '../../src/application/ports/session-verifier'
import type { SignatureProvider } from '../../src/application/ports/signature-provider'
import type { Authorize } from '../../src/application/use-cases/authorize'
import type { AuthorizeClinical } from '../../src/application/use-cases/authorize-clinical'
import type { ManageCareLinks } from '../../src/application/use-cases/manage-care-links'
import { ManageClinicalDocuments } from '../../src/application/use-cases/manage-clinical-documents'
import type { ManageDocumentTypes } from '../../src/application/use-cases/manage-document-types'
import { JcsCanonicalDocuments } from '../../src/infrastructure/documents/canonical-documents'
import {
  DevSignatureProvider,
  DisabledSignatureProvider,
} from '../../src/infrastructure/documents/dev-signature-provider'
import type { PrismaClinicalDocumentStore } from '../../src/infrastructure/persistence/prisma/clinical-document-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { CryptoOpaqueTokens } from '../../src/infrastructure/security/passwords'
import { services } from '../../src/shared/composition/container'
import { createApp } from '../../src/shared/infra/http/app'
import { createClinicalDocumentRouter } from '../../src/shared/infra/http/clinical-document-router'
import {
  clinicalDocumentResponse,
  documentTypesResponse,
  publicDocumentVerificationResponse,
} from '../../src/shared/infra/http/contracts/clinical-documents'
import { parseInput } from '../../src/shared/infra/http/parse-input'
import { createClinicalFixture } from '../support/m2-clinical'

let f: Awaited<ReturnType<typeof createClinicalFixture>>
let manager: Awaited<ReturnType<typeof f.account>>
const fixturePolicies: DocumentPolicies = {
  get: () => ({
    validate: (payload) =>
      parseInput(z.object({ body: z.string().min(1) }).strict(), payload),
    summary: () => 'Documento fictício de teste sem validade jurídica',
    beforeIssue: async () => {},
  }),
}
before(async () => {
  f = await createClinicalFixture()
  manager = await f.account('manager')
})
beforeEach(async () => {
  await f.clearActive()
})
after(async () => {
  if (f) await f.close()
})
const actor = () => f.principal(f.professionalAccounts[0], 'professional')
const context = () => ({
  requestId: randomUUID(),
  actorRoles: ['professional'],
  authorizationBasis: 'test',
})
function engine(
  provider: SignatureProvider = new DevSignatureProvider('test'),
  policies = fixturePolicies,
) {
  return new ManageClinicalDocuments(
    f.scope.resolve<PrismaClinicalDocumentStore>(
      services.clinicalDocumentStore,
    ),
    f.scope.resolve<ManageCareLinks>(services.manageCareLinks),
    f.scope.resolve<AuthorizeClinical>(services.authorizeClinical),
    f.scope.resolve<AuditWriter>(services.audit),
    provider,
    new JcsCanonicalDocuments(),
    new CryptoOpaqueTokens(),
    policies,
  )
}
function app(
  service = engine(),
  limit = f.config.documentVerifyRequestsPerMinute,
) {
  return createApp(
    f.config,
    createClinicalDocumentRouter(
      f.scope.resolve<SessionVerifier>(services.accessTokens),
      f.scope.resolve<Authorize>(services.authorize),
      f.scope.resolve<ManageDocumentTypes>(services.manageDocumentTypes),
      service,
      f.scope.resolve<AuthStore>(services.authStore),
      f.scope.resolve<AuditWriter>(services.audit),
      limit,
    ),
  )
}
async function draft(type: DocumentTypeCode = 'report') {
  const visit = await f.visit()
  const row = await engine().createDraft(
    actor(),
    visit.encounterId,
    type,
    { body: 'Conteúdo clínico fictício reservado' },
    context(),
  )
  return { ...visit, ...row }
}
const issue = (id: string, version = 1, service = engine()) =>
  request(app(service))
    .post(`/v1/clinical/documents/${id}/issue`)
    .set('Authorization', f.professionalAccounts[0].token)
    .send({ expectedVersion: version })
const get = (id: string, token = f.professionalAccounts[0].token) =>
  request(f.app).get(`/v1/clinical/documents/${id}`).set('Authorization', token)
const types = (token = f.admin.token) =>
  request(f.app).get('/v1/document-types').set('Authorization', token)
const changeType = (
  id: string,
  version: number,
  extra: Record<string, unknown> = {},
) =>
  request(f.app)
    .put(`/v1/admin/document-types/${id}`)
    .set('Authorization', f.admin.token)
    .send({
      expectedVersion: version,
      requiredSignatureLevel: 'simple',
      templateVersion: '2',
      active: true,
      reason: 'Configuração técnica de teste',
      ...extra,
    })
test('BE-038: seed de seis tipos/defaults e catálogo por admin/profissional sem história administrativa', async () => {
  const admin = (await types().expect(200)).body
  documentTypesResponse.parse(admin)
  assert.equal(admin.items.length, 6)
  assert.equal(await f.db.documentTypeVersion.count(), 6)
  for (const item of admin.items) {
    assert.equal(item.version, 1)
    assert.equal(
      item.requiredSignatureLevel,
      item.code === 'declaration' ? 'simple' : 'qualified',
    )
    assert.equal(item.source, 'seed')
  }
  assert.equal(
    spawnSync('yarn', ['prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: f.config.databaseUrl },
      stdio: 'pipe',
    }).status,
    0,
  )
  await types().expect(200)
  assert.equal(await f.db.documentTypeVersion.count(), 6)
  const professional = (
    await types(f.professionalAccounts[0].token).expect(200)
  ).body
  assert.ok(
    professional.items.every(
      (t: { history?: unknown }) => t.history === undefined,
    ),
  )
  for (const token of [
    manager.token,
    f.reception.token,
    (await f.patient()).token,
  ])
    await types(token).expect(403)
})
test('BE-038: catálogo versionado/auditado, concorrência e histórico sem atualização retroativa', async () => {
  const list = (await types().expect(200)).body.items,
    certificate = list.find((t: { code: string }) => t.code === 'certificate')
  const changes = await Promise.all([
    changeType(certificate.id, 1),
    changeType(certificate.id, 1),
  ])
  assert.deepEqual(changes.map((r) => r.status).sort(), [200, 409])
  await changeType(certificate.id, 2, { reason: ' ' }).expect(400)
  const history = (await types().expect(200)).body.items.find(
    (t: { id: string }) => t.id === certificate.id,
  ).history
  assert.equal(history.length, 2)
  assert.equal(history[1].requiredSignatureLevel, 'qualified')
  assert.equal(history[0].changedBy.id, f.admin.user.id)
  const original = await f.db.documentTypeVersion.findFirstOrThrow({
    where: { typeId: certificate.id, version: 1 },
  })
  await assert.rejects(
    f.db.documentTypeVersion.update({
      where: { id: original.id },
      data: { requiredSignatureLevel: 'simple' },
    }),
  )
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: {
        resourceId: certificate.id,
        action: 'document.type_changed',
        actorUserId: f.admin.user.id,
      },
    }),
  )
  await request(f.app)
    .put(`/v1/admin/document-types/${certificate.id}`)
    .set('Authorization', manager.token)
    .send({})
    .expect(403)
})
test('BE-038: emissão dev congela bytes canônicos, signatário e nível sem validade jurídica', async () => {
  const d = await draft(),
    issued = (await issue(d.documentId).expect(200)).body
  clinicalDocumentResponse.parse(issued)
  assert.equal(issued.status, 'issued_dev')
  assert.equal(issued.signature.level, 'qualified')
  assert.equal(issued.signature.legalValidity, false)
  assert.equal(issued.signature.seal, 'sem validade jurídica')
  assert.equal(issued.signature.signer.id, f.professionalIds[0])
  assert.ok(issued.signature.signer.council.number)
  const stored = await f.db.clinicalDocument.findUniqueOrThrow({
    where: { id: d.documentId },
  })
  assert.ok(!stored.payloadEncrypted.includes('Conteúdo clínico'))
  const canonical = new AesSecretBox(
    f.config.encryptionKey,
    'clinical-document',
  ).open(
    stored.canonicalEncrypted as string,
    `document_canonical:${d.documentId}`,
  )
  assert.equal(
    createHash('sha256').update(canonical).digest('hex'),
    issued.sha256,
  )
  assert.equal(JSON.parse(canonical).patientId, d.patientId)
  assert.equal(
    stored.verificationCodeHash,
    new CryptoOpaqueTokens().digest(issued.verificationCode),
  )
  assert.equal((await get(d.documentId).expect(200)).body.sha256, issued.sha256)
  await issue(d.documentId).expect(409)
  await assert.rejects(
    f.db.clinicalDocument.update({
      where: { id: d.documentId },
      data: { payloadEncrypted: 'alterado' },
    }),
  )
  await assert.rejects(
    f.db.clinicalDocument.delete({ where: { id: d.documentId } }),
  )
  await assert.rejects(
    f.db.$executeRawUnsafe('TRUNCATE "ClinicalDocument" CASCADE'),
  )
})
test('BE-038: provider ausente e policy ausente mantêm draft; payload inválido é recusado', async () => {
  const d = await draft()
  await issue(d.documentId, 1, engine(new DisabledSignatureProvider())).expect(
    503,
  )
  await request(f.app)
    .post(`/v1/clinical/documents/${d.documentId}/issue`)
    .set('Authorization', f.professionalAccounts[0].token)
    .send({ expectedVersion: 1 })
    .expect(503)
  assert.equal((await get(d.documentId).expect(200)).body.status, 'draft')
  await assert.rejects(
    engine().createDraft(
      actor(),
      d.encounterId,
      'report',
      { wrong: 'invalid' },
      context(),
    ),
    (e: { code?: string }) => e.code === 'VALIDATION_ERROR',
  )
  assert.equal(
    await f.db.clinicalDocument.count({
      where: { encounterId: d.encounterId },
    }),
    1,
  )
})
test('BE-038: mudança de tipo exige atualizar explicitamente draft e preserva emitidos anteriores', async () => {
  const d = await draft(),
    first = (await issue(d.documentId).expect(200)).body
  const other = await engine().createDraft(
    actor(),
    d.encounterId,
    'report',
    { body: 'Outro draft fictício' },
    context(),
  )
  const type = (await types().expect(200)).body.items.find(
    (t: { code: string }) => t.code === 'report',
  )
  await changeType(type.id, type.version).expect(200)
  await issue(other.documentId).expect(409)
  const patched = await engine().patchDraft(
    actor(),
    other.documentId.toUpperCase(),
    { body: 'Revisto fictício' },
    1,
    context(),
  )
  assert.equal(patched.version, 2)
  assert.equal(patched.requiredSignatureLevel, 'simple')
  await issue(other.documentId, 2).expect(200)
  assert.equal(
    (await get(d.documentId).expect(200)).body.signature.level,
    first.signature.level,
  )
  assert.equal((await get(d.documentId).expect(200)).body.sha256, first.sha256)
})
test('BE-038: leitura requer vínculo/autoria de draft; urgência não emite nem lê draft', async () => {
  const d = await draft()
  await get(d.documentId, f.professionalAccounts[1].token).expect(404)
  await request(f.app)
    .post('/v1/clinical/emergency-access')
    .set('Authorization', f.professionalAccounts[1].token)
    .send({ patientId: d.patientId, justification: 'Urgência fictícia' })
    .expect(201)
  await get(d.documentId, f.professionalAccounts[1].token).expect(404)
  await request(app())
    .post(`/v1/clinical/documents/${d.documentId}/issue`)
    .set('Authorization', f.professionalAccounts[1].token)
    .send({ expectedVersion: 1 })
    .expect(404)
  await issue(d.documentId).expect(200)
  await get(d.documentId, f.professionalAccounts[1].token).expect(200)
  for (const token of [
    f.admin.token,
    manager.token,
    f.reception.token,
    d.patient.token,
  ])
    await get(d.documentId, token).expect(403)
  await f.db.careLink.update({
    where: { id: d.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  await get(d.documentId).expect(404)
})
test('BE-038: anulação preserva original e código público expõe só metadados técnicos', async () => {
  const d = await draft(),
    issued = (await issue(d.documentId).expect(200)).body
  const original = await f.db.clinicalDocument.findUniqueOrThrow({
    where: { id: d.documentId },
  })
  const verification = (
    await request(f.app)
      .get(`/v1/documents/verify/${issued.verificationCode}`)
      .expect(200)
  ).body
  publicDocumentVerificationResponse.parse(verification)
  assert.deepEqual(
    Object.keys(verification).sort(),
    [
      'documentId',
      'type',
      'issuedAt',
      'issuer',
      'sha256',
      'status',
      'signatureLevel',
      'legalValidity',
      'seal',
    ].sort(),
  )
  assert.ok(!JSON.stringify(verification).includes(d.patientId))
  assert.ok(!JSON.stringify(verification).includes('Conteúdo clínico'))
  const endpoint = `/v1/clinical/documents/${d.documentId}/void`
  await request(f.app)
    .post(endpoint)
    .set('Authorization', f.professionalAccounts[0].token)
    .send({ reason: ' ' })
    .expect(400)
  await request(f.app)
    .post(endpoint)
    .set('Authorization', f.professionalAccounts[0].token)
    .send({ reason: 'Correção fictícia' })
    .expect(200)
  assert.deepEqual(
    await f.db.clinicalDocument.findUniqueOrThrow({
      where: { id: d.documentId },
    }),
    original,
  )
  assert.equal((await get(d.documentId).expect(200)).body.status, 'voided')
  const after = (
    await request(f.app)
      .get(`/v1/documents/verify/${issued.verificationCode}`)
      .expect(200)
  ).body
  assert.equal(after.status, 'voided')
  assert.equal(after.sha256, issued.sha256)
  assert.equal(after.reason, undefined)
  const event = await f.db.clinicalDocumentVoid.findUniqueOrThrow({
    where: { documentId: d.documentId },
  })
  await assert.rejects(
    f.db.clinicalDocumentVoid.delete({ where: { id: event.id } }),
  )
  await request(f.app)
    .post(endpoint)
    .set('Authorization', f.professionalAccounts[0].token)
    .send({ reason: 'Novamente' })
    .expect(409)
})
test('BE-038: falha de auditoria na emissão reverte status, código e timeline', async () => {
  const d = await draft()
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_document_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='document.issued' THEN RAISE EXCEPTION 'forced_document_audit'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER "fail_document_audit" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_document_audit()',
  )
  try {
    await issue(d.documentId).expect(500)
    const row = await f.db.clinicalDocument.findUniqueOrThrow({
      where: { id: d.documentId },
    })
    assert.equal(row.status, 'draft')
    assert.equal(row.verificationCodeHash, null)
    assert.equal(
      await f.db.clinicalTimelineEntry.count({
        where: { resourceId: d.documentId },
      }),
      0,
    )
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER "fail_document_audit" ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_document_audit()')
  }
  await issue(d.documentId).expect(200)
})
test('BE-038: arquivo associado a emitido é imutável e não aceita associação posterior', async () => {
  const d = await draft(),
    data = {
      category: 'attachment',
      ownerPatientId: d.patientId,
      linkedResourceType: 'ClinicalDocument',
      linkedResourceId: d.documentId,
      storageKey: randomUUID(),
      contentTypeDetected: 'application/pdf',
      size: 1n,
      sha256: 'f'.repeat(64),
      encryptionKeyRef: 'fixture',
      scanStatus: 'skipped_dev',
    }
  const file = await f.db.fileObject.create({ data })
  await issue(d.documentId).expect(200)
  await assert.rejects(
    f.db.fileObject.update({
      where: { id: file.id },
      data: { sha256: 'a'.repeat(64) },
    }),
  )
  await assert.rejects(f.db.fileObject.delete({ where: { id: file.id } }))
  await assert.rejects(
    f.db.fileObject.create({ data: { ...data, storageKey: randomUUID() } }),
  )
  await assert.rejects(f.db.$executeRawUnsafe('TRUNCATE "FileObject" CASCADE'))
})
test('BE-038: alteração simulada de restore falha fechada sem devolver conteúdo', async () => {
  const d = await draft(),
    issued = (await issue(d.documentId).expect(200)).body
  const original = await f.db.clinicalDocument.findUniqueOrThrow({
    where: { id: d.documentId },
  })
  await f.db.$executeRawUnsafe(
    'ALTER TABLE "ClinicalDocument" DISABLE TRIGGER "ClinicalDocument_integrity"',
  )
  try {
    await f.db.clinicalDocument.update({
      where: { id: d.documentId },
      data: {
        payloadEncrypted: new AesSecretBox(
          f.config.encryptionKey,
          'clinical-document',
        ).seal(
          JSON.stringify({ body: 'Conteúdo alterado' }),
          `document_payload:${d.documentId}`,
        ),
      },
    })
    await get(d.documentId).expect(503)
    await request(f.app)
      .get(`/v1/documents/verify/${issued.verificationCode}`)
      .expect(503)
    assert.ok(
      await f.db.auditEvent.findFirst({
        where: {
          action: 'clinical.integrity_failed',
          resourceId: d.documentId,
        },
      }),
    )
  } finally {
    await f.db.clinicalDocument.update({
      where: { id: d.documentId },
      data: { payloadEncrypted: original.payloadEncrypted },
    })
    await f.db.$executeRawUnsafe(
      'ALTER TABLE "ClinicalDocument" ENABLE TRIGGER "ClinicalDocument_integrity"',
    )
  }
  await get(d.documentId).expect(200)
})
test('BE-038: verificação pública aplica limite persistente sem confiar em X-Forwarded-For', async () => {
  const endpoint = `/v1/documents/verify/${randomBytes(32).toString('base64url')}`
  await f.db.rateLimitBucket.deleteMany()
  const limited = app(engine(), 2)
  await request(limited).get(endpoint).expect(404)
  await request(limited).get(endpoint).expect(404)
  await request(limited)
    .get(endpoint)
    .set('X-Forwarded-For', '203.0.113.10')
    .expect(429)
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: { action: 'document.verification_limited' },
    }),
  )
  const entries = await f.db.rateLimitBucket.findMany()
  assert.ok(entries.every((e) => /^[a-f0-9]{64}$/.test(e.key)))
  await f.db.rateLimitBucket.deleteMany()
})
test('BE-038: emissão concorrente é única e substituição exige mesmo paciente/tipo/autor', async () => {
  const foreign = await draft(),
    foreignIssued = (await issue(foreign.documentId).expect(200)).body
  await f.clearActive()
  const d = await draft()
  const attempts = await Promise.all([issue(d.documentId), issue(d.documentId)])
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409])
  assert.equal(
    await f.db.clinicalTimelineEntry.count({
      where: { resourceId: d.documentId },
    }),
    1,
  )
  const endpoint = `/v1/clinical/documents/${d.documentId}/void`
  const invalidate = (replacementDocumentId: string) =>
    request(f.app)
      .post(endpoint)
      .set('Authorization', f.professionalAccounts[0].token)
      .send({ reason: 'Substituição fictícia', replacementDocumentId })
  await invalidate(foreignIssued.documentId).expect(400)
  const differentType = await engine().createDraft(
    actor(),
    d.encounterId,
    'certificate',
    { body: 'Outro tipo fictício' },
    context(),
  )
  await issue(differentType.documentId).expect(200)
  await invalidate(differentType.documentId).expect(400)
  const replacement = await engine().createDraft(
    actor(),
    d.encounterId,
    'report',
    { body: 'Substituto fictício' },
    context(),
  )
  await issue(replacement.documentId).expect(200)
  const result = (await invalidate(replacement.documentId).expect(200)).body
  assert.equal(result.voidEvent.replacementDocumentId, replacement.documentId)
  assert.equal(
    (await get(replacement.documentId).expect(200)).body.status,
    'issued_dev',
  )
})
test('BE-038: OpenAPI documenta catálogo, emissão, anulação e verificação pública', async () => {
  const doc = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.deepEqual(doc.paths['/documents/verify/{code}'].get.security, [])
  for (const path of [
    '/document-types',
    '/admin/document-types/{id}',
    '/clinical/documents/{id}/issue',
    '/clinical/documents/{id}/void',
  ])
    assert.ok(doc.paths[path])
})
