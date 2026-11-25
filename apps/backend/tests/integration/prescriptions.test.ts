import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { PDFDocument } from 'pdf-lib'
import request from 'supertest'
import { ApplicationError } from '../../src/application/errors/application-error'
import type { FileDownloadTokens } from '../../src/application/ports/files'
import type { MedicationDataset } from '../../src/application/ports/medications'
import type { ManageMedications } from '../../src/application/use-cases/manage-medications'
import { JcsCanonicalDocuments } from '../../src/infrastructure/documents/canonical-documents'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { services } from '../../src/shared/composition/container'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { clinicalDocumentResponse } from '../../src/shared/infra/http/contracts/clinical-documents'
import { allergyCheckResponse } from '../../src/shared/infra/http/contracts/prescriptions'
import { createClinicalFixture } from '../support/m2-clinical'

let f: Awaited<ReturnType<typeof createClinicalFixture>>
let dataset: MedicationDataset
before(async () => {
  f = await createClinicalFixture()
  dataset = JSON.parse(
    await readFile(
      resolve(__dirname, '../../fixtures/medications/medications.dev.json'),
      'utf8',
    ),
  )
  await f.scope
    .resolve<ManageMedications>(services.manageMedications)
    .load(dataset, {
      requestId: randomUUID(),
      actorRoles: [],
      authorizationBasis: 'test',
    })
})
beforeEach(async () => {
  await f.clearActive()
  await medications().load(dataset, context())
})
after(async () => {
  if (f) await f.close()
})
const payload = () => ({
  items: [
    {
      medicationCode: 'DEV-MED-A',
      medicationVersion: dataset.version,
      dose: 'Dose fictícia para teste',
      route: 'Via demonstrativa',
      frequency: 'Frequência demonstrativa',
      quantity: 'Quantidade demonstrativa',
      instructions: 'Orientação fictícia; não usar clinicamente.',
    },
  ],
})
const auth = () => f.professionalAccounts[0].token
const create = (encounterId: string, body: unknown = payload()) =>
  request(f.app)
    .post(`/v1/clinical/encounters/${encounterId}/documents/drafts`)
    .set('Authorization', auth())
    .send({ typeCode: 'prescription', payload: body })
const issue = (
  id: string,
  acknowledgedAllergyIds: string[] = [],
  expectedVersion = 1,
) =>
  request(f.app)
    .post(`/v1/clinical/documents/${id}/issue`)
    .set('Authorization', auth())
    .send({ expectedVersion, acknowledgedAllergyIds })
const review = (id: string) =>
  request(f.app)
    .get(`/v1/clinical/documents/${id}/allergy-check`)
    .set('Authorization', auth())
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  authorizationBasis: 'test',
})
const medications = () =>
  f.scope.resolve<ManageMedications>(services.manageMedications)
const get = (id: string, token = auth()) =>
  request(f.app).get(`/v1/clinical/documents/${id}`).set('Authorization', token)
const patch = (id: string, version: number, body: unknown) =>
  request(f.app)
    .patch(`/v1/clinical/documents/${id}/draft`)
    .set('Authorization', auth())
    .send({ expectedVersion: version, payload: body })
const alert = async (patientId: string, substanceCode?: string) =>
  (
    await request(f.app)
      .post(`/v1/clinical/records/${patientId}/alerts`)
      .set('Authorization', auth())
      .send({
        kind: 'allergy',
        term: 'Alergia fictícia',
        substanceCode,
        verificationState: 'reported',
      })
      .expect(201)
  ).body
