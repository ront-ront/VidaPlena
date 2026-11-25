import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { PDFDocument } from 'pdf-lib'
import request from 'supertest'
import type { AuditWriter } from '../../src/application/ports/audit-writer'
import type { AuthorizeClinical } from '../../src/application/use-cases/authorize-clinical'
import type { ManageTerminologies } from '../../src/application/use-cases/manage-terminologies'
import { ReadPendingExamOrders } from '../../src/application/use-cases/read-pending-exam-orders'
import type { PrismaExamOrderStore } from '../../src/infrastructure/persistence/prisma/exam-order-store'
import { services } from '../../src/shared/composition/container'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { clinicalDocumentResponse } from '../../src/shared/infra/http/contracts/clinical-documents'
import { pendingExamOrderResponse } from '../../src/shared/infra/http/contracts/exam-orders'
import { createClinicalFixture } from '../support/m2-clinical'

let f: Awaited<ReturnType<typeof createClinicalFixture>>
let tuss: {
  version: string
  entries: { code: string; description: string; active: boolean }[]
  [key: string]: unknown
}
before(async () => {
  f = await createClinicalFixture()
  tuss = JSON.parse(
    await readFile(
      resolve(__dirname, '../../fixtures/terminologies/tuss.dev.json'),
      'utf8',
    ),
  )
  await terminology().load(tuss, context())
})
beforeEach(async () => {
  await f.clearActive()
  await terminology().load(tuss, context())
})
after(async () => {
  if (f) await f.close()
})
const context = () => ({
  requestId: randomUUID(),
  actorRoles: ['professional'],
  authorizationBasis: 'test',
})
const auth = () => f.professionalAccounts[0].token
const actor = () => f.principal(f.professionalAccounts[0], 'professional')
const terminology = () =>
  f.scope.resolve<ManageTerminologies>(services.manageTerminologies)
const payload = (privateVisit = true) => ({
  privateVisit,
  exams: [
    {
      description: 'Exame demonstrativo',
      indication: 'Indicação clínica fictícia para testes.',
    },
  ],
})
const create = (encounterId: string, body: unknown = payload()) =>
  request(f.app)
    .post(`/v1/clinical/encounters/${encounterId}/documents/drafts`)
    .set('Authorization', auth())
    .send({ typeCode: 'exam_order', payload: body })
const issue = (id: string, expectedVersion = 1) =>
  request(f.app)
    .post(`/v1/clinical/documents/${id}/issue`)
    .set('Authorization', auth())
    .send({ expectedVersion })
const get = (id: string) =>
  request(f.app)
    .get(`/v1/clinical/documents/${id}`)
    .set('Authorization', auth())
