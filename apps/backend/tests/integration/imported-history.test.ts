import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { after, before, test } from 'node:test'
import request from 'supertest'
import type { FileDownloadTokens } from '../../src/application/ports/files'
import type { ManageFiles } from '../../src/application/use-cases/manage-files'
import { careWindow } from '../../src/domain/rules/care-link'
import { ConsentEvidenceReconciler } from '../../src/infrastructure/jobs/consent-evidence-reconciler'
import {
  createServiceContainer,
  services,
} from '../../src/shared/composition/container'
import {
  importedHistoryDetail,
  importedHistoryReceipt,
} from '../../src/shared/infra/http/contracts/imported-history'
import { createBookingFixture } from '../support/m1-bookings'

let f: Awaited<ReturnType<typeof createBookingFixture>>
let files: ManageFiles
before(async () => {
  f = await createBookingFixture()
  files = createServiceContainer(f.config, f.db).resolve<ManageFiles>(
    services.manageFiles,
  )
})
after(async () => {
  if (f) await f.close()
})
const pdf = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
)
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  originClient: 'test',
  authorizationBasis: 'test',
})
const admin = () => f.principal(f.admin, 'admin')
const create = (
  patientId: string,
  token = f.admin.token,
  data: Record<string, unknown> = {
    origin: 'Acervo fictício',
    originalDate: '2020-05-01',
    originalAuthor: 'Autor anterior fictício',
  },
  body = pdf,
  filename = 'historico.pdf',
) =>
  request(f.app)
    .post(`/v1/clinical/records/${patientId}/imported-history`)
    .set('Authorization', token)
    .field('data', JSON.stringify(data))
    .attach('file', body, filename)
const detail = (id: string, token = f.professionalAccounts[0].token) =>
  request(f.app)
    .get(`/v1/clinical/imported-history/${id}`)
    .set('Authorization', token)
const check = (id: string, token = f.professionalAccounts[0].token) =>
  request(f.app)
    .post(`/v1/clinical/imported-history/${id}/check`)
    .set('Authorization', token)
    .send({})
const addendum = (
  id: string,
  token = f.professionalAccounts[0].token,
  data = {
    reason: 'Justificativa fictícia',
    correctionText: 'Correção fictícia para teste',
  },
) =>
  request(f.app)
    .post(`/v1/clinical/imported-history/${id}/addenda`)
    .set('Authorization', token)
    .send(data)
const downloadLink = (id: string, token = f.professionalAccounts[0].token) =>
  request(f.app)
    .post(`/v1/files/${id}/download-link`)
    .set('Authorization', token)
