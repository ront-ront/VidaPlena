import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import request from 'supertest'
import { AuthorizeClinical } from '../../src/application/use-cases/authorize-clinical'
import { ManageCareLinks } from '../../src/application/use-cases/manage-care-links'
import { ManageEmergencyAccess } from '../../src/application/use-cases/manage-emergency-access'
import { ReadClinicalRecord } from '../../src/application/use-cases/read-clinical-record'
import { careWindow } from '../../src/domain/rules/care-link'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { PrismaCareLinkStore } from '../../src/infrastructure/persistence/prisma/care-link-store'
import { PrismaClinicalRecordStore } from '../../src/infrastructure/persistence/prisma/clinical-record-store'
import { PrismaEmergencyAccessStore } from '../../src/infrastructure/persistence/prisma/emergency-access-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import {
  encounterResponse,
  recordHeaderResponse,
  timelineResponse,
} from '../../src/shared/infra/http/contracts/clinical-records'
import { createBookingFixture } from '../support/m1-bookings'

let f: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  f = await createBookingFixture()
})
beforeEach(async () => {
  await f.db.$transaction(async (tx) => {
    const active = await tx.appointment.findMany({
      where: { status: { in: ['confirmed', 'waiting', 'in_service'] } },
      select: { id: true },
    })
    const ids = active.map((a) => a.id)
    await tx.slotReservation.updateMany({
      where: { appointmentId: { in: ids }, state: 'confirmed' },
      data: { state: 'released' },
    })
    await tx.appointment.updateMany({
      where: { id: { in: ids } },
      data: { status: 'cancelled' },
    })
  })
})
after(async () => {
  if (f) await f.close()
})
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  originClient: 'test',
  authorizationBasis: 'test',
})
const professional = () =>
  f.principal(f.professionalAccounts[0], 'professional')