function pending(now: Date) {
  return new ReadPendingExamOrders(
    f.scope.resolve<PrismaExamOrderStore>(services.examOrderStore),
    f.scope.resolve<AuthorizeClinical>(services.authorizeClinical),
    f.scope.resolve<AuditWriter>(services.audit),
    f.config.examPendingResultAlertDays,
    () => now,
  )
}
test('BE-040: particular sem TUSS gera draft/pedido/PDF imutável e não se publica automaticamente', async () => {
  const v = await f.visit(),
    draft = (await create(v.encounterId).expect(201)).body
  assert.equal(draft.payload.exams[0].procedureSnapshot, null)
  assert.equal(draft.examOrder, null)
  const issued = (await issue(draft.documentId).expect(200)).body
  clinicalDocumentResponse.parse(issued)
  assert.equal(issued.status, 'issued_dev')
  assert.equal(issued.signature.legalValidity, false)
  assert.ok(issued.examOrder.id)
  assert.equal(issued.examOrder.resultReceivedAt, null)
  assert.equal(issued.files.length, 1)
  const link = (
    await request(f.app)
      .post(`/v1/files/${issued.files[0].id}/download-link`)
      .set('Authorization', auth())
      .expect(200)
  ).body
  const bytes = await request(f.app)
    .get(link.url)
    .set('Authorization', auth())
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => done(null, Buffer.concat(chunks)))
    })
    .expect(200)
  assert.ok(
    (await PDFDocument.load(bytes.body))
      .getTitle()
      ?.includes('Pedido de exames demonstrativo'),
  )
  assert.equal(
    await f.db.examOrder.count({ where: { documentId: draft.documentId } }),
    1,
  )
  await assert.rejects(
    f.db.examOrder.delete({ where: { id: issued.examOrder.id } }),
  )
  await request(f.app)
    .patch(`/v1/clinical/documents/${draft.documentId}/draft`)
    .set('Authorization', auth())
    .send({ expectedVersion: 1, payload: payload() })
    .expect(409)
})
test('BE-040: TUSS é obrigatório quando não particular; código fornecido inválido/inativo/antigo é recusado', async () => {
  const v = await f.visit()
  await create(v.encounterId, payload(false)).expect(400)
  await create(v.encounterId, {
    privateVisit: true,
    exams: [{ description: ' ', indication: 'Indicação' }],
  }).expect(400)
  await create(v.encounterId, {
    privateVisit: true,
    exams: [{ description: 'Exame', indication: ' ' }],
  }).expect(400)
  for (const code of ['DEV-TUSS-UNKNOWN', 'DEV-TUSS-004'])
    await create(v.encounterId, {
      privateVisit: true,
      exams: [
        { tussCode: code, tussVersion: tuss.version, indication: 'Fictícia' },
      ],
    }).expect(400)
  await create(v.encounterId, {
    privateVisit: true,
    exams: [
      { tussCode: 'DEV-TUSS-001', tussVersion: 'old', indication: 'Fictícia' },
    ],
  }).expect(409)
  const d = (
    await create(v.encounterId, {
      privateVisit: false,
      exams: [
        {
          tussCode: 'DEV-TUSS-001',
          tussVersion: tuss.version,
          description: 'Cliente não decide snapshot',
          indication: 'Fictícia',
        },
      ],
    }).expect(201)
  ).body
  assert.equal(d.payload.exams[0].description, tuss.entries[0].description)
  await issue(d.documentId).expect(200)
})
test('BE-040: provider indisponível preserva draft sem índice/arquivo de pedido emitido', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body,
    runtime = await composeBackendApplication({
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
  assert.equal(
    await f.db.examOrder.count({ where: { documentId: d.documentId } }),
    0,
  )
  const remaining = (await get(d.documentId).expect(200)).body
  assert.equal(remaining.status, 'draft')
  assert.equal(remaining.files.length, 0)
})
test('BE-040: fila usa parâmetro/relógio e só revela solicitante autorizado com auditoria', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body,
    issued = (await issue(d.documentId).expect(200)).body
  const boundary = new Date(
    +new Date(issued.issuedAt) + f.config.examPendingResultAlertDays * 86400000,
  )
  const early = await pending(new Date(+boundary - 1)).list(
    actor(),
    { patientId: v.patientId },
    context(),
  )
  assert.equal(early.items.length, 0)
  const due = await pending(boundary).list(
    actor(),
    { patientId: v.patientId },
    context(),
  )
  pendingExamOrderResponse.parse(due)
  assert.equal(due.items.length, 1)
  assert.equal(due.items[0].orderId, issued.examOrder.id)
  await f.db.session.update({
    where: { id: f.professionalAccounts[0].session.id },
    data: { mfaVerifiedAt: null },
  })
  try {
    await request(f.app)
      .get('/v1/clinical/exam-orders/pending')
      .set('Authorization', auth())
      .expect(401)
  } finally {
    await f.db.session.update({
      where: { id: f.professionalAccounts[0].session.id },
      data: { mfaVerifiedAt: new Date() },
    })
  }
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: {
        action: 'exam.pending_viewed',
        resourceId: issued.examOrder.id,
        subjectPatientId: v.patientId,
        authorizationBasis: `care_link:${v.linkId}`,
      },
    }),
  )
  await assert.rejects(
    pending(boundary).list(
      actor(),
      { professionalId: f.professionalIds[1] },
      context(),
    ),
  )
  for (const token of [f.admin.token, f.reception.token, v.patient.token])
    await request(f.app)
      .get('/v1/clinical/exam-orders/pending')
      .set('Authorization', token)
      .expect(403)
  await f.db.careLink.update({
    where: { id: v.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  assert.equal(
    (
      await pending(boundary).list(
        actor(),
        { patientId: v.patientId },
        context(),
      )
    ).items.length,
    0,
  )
})

test('BE-040: filtro SQL exclui pré-consulta/expirado e só inclui urgência vigente não rejeitada', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body,
    issued = (await issue(d.documentId).expect(200)).body,
    cutoff = new Date(+new Date(issued.issuedAt) + 1),
    store = f.scope.resolve<PrismaExamOrderStore>(services.examOrderStore),
    list = (now: Date) =>
      store.transaction((tx) =>
        tx.pendingExamOrders(
          f.professionalIds[0],
          { patientId: v.patientId },
          cutoff,
          now,
        ),
      )
  const appointment = await f.db.appointment.findUniqueOrThrow({
    where: { id: v.appointmentId },
  })
  assert.equal(
    (await list(new Date(+appointment.startsAt - 1))).items.length,
    0,
  )
  await f.db.careLink.update({
    where: { id: v.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  assert.equal((await list(new Date())).items.length, 0)
  const grant = (
    await request(f.app)
      .post('/v1/clinical/emergency-access')
      .set('Authorization', auth())
      .send({
        patientId: v.patientId,
        justification: 'Urgência fictícia para testar autorização',
      })
      .expect(201)
  ).body
  assert.equal((await list(new Date())).items.length, 1)
  assert.equal((await list(new Date(grant.expiresAt))).items.length, 0)
  await request(f.app)
    .post(`/v1/admin/emergency-access/${grant.grantId}/review`)
    .set('Authorization', f.admin.token)
    .send({ outcome: 'rejected', notes: 'Revisão de teste' })
    .expect(200)
  assert.equal((await list(new Date())).items.length, 0)
})

test('BE-040: catálogo novo preserva emitido, exige revisão do draft e reuso resolve a versão vigente', async () => {
  const v = await f.visit(),
    body = {
      privateVisit: false,
      exams: [
        {
          tussCode: 'DEV-TUSS-001',
          tussVersion: tuss.version,
          indication: 'Indicação fictícia',
        },
      ],
    },
    original = (await create(v.encounterId, body).expect(201)).body,
    draft = (await create(v.encounterId, body).expect(201)).body,
    issued = (await issue(original.documentId).expect(200)).body
  const next = {
    ...tuss,
    version: 'dev-exam-next',
    entries: tuss.entries.map((e) => ({
      ...e,
      description: `${e.description} — nova versão`,
    })),
  }
  await terminology().load(next, context())
  const frozen = (await get(original.documentId).expect(200)).body
  assert.deepEqual(frozen.payload, issued.payload)
  assert.equal(frozen.sha256, issued.sha256)
  await issue(draft.documentId).expect(409)
  assert.equal(
    (await get(draft.documentId).expect(200)).body.payload.exams[0].tussVersion,
    tuss.version,
  )
  const updated = (
    await request(f.app)
      .patch(`/v1/clinical/documents/${draft.documentId}/draft`)
      .set('Authorization', auth())
      .send({
        expectedVersion: 1,
        payload: {
          ...body,
          exams: [{ ...body.exams[0], tussVersion: next.version }],
        },
      })
      .expect(200)
  ).body
  assert.equal(
    updated.payload.exams[0].description,
    next.entries[0].description,
  )
  await issue(draft.documentId, 2).expect(200)
  const copy = (
    await request(f.app)
      .post(`/v1/clinical/encounters/${v.encounterId}/documents/reuse`)
      .set('Authorization', auth())
      .send({ sourceDocumentId: original.documentId })
      .expect(201)
  ).body
  assert.equal(copy.copiedFromDocumentId, original.documentId)
  assert.equal(copy.payload.exams[0].procedureSnapshot.version, next.version)
  assert.equal(copy.examOrder, null)
  assert.equal(copy.signature, null)
  assert.deepEqual(
    (await get(original.documentId).expect(200)).body.payload,
    issued.payload,
  )
})

test('BE-040: falha de auditoria reverte pedido, documento, timeline e arquivo provisório', async () => {
  const v = await f.visit(),
    d = (await create(v.encounterId).expect(201)).body,
    directory = resolve(f.config.fileStoragePath, 'attachment'),
    beforeFiles = (await readdir(directory).catch(() => [])).sort()
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_exam_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='document.issued' THEN RAISE EXCEPTION 'forced_exam_audit'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER "fail_exam_audit" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_exam_audit()',
  )
  try {
    await issue(d.documentId).expect(500)
    assert.equal(
      await f.db.examOrder.count({ where: { documentId: d.documentId } }),
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
    assert.equal(
      await f.db.clinicalTimelineEntry.count({
        where: { resourceId: d.documentId },
      }),
      0,
    )
    assert.deepEqual((await readdir(directory)).sort(), beforeFiles)
    assert.equal((await get(d.documentId).expect(200)).body.status, 'draft')
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER "fail_exam_audit" ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_exam_audit()')
  }
  await issue(d.documentId).expect(200)
})

test('BE-040: paginação filtra antes do limite, exclui draft/anulado e rejeita cursor de outro filtro', async () => {
  const v = await f.visit(),
    ids = new Set<string>()
  let lastIssuedAt = ''
  for (let i = 0; i < 32; i++) {
    const d = (await create(v.encounterId).expect(201)).body,
      issued = (await issue(d.documentId).expect(200)).body
    lastIssuedAt = issued.issuedAt
    if (i === 0) {
      await request(f.app)
        .post(`/v1/clinical/documents/${d.documentId}/void`)
        .set('Authorization', auth())
        .send({ reason: 'Pedido demonstrativo anulado' })
        .expect(200)
    } else ids.add(issued.examOrder.id)
  }
  await create(v.encounterId).expect(201)
  const service = pending(
      new Date(
        +new Date(lastIssuedAt) +
          f.config.examPendingResultAlertDays * 86400000,
      ),
    ),
    page = await service.list(actor(), { patientId: v.patientId }, context())
  assert.equal(page.items.length, 30)
  assert.ok(page.nextCursor)
  const rest = await service.list(
    actor(),
    { patientId: v.patientId, cursor: page.nextCursor },
    context(),
  )
  assert.equal(rest.items.length, 1)
  assert.equal(rest.nextCursor, null)
  assert.deepEqual(
    new Set([...page.items, ...rest.items].map((e) => e.orderId)),
    ids,
  )
  const otherPatient = await f.patient()
  await assert.rejects(
    service.list(
      actor(),
      { patientId: otherPatient.patientId, cursor: page.nextCursor },
      context(),
    ),
  )
  assert.equal(
    (
      await service.list(
        f.principal(f.professionalAccounts[1], 'professional'),
        {},
        context(),
      )
    ).items.length,
    0,
  )
})