async function linkedPatient(pre = false) {
  const p = await f.patient(),
    startsAt = new Date(Date.now() + (pre ? 6 : -3) * 3600000),
    endsAt = new Date(+startsAt + 3600000)
  const a = await f.db.$transaction(async (tx) => {
    const row = await tx.appointment.create({
      data: {
        patientId: p.patientId,
        professionalId: f.professionalIds[0],
        specialtyId: f.specialtyId,
        modality: 'remote',
        visitType: 'first',
        startsAt,
        endsAt,
        durationMinutes: 60,
        specialtyVersion: 1,
        status: pre ? 'confirmed' : 'completed',
        bookingSource: 'imported',
        createdBy: f.admin.user.id,
      },
    })
    if (pre)
      await tx.slotReservation.create({
        data: {
          professionalId: row.professionalId,
          appointmentId: row.id,
          modality: 'remote',
          startsAt,
          endsAt,
          state: 'confirmed',
          requestKey: randomUUID(),
          requestHash: 'f'.repeat(64),
        },
      })
    return row
  })
  const window = careWindow(a, f.config.careLinkPolicy)
  assert.ok(window)
  const link = await f.db.careLink.create({
    data: {
      patientId: p.patientId,
      professionalId: a.professionalId,
      source: 'appointment',
      sourceAppointmentId: a.id,
      appointmentVersion: a.version,
      ...window,
    },
  })
  return { ...p, linkId: link.id }
}
test('BE-033: admin/gestor fazem entrada cega, sem conta, notificação ou evolução assinada', async () => {
  const p = await linkedPatient(),
    manager = await f.account('manager'),
    users = await f.db.user.count(),
    notifications = await f.db.notification.count()
  const r = await create(p.patientId).expect(201)
  importedHistoryReceipt.parse(r.body)
  assert.equal(r.body.signatureStatus, 'not_signed')
  assert.ok(!('file' in r.body) && !('fileId' in r.body) && !('url' in r.body))
  assert.equal(r.headers['cache-control'], 'no-store')
  await create(p.patientId, manager.token, {
    origin: 'Outra fonte fictícia',
  }).expect(201)
  assert.equal(await f.db.user.count(), users)
  assert.equal(await f.db.notification.count(), notifications)
  assert.equal(await f.db.clinicalEncounter.count(), 0)
  for (const token of [
    f.professionalAccounts[0].token,
    f.reception.token,
    p.token,
  ])
    await create(p.patientId, token).expect(403)
  const row = await f.db.importedHistory.findUniqueOrThrow({
    where: { id: r.body.id },
  })
  assert.ok(!row.metadataEncrypted.includes('Acervo fictício'))
  const stored = await f.db.fileObject.findUniqueOrThrow({
    where: { id: row.fileId },
  })
  assert.equal(stored.ownerPatientId, p.patientId)
  assert.equal(stored.linkedResourceId, row.id)
  assert.ok(
    !(
      await readFile(
        join(f.config.fileStoragePath, 'attachment', stored.storageKey),
      )
    ).includes(pdf),
  )
})
test('BE-033: conteúdo só abre com vínculo fora da pré-consulta, entrada não concede leitura', async () => {
  const p = await linkedPatient(),
    r = (await create(p.patientId).expect(201)).body
  const d = (await detail(r.id).expect(200)).body
  importedHistoryDetail.parse(d)
  assert.equal(d.originalAuthor, 'Autor anterior fictício')
  assert.equal(d.signatureStatus, 'not_signed')
  assert.equal(d.check, null)
  assert.deepEqual(d.addenda, [])
  for (const token of [
    f.admin.token,
    f.reception.token,
    p.token,
    (await f.account('manager')).token,
  ])
    await detail(r.id, token).expect(403)
  await detail(r.id, f.professionalAccounts[1].token).expect(404)
  await detail(randomUUID()).expect(404)
  const pre = await linkedPatient(true),
    imported = (await create(pre.patientId).expect(201)).body
  await detail(imported.id).expect(404)
  await check(imported.id).expect(404)
  await addendum(imported.id).expect(404)
  const stored = await f.db.importedHistory.findUniqueOrThrow({
    where: { id: imported.id },
  })
  await downloadLink(stored.fileId).expect(404)
})
test('BE-033: conferência concorrente é única; adendo preserva original e trilha', async () => {
  const p = await linkedPatient(),
    r = (await create(p.patientId).expect(201)).body,
    original = await f.db.importedHistory.findUniqueOrThrow({
      where: { id: r.id },
    })
  const checks = await Promise.all([
    check(r.id).expect(200),
    check(r.id).expect(200),
  ])
  assert.equal(checks[0].body.id, checks[1].body.id)
  assert.equal(
    await f.db.importedHistoryCheck.count({ where: { historyId: r.id } }),
    1,
  )
  await addendum(r.id, f.professionalAccounts[0].token, {
    reason: '',
    correctionText: 'Teste',
  }).expect(400)
  const a = (await addendum(r.id).expect(201)).body
  const d = (await detail(r.id).expect(200)).body
  assert.equal(d.check.professional.id, f.professionalIds[0])
  assert.equal(d.addenda[0].id, a.id)
  assert.equal(d.addenda[0].correctionText, 'Correção fictícia para teste')
  assert.deepEqual(
    await f.db.importedHistory.findUniqueOrThrow({ where: { id: r.id } }),
    original,
  )
  const timeline = (
    await request(f.app)
      .get(`/v1/clinical/records/${p.patientId}/timeline`)
      .query({ type: 'imported_history' })
      .set('Authorization', f.professionalAccounts[0].token)
      .expect(200)
  ).body
  assert.equal(timeline.items[0].resourceId, r.id)
  assert.equal(timeline.items[0].importedOrigin.origin, 'Acervo fictício')
  assert.ok(timeline.items[0].summary.includes('não equivale'))
  assert.ok(timeline.items[0].date.startsWith('2020-05-01'))
  const events = await f.db.auditEvent.findMany({ where: { resourceId: r.id } })
  assert.ok(
    events.some(
      (e) =>
        e.action === 'imported_history.checked' &&
        e.authorizationBasis === `care_link:${p.linkId}`,
    ),
  )
  assert.ok(
    events.some((e) => e.action === 'imported_history.addendum_created'),
  )
  assert.ok(!JSON.stringify(events).includes('Correção fictícia'))
  for (const operation of [
    f.db.importedHistory.update({
      where: { id: r.id },
      data: { originalDate: new Date('2019-01-01') },
    }),
    f.db.importedHistory.delete({ where: { id: r.id } }),
    f.db.importedHistoryCheck.delete({ where: { historyId: r.id } }),
    f.db.importedHistoryAddendum.update({
      where: { id: a.id },
      data: { contentEncrypted: 'changed' },
    }),
    f.db.fileObject.update({
      where: { id: original.fileId },
      data: { storageKey: randomUUID() },
    }),
    f.db.fileObject.delete({ where: { id: original.fileId } }),
  ])
    await assert.rejects(operation)
})
test('BE-033: download exige sessão/base atual e audita vínculo sem acesso administrativo', async () => {
  const p = await linkedPatient(),
    r = (await create(p.patientId).expect(201)).body,
    d = (await detail(r.id).expect(200)).body
  await downloadLink(d.file.id, f.admin.token).expect(404)
  await downloadLink(d.file.id, f.professionalAccounts[1].token).expect(404)
  const link = (await downloadLink(d.file.id).expect(200)).body
  const downloaded = await request(f.app)
    .get(link.url)
    .set('Authorization', f.professionalAccounts[0].token)
    .expect(200)
  assert.equal(downloaded.headers['content-type'], 'application/pdf')
  assert.deepEqual(downloaded.body, pdf)
  const expiredToken = createServiceContainer(f.config, f.db)
    .resolve<FileDownloadTokens>(services.fileTokens)
    .issue({
      fileId: d.file.id,
      userId: f.professionalAccounts[0].user.id,
      sessionId: f.professionalAccounts[0].session.id,
      expiresAt: new Date(Date.now() - 1),
    })
  await request(f.app)
    .get(`/v1/file-download/${expiredToken}`)
    .set('Authorization', f.professionalAccounts[0].token)
    .expect(410)

  await request(f.app)
    .get(link.url)
    .set('Authorization', f.admin.token)
    .expect(403)
  const event = await f.db.auditEvent.findFirstOrThrow({
    where: { resourceId: d.file.id, action: 'file.downloaded' },
  })
  assert.equal(event.authorizationBasis, `care_link:${p.linkId}`)
  await f.db.careLink.update({
    where: { id: p.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  await request(f.app)
    .get(link.url)
    .set('Authorization', f.professionalAccounts[0].token)
    .expect(404)
  await detail(r.id).expect(404)
  await check(r.id).expect(404)
})
test('BE-033: tipos inválidos, extensão falsa, limite e multipart recusados sem registros órfãos', async () => {
  const p = await f.patient(),
    beforeFiles = await f.db.fileObject.count(),
    beforeHistory = await f.db.importedHistory.count()
  await create(
    p.patientId,
    f.admin.token,
    { origin: 'Teste' },
    Buffer.from('texto inválido'),
    'arquivo.pdf',
  ).expect(422)
  await create(
    p.patientId,
    f.admin.token,
    { origin: 'Teste' },
    pdf,
    'arquivo.jpg',
  ).expect(422)
  await create(
    p.patientId,
    f.admin.token,
    { origin: 'Teste' },
    Buffer.alloc(f.config.fileAttachmentMaxMb * 1024 * 1024 + 1),
    'arquivo.pdf',
  ).expect(422)
  await create(p.patientId, f.admin.token, { origin: '' }).expect(400)
  await create(p.patientId, f.admin.token, {
    origin: 'Teste',
    contentReference: 'https://example.test',
  }).expect(400)
  await create(randomUUID()).expect(404)
  await request(f.app)
    .post(`/v1/clinical/records/${p.patientId}/imported-history`)
    .set('Authorization', f.admin.token)
    .attach('file', pdf, 'arquivo.pdf')
    .field('data', JSON.stringify({ origin: 'Teste' }))
    .expect(400)
  await request(f.app)
    .post(`/v1/clinical/records/${p.patientId}/imported-history`)
    .set('Authorization', f.admin.token)
    .field('data', JSON.stringify({ origin: 'Teste' }))
    .attach('file', pdf, 'arquivo.pdf')
    .attach('file', pdf, 'duplicado.pdf')
    .expect(400)
  assert.equal(await f.db.fileObject.count(), beforeFiles)
  assert.equal(await f.db.importedHistory.count(), beforeHistory)
})
test('BE-033: falha na confirmação reverte histórico/índice e limpa upload', async () => {
  const p = await f.patient(),
    beforeFiles = await f.db.fileObject.count(),
    beforeHistory = await f.db.importedHistory.count()
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_imported_history_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='imported_history.created' THEN RAISE EXCEPTION 'test import audit unavailable'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER test_imported_history_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_imported_history_audit()',
  )
  try {
    await create(p.patientId).expect(500)
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER test_imported_history_audit ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_imported_history_audit()')
  }
  assert.equal(await f.db.fileObject.count(), beforeFiles)
  assert.equal(await f.db.importedHistory.count(), beforeHistory)
  assert.equal(
    await f.db.clinicalRecord.count({ where: { patientId: p.patientId } }),
    0,
  )
})
test('BE-033: arquivo provisório não é legível, reconciliador remove só órfão antigo', async () => {
  const p = await linkedPatient(),
    saved = await files.upload({
      actor: admin(),
      category: 'attachment',
      ownerPatientId: p.patientId,
      linkedResourceType: 'ImportedHistory',
      linkedResourceId: randomUUID(),
      filename: 'orfao.pdf',
      source: Readable.from([pdf]),
      context: context(),
    })
  await downloadLink(saved.fileId).expect(404)
  const stored = await f.db.fileObject.update({
    where: { id: saved.fileId },
    data: {
      createdAt: new Date(
        Date.now() - (f.config.fileOrphanReconcileMinutes + 1) * 60000,
      ),
    },
  })
  const valid = (await create(p.patientId).expect(201)).body
  const reconciler = new ConsentEvidenceReconciler(
    f.db,
    files,
    f.config.fileOrphanReconcileMinutes,
  )
  assert.equal(await reconciler.runOnce(), 1)
  assert.equal(
    await f.db.fileObject.findUnique({ where: { id: saved.fileId } }),
    null,
  )
  await assert.rejects(
    readFile(join(f.config.fileStoragePath, 'attachment', stored.storageKey)),
  )
  await detail(valid.id).expect(200)
})
test('BE-033: urgência permite leitura/download, mas não conferência/adendo sem vínculo', async () => {
  const p = await f.patient(),
    imported = (await create(p.patientId).expect(201)).body
  const grant = (
    await request(f.app)
      .post('/v1/clinical/emergency-access')
      .set('Authorization', f.professionalAccounts[0].token)
      .send({
        patientId: p.patientId,
        justification: 'Teste de acesso excepcional',
      })
      .expect(201)
  ).body
  const d = (await detail(imported.id).expect(200)).body
  const link = (await downloadLink(d.file.id).expect(200)).body
  await request(f.app)
    .get(link.url)
    .set('Authorization', f.professionalAccounts[0].token)
    .expect(200)
  assert.equal(
    (
      await f.db.auditEvent.findFirstOrThrow({
        where: { resourceId: d.file.id, action: 'file.downloaded' },
      })
    ).authorizationBasis,
    `emergency_access:${grant.grantId}`,
  )
  await check(imported.id).expect(404)
  await addendum(imported.id).expect(404)
})
test('BE-033: contratos OpenAPI preservam upload cego e rotas clínicas', async () => {
  const doc = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(
    doc.paths['/clinical/records/{patientId}/imported-history'].post.requestBody
      .content['multipart/form-data'],
  )
  assert.ok(doc.paths['/clinical/imported-history/{id}'].get)
  assert.ok(doc.paths['/clinical/imported-history/{id}/check'].post)
})