const download = async (fileId: string) => {
  const link = (
    await request(f.app)
      .post(`/v1/files/${fileId}/download-link`)
      .set('Authorization', auth())
      .expect(200)
  ).body
  return request(f.app)
    .get(link.url)
    .set('Authorization', auth())
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => done(null, Buffer.concat(chunks)))
    })
    .expect(200)
}
test('BE-039: draft estruturado, emissão dev e PDF real autorizado', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body
  clinicalDocumentResponse.parse(d)
  assert.equal(d.payload.items[0].medicationSnapshot.code, 'DEV-MED-A')
  const r = (await review(d.documentId).expect(200)).body
  allergyCheckResponse.parse(r)
  assert.deepEqual(r.requiredAlertIds, [])
  const issued = (await issue(d.documentId).expect(200)).body
  clinicalDocumentResponse.parse(issued)
  assert.equal(issued.status, 'issued_dev')
  assert.equal(issued.files.length, 1)
  const fileId = issued.files[0].id
  const link = (
    await request(f.app)
      .post(`/v1/files/${fileId}/download-link`)
      .set('Authorization', auth())
      .send({})
      .expect(200)
  ).body
  const downloaded = await request(f.app)
    .get(link.url)
    .set('Authorization', auth())
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => done(null, Buffer.concat(chunks)))
    })
    .expect(200)
  const pdf = await PDFDocument.load(downloaded.body)
  assert.ok(pdf.getPageCount() >= 1)
  assert.ok(pdf.getTitle()?.includes('sem validade jurídica'))
})
test('BE-039: alergia associada exige ciência e a emissão registra versão/autor', async () => {
  const v = await f.visit(),
    alert = (
      await request(f.app)
        .post(`/v1/clinical/records/${v.patientId}/alerts`)
        .set('Authorization', auth())
        .send({
          kind: 'allergy',
          term: 'Alergia fictícia A',
          substanceCode: 'DEV-SUB-A',
          verificationState: 'reported',
        })
        .expect(201)
    ).body
  const d = (await create(v.encounterId).expect(201)).body,
    r = (await review(d.documentId).expect(200)).body
  assert.deepEqual(r.requiredAlertIds, [alert.id])
  const denied = (await issue(d.documentId).expect(409)).body
  assert.deepEqual(denied.error.allergyConflict.requiredAlertIds, [alert.id])
  const issued = (await issue(d.documentId, [alert.id]).expect(200)).body
  assert.equal(issued.allergyAcknowledgements[0].alertVersion, 1)
  assert.equal(
    await f.db.prescriptionAllergyAcknowledgement.count({
      where: { documentId: d.documentId },
    }),
    1,
  )
})

