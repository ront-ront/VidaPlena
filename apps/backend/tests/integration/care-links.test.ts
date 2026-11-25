import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { ManageCareLinks } from '../../src/application/use-cases/manage-care-links'
import { careWindow } from '../../src/domain/rules/care-link'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { PrismaCareLinkStore } from '../../src/infrastructure/persistence/prisma/care-link-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { careLinkListResponse } from '../../src/shared/infra/http/contracts/care-links'
import { createBookingFixture } from '../support/m1-bookings'

let f: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  f = await createBookingFixture()
})
after(async () => {
  if (f) await f.close()
})
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  authorizationBasis: 'test',
})
function service(now = new Date(), shared = true) {
  return new ManageCareLinks(
    new PrismaCareLinkStore(
      f.db,
      f.config.careLinkPolicy,
      {
        internalMinutes: f.config.internalIdleMinutes,
        patientMinutes: f.config.patientIdleMinutes,
      },
      new AesSecretBox(f.config.encryptionKey, 'care-link'),
    ),
    new PrismaAuditWriter(f.db),
    { ...f.config.careLinkPolicy, sharedCaseEnabled: shared },
    () => now,
  )
}
const professional = () =>
  f.principal(f.professionalAccounts[0], 'professional')
const other = () => f.principal(f.professionalAccounts[1], 'professional')
const list = (token = f.professionalAccounts[0].token) =>
  request(f.app).get('/v1/clinical/care-links/me').set('Authorization', token)
