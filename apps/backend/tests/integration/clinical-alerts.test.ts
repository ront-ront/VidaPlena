import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import request from 'supertest'
import { syncAppointmentCareLink } from '../../src/infrastructure/persistence/prisma/care-link-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import {
  alertPageResponse,
  alertResponse,
} from '../../src/shared/infra/http/contracts/clinical-alerts'
import { recordHeaderResponse } from '../../src/shared/infra/http/contracts/clinical-records'
import { createClinicalFixture } from '../support/m2-clinical'

let f: Awaited<ReturnType<typeof createClinicalFixture>>
let manager: Awaited<ReturnType<typeof f.account>>
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
const auth = () => f.professionalAccounts[0].token
const input = {
  kind: 'allergy',
  term: 'Substância fictícia sem mapeamento',
  verificationState: 'reported',
}
const create = (
  patientId: string,
  body: Record<string, unknown> = input,
  token = auth(),
) =>
  request(f.app)
    .post(`/v1/clinical/records/${patientId}/alerts`)
    .set('Authorization', token)
    .send(body)
const list = (
  patientId: string,
  query: Record<string, unknown> = {},
  token = auth(),
) =>
  request(f.app)
    .get(`/v1/clinical/records/${patientId}/alerts`)
    .set('Authorization', token)
    .query(query)
const change = (
  id: string,
  action = 'deactivate',
  body: Record<string, unknown> = {
    expectedVersion: 1,
    reason: 'Revisão fictícia',
  },
  token = auth(),
) =>
  request(f.app)
    .post(`/v1/clinical/alerts/${id}/${action}`)
    .set('Authorization', token)
    .send(body)
const header = (patientId: string, token = auth()) =>
  request(f.app)
    .get(`/v1/clinical/records/${patientId}`)
    .set('Authorization', token)