function services(now = new Date()) {
  const audit = new PrismaAuditWriter(f.db),
    links = new PrismaCareLinkStore(
      f.db,
      f.config.careLinkPolicy,
      {
        internalMinutes: f.config.internalIdleMinutes,
        patientMinutes: f.config.patientIdleMinutes,
      },
      new AesSecretBox(f.config.encryptionKey, 'care-link'),
    )
  const care = new ManageCareLinks(
      links,
      audit,
      f.config.careLinkPolicy,
      () => now,
    ),
    emergency = new PrismaEmergencyAccessStore(
      f.db,
      links,
      new AesSecretBox(f.config.encryptionKey, 'emergency-access'),
    )
  return {
    record: new ReadClinicalRecord(
      new PrismaClinicalRecordStore(
        f.db,
        emergency,
        new AesSecretBox(f.config.encryptionKey, 'clinical-record'),
        f.config.careLinkPolicy,
      ),
      new AuthorizeClinical(emergency, care, audit, () => now),
      care,
      audit,
      () => now,
    ),
    emergency: new ManageEmergencyAccess(
      emergency,
      audit,
      f.config.emergencyAccessDurationMinutes,
      () => now,
    ),
  }
}
async function appointment(
  patientId: string,
  status: 'confirmed' | 'completed' = 'confirmed',
  hoursAgo = 0.5,
) {
  const startsAt = new Date(Date.now() - hoursAgo * 3600000),
    endsAt = new Date(+startsAt + 3600000)
  const row = await f.db.$transaction(async (tx) => {
    const row = await tx.appointment.create({
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
    if (status === 'confirmed')
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
  const window = careWindow(row, f.config.careLinkPolicy)
  assert.ok(window)
  const link = await f.db.careLink.create({
    data: {
      patientId,
      professionalId: row.professionalId,
      source: 'appointment',
      sourceAppointmentId: row.id,
      appointmentVersion: row.version,
      ...window,
    },
  })
  return { ...row, linkId: link.id }
}
const header = (patientId: string, token = f.professionalAccounts[0].token) =>
  request(f.app)
    .get(`/v1/clinical/records/${patientId}`)
    .set('Authorization', token)
const timeline = (
  patientId: string,
  query: Record<string, string> = {},
  token = f.professionalAccounts[0].token,
) =>
  request(f.app)
    .get(`/v1/clinical/records/${patientId}/timeline`)
    .query(query)
    .set('Authorization', token)
const start = (
  appointmentId: string,
  token = f.professionalAccounts[0].token,
) =>
  request(f.app)
    .post('/v1/clinical/encounters')
    .set('Authorization', token)
    .send({ appointmentId })

test('BE-032: primeira consulta cria somente identidade do prontuário, header/timeline auditados', async () => {
  const p = await f.patient(),
    a = await appointment(p.patientId)
  assert.equal(
    await f.db.clinicalRecord.count({ where: { patientId: p.patientId } }),
    0,
  )
  const response = await header(p.patientId).expect(200),
    body = response.body
  recordHeaderResponse.parse(body)
  assert.equal(body.patient.name, 'Paciente Fictício')
  assert.ok(!('cpf' in body.patient) && !('email' in body.patient))
  assert.equal(body.firstVisit, true)
  assert.equal(body.lastEncounterAt, null)
  assert.equal(body.currentEncounter, null)
  assert.equal(body.linkBasis.id, a.linkId)
  assert.equal(body.linkBasis.scope, 'during')
  assert.equal(response.headers['cache-control'], 'no-store')
  const page = (await timeline(p.patientId).expect(200)).body
  timelineResponse.parse(page)
  assert.deepEqual(page, { items: [], nextCursor: null, restricted: false })
  assert.equal(
    await f.db.clinicalEncounter.count({ where: { recordId: body.recordId } }),
    0,
  )
  const again = await header(p.patientId).expect(200)
  assert.equal(again.body.recordNumber, body.recordNumber)
  const events = await f.db.auditEvent.findMany({
    where: {
      subjectPatientId: p.patientId,
      action: { in: ['clinical.record_read', 'clinical.timeline_read'] },
    },
  })
  assert.equal(events.length, 3)
  assert.ok(
    events.every(
      (e) =>
        e.authorizationBasis === `care_link:${a.linkId}` &&
        e.originClient === 'web',
    ),
  )
})
test('BE-032: pré-consulta não revela histórico, última consulta nem primeira visita', async () => {
  const p = await f.patient(),
    future = await f.book(p, 1)
  await appointment(p.patientId, 'completed', 10)
  const pre = new Date(+new Date(future.startsAt) - 3600000)
  // Remove the historical link, preserving the completed appointment in the timeline.
  await f.db.careLink.updateMany({
    where: { patientId: p.patientId, sourceAppointmentId: { not: future.id } },
    data: { status: 'revoked', revokedAt: new Date() },
  })
  const s = services(pre),
    h = await s.record.header(professional(), p.patientId, context())
  recordHeaderResponse.parse(h)
  assert.equal(h.linkBasis.scope, 'pre')
  assert.equal(h.firstVisit, null)
  assert.equal(h.lastEncounterAt, null)
  assert.equal(h.currentEncounter, null)
  assert.deepEqual(
    await s.record.timeline(professional(), p.patientId, {}, context()),
    { items: [], nextCursor: null, restricted: true },
  )
  await assert.rejects(
    s.record.openEncounter(professional(), future.id, context()),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
})
test('BE-032: sem vínculo ou com papel administrativo, IDs trocados não revelam prontuário', async () => {
  const p = await f.patient(),
    a = await appointment(p.patientId)
  await header(p.patientId, f.professionalAccounts[1].token).expect(404)
  await timeline(p.patientId, {}, f.professionalAccounts[1].token).expect(404)
  await header(randomUUID()).expect(404)
  await timeline(randomUUID()).expect(404)
  for (const token of [
    f.admin.token,
    f.reception.token,
    p.token,
    (await f.account('manager')).token,
  ])
    await header(p.patientId, token).expect(403)
  await request(f.app).get(`/v1/clinical/records/${p.patientId}`).expect(401)
  assert.equal(
    await f.db.clinicalRecord.count({ where: { patientId: p.patientId } }),
    0,
  )
  assert.ok(
    (await f.db.auditEvent.count({
      where: { resourceId: p.patientId, action: 'authorization.denied' },
    })) >= 2,
  )
  await f.db.careLink.update({
    where: { id: a.linkId },
    data: { status: 'revoked', revokedAt: new Date() },
  })
  await header(p.patientId).expect(404)
})
test('BE-032/031: urgência abre leitura real, expira e rejeição fecha novas requisições', async () => {
  const p = await f.patient(),
    now = new Date(),
    s = services(now)
  const g = await s.emergency.request(
    professional(),
    { patientId: p.patientId, justification: 'Teste de leitura por urgência' },
    context(),
  )
  const h = (await header(p.patientId).expect(200)).body
  assert.equal(h.linkBasis.kind, 'emergency')
  assert.equal(h.linkBasis.id, g.grantId)
  await timeline(p.patientId).expect(200)
  const events = await f.db.auditEvent.findMany({
    where: {
      subjectPatientId: p.patientId,
      action: { in: ['clinical.record_read', 'clinical.timeline_read'] },
    },
  })
  assert.equal(events.length, 2)
  assert.ok(
    events.every(
      (e) => e.authorizationBasis === `emergency_access:${g.grantId}`,
    ),
  )
  await assert.rejects(
    services(new Date(g.expiresAt)).record.header(
      professional(),
      p.patientId,
      context(),
    ),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  await request(f.app)
    .post(`/v1/admin/emergency-access/${g.grantId}/review`)
    .set('Authorization', f.admin.token)
    .send({ outcome: 'rejected', notes: 'Revisão para teste' })
    .expect(200)
  await header(p.patientId).expect(404)
  await timeline(p.patientId).expect(404)
})
test('BE-032: consulta concluída importada aparece com origem, modalidade e filtros', async () => {
  const p = await f.patient(),
    a = await appointment(p.patientId, 'completed', 3)
  const h = (await header(p.patientId).expect(200)).body
  assert.equal(h.firstVisit, false)
  assert.equal(h.lastEncounterAt, a.endsAt.toISOString())
  const page = (
    await timeline(p.patientId, {
      type: 'encounter',
      specialtyId: f.specialtyId,
      from: a.startsAt.toISOString(),
      to: new Date(+a.endsAt + 1).toISOString(),
    }).expect(200)
  ).body
  timelineResponse.parse(page)
  assert.equal(page.items.length, 1)
  const item = page.items[0]
  assert.equal(item.type, 'encounter')
  assert.equal(item.resourceId, a.id)
  assert.equal(item.summary, 'Consulta inicial')
  assert.equal(item.professional.id, f.professionalIds[0])
  assert.equal(item.modality, 'remote')
  assert.equal(item.importedOrigin.origin, 'agenda_importada')
  assert.equal(
    (await timeline(p.patientId, { type: 'document' }).expect(200)).body.items
      .length,
    0,
  )
  assert.equal(
    (await timeline(p.patientId, { to: a.endsAt.toISOString() }).expect(200))
      .body.items.length,
    0,
  )
  await timeline(p.patientId, {
    from: a.endsAt.toISOString(),
    to: a.startsAt.toISOString(),
  }).expect(400)
})
test('BE-032: histórico pesado usa blocos estáveis, cursor escopado e filtros no banco', async () => {
  const p = await f.patient(),
    a = await appointment(p.patientId),
    peer = await f.patient()
  await appointment(peer.patientId, 'completed', 3)
  const date = new Date(Date.now() - 86400000)
  await f.db.appointment.createMany({
    data: Array.from({ length: 300 }, (_, i) => ({
      patientId: p.patientId,
      professionalId: f.professionalIds[i % 2],
      specialtyId: f.specialtyId,
      modality: 'remote' as const,
      visitType: 'return',
      startsAt: new Date(+date - 3600000),
      endsAt: date,
      durationMinutes: 60,
      specialtyVersion: 1,
      status: 'completed' as const,
      bookingSource: 'imported',
      createdBy: f.admin.user.id,
    })),
  })
  const seen = new Set<string>()
  let cursor: string | undefined
  for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
    const page = (
      await timeline(p.patientId, cursor ? { cursor } : {}).expect(200)
    ).body
    timelineResponse.parse(page)
    assert.equal(page.items.length, 30)
    assert.ok(page.items.every((r: { id: string }) => !seen.has(r.id)))
    for (const row of page.items) seen.add(row.id)
    if (pageNumber === 0) {
      await timeline(peer.patientId, { cursor: page.nextCursor }).expect(404)
      await timeline(p.patientId, {
        cursor: page.nextCursor,
        type: 'document',
      }).expect(404)
    }
    cursor = page.nextCursor ?? undefined
    assert.equal(!!cursor, pageNumber < 9)
  }
  assert.equal(seen.size, 300)
  assert.equal(
    (await header(p.patientId).expect(200)).body.linkBasis.id,
    a.linkId,
  )
  assert.equal(
    await f.db.auditEvent.count({
      where: {
        subjectPatientId: p.patientId,
        action: 'clinical.timeline_read',
      },
    }),
    10,
  )
})
test('BE-032: início explícito é atômico/idempotente e não amplia recursos nem autor', async () => {
  const p = await f.patient(),
    a = await appointment(p.patientId)
  const beforeReservations = await f.db.slotReservation.count()
  const outcomes = await Promise.all([start(a.id), start(a.id)])
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 201])
  assert.equal(outcomes[0].body.encounter.id, outcomes[1].body.encounter.id)
  encounterResponse.parse(outcomes[0].body)
  assert.equal(
    await f.db.clinicalEncounter.count({ where: { appointmentId: a.id } }),
    1,
  )
  assert.equal(
    (await f.db.appointment.findUniqueOrThrow({ where: { id: a.id } })).status,
    'in_service',
  )
  assert.equal(
    await f.db.appointmentHistory.count({
      where: { appointmentId: a.id, action: 'started' },
    }),
    1,
  )
  assert.equal(await f.db.slotReservation.count(), beforeReservations)
  await start(a.id, f.professionalAccounts[1].token).expect(404)
  await start(a.id, f.admin.token).expect(403)
  await start(randomUUID()).expect(404)
  const current = (await header(p.patientId).expect(200)).body.currentEncounter
  assert.equal(current.id, outcomes[0].body.encounter.id)
  const afterScheduledEnd = services(new Date(+a.endsAt + 3600000))
  assert.equal(
    (
      await afterScheduledEnd.record.header(
        professional(),
        p.patientId,
        context(),
      )
    ).linkBasis.scope,
    'during',
  )
  const record = await f.db.clinicalRecord.findUniqueOrThrow({
    where: { patientId: p.patientId },
  })
  await assert.rejects(f.db.clinicalRecord.delete({ where: { id: record.id } }))
  await assert.rejects(
    f.db.clinicalRecord.update({
      where: { id: record.id },
      data: { recordNumber: 'changed' },
    }),
  )
  await assert.rejects(
    f.db.clinicalEncounter.update({
      where: { id: current.id },
      data: { professionalId: f.professionalIds[1] },
    }),
  )
})
test('BE-032: falha de auditoria reverte começo, histórico e encontro', async () => {
  const p = await f.patient(),
    a = await appointment(p.patientId)
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_encounter_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='clinical.encounter_started' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER test_encounter_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_encounter_audit()',
  )
  try {
    await assert.rejects(
      services().record.openEncounter(professional(), a.id, context()),
      /test audit unavailable/,
    )
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER test_encounter_audit ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_encounter_audit()')
  }
  assert.equal(
    await f.db.clinicalEncounter.count({ where: { appointmentId: a.id } }),
    0,
  )
  assert.equal(
    await f.db.clinicalRecord.count({ where: { patientId: p.patientId } }),
    0,
  )
  const original = await f.db.appointment.findUniqueOrThrow({
    where: { id: a.id },
  })
  assert.equal(original.status, 'confirmed')
  assert.equal(original.version, a.version)
  assert.equal(
    await f.db.appointmentHistory.count({
      where: { appointmentId: a.id, action: 'started' },
    }),
    0,
  )
})
test('BE-032: índice clínico cifrado filtra por tipo/especialidade e preserva origem', async () => {
  const p = await f.patient()
  await appointment(p.patientId)
  const h = (await header(p.patientId).expect(200)).body
  const links = new PrismaCareLinkStore(
    f.db,
    f.config.careLinkPolicy,
    {
      internalMinutes: f.config.internalIdleMinutes,
      patientMinutes: f.config.patientIdleMinutes,
    },
    new AesSecretBox(f.config.encryptionKey, 'care-link'),
  )
  const emergency = new PrismaEmergencyAccessStore(
    f.db,
    links,
    new AesSecretBox(f.config.encryptionKey, 'emergency-access'),
  )
  const store = new PrismaClinicalRecordStore(
    f.db,
    emergency,
    new AesSecretBox(f.config.encryptionKey, 'clinical-record'),
    f.config.careLinkPolicy,
  )
  const occurredAt = new Date(Date.now() - 86400000),
    summary = 'Resumo fictício de histórico para leitura',
    resourceId = randomUUID()
  const entry = await store.transaction((tx) =>
    tx.appendTimeline({
      recordId: h.recordId,
      resourceId,
      type: 'imported_history',
      occurredAt,
      professionalId: f.professionalIds[1],
      specialtyId: f.specialtyId,
      modality: null,
      summary,
      importedOrigin: {
        origin: 'fonte_ficticia',
        importedAt: new Date().toISOString(),
        importedBy: f.admin.user.id,
      },
    }),
  )
  const result = (
    await timeline(p.patientId, {
      type: 'imported_history',
      specialtyId: f.specialtyId,
    }).expect(200)
  ).body
  timelineResponse.parse(result)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].summary, summary)
  assert.equal(result.items[0].professional.id, f.professionalIds[1])
  assert.equal(result.items[0].importedOrigin.origin, 'fonte_ficticia')
  assert.equal((await header(p.patientId).expect(200)).body.firstVisit, false)
  const stored = await f.db.clinicalTimelineEntry.findUniqueOrThrow({
    where: { id: entry.id },
  })
  assert.ok(!stored.summaryEncrypted.includes(summary))
  assert.ok(!stored.importedOriginEncrypted?.includes('fonte_ficticia'))
  await assert.rejects(
    f.db.clinicalTimelineEntry.update({
      where: { id: entry.id },
      data: { summaryEncrypted: 'changed' },
    }),
  )
  await assert.rejects(
    f.db.clinicalTimelineEntry.delete({ where: { id: entry.id } }),
  )
  // Verify the test fixture never wrote clinical content to the audit event.
  assert.ok(
    !JSON.stringify(
      await f.db.auditEvent.findMany({
        where: { subjectPatientId: p.patientId },
      }),
    ).includes(summary),
  )
})
test('BE-032: contratos publicados e entradas inválidas recusadas', async () => {
  const p = await f.patient()
  await header('invalid').expect(400)
  await timeline(p.patientId, { cursor: 'invalid' }).expect(400)
  await timeline(p.patientId, { type: 'draft' }).expect(400)
  const spec = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(spec.paths['/clinical/records/{patientId}'].get)
  assert.ok(spec.paths['/clinical/records/{patientId}/timeline'].get)
  assert.ok(spec.paths['/clinical/encounters'].post)
})
