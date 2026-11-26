import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import request from 'supertest'
import type { AuditWriter } from '../../src/application/ports/audit-writer'
import type { FileDownloadTokens } from '../../src/application/ports/files'
import type { AuthorizeClinical } from '../../src/application/use-cases/authorize-clinical'
import type { DispatchNotifications } from '../../src/application/use-cases/dispatch-notifications'
import type { ManageExamResults } from '../../src/application/use-cases/manage-exam-results'
import type { ManageFiles } from '../../src/application/use-cases/manage-files'
import { ReadPendingExamOrders } from '../../src/application/use-cases/read-pending-exam-orders'
import { ConsentEvidenceReconciler } from '../../src/infrastructure/jobs/consent-evidence-reconciler'
import { syncAppointmentCareLink } from '../../src/infrastructure/persistence/prisma/care-link-store'
import type { PrismaExamOrderStore } from '../../src/infrastructure/persistence/prisma/exam-order-store'
import { services } from '../../src/shared/composition/container'
import {
  examResultDetail,
  examResultPage,
  examResultReceipt,
} from '../../src/shared/infra/http/contracts/exam-results'
import { createClinicalFixture } from '../support/m2-clinical'

let f: Awaited<ReturnType<typeof createClinicalFixture>>
const pdf = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
)
before(async () => {
  f = await createClinicalFixture()
})
beforeEach(async () => {
  await f.clearActive()
})
after(async () => {
  if (f) await f.close()
})
const auth = () => f.professionalAccounts[0].token
const ctx = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  authorizationBasis: 'test',
})
const upload = (
  token: string,
  data: object,
  bytes = pdf,
  filename = 'resultado.pdf',
) =>
  request(f.app)
    .post('/v1/clinical/exam-results')
    .set('Authorization', token)
    .field('data', JSON.stringify(data))
    .attach('resultFile', bytes, filename)
    .timeout({ response: 10000, deadline: 15000 })