test('BE-039: busca por nome/substância, paginação, catálogo imutável e CLI idempotente', async () => {
  const loaded = await medications().load(dataset, context())
  assert.equal(loaded.loadedCount, 0)
  const found = (
    await request(f.app)
      .get('/v1/terminologies/medications')
      .set('Authorization', auth())
      .query({ q: 'SUBSTANCIA demonstrativa A' })
      .expect(200)
  ).body
  assert.equal(found.items[0].code, 'DEV-MED-A')
  assert.equal(found.items[0].demo, true)
  assert.equal(found.items[0].id, undefined)
  const mass = {
    ...dataset,
    version: 'dev-page',
    entries: Array.from({ length: 31 }, (_, i) => ({
      ...dataset.entries[0],
      code: `DEV-MED-X${String(i).padStart(3, '0')}`,
      name: `Árvore demonstrativa ${i}`,
    })),
  }
  await medications().load(mass, context())
  const first = (
    await request(f.app)
      .get('/v1/terminologies/medications')
      .set('Authorization', auth())
      .query({ q: 'arvore' })
      .expect(200)
  ).body
  const next = (
    await request(f.app)
      .get('/v1/terminologies/medications')
      .set('Authorization', auth())
      .query({ q: 'arvore', cursor: first.nextCursor })
      .expect(200)
  ).body
  assert.equal(first.items.length, 30)
  assert.equal(next.items.length, 1)
  assert.equal(
    new Set([...first.items, ...next.items].map((i) => i.code)).size,
    31,
  )
  await request(f.app)
    .get('/v1/terminologies/medications')
    .set('Authorization', auth())
    .query({ q: 'inexistente', cursor: first.nextCursor })
    .expect(404)
  const row = await f.db.medicationEntry.findFirstOrThrow({
    where: { catalogId: loaded.catalogId },
  })
  await assert.rejects(
    f.db.medicationEntry.update({
      where: { id: row.id },
      data: { name: 'Mudar versão em lugar' },
    }),
  )
  await assert.rejects(
    medications().load(
      {
        ...dataset,
        entries: [{ ...dataset.entries[0], name: 'Outro conteúdo' }],
      },
      context(),
    ),
    (e) => e instanceof ApplicationError && e.code === 'CONFLICT',
  )
  const env = {
    ...process.env,
    DOTENV_CONFIG_PATH: '/dev/null',
    APP_ENV: 'test',
    ENVIRONMENT_ID: 'test-medications-cli',
    DATABASE_URL: f.config.databaseUrl,
    CORS_ORIGINS: 'http://localhost:3000',
    FRONTEND_ORIGIN: 'http://localhost:3000',
    JWT_SECRET: f.config.jwtSecret,
    FILE_ENCRYPTION_KEY: f.config.encryptionKey.toString('base64'),
    SIGNATURE_PROVIDER: 'dev',
    MALWARE_SCANNER: 'dev',
    EMAIL_SENDER: 'dev',
    FILE_STORAGE_PATH: f.config.fileStoragePath,
  }
  for (let i = 0; i < 2; i++) {
    const cli = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/shared/infra/cli/medications.ts', 'demo'],
      { env, encoding: 'utf8' },
    )
    assert.equal(cli.status, 0, cli.stderr)
    assert.ok(cli.stdout.includes('medication.catalog_loaded'))
  }
  assert.equal(
    await f.db.medicationEntry.count({
      where: { catalogId: loaded.catalogId },
    }),
    dataset.entries.length,
  )
})
test('BE-039: campos, origem do snapshot e formato do catálogo são validados', async () => {
  const v = await f.visit()
  for (const body of [
    { items: [] },
    { items: [{ ...payload().items[0], dose: ' ' }] },
    { items: [{ ...payload().items[0], route: ' ' }] },
    { items: [{ ...payload().items[0], quantity: ' ' }] },
    { items: [{ ...payload().items[0], medicationVersion: undefined }] },
    {
      items: [
        { ...payload().items[0], medicationSnapshot: { controlled: false } },
      ],
    },
  ])
    await create(v.encounterId, body).expect(400)
  await create(v.encounterId, {
    items: [{ ...payload().items[0], medicationCode: 'DEV-MED-UNKNOWN' }],
  }).expect(400)
  await create(v.encounterId, {
    items: [{ ...payload().items[0], medicationVersion: 'old-version' }],
  }).expect(409)
  assert.throws(
    () =>
      medications().load(
        { ...dataset, entries: [dataset.entries[0], dataset.entries[0]] },
        context(),
      ),
    (e) => e instanceof ApplicationError && e.code === 'VALIDATION_ERROR',
  )
  assert.equal(
    await f.db.clinicalDocument.count({
      where: { encounterId: v.encounterId },
    }),
    0,
  )
})
test('BE-039: alergias textuais/manuais exigem ciência e códigos conhecidos distintos permanecem visíveis', async () => {
  const v = await f.visit(),
    text = await alert(v.patientId),
    different = await alert(v.patientId, 'DEV-SUB-B'),
    d = (await create(v.encounterId).expect(201)).body
  const r = (await review(d.documentId).expect(200)).body
  assert.ok(
    r.allergies.some(
      (a) =>
        a.id === text.id &&
        a.match === 'unmapped_alert' &&
        a.requiresAcknowledgement,
    ),
  )
  assert.ok(
    r.allergies.some(
      (a) =>
        a.id === different.id &&
        a.match === 'no_catalog_match' &&
        !a.requiresAcknowledgement,
    ),
  )
  await issue(d.documentId).expect(409)
  await issue(d.documentId, [text.id]).expect(200)
  const base = payload().items[0],
    manual = {
      items: [
        {
          name: 'Nome manual fictício',
          dose: base.dose,
          route: base.route,
          frequency: base.frequency,
          quantity: base.quantity,
          instructions: base.instructions,
        },
      ],
    }
  const md = (await create(v.encounterId, manual).expect(201)).body
  assert.equal(md.payload.items[0].mappingStatus, 'unverified')
  const mr = (await review(md.documentId).expect(200)).body
  assert.equal(mr.requiredAlertIds.length, 2)
  await issue(md.documentId, [text.id]).expect(409)
  await issue(md.documentId, [text.id, different.id]).expect(200)
})
test('BE-039: alerta novo após preview é revalidado e ID alheio não vira ciência', async () => {
  const foreign = await f.visit(),
    foreignAlert = await alert(foreign.patientId, 'DEV-SUB-A')
  await f.clearActive()
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body
  assert.deepEqual(
    (await review(d.documentId).expect(200)).body.requiredAlertIds,
    [],
  )
  const added = await alert(v.patientId, 'DEV-SUB-A')
  await issue(d.documentId).expect(409)
  await issue(d.documentId, [foreignAlert.id]).expect(400)
  await issue(d.documentId, [randomUUID()]).expect(400)
  assert.equal(
    await f.db.prescriptionAllergyAcknowledgement.count({
      where: { documentId: d.documentId },
    }),
    0,
  )
  await issue(d.documentId, [added.id]).expect(200)
})
test('BE-039: controlados bloqueados e falta de provider preserva rascunho', async () => {
  const v = await f.visit(),
    body = payload()
  body.items[0].medicationCode = 'DEV-MED-CONTROL'
  const controlled = (await create(v.encounterId, body).expect(201)).body
  await issue(controlled.documentId).expect(403)
  assert.equal(
    (await get(controlled.documentId).expect(200)).body.status,
    'draft',
  )
  const d = (await create(v.encounterId).expect(201)).body
  const runtime = await composeBackendApplication({
    ...f.config,
    signatureProvider: 'disabled',
  })
  try {
    await request(runtime.app)
      .post(`/v1/clinical/documents/${d.documentId}/issue`)
      .set('Authorization', auth())
      .send({ expectedVersion: 1 })
      .expect(503)
  } finally {
    await runtime.close()
  }
  assert.equal((await get(d.documentId).expect(200)).body.files.length, 0)
})
test('BE-039: catálogo novo não altera snapshot; revisão explícita atualiza novo draft', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body
  await medications().load(
    {
      ...dataset,
      version: 'dev-new-version',
      entries: dataset.entries.map((e) => ({
        ...e,
        name: `${e.name} atualizado`,
      })),
    },
    context(),
  )
  await issue(d.documentId).expect(409)
  assert.equal(
    (await get(d.documentId).expect(200)).body.payload.items[0]
      .medicationSnapshot.version,
    dataset.version,
  )
  const next = payload()
  next.items[0].medicationVersion = 'dev-new-version'
  const p = (await patch(d.documentId, 1, next).expect(200)).body
  assert.equal(p.version, 2)
  assert.ok(p.payload.items[0].name.endsWith('atualizado'))
  await issue(d.documentId, [], 2).expect(200)
})
test('BE-039: reuso cria draft novo com origem imutável, sem assinatura/ciências antigas', async () => {
  const v = await f.visit(),
    a = await alert(v.patientId, 'DEV-SUB-A'),
    d = (await create(v.encounterId).expect(201)).body
  await issue(d.documentId, [a.id]).expect(200)
  const original = await f.db.clinicalDocument.findUniqueOrThrow({
    where: { id: d.documentId },
  })
  const copy = (
    await request(f.app)
      .post(`/v1/clinical/encounters/${v.encounterId}/documents/reuse`)
      .set('Authorization', auth())
      .send({ sourceDocumentId: d.documentId })
      .expect(201)
  ).body
  assert.notEqual(copy.documentId, d.documentId)
  assert.equal(copy.copiedFromDocumentId, d.documentId)
  assert.equal(copy.signature, null)
  assert.deepEqual(copy.allergyAcknowledgements, [])
  await assert.rejects(
    f.db.clinicalDocument.update({
      where: { id: copy.documentId },
      data: { copiedFromDocumentId: null, version: { increment: 1 } },
    }),
  )
  const changed = payload()
  changed.items[0].instructions = 'Orientação modificada apenas na cópia.'
  await patch(copy.documentId, 1, changed).expect(200)
  await issue(copy.documentId, [], 2).expect(409)
  await issue(copy.documentId, [a.id], 2).expect(200)
  assert.deepEqual(
    await f.db.clinicalDocument.findUniqueOrThrow({
      where: { id: d.documentId },
    }),
    original,
  )
})
test('BE-039: falha de auditoria desfaz ciência/documento/PDF e limpa arquivo provisório', async () => {
  const v = await f.visit(),
    a = await alert(v.patientId, 'DEV-SUB-A'),
    d = (await create(v.encounterId).expect(201)).body
  const directory = resolve(f.config.fileStoragePath, 'attachment'),
    before = (await readdir(directory).catch(() => [])).sort()
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_prescription_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='document.issued' THEN RAISE EXCEPTION 'forced_prescription_audit'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER "fail_prescription_audit" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_prescription_audit()',
  )
  try {
    await issue(d.documentId, [a.id]).expect(500)
    assert.equal(
      await f.db.prescriptionAllergyAcknowledgement.count({
        where: { documentId: d.documentId },
      }),
      0,
    )
    assert.equal(
      await f.db.fileObject.count({
        where: {
          linkedResourceType: 'ClinicalDocument',
          linkedResourceId: d.documentId,
        },
      }),
      0,
    )
    assert.deepEqual((await readdir(directory)).sort(), before)
    assert.equal((await get(d.documentId).expect(200)).body.status, 'draft')
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER "fail_prescription_audit" ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_prescription_audit()')
  }
  await issue(d.documentId, [a.id]).expect(200)
})
test('BE-039: arquivo cifrado/imutável, link expirado e download auditado com vínculo', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body,
    issued = (await issue(d.documentId).expect(200)).body,
    file = await f.db.fileObject.findUniqueOrThrow({
      where: { id: issued.files[0].id },
    })
  const response = await download(file.id)
  assert.equal(
    createHash('sha256').update(response.body).digest('hex'),
    issued.files[0].sha256,
  )
  assert.notEqual(
    (
      await readFile(
        resolve(f.config.fileStoragePath, 'attachment', file.storageKey),
      )
    )
      .subarray(0, 5)
      .toString(),
    '%PDF-',
  )
  for (const token of [f.admin.token, f.reception.token, v.patient.token])
    await request(f.app)
      .post(`/v1/files/${file.id}/download-link`)
      .set('Authorization', token)
      .expect(404)
  const expired = f.scope
    .resolve<FileDownloadTokens>(services.fileTokens)
    .issue({
      fileId: file.id,
      userId: f.professionalAccounts[0].user.id,
      sessionId: f.professionalAccounts[0].session.id,
      expiresAt: new Date(Date.now() - 1),
    })
  await request(f.app)
    .get(`/v1/file-download/${expired}`)
    .set('Authorization', auth())
    .expect(410)
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: {
        resourceId: file.id,
        action: 'file.downloaded',
        authorizationBasis: `care_link:${v.linkId}`,
      },
    }),
  )
  await assert.rejects(
    f.db.fileObject.update({
      where: { id: file.id },
      data: { sha256: 'a'.repeat(64) },
    }),
  )
  await assert.rejects(f.db.fileObject.delete({ where: { id: file.id } }))
})
test('BE-039: payload máximo aceito gera PDF paginado e caractere sem glyph preserva draft', async () => {
  const v = await f.visit(),
    large = {
      items: Array.from({ length: 30 }, (_, i) => ({
        ...payload().items[0],
        instructions: `Item fictício ${i}: ${'teste '.repeat(320)}FIM-DESTE-ITEM`,
      })),
    }
  const d = (await create(v.encounterId, large).expect(201)).body,
    issued = (await issue(d.documentId).expect(200)).body
  const bytes = (await download(issued.files[0].id)).body,
    pdf = await PDFDocument.load(bytes)
  assert.ok(pdf.getPageCount() > 1)
  if (process.env.PDF_REVIEW_OUTPUT)
    await writeFile(process.env.PDF_REVIEW_OUTPUT, bytes, {
      flag: 'wx',
      mode: 0o600,
    })
  const unsupported = payload()
  unsupported.items[0].instructions = 'Caractere sem glyph: 🧪'
  const u = (await create(v.encounterId, unsupported).expect(201)).body
  await issue(u.documentId).expect(400)
  assert.equal((await get(u.documentId).expect(200)).body.status, 'draft')
})
test('BE-039: autorização por paciente/MFA, rotas e contrato OpenAPI', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body
  await request(f.app)
    .get(`/v1/clinical/documents/${d.documentId}/allergy-check`)
    .set('Authorization', f.professionalAccounts[1].token)
    .expect(404)
  await request(f.app)
    .post(`/v1/clinical/encounters/${v.encounterId}/documents/reuse`)
    .set('Authorization', f.professionalAccounts[1].token)
    .send({ sourceDocumentId: d.documentId })
    .expect(404)
  await f.db.session.update({
    where: { id: f.professionalAccounts[0].session.id },
    data: { mfaVerifiedAt: null },
  })
  try {
    await request(f.app)
      .get('/v1/terminologies/medications')
      .set('Authorization', auth())
      .expect(401)
  } finally {
    await f.db.session.update({
      where: { id: f.professionalAccounts[0].session.id },
      data: { mfaVerifiedAt: new Date() },
    })
  }
  const api = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  for (const path of [
    '/terminologies/medications',
    '/clinical/encounters/{id}/documents/drafts',
    '/clinical/documents/{id}/allergy-check',
    '/clinical/encounters/{id}/documents/reuse',
  ])
    assert.ok(api.paths[path])
})