async function addOtherLink(
  patientId: string,
  professionalIndex = 1,
  minutesAhead = -1,
) {
  return f.db.$transaction(async (tx) => {
    const startsAt = new Date(Date.now() + minutesAhead * 60000),
      endsAt = new Date(+startsAt + 3600000)
    const row = await tx.appointment.create({
      data: {
        patientId,
        professionalId: f.professionalIds[professionalIndex],
        specialtyId: f.specialtyId,
        modality: 'remote',
        visitType: 'return',
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
        professionalId: row.professionalId,
        appointmentId: row.id,
        modality: row.modality,
        startsAt,
        endsAt,
        state: 'confirmed',
        requestKey: randomUUID(),
        requestHash: 'f'.repeat(64),
      },
    })
    await syncAppointmentCareLink(tx, row, f.config.careLinkPolicy, null, {
      requestId: randomUUID(),
      actorRoles: [],
      originClient: 'test',
      authorizationBasis: 'fixture',
    })
    return tx.careLink.findFirstOrThrow({
      where: { sourceAppointmentId: row.id },
    })
  })
}
test('BE-037: quatro tipos cifrados, relato explícito e alertas ativos no header', async () => {
  const v = await f.visit()
  const ids: string[] = []
  for (const kind of [
    'allergy',
    'condition',
    'continuous_medication',
    'other',
  ]) {
    const row = (
      await create(v.patientId, {
        ...input,
        kind,
        substanceCode: 'DEV-SUB-001',
      }).expect(201)
    ).body
    alertResponse.parse(row)
    ids.push(row.id)
    assert.equal(row.verificationState, 'reported')
    assert.equal(row.active, true)
    assert.equal(row.version, 1)
    assert.equal(row.history[0].author.id, f.professionalIds[0])
    const db = await f.db.clinicalAlert.findUniqueOrThrow({
      where: { id: row.id },
    })
    assert.ok(!db.payloadEncrypted.includes(input.term))
    const payload = JSON.parse(
      new AesSecretBox(f.config.encryptionKey, 'clinical-record').open(
        db.payloadEncrypted,
        `clinical_alert:${row.id}`,
      ),
    )
    assert.equal(payload.term, input.term)
  }
  const h = (await header(v.patientId).expect(200)).body
  recordHeaderResponse.parse(h)
  assert.deepEqual(h.alerts.map((a: { id: string }) => a.id).sort(), ids.sort())
  assert.ok(
    h.alerts.every(
      (a: { history?: unknown; verificationState: string }) =>
        !a.history && a.verificationState === 'reported',
    ),
  )
  const page = (await list(v.patientId).expect(200)).body
  alertPageResponse.parse(page)
  assert.equal(page.items.length, 4)
  const audit = await f.db.auditEvent.findMany({
    where: { subjectPatientId: v.patientId },
  })
  assert.ok(
    audit.some(
      (a) =>
        a.action === 'clinical.alerts_read' &&
        a.authorizationBasis === `care_link:${v.linkId}`,
    ),
  )
  assert.ok(!JSON.stringify(audit).includes(input.term))
})
test('BE-037: confirmação explícita preserva autor/data e desativação preserva original/histórico', async () => {
  const v = await f.visit(),
    a = (await create(v.patientId).expect(201)).body
  const original = await f.db.clinicalAlert.findUniqueOrThrow({
    where: { id: a.id },
  })
  await addOtherLink(v.patientId)
  const confirmed = (
    await change(
      a.id.toUpperCase(),
      'confirm',
      { expectedVersion: 1 },
      f.professionalAccounts[1].token,
    ).expect(200)
  ).body
  alertResponse.parse(confirmed)
  assert.equal(confirmed.verificationState, 'confirmed')
  assert.deepEqual(confirmed.author, a.author)
  assert.equal(confirmed.date, a.date)
  assert.equal(confirmed.history[1].author.id, f.professionalIds[1])
  await change(a.id, 'confirm', { expectedVersion: 2 }).expect(409)
  await change(a.id, 'deactivate', {
    expectedVersion: 1,
    reason: 'Antiga',
  }).expect(409)
  await change(a.id, 'deactivate', { expectedVersion: 2 }).expect(400)
  await change(a.id, 'deactivate', {
    expectedVersion: 2,
    reason: '   ',
  }).expect(400)
  const inactive = (
    await change(a.id, 'deactivate', {
      expectedVersion: 2,
      reason: 'Conferência fictícia',
    }).expect(200)
  ).body
  assert.equal(inactive.active, false)
  assert.equal(inactive.version, 3)
  assert.equal(inactive.history[2].reason, 'Conferência fictícia')
  assert.deepEqual(
    await f.db.clinicalAlert.findUniqueOrThrow({ where: { id: a.id } }),
    original,
  )
  assert.equal((await header(v.patientId).expect(200)).body.alerts.length, 0)
  assert.equal(
    (await list(v.patientId, { active: 'false' }).expect(200)).body.items[0].id,
    a.id,
  )
  assert.equal(
    (await list(v.patientId, { active: 'true' }).expect(200)).body.items.length,
    0,
  )
  await change(a.id).expect(409)
  await request(f.app)
    .delete(`/v1/clinical/alerts/${a.id}`)
    .set('Authorization', auth())
    .expect(404)
})
test('BE-037: validação HTTP, sessão/MFA e cinco perfis sem exposição administrativa', async () => {
  const v = await f.visit()
  for (const body of [
    { ...input, kind: 'invalid' },
    { ...input, verificationState: 'unknown' },
    { ...input, term: ' ' },
    { ...input, term: 'x'.repeat(501) },
    { ...input, substanceCode: 'x'.repeat(81) },
    { ...input, extra: true },
  ])
    await create(v.patientId, body).expect(400)
  await request(f.app)
    .get(`/v1/clinical/records/${v.patientId}/alerts`)
    .expect(401)
  for (const token of [
    f.admin.token,
    manager.token,
    f.reception.token,
    v.patient.token,
  ]) {
    await list(v.patientId, {}, token).expect(403)
    await create(v.patientId, input, token).expect(403)
  }
  await f.db.session.update({
    where: { id: f.professionalAccounts[0].session.id },
    data: { mfaVerifiedAt: null },
  })
  try {
    await list(v.patientId).expect(401)
  } finally {
    await f.db.session.update({
      where: { id: f.professionalAccounts[0].session.id },
      data: { mfaVerifiedAt: new Date() },
    })
  }
  const id = (await create(v.patientId).expect(201)).body.id
  await list(v.patientId, {}, f.professionalAccounts[1].token).expect(404)
  await change(
    id,
    'deactivate',
    { expectedVersion: 1, reason: 'Não autorizado' },
    f.professionalAccounts[1].token,
  ).expect(404)
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: { action: 'authorization.denied', resourceId: id },
    }),
  )
  await list(randomUUID()).expect(404)
  assert.equal(
    await f.db.clinicalAlert.count({ where: { patientId: v.patientId } }),
    1,
  )
})
test('BE-037: pré-consulta só ativos sem eventos e sem mutações; expirado nega leitura', async () => {
  const v = await f.visit(),
    a = (await create(v.patientId).expect(201)).body
  const second = (
    await create(v.patientId, { ...input, kind: 'condition' }).expect(201)
  ).body
  await change(second.id).expect(200)
  await f.clearActive()
  const preLink = await addOtherLink(v.patientId, 0, 60)
  const page = (await list(v.patientId).expect(200)).body
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0].id, a.id)
  assert.equal(page.items[0].history, undefined)
  assert.equal((await header(v.patientId).expect(200)).body.alerts[0].id, a.id)
  await list(v.patientId, { active: 'false' }).expect(404)
  await create(v.patientId).expect(403)
  await change(a.id).expect(403)
  await f.db.careLink.update({
    where: { id: preLink.id },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  await list(v.patientId).expect(404)
})
test('BE-037: urgência permite leitura/histórico, nunca escrita sem vínculo de atendimento', async () => {
  const v = await f.visit(),
    a = (await create(v.patientId).expect(201)).body
  const emergency = f.professionalAccounts[1].token
  await request(f.app)
    .post('/v1/clinical/emergency-access')
    .set('Authorization', emergency)
    .send({ patientId: v.patientId, justification: 'Urgência fictícia' })
    .expect(201)
  const page = (await list(v.patientId, {}, emergency).expect(200)).body
  assert.equal(page.items[0].id, a.id)
  assert.equal(page.items[0].history.length, 1)
  await create(v.patientId, input, emergency).expect(404)
  await change(
    a.id,
    'deactivate',
    { expectedVersion: 1, reason: 'Sem vínculo' },
    emergency,
  ).expect(404)
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: {
        action: 'clinical.alerts_read',
        actorUserId: f.professionalAccounts[1].user.id,
        authorizationBasis: { startsWith: 'emergency_access:' },
      },
    }),
  )
})
test('BE-037: concorrência de versão efetiva somente uma transição e banco é append-only', async () => {
  const v = await f.visit(),
    a = (await create(v.patientId).expect(201)).body
  const results = await Promise.all([change(a.id), change(a.id)])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  assert.equal(
    await f.db.clinicalAlertEvent.count({ where: { alertId: a.id } }),
    2,
  )
  await assert.rejects(
    f.db.clinicalAlert.update({
      where: { id: a.id },
      data: { verificationState: 'confirmed' },
    }),
  )
  await assert.rejects(f.db.clinicalAlert.delete({ where: { id: a.id } }))
  const e = await f.db.clinicalAlertEvent.findFirstOrThrow({
    where: { alertId: a.id },
  })
  await assert.rejects(
    f.db.clinicalAlertEvent.update({
      where: { id: e.id },
      data: { kind: 'confirmed' },
    }),
  )
  await assert.rejects(f.db.clinicalAlertEvent.delete({ where: { id: e.id } }))
  await assert.rejects(
    f.db.clinicalAlert.create({
      data: {
        patientId: v.patientId,
        kind: 'other',
        verificationState: 'reported',
        authorProfessionalId: f.professionalIds[0],
        createdAt: new Date(),
        payloadEncrypted: 'fixture',
      },
    }),
  )
  await assert.rejects(
    f.db.$executeRawUnsafe('TRUNCATE "ClinicalAlert" CASCADE'),
  )
  await assert.rejects(
    f.db.$executeRawUnsafe('TRUNCATE "ClinicalAlertEvent" CASCADE'),
  )
  await assert.rejects(
    f.db.clinicalAlertEvent.create({
      data: {
        alertId: a.id,
        kind: 'confirmed',
        version: 3,
        authorProfessionalId: f.professionalIds[0],
        createdAt: new Date(),
      },
    }),
  )
})
test('BE-037: falha de auditoria desfaz criação/transição sem estado parcial', async () => {
  const v = await f.visit(),
    a = (await create(v.patientId).expect(201)).body
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_alert_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" IN ('clinical.alert_created','clinical.alert_deactivated') THEN RAISE EXCEPTION 'forced_alert_audit'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER "fail_alert_test" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_alert_test_audit()',
  )
  try {
    await create(v.patientId).expect(500)
    await change(a.id).expect(500)
    assert.equal(
      await f.db.clinicalAlert.count({ where: { patientId: v.patientId } }),
      1,
    )
    assert.equal(
      await f.db.clinicalAlertEvent.count({ where: { alertId: a.id } }),
      1,
    )
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER "fail_alert_test" ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_alert_test_audit()')
  }
  await change(a.id).expect(200)
})
test('BE-037: paginação filtra paciente/estado antes do limite, header não oculta alertas', async () => {
  const v = await f.visit()
  for (let i = 0; i < 31; i++)
    await create(v.patientId, {
      ...input,
      term: `Alerta fictício ${i}`,
    }).expect(201)
  const first = (await list(v.patientId, { active: 'true' }).expect(200)).body
  assert.equal(first.items.length, 30)
  assert.ok(first.nextCursor)
  const next = (
    await list(v.patientId, {
      active: 'true',
      cursor: first.nextCursor,
    }).expect(200)
  ).body
  assert.equal(next.items.length, 1)
  assert.equal(next.nextCursor, null)
  assert.equal(
    new Set([...first.items, ...next.items].map((a) => a.id)).size,
    31,
  )
  assert.equal((await header(v.patientId).expect(200)).body.alerts.length, 31)
  await list(v.patientId, { active: 'false', cursor: first.nextCursor }).expect(
    404,
  )
  await list(v.patientId, { active: 'invalid' }).expect(400)
})
test('BE-037: alertas persistem em novo atendimento e pós-consulta permite somente leitura', async () => {
  const v = await f.visit(),
    a = (
      await create(v.patientId, {
        ...input,
        verificationState: 'confirmed',
      }).expect(201)
    ).body
  const draft = (
    await request(f.app)
      .post(`/v1/clinical/encounters/${v.encounterId}/evolutions/draft`)
      .set('Authorization', auth())
      .send({ complaint: 'Queixa fictícia', conduct: 'Conduta fictícia' })
      .expect(201)
  ).body
  await request(f.app)
    .post(`/v1/clinical/evolutions/${draft.evolutionId}/finalize`)
    .set('Authorization', auth())
    .send({ expectedDraftVersion: 1 })
    .expect(200)
  assert.equal((await list(v.patientId).expect(200)).body.items[0].id, a.id)
  await change(a.id).expect(403)
  await f.db.careLink.update({
    where: { id: v.linkId },
    data: { endsAt: new Date(Date.now() - 1) },
  })
  await list(v.patientId).expect(404)
  await f.visit(v.patient)
  const h = (await header(v.patientId).expect(200)).body
  assert.equal(h.alerts[0].id, a.id)
  assert.equal(h.alerts[0].verificationState, 'confirmed')
  await change(a.id).expect(200)
})
test('BE-037: OpenAPI documenta as operações e schemas compartilhados', async () => {
  const doc = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  for (const path of [
    '/clinical/records/{patientId}/alerts',
    '/clinical/alerts/{id}/confirm',
    '/clinical/alerts/{id}/deactivate',
  ])
    assert.ok(doc.paths[path])
})