async function order() {
  const v = await f.visit()
  const draft = (
    await request(f.app)
      .post(`/v1/clinical/encounters/${v.encounterId}/documents/drafts`)
      .set('Authorization', auth())
      .send({
        typeCode: 'exam_order',
        payload: {
          privateVisit: true,
          exams: [
            { description: 'Exame fictício', indication: 'Indicação fictícia' },
          ],
        },
      })
      .expect(201)
  ).body
  const issued = (
    await request(f.app)
      .post(`/v1/clinical/documents/${draft.documentId}/issue`)
      .set('Authorization', auth())
      .send({ expectedVersion: 1 })
      .expect(200)
  ).body
  return { ...v, documentId: issued.documentId, orderId: issued.examOrder.id }
}
test('BE-041: envio próprio cria resultado cifrado, retenção e timeline externa sem publicação', async () => {
  const p = await f.patient(),
    r = (
      await upload(p.token, {
        patientId: p.patientId,
        origin: 'external',
      }).expect(201)
    ).body
  examResultReceipt.parse(r)
  assert.equal(r.orderId, null)
  assert.equal(r.file, undefined)
  const row = await f.db.examResult.findUniqueOrThrow({
    where: { id: r.resultId },
    include: { file: true, retentionEvent: true },
  })
  assert.equal(row.file.category, 'result')
  assert.equal(
    row.retentionEvent?.retentionYears,
    f.config.clinicalRetentionYears,
  )
  assert.equal(row.retentionEvent?.anchorAt.toISOString(), r.receivedAt)
  assert.equal(
    await f.db.notification.count({ where: { aggregateId: r.resultId } }),
    0,
  )
  const encrypted = await readFile(
    join(f.config.fileStoragePath, 'result', row.file.storageKey),
  )
  assert.equal(encrypted.includes(pdf), false)
  await request(f.app)
    .get(`/v1/clinical/exam-results/${r.resultId}`)
    .set('Authorization', p.token)
    .expect(403)
  await request(f.app)
    .post(`/v1/files/${r.fileId}/download-link`)
    .set('Authorization', p.token)
    .expect(404)
  const v = await f.visit(p)
  const detail = (
    await request(f.app)
      .get(`/v1/clinical/exam-results/${r.resultId}`)
      .set('Authorization', auth())
      .expect(200)
  ).body
  examResultDetail.parse(detail)
  const timeline = (
    await request(f.app)
      .get(`/v1/clinical/records/${v.patientId}/timeline?type=exam_result`)
      .set('Authorization', auth())
      .expect(200)
  ).body
  assert.match(timeline.items[0].summary, /origem externa/)
  assert.equal(timeline.items[0].professional, null)
})
test('BE-041: resultado do pedido retira pendência, avisa somente solicitante e preserva primeiro recebimento', async () => {
  const v = await order(),
    data = { patientId: v.patientId, origin: 'ordered', orderId: v.orderId }
  const r = (await upload(f.reception.token, data).expect(201)).body
  const second = (await upload(f.reception.token, data).expect(201)).body
  assert.notEqual(r.resultId, second.resultId)
  assert.equal(
    (
      await f.db.examOrder.findUniqueOrThrow({ where: { id: v.orderId } })
    ).resultReceivedAt?.toISOString(),
    r.receivedAt,
  )
  const notices = await f.db.notification.findMany({
    where: { aggregateId: { in: [r.resultId, second.resultId] } },
  })
  assert.equal(notices.length, 2)
  assert.ok(
    notices.every(
      (n) =>
        n.userId === f.professionalAccounts[0].user.id &&
        n.templateKey === 'exam.result_received' &&
        n.payloadEncrypted === null,
    ),
  )
  const page = (
    await request(f.app)
      .get(
        `/v1/clinical/records/${v.patientId}/exam-results?orderId=${v.orderId}`,
      )
      .set('Authorization', auth())
      .expect(200)
  ).body
  examResultPage.parse(page)
  assert.equal(page.items.length, 2)
  const pending = new ReadPendingExamOrders(
    f.scope.resolve<PrismaExamOrderStore>(services.examOrderStore),
    f.scope.resolve<AuthorizeClinical>(services.authorizeClinical),
    f.scope.resolve<AuditWriter>(services.audit),
    f.config.examPendingResultAlertDays,
    () =>
      new Date(
        Date.now() + (f.config.examPendingResultAlertDays + 1) * 86400000,
      ),
  )
  const queue = await pending.list(
    f.principal(f.professionalAccounts[0], 'professional'),
    {},
    ctx(),
  )
  assert.equal(
    queue.items.some((item) => item.orderId === v.orderId),
    false,
  )
  const dispatcher = f.scope.resolve<DispatchNotifications>(services.dispatcher)
  await dispatcher.runOnce()
  assert.equal(
    (
      await f.db.notification.findUniqueOrThrow({
        where: { id: notices[0].id },
      })
    ).deliveryStatus,
    'sent',
  )
})
test('BE-041: arquivo inválido, extensão falsa e excesso respondem sem órfãos nem mudar pedido', async () => {
  const v = await order(),
    data = { patientId: v.patientId, origin: 'ordered', orderId: v.orderId },
    files = await f.db.fileObject.count(),
    diskBefore = await readdir(join(f.config.fileStoragePath, 'result'))
  await upload(f.reception.token, data, Buffer.from('não é PDF')).expect(422)
  await upload(f.reception.token, data, pdf, 'resultado.png').expect(422)
  const excess = Buffer.alloc(f.config.fileResultMaxMb * 1024 * 1024 + 1)
  pdf.copy(excess)
  await upload(f.reception.token, data, excess).expect(422)
  assert.equal(await f.db.fileObject.count(), files)
  assert.equal(
    await f.db.examResult.count({ where: { orderId: v.orderId } }),
    0,
  )
  assert.equal(
    (await f.db.examOrder.findUniqueOrThrow({ where: { id: v.orderId } }))
      .resultReceivedAt,
    null,
  )
  assert.deepEqual(
    await readdir(join(f.config.fileStoragePath, 'result')),
    diskBefore,
  )
})
test('BE-041: IDOR, origem/pedido inconsistente, tipos multipart e papel não ampliam escopo', async () => {
  const v = await order(),
    p = await f.patient(),
    data = { patientId: p.patientId, origin: 'ordered', orderId: v.orderId },
    files = await f.db.fileObject.count()
  await upload(p.token, data).expect(404)
  await upload(f.reception.token, data).expect(404)
  await upload(p.token, { patientId: v.patientId, origin: 'external' }).expect(
    404,
  )
  await upload(p.token, { patientId: p.patientId, origin: 'ordered' }).expect(
    400,
  )
  await upload(p.token, {
    patientId: p.patientId,
    origin: 'external',
    orderId: v.orderId,
  }).expect(400)
  await upload(p.token, {
    patientId: p.patientId,
    origin: 'external',
    submittedBy: p.user.id,
  }).expect(400)
  for (const token of [
    f.admin.token,
    auth(),
    (await f.account('manager')).token,
  ])
    await upload(token, { patientId: p.patientId, origin: 'external' }).expect(
      403,
    )
  await request(f.app)
    .post('/v1/clinical/exam-results')
    .set('Authorization', p.token)
    .attach('resultFile', pdf, 'teste.pdf')
    .field(
      'data',
      JSON.stringify({ patientId: p.patientId, origin: 'external' }),
    )
    .expect(400)
  await request(f.app)
    .post('/v1/clinical/exam-results')
    .set('Authorization', p.token)
    .field(
      'data',
      JSON.stringify({ patientId: p.patientId, origin: 'external' }),
    )
    .attach('resultFile', pdf, 'a.pdf')
    .attach('resultFile', pdf, 'b.pdf')
    .expect(400)
  assert.equal(await f.db.fileObject.count(), files)
})
test('BE-041: responsável ativo envia dependente, vínculo encerrado ou consentimento revogado negam', async () => {
  const guardian = await f.patient(),
    child = await f.patient()
  const link = await f.db.guardianLink.create({
    data: {
      guardianUserId: guardian.user.id,
      patientId: child.patientId,
      relationship: 'responsável',
    },
  })
  await upload(guardian.token, {
    patientId: child.patientId,
    origin: 'external',
  }).expect(201)
  await f.db.guardianLink.update({
    where: { id: link.id },
    data: { endedAt: new Date(), status: 'ended' },
  })
  await upload(guardian.token, {
    patientId: child.patientId,
    origin: 'external',
  }).expect(404)
  await request(f.app)
    .post('/v1/me/consents/revoke')
    .set('Authorization', child.token)
    .send({ patientId: child.patientId, versionId: f.documentId })
    .expect(201)
  await upload(f.reception.token, {
    patientId: child.patientId,
    origin: 'external',
  }).expect(409)
  await upload(child.token, {
    patientId: child.patientId,
    origin: 'external',
  }).expect(401)
})
test('BE-041: recepção/admin/gestor/DPO e profissional sem vínculo não leem; download é auditado e revalidado', async () => {
  const v = await order(),
    r = (
      await upload(f.reception.token, {
        patientId: v.patientId,
        origin: 'ordered',
        orderId: v.orderId,
      }).expect(201)
    ).body
  for (const token of [
    f.reception.token,
    f.admin.token,
    (await f.account('manager')).token,
    v.patient.token,
  ]) {
    await request(f.app)
      .get(`/v1/clinical/exam-results/${r.resultId}`)
      .set('Authorization', token)
      .expect(403)
    await request(f.app)
      .post(`/v1/files/${r.fileId}/download-link`)
      .set('Authorization', token)
      .expect(404)
  }
  await request(f.app)
    .get(`/v1/clinical/exam-results/${r.resultId}`)
    .set('Authorization', f.professionalAccounts[1].token)
    .expect(404)
  const link = (
    await request(f.app)
      .post(`/v1/files/${r.fileId}/download-link`)
      .set('Authorization', auth())
      .expect(200)
  ).body
  await request(f.app).get(link.url).set('Authorization', auth()).expect(200)
  assert.equal(
    await f.db.auditEvent.count({
      where: { resourceId: r.fileId, action: 'file.downloaded' },
    }),
    1,
  )
  await f.db.careLink.update({
    where: { id: v.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  await request(f.app).get(link.url).set('Authorization', auth()).expect(404)
  assert.ok(
    (await f.db.auditEvent.count({
      where: { resourceId: r.resultId, action: 'authorization.denied' },
    })) > 0,
  )
})
test('BE-041: revalida depois do upload, compensa órfão e reconcilia abandono sem apagar original', async () => {
  const v = await order(),
    service = f.scope.resolve<ManageExamResults>(services.manageExamResults),
    files = f.scope.resolve<ManageFiles>(services.manageFiles),
    actor = f.principal(f.reception, 'receptionist')
  const intent = await service.prepare(
    actor,
    { patientId: v.patientId, origin: 'ordered', orderId: v.orderId },
    ctx(),
  )
  const { Readable } = await import('node:stream')
  const saved = await files.upload({
    actor,
    category: 'result',
    ownerPatientId: v.patientId,
    linkedResourceType: 'ExamResult',
    linkedResourceId: intent.id,
    filename: 'teste.pdf',
    source: Readable.from(pdf),
    context: ctx(),
  })
  await request(f.app)
    .post(`/v1/clinical/documents/${v.documentId}/void`)
    .set('Authorization', auth())
    .send({ reason: 'Correção fictícia' })
    .expect(200)
  await assert.rejects(service.commit(actor, intent, saved.fileId, ctx()), {
    code: 'NOT_FOUND_OR_FORBIDDEN',
  })
  await files.discardUnlinked(saved.fileId)
  assert.equal(
    await f.db.fileObject.findUnique({ where: { id: saved.fileId } }),
    null,
  )
  const external = (
    await upload(v.patient.token, {
      patientId: v.patientId,
      origin: 'external',
    }).expect(201)
  ).body
  const abandoned = await files.upload({
    actor,
    category: 'result',
    ownerPatientId: v.patientId,
    linkedResourceType: 'ExamResult',
    linkedResourceId: randomUUID(),
    filename: 'teste.pdf',
    source: Readable.from(pdf),
    context: ctx(),
  })
  const old = new Date(
    Date.now() - 2 * f.config.fileOrphanReconcileMinutes * 60000,
  )
  await f.db.fileObject.update({
    where: { id: abandoned.fileId },
    data: { createdAt: old },
  })
  await new ConsentEvidenceReconciler(
    f.db,
    files,
    f.config.fileOrphanReconcileMinutes,
  ).runOnce()
  assert.equal(
    await f.db.fileObject.findUnique({ where: { id: abandoned.fileId } }),
    null,
  )
  await files.discardUnlinked(external.fileId)
  assert.ok(
    await f.db.fileObject.findUnique({ where: { id: external.fileId } }),
  )
})
test('BE-041: resultado/arquivo/retenção são imutáveis sem invalidar o hash do pedido', async () => {
  const v = await order(),
    r = (
      await upload(f.reception.token, {
        patientId: v.patientId,
        origin: 'ordered',
        orderId: v.orderId,
      }).expect(201)
    ).body
  await assert.rejects(
    f.db.examResult.update({
      where: { id: r.resultId },
      data: { origin: 'external' },
    }),
  )
  await assert.rejects(f.db.examResult.delete({ where: { id: r.resultId } }))
  await assert.rejects(
    f.db.fileObject.update({
      where: { id: r.fileId },
      data: { sha256: '0'.repeat(64) },
    }),
  )
  await assert.rejects(f.db.fileObject.delete({ where: { id: r.fileId } }))
  const retention = await f.db.clinicalRetentionEvent.findUniqueOrThrow({
    where: { examResultId: r.resultId },
  })
  await assert.rejects(
    f.db.clinicalRetentionEvent.delete({ where: { id: retention.id } }),
  )
  await assert.rejects(
    f.db.examOrder.update({
      where: { id: v.orderId },
      data: { resultReceivedAt: new Date(Date.now() + 1000) },
    }),
  )
  const document = await f.db.clinicalDocument.findUniqueOrThrow({
    where: { id: v.documentId },
  })
  const read = (
    await request(f.app)
      .get(`/v1/clinical/documents/${v.documentId}`)
      .set('Authorization', auth())
      .expect(200)
  ).body
  assert.equal(read.sha256, document.sha256)
})
test('BE-041: falha de auditoria desfaz resultado, recebimento, timeline, retenção e aviso, limpando arquivo', async () => {
  const v = await order(),
    beforeFiles = await f.db.fileObject.count(),
    beforeEvents = await f.db.clinicalRetentionEvent.count()
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_exam_result_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='exam_result.received' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER test_exam_result_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_exam_result_audit()',
  )
  try {
    await upload(f.reception.token, {
      patientId: v.patientId,
      origin: 'ordered',
      orderId: v.orderId,
    }).expect(500)
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER test_exam_result_audit ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_exam_result_audit()')
  }
  assert.equal(await f.db.fileObject.count(), beforeFiles)
  assert.equal(await f.db.clinicalRetentionEvent.count(), beforeEvents)
  assert.equal(
    await f.db.examResult.count({ where: { orderId: v.orderId } }),
    0,
  )
  assert.equal(
    (await f.db.examOrder.findUniqueOrThrow({ where: { id: v.orderId } }))
      .resultReceivedAt,
    null,
  )
  const record = await f.db.clinicalRecord.findUniqueOrThrow({
    where: { patientId: v.patientId },
  })
  assert.equal(
    await f.db.clinicalTimelineEntry.count({
      where: { recordId: record.id, type: 'exam_result' },
    }),
    0,
  )
  assert.equal(
    await f.db.notification.count({
      where: { patientId: v.patientId, templateKey: 'exam.result_received' },
    }),
    0,
  )
})
test('BE-041: revogação entre upload e commit bloqueia associação; revogação antes de delivery suprime aviso sem apagar resultado', async () => {
  const v = await order(),
    service = f.scope.resolve<ManageExamResults>(services.manageExamResults),
    files = f.scope.resolve<ManageFiles>(services.manageFiles),
    actor = f.principal(f.reception, 'receptionist')
  const first = (
    await upload(f.reception.token, {
      patientId: v.patientId,
      origin: 'ordered',
      orderId: v.orderId,
    }).expect(201)
  ).body
  const intent = await service.prepare(
    actor,
    { patientId: v.patientId, origin: 'external' },
    ctx(),
  )
  const { Readable } = await import('node:stream')
  const saved = await files.upload({
    actor,
    category: 'result',
    ownerPatientId: v.patientId,
    linkedResourceType: 'ExamResult',
    linkedResourceId: intent.id,
    filename: 'teste.pdf',
    source: Readable.from(pdf),
    context: ctx(),
  })
  await request(f.app)
    .post('/v1/me/consents/revoke')
    .set('Authorization', v.patient.token)
    .send({ patientId: v.patientId, versionId: f.documentId })
    .expect(201)
  await assert.rejects(service.commit(actor, intent, saved.fileId, ctx()), {
    code: 'CONSENT_REQUIRED',
  })
  await files.discardUnlinked(saved.fileId)
  assert.equal(await f.db.examResult.count({ where: { id: intent.id } }), 0)
  const notice = await f.db.notification.findFirstOrThrow({
    where: { aggregateId: first.resultId },
  })
  await f.scope
    .resolve<DispatchNotifications>(services.dispatcher)
    .deliver(notice.id)
  assert.equal(
    (await f.db.notification.findUniqueOrThrow({ where: { id: notice.id } }))
      .deliveryStatus,
    'suppressed',
  )
  assert.ok(await f.db.examResult.findUnique({ where: { id: first.resultId } }))
  await request(f.app)
    .get(`/v1/clinical/exam-results/${first.resultId}`)
    .set('Authorization', auth())
    .expect(200)
})
test('BE-041: links expiram e são pessoais', async () => {
  const v = await order(),
    r = (
      await upload(f.reception.token, {
        patientId: v.patientId,
        origin: 'ordered',
        orderId: v.orderId,
      }).expect(201)
    ).body
  const tokens = f.scope.resolve<FileDownloadTokens>(services.fileTokens),
    expired = tokens.issue({
      fileId: r.fileId,
      userId: f.professionalAccounts[0].user.id,
      sessionId: f.professionalAccounts[0].session.id,
      expiresAt: new Date(Date.now() - 1),
    })
  await request(f.app)
    .get(`/v1/file-download/${expired}`)
    .set('Authorization', auth())
    .expect(410)
  const link = (
    await request(f.app)
      .post(`/v1/files/${r.fileId}/download-link`)
      .set('Authorization', auth())
      .expect(200)
  ).body
  await request(f.app)
    .get(link.url)
    .set('Authorization', f.professionalAccounts[1].token)
    .expect(403)
})
test('BE-041: DPO e pré-consulta não abrem resultado; urgência auditada permite leitura', async () => {
  const p = await f.patient(),
    r = (
      await upload(p.token, {
        patientId: p.patientId,
        origin: 'external',
      }).expect(201)
    ).body
  const dpo = await f.account('manager')
  await f.db.userPermissionGrant.create({
    data: {
      userId: dpo.user.id,
      permissionCode: 'privacy.dpo',
      grantedBy: f.admin.user.id,
    },
  })
  await request(f.app)
    .get(`/v1/clinical/exam-results/${r.resultId}`)
    .set('Authorization', dpo.token)
    .expect(403)
  await request(f.app)
    .post(`/v1/files/${r.fileId}/download-link`)
    .set('Authorization', dpo.token)
    .expect(404)
  const professional = f.professionalAccounts[1]
  await f.db.$transaction(async (tx) => {
    const startsAt = new Date(Date.now() + 3600000),
      endsAt = new Date(+startsAt + 3600000)
    const appointment = await tx.appointment.create({
      data: {
        patientId: p.patientId,
        professionalId: f.professionalIds[1],
        specialtyId: f.specialtyId,
        modality: 'remote',
        visitType: 'first',
        startsAt,
        endsAt,
        durationMinutes: 60,
        specialtyVersion: 1,
        status: 'confirmed',
        bookingSource: 'imported',
        createdBy: f.admin.user.id,
      },
    })
    await tx.slotReservation.create({
      data: {
        professionalId: appointment.professionalId,
        appointmentId: appointment.id,
        modality: 'remote',
        startsAt,
        endsAt,
        state: 'confirmed',
        requestKey: randomUUID(),
        requestHash: 'e'.repeat(64),
      },
    })
    await syncAppointmentCareLink(
      tx,
      appointment,
      f.config.careLinkPolicy,
      null,
      ctx(),
    )
  })
  await request(f.app)
    .get(`/v1/clinical/exam-results/${r.resultId}`)
    .set('Authorization', professional.token)
    .expect(404)
  await request(f.app)
    .post(`/v1/files/${r.fileId}/download-link`)
    .set('Authorization', professional.token)
    .expect(404)
  const grant = (
    await request(f.app)
      .post('/v1/clinical/emergency-access')
      .set('Authorization', professional.token)
      .send({
        patientId: p.patientId,
        justification: 'Risco clínico fictício que exige avaliação imediata',
      })
      .expect(201)
  ).body
  await request(f.app)
    .get(`/v1/clinical/exam-results/${r.resultId}`)
    .set('Authorization', professional.token)
    .expect(200)
  assert.ok(
    (await f.db.auditEvent.count({
      where: {
        resourceId: r.resultId,
        authorizationBasis: `emergency_access:${grant.grantId}`,
      },
    })) > 0,
  )
})
test('BE-041: paginação/filtro/cursor não escapam do prontuário e OpenAPI usa contratos de resultado', async () => {
  const p = await f.patient(),
    data = { patientId: p.patientId, origin: 'external' }
  for (let i = 0; i < 31; i++) await upload(p.token, data).expect(201)
  await f.visit(p)
  const first = (
    await request(f.app)
      .get(`/v1/clinical/records/${p.patientId}/exam-results`)
      .set('Authorization', auth())
      .expect(200)
  ).body
  examResultPage.parse(first)
  assert.equal(first.items.length, 30)
  assert.ok(first.nextCursor)
  const last = (
    await request(f.app)
      .get(
        `/v1/clinical/records/${p.patientId}/exam-results?cursor=${first.nextCursor}`,
      )
      .set('Authorization', auth())
      .expect(200)
  ).body
  assert.equal(last.items.length, 1)
  assert.equal(last.nextCursor, null)
  assert.ok(
    !first.items.some((item: { id: string }) => item.id === last.items[0].id),
  )
  await request(f.app)
    .get(
      `/v1/clinical/records/${p.patientId}/exam-results?orderId=${randomUUID()}`,
    )
    .set('Authorization', auth())
    .expect(404)
  const other = await f.patient(),
    foreign = (
      await upload(other.token, {
        patientId: other.patientId,
        origin: 'external',
      }).expect(201)
    ).body
  await request(f.app)
    .get(
      `/v1/clinical/records/${p.patientId}/exam-results?cursor=${foreign.resultId}`,
    )
    .set('Authorization', auth())
    .expect(404)
  const spec = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(
    spec.paths['/clinical/exam-results'].post.requestBody.content[
      'multipart/form-data'
    ],
  )
  assert.ok(spec.paths['/clinical/records/{patientId}/exam-results'].get)
})