test('BE-039: leitura mantém compatibilidade com bytes canônicos v1 anteriores à prescrição', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body
  await issue(d.documentId).expect(200)
  const row = await f.db.clinicalDocument.findUniqueOrThrow({
      where: { id: d.documentId },
    }),
    secrets = new AesSecretBox(f.config.encryptionKey, 'clinical-document')
  const envelope = JSON.parse(
    secrets.open(
      row.canonicalEncrypted as string,
      `document_canonical:${row.id}`,
    ),
  )
  envelope.integrityVersion = 1
  delete envelope.files
  delete envelope.copiedFromDocumentId
  delete envelope.allergyAcknowledgements
  const canonical = new JcsCanonicalDocuments(),
    bytes = canonical.serialize(envelope),
    sha256 = canonical.sha256(bytes),
    signature = JSON.parse(
      secrets.open(
        row.signatureEncrypted as string,
        `document_signature:${row.id}`,
      ),
    )
  signature.evidence.sha256 = sha256
  await f.db.$executeRawUnsafe(
    'ALTER TABLE "ClinicalDocument" DISABLE TRIGGER "ClinicalDocument_integrity"',
  )
  try {
    await f.db.clinicalDocument.update({
      where: { id: row.id },
      data: {
        canonicalEncrypted: secrets.seal(bytes, `document_canonical:${row.id}`),
        signatureEncrypted: secrets.seal(
          JSON.stringify(signature),
          `document_signature:${row.id}`,
        ),
        sha256,
      },
    })
  } finally {
    await f.db.$executeRawUnsafe(
      'ALTER TABLE "ClinicalDocument" ENABLE TRIGGER "ClinicalDocument_integrity"',
    )
  }
  assert.equal((await get(row.id).expect(200)).body.sha256, sha256)
})