async function historical(
  patientId: string,
  status: 'completed' | 'no_show' = 'completed',
) {
  const startsAt = new Date(Date.now() - 2 * 3600000),
    endsAt = new Date(+startsAt + 3600000)
  return f.db.appointment.create({
    data: {
      patientId,
      professionalId: f.professionalIds[0],
      specialtyId: f.specialtyId,
      modality: 'remote',
      visitType: 'first',
      startsAt,
      endsAt,
      durationMinutes: 60,
      specialtyVersion: 1,
      status,
      bookingSource: 'imported',
      createdBy: f.admin.user.id,
    },
  })
}
test('BE-030: confirmação cria vínculo atômico, janelas configuráveis e leitura auditada sem clínico', async () => {
  const p = await f.patient(),
    appointment = await f.book(p, 0)
  const row = await f.db.careLink.findFirstOrThrow({
    where: { sourceAppointmentId: appointment.id },
  })
  const input = {
    ...appointment,
    startsAt: new Date(appointment.startsAt),
    endsAt: new Date(appointment.endsAt),
  }
  const window = careWindow(input, f.config.careLinkPolicy)
  assert.ok(window)
  assert.equal(+row.startsAt, +window.startsAt)
  assert.equal(+row.endsAt, +window.endsAt)
  await assert.rejects(
    service(new Date(+window.startsAt - 1)).authorize(
      professional(),
      p.patientId,
      context(),
    ),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  assert.equal(
    (
      await service(window.startsAt).authorize(
        professional(),
        p.patientId,
        context(),
      )
    ).phase,
    'pre',
  )
  assert.equal(
    (
      await service(new Date(appointment.startsAt)).authorize(
        professional(),
        p.patientId,
        context(),
      )
    ).phase,
    'during',
  )
  assert.equal(
    (
      await service(new Date(appointment.endsAt)).authorize(
        professional(),
        p.patientId,
        context(),
      )
    ).phase,
    'post',
  )
  await assert.rejects(
    service(window.endsAt).authorize(professional(), p.patientId, context()),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  await assert.rejects(
    service(new Date(appointment.startsAt)).authorize(
      other(),
      p.patientId,
      context(),
    ),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  const result = (await list().expect(200)).body
  careLinkListResponse.parse(result)
  assert.equal(
    result.items.find((r: { id: string }) => r.id === row.id).status,
    'scheduled',
  )
  assert.ok(!JSON.stringify(result).includes('reasonEncrypted'))
  const events = await f.db.auditEvent.findMany({
    where: { subjectPatientId: p.patientId, action: 'clinical.access_checked' },
  })
  assert.equal(events.length, 3)
  assert.ok(events.every((e) => e.authorizationBasis === `care_link:${row.id}`))
})
test('BE-030: M1 preexistente e no-show são reconciliados duas vezes sem duplicar', async () => {
  const p = await f.patient(),
    appt = await historical(p.patientId),
    noShow = await historical(p.patientId, 'no_show')
  assert.equal(
    await f.db.careLink.count({ where: { sourceAppointmentId: appt.id } }),
    0,
  )
  assert.ok((await service().reconcile(context())).count >= 2)
  assert.equal((await service().reconcile(context())).count, 0)
  assert.equal(
    await f.db.careLink.count({ where: { sourceAppointmentId: appt.id } }),
    1,
  )
  const row = await f.db.careLink.findFirstOrThrow({
    where: { sourceAppointmentId: noShow.id },
  })
  assert.equal(
    +row.endsAt,
    +(careWindow(noShow, f.config.careLinkPolicy)?.endsAt ?? new Date(0)),
  )
  assert.equal(
    (await service().authorize(professional(), p.patientId, context())).phase,
    'post',
  )
})
test('BE-030: compartilhamento individual cifrado, pré-consulta/flag/tempo e delegação negados', async () => {
  const p = await f.patient(),
    appt = await f.book(p, 1),
    now = new Date(Date.parse(appt.startsAt) + 1000)
  const input = {
    patientId: p.patientId,
    targetProfessionalId: f.professionalIds[1],
    reason: 'Cobertura fictícia',
    endsAt: new Date(+now + 3600000).toISOString(),
  }
  await assert.rejects(
    service(new Date(Date.parse(appt.startsAt) - 1000)).grant(
      professional(),
      input,
      context(),
    ),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  await assert.rejects(
    service(now, false).grant(professional(), input, context()),
    { code: 'FORBIDDEN' },
  )
  const shared = await service(now).grant(professional(), input, context())
  const stored = await f.db.careLink.findUniqueOrThrow({
    where: { id: shared.id },
  })
  assert.ok(
    stored.reasonEncrypted && !stored.reasonEncrypted.includes(input.reason),
  )
  assert.equal(
    (await service(now).authorize(other(), p.patientId, context())).id,
    shared.id,
  )
  await assert.rejects(
    service(now).grant(
      other(),
      { ...input, targetProfessionalId: f.professionalIds[0] },
      context(),
    ),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  await assert.rejects(
    service(now).grant(
      professional(),
      { ...input, endsAt: new Date(+now + 100 * 86400000).toISOString() },
      context(),
    ),
    { code: 'VALIDATION_ERROR' },
  )
  await request(f.app)
    .post(`/v1/appointments/${appt.id}/cancel`)
    .set('Authorization', p.token)
    .set('Idempotency-Key', randomUUID())
    .send({ expectedVersion: 1, origin: 'patient' })
    .expect(200)
  await assert.rejects(
    service(now).authorize(other(), p.patientId, context()),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  assert.equal(
    (await f.db.careLink.findUniqueOrThrow({ where: { id: shared.id } }))
      .status,
    'revoked',
  )
})
test('BE-030: remarcação troca profissional, encerra vínculo anterior e renova novo sem duplicar origem', async () => {
  const p = await f.patient(),
    appt = await f.book(p, 2)
  await request(f.app)
    .post(`/v1/appointments/${appt.id}/reschedule`)
    .set('Authorization', p.token)
    .set('Idempotency-Key', randomUUID())
    .send({
      startsAt: f.at(3),
      professionalId: f.professionalIds[1],
      expectedVersion: 1,
    })
    .expect(200)
  const rows = await f.db.careLink.findMany({
    where: { sourceAppointmentId: appt.id },
  })
  assert.equal(rows.length, 2)
  assert.equal(
    rows.find((r) => r.professionalId === f.professionalIds[0])?.status,
    'revoked',
  )
  assert.equal(
    rows.find((r) => r.professionalId === f.professionalIds[1])?.status,
    'active',
  )
  await assert.rejects(
    service(new Date(f.at(3))).authorize(
      professional(),
      p.patientId,
      context(),
    ),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  assert.equal(
    (
      await service(new Date(f.at(3))).authorize(
        other(),
        p.patientId,
        context(),
      )
    ).phase,
    'during',
  )
})
test('BE-030: gestor concede substituição temporária mas permanece sem acesso clínico, papéis/MFA atuais', async () => {
  const manager = await f.account('manager'),
    p = await f.patient(),
    now = new Date(),
    start = new Date(+now + 1000),
    end = new Date(+now + 60000)
  const input = {
    patientId: p.patientId,
    targetProfessionalId: f.professionalIds[1],
    reason: 'Substituição fictícia',
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  }
  const granted = (
    await request(f.app)
      .post('/v1/admin/care-links/substitution')
      .set('Authorization', manager.token)
      .send(input)
      .expect(201)
  ).body
  assert.equal(
    (await service(start).authorize(other(), p.patientId, context())).id,
    granted.id,
  )
  await assert.rejects(
    service(end).authorize(other(), p.patientId, context()),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  for (const token of [
    f.admin.token,
    f.reception.token,
    f.professionalAccounts[0].token,
    p.token,
  ])
    await request(f.app)
      .post('/v1/admin/care-links/substitution')
      .set('Authorization', token)
      .send(input)
      .expect(403)
  await list(manager.token).expect(403)
  await assert.rejects(
    service(start).authorize(
      f.principal(manager, 'manager'),
      p.patientId,
      context(),
    ),
    { code: 'FORBIDDEN' },
  )
  await request(f.app)
    .post('/v1/admin/care-links/substitution')
    .set('Authorization', manager.token)
    .send({ ...input, reason: '' })
    .expect(400)
  await f.db.session.update({
    where: { id: manager.session.id },
    data: { mfaVerifiedAt: null },
  })
  await request(f.app)
    .post('/v1/admin/care-links/substitution')
    .set('Authorization', manager.token)
    .send(input)
    .expect(401)
})
test('BE-030: HTTP compartilhamento, cursor alheio, RBAC, integridade e OpenAPI', async () => {
  const p = await f.patient()
  await historical(p.patientId)
  await service().reconcile(context())
  const shared = (
    await request(f.app)
      .post('/v1/clinical/care-links/share')
      .set('Authorization', f.professionalAccounts[0].token)
      .send({
        patientId: p.patientId,
        targetProfessionalId: f.professionalIds[1],
        reason: 'Compartilhamento fictício',
        endsAt: new Date(Date.now() + 60000).toISOString(),
      })
      .expect(201)
  ).body
  await request(f.app).get('/v1/clinical/care-links/me').expect(401)
  for (const token of [f.admin.token, f.reception.token, p.token])
    await list(token).expect(403)
  await request(f.app)
    .get('/v1/clinical/care-links/me')
    .query({ cursor: shared.id })
    .set('Authorization', f.professionalAccounts[0].token)
    .expect(404)
  await assert.rejects(f.db.careLink.delete({ where: { id: shared.id } }))
  await assert.rejects(
    f.db.careLink.update({
      where: { id: shared.id },
      data: { patientId: randomUUID() },
    }),
  )
  const doc = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(doc.paths['/clinical/care-links/me'])
  assert.ok(doc.paths['/admin/care-links/substitution'])
  const audit = JSON.stringify(
    await f.db.auditEvent.findMany({ where: { resourceId: shared.id } }),
  )
  assert.ok(!audit.includes('Compartilhamento fictício'))
})
test('BE-030: falha da auditoria reverte consulta, reserva e vínculo juntos', async () => {
  const p = await f.patient()
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION reject_care_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='care_link.created' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER reject_care_audit_test BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_care_audit_test()',
  )
  try {
    await request(f.app)
      .post('/v1/appointments')
      .set('Authorization', p.token)
      .set('Idempotency-Key', randomUUID())
      .send({
        patientId: p.patientId,
        professionalId: f.professionalIds[0],
        specialtyId: f.specialtyId,
        modality: 'onsite',
        visitType: 'first',
        startsAt: f.at(10),
      })
      .expect(500)
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER reject_care_audit_test ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION reject_care_audit_test()')
  }
  assert.equal(
    await f.db.appointment.count({ where: { patientId: p.patientId } }),
    0,
  )
  assert.equal(
    await f.db.careLink.count({ where: { patientId: p.patientId } }),
    0,
  )
  assert.equal(
    await f.db.slotReservation.count({
      where: { startsAt: new Date(f.at(10)) },
    }),
    0,
  )
})

test('BE-030: paginação30+1 por profissional e filtro de paciente sem cursor alheio', async () => {
  const p = await f.patient(),
    now = new Date(),
    secret = new AesSecretBox(f.config.encryptionKey, 'care-link')
  await f.db.careLink.createMany({
    data: Array.from({ length: 33 }, () => {
      const id = randomUUID()
      return {
        id,
        patientId: p.patientId,
        professionalId: f.professionalIds[0],
        source: 'substitution',
        startsAt: now,
        endsAt: new Date(+now + 3600000),
        grantedBy: f.admin.user.id,
        reasonEncrypted: secret.seal('Fixture fictícia', `care_link:${id}`),
      }
    }),
  })
  const read = (cursor?: string) =>
    request(f.app)
      .get('/v1/clinical/care-links/me')
      .set('Authorization', f.professionalAccounts[0].token)
      .query({
        patientId: p.patientId,
        status: 'active',
        ...(cursor ? { cursor } : {}),
      })
  const first = (await read().expect(200)).body,
    second = (await read(first.nextCursor).expect(200)).body
  assert.equal(first.items.length, 30)
  assert.equal(second.items.length, 3)
  assert.equal(second.nextCursor, null)
  assert.equal(
    new Set(
      [...first.items, ...second.items].map((row: { id: string }) => row.id),
    ).size,
    33,
  )
  await request(f.app)
    .get('/v1/clinical/care-links/me')
    .set('Authorization', f.professionalAccounts[1].token)
    .query({ cursor: first.nextCursor })
    .expect(404)
})

test('BE-030: startup reconcilia agenda anterior antes de expor rotas, sem duplicação no reinício', async () => {
  const p = await f.patient(),
    appointment = await historical(p.patientId)
  assert.equal(
    await f.db.careLink.count({
      where: { sourceAppointmentId: appointment.id },
    }),
    0,
  )
  for (let i = 0; i < 2; i++) {
    const runtime = await composeBackendApplication(f.config)
    try {
      await request(runtime.app)
        .get('/v1/clinical/care-links/me')
        .query({ patientId: p.patientId })
        .set('Authorization', f.professionalAccounts[0].token)
        .expect(200)
    } finally {
      await runtime.close()
    }
  }
  assert.equal(
    await f.db.careLink.count({
      where: { sourceAppointmentId: appointment.id },
    }),
    1,
  )
})

test('BE-030: remarcação do mesmo profissional encerra concessão da janela antiga', async () => {
  const p = await f.patient(),
    appointment = await f.book(p, 20),
    now = new Date(Date.parse(appointment.startsAt) + 1000)
  const grant = await service(now).grant(
    professional(),
    {
      patientId: p.patientId,
      targetProfessionalId: f.professionalIds[1],
      reason: 'Compartilhamento fictício',
      endsAt: new Date(+now + 3600000).toISOString(),
    },
    context(),
  )
  await request(f.app)
    .post(`/v1/appointments/${appointment.id}/reschedule`)
    .set('Authorization', p.token)
    .set('Idempotency-Key', randomUUID())
    .send({ startsAt: f.at(21), expectedVersion: 1 })
    .expect(200)
  assert.equal(
    (await f.db.careLink.findUniqueOrThrow({ where: { id: grant.id } })).status,
    'revoked',
  )
  await assert.rejects(
    service(new Date(f.at(21))).authorize(other(), p.patientId, context()),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
})
