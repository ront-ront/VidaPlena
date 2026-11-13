import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { Authorize } from '../../src/application/use-cases/authorize'
import { ManageArrivals } from '../../src/application/use-cases/manage-arrivals'
import { RescheduleAppointment } from '../../src/application/use-cases/reschedule-appointment'
import { clinicDate } from '../../src/domain/rules/arrival'
import { PrismaAccessStore } from '../../src/infrastructure/persistence/prisma/access-store'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { PrismaOperationalStore } from '../../src/infrastructure/persistence/prisma/operational-store'
import { JwtAccessTokens } from '../../src/infrastructure/security/access-tokens'
import { createApp } from '../../src/shared/infra/http/app'
import { operationalAppointment } from '../../src/shared/infra/http/contracts/operational-agenda'
import { createOperationalRouter } from '../../src/shared/infra/http/operational-router'
import { createBookingFixture } from '../support/m1-bookings'

let ctx: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  ctx = await createBookingFixture()
})
after(async () => {
  if (ctx) await ctx.close()
})
const auditContext = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  authorizationBasis: 'test',
})
function timed(
  now: Date,
  tolerance = ctx.config.appointmentLateToleranceMinutes,
) {
  const audit = new PrismaAuditWriter(ctx.db)
  const service = new ManageArrivals(
    new PrismaOperationalStore(
      ctx.db,
      {
        maxWaitMs: ctx.config.reservationTxMaxWaitMs,
        timeoutMs: ctx.config.reservationTxTimeoutMs,
        retryAttempts: ctx.config.reservationTxRetryAttempts,
        internalMinutes: ctx.config.internalIdleMinutes,
        patientMinutes: ctx.config.patientIdleMinutes,
        reminderScheduleHours: ctx.config.reminderScheduleHoursBefore,
      },
      ctx.config.appointmentNoshowAfterMinutes,
    ),
    audit,
    { timeZone: ctx.config.clinicTimeZone, lateToleranceMinutes: tolerance },
    () => now,
  )
  return {
    service,
    app: createApp(
      ctx.config,
      createOperationalRouter(
        new JwtAccessTokens(ctx.config.jwtSecret),
        new Authorize(new PrismaAccessStore(ctx.db), audit),
        service,
      ),
    ),
  }
}
const check = (
  app: ReturnType<typeof createApp>,
  id: string,
  token = ctx.reception.token,
  body: Record<string, unknown> = {},
) =>
  request(app)
    .post(`/v1/appointments/${id}/check-in`)
    .set('Authorization', token)
    .send(body)
const day = (offset: number) =>
  clinicDate(new Date(ctx.at(offset)), ctx.config.clinicTimeZone)
const agenda = (
  localDate: string,
  token = ctx.reception.token,
  query: Record<string, string> = {},
) =>
  request(ctx.app)
    .get('/v1/agenda/day')
    .set('Authorization', token)
    .query({ localDate, ...query })
const queue = (
  localDate: string,
  token = ctx.professionalAccounts[0].token,
  query: Record<string, string> = {},
) =>
  request(ctx.app)
    .get('/v1/professionals/me/queue')
    .set('Authorization', token)
    .query({ localDate, ...query })

test('BE-026: chegada HTTP é atômica/idempotente, preserva reserva e impede alteração do histórico', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 0)
  const now = new Date(new Date(row.startsAt).getTime() - 600_000),
    { app } = timed(now)
  const results = await Promise.all([
    check(app, row.id),
    check(app, row.id),
    check(app, row.id),
  ])
  for (const result of results) {
    assert.equal(result.status, 200)
    assert.deepEqual(result.body, results[0].body)
  }
  const body = results[0].body
  assert.equal(body.status, 'waiting')
  assert.equal(body.appointmentVersion, 2)
  assert.equal(body.arrivedAt, now.toISOString())
  assert.equal(body.recordedAt, now.toISOString())
  assert.equal(body.lateFlag, false)
  assert.equal(
    await ctx.db.checkIn.count({ where: { appointmentId: row.id } }),
    1,
  )
  const saved = await ctx.db.checkIn.findFirstOrThrow({
    where: { appointmentId: row.id },
  })
  assert.equal(saved.recordedBy, ctx.reception.user.id)
  assert.equal(
    saved.toleranceMinutes,
    ctx.config.appointmentLateToleranceMinutes,
  )
  assert.equal(
    await ctx.db.appointmentHistory.count({
      where: { appointmentId: row.id, action: 'checked_in' },
    }),
    1,
  )
  assert.equal(
    await ctx.db.auditEvent.count({
      where: { resourceId: row.id, action: 'appointment.checked_in' },
    }),
    1,
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: row.id, state: 'confirmed' },
    }),
    1,
  )
  assert.equal(
    await ctx.db.reminderJob.count({
      where: { appointmentId: row.id, status: { in: ['pending', 'enqueued'] } },
    }),
    0,
  )
  await check(app, row.id, ctx.reception.token, {
    arrivedAt: new Date(now.getTime() - 1000).toISOString(),
  }).expect(409)
  await assert.rejects(
    ctx.db.checkIn.update({
      where: { id: saved.id },
      data: { lateFlag: true },
    }),
  )
  await assert.rejects(ctx.db.checkIn.delete({ where: { id: saved.id } }))
  const visible = (await queue(day(0)).expect(200)).body.items
  assert.equal(visible.length, 1)
  assert.equal(visible[0].id, row.id)
  assert.equal(visible[0].checkIn.arrivedAt, now.toISOString())
})

test('BE-026: limite de atraso vem do parâmetro, aceita horário manual auditado e não cria no-show', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 1),
    limit = ctx.config.appointmentLateToleranceMinutes
  const exact = new Date(new Date(row.startsAt).getTime() + limit * 60_000)
  const first = await check(
    timed(new Date(exact.getTime() + 1000)).app,
    row.id,
    ctx.reception.token,
    { arrivedAt: exact.toISOString() },
  ).expect(200)
  assert.equal(first.body.lateFlag, false)
  const other = await ctx.book(await ctx.patient(), 2)
  const lateAt = new Date(
    new Date(other.startsAt).getTime() + (limit + 1) * 60_000,
  )
  const late = await check(timed(lateAt).app, other.id).expect(200)
  assert.equal(late.body.lateFlag, true)
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: other.id } }))
      .status,
    'waiting',
  )
  assert.equal(
    await ctx.db.appointmentHistory.count({
      where: { appointmentId: other.id, action: 'no_show' },
    }),
    0,
  )
  const event = await ctx.db.auditEvent.findFirstOrThrow({
    where: { resourceId: row.id, action: 'appointment.checked_in' },
  })
  assert.deepEqual(event.metadataSafe, {
    version: 2,
    status: 'waiting',
    source: 'manual_arrival_time',
  })
  // Changing configuration does not recompute the historical flag.
  assert.equal(
    (await check(timed(lateAt, limit + 100).app, other.id).expect(200)).body
      .lateFlag,
    true,
  )
})

test('BE-026: valida dia civil no fuso, data/horário futuro, estado cancelado e modalidade remota', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 3)
  const sameUtcPreviousClinicDay = new Date(ctx.at(2, '23:30'))
  assert.equal(
    sameUtcPreviousClinicDay.toISOString().slice(0, 10),
    row.startsAt.slice(0, 10),
  )
  await check(timed(sameUtcPreviousClinicDay).app, row.id).expect(409)
  const now = new Date(row.startsAt),
    app = timed(now).app
  await check(app, row.id, ctx.reception.token, {
    arrivedAt: new Date(now.getTime() + 1000).toISOString(),
  }).expect(400)
  await check(app, row.id, ctx.reception.token, {
    arrivedAt: ctx.at(2, '23:30'),
  }).expect(400)
  await check(app, row.id, ctx.reception.token, {
    arrivedAt: 'invalid',
  }).expect(400)
  const remote = await ctx.book(await ctx.patient(), 4, {
    modality: 'remote',
    startsAt: ctx.at(4, '13:00'),
  })
  await check(timed(new Date(remote.startsAt)).app, remote.id).expect(409)
  await request(ctx.app)
    .post(`/v1/appointments/${row.id}/cancel`)
    .set('Authorization', p.token)
    .set('Idempotency-Key', randomUUID())
    .send({ origin: 'patient', expectedVersion: 1 })
    .expect(200)
  await check(app, row.id).expect(409)
  const night = await ctx.book(await ctx.patient(), 5)
  const nextUtcSameClinicDay = new Date(ctx.at(5, '21:01'))
  assert.notEqual(
    nextUtcSameClinicDay.toISOString().slice(0, 10),
    night.startsAt.slice(0, 10),
  )
  await check(timed(nextUtcSameClinicDay).app, night.id).expect(200)
})

test('BE-026: fila ordena pelo horário previsto e impede leitura alheia, identidade e conteúdo clínico', async () => {
  const p = await ctx.patient(),
    p2 = await ctx.patient(),
    p3 = await ctx.patient()
  const early = await ctx.book(p, 6),
    later = await ctx.book(p2, 6, { startsAt: ctx.at(6, '09:00') }),
    other = await ctx.book(p3, 6, { professionalId: ctx.professionalIds[1] })
  const now = new Date(ctx.at(6, '10:00')),
    app = timed(now).app
  await check(app, later.id).expect(200)
  await check(app, early.id).expect(200)
  await check(app, other.id).expect(200)
  const list = (await queue(day(6)).expect(200)).body
  assert.deepEqual(
    list.items.map((item: { id: string }) => item.id),
    [early.id, later.id],
  )
  for (const item of list.items) {
    assert.equal(item.patient.birthDate, null)
    assert.equal(item.patient.cpfMasked, null)
    assert.equal(item.professional.id, ctx.professionalIds[0])
  }
  assert.ok(!JSON.stringify(list).includes(p.user.email))
  assert.ok(!JSON.stringify(list).includes('passwordHash'))
  const cpf = (
    await ctx.db.patientProfile.findUniqueOrThrow({
      where: { id: p.patientId },
    })
  ).cpf
  assert.ok(!JSON.stringify(list).includes(cpf))
  await queue(day(6), ctx.professionalAccounts[0].token, {
    professionalId: ctx.professionalIds[1],
  }).expect(403)
  assert.deepEqual(
    (
      await queue(day(6), ctx.professionalAccounts[1].token).expect(200)
    ).body.items.map((item: { id: string }) => item.id),
    [other.id],
  )
  for (const token of [ctx.reception.token, ctx.admin.token, p.token])
    await queue(day(6), token).expect(403)
  assert.equal((await queue(day(7)).expect(200)).body.items.length, 0)
  assert.ok(
    (await ctx.db.auditEvent.count({
      where: {
        resourceId: ctx.professionalIds[0],
        action: 'appointment.queue_read',
      },
    })) > 0,
  )
})

test('BE-026: somente recepção registra; perfil/mfa atual são revalidados, e falha de auditoria reverte chegada', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 7),
    app = timed(new Date(row.startsAt)).app
  for (const token of [
    p.token,
    ctx.admin.token,
    ctx.professionalAccounts[0].token,
  ])
    await check(app, row.id, token).expect(403)
  await request(app)
    .post(`/v1/appointments/${row.id}/check-in`)
    .send({})
    .expect(401)
  await check(app, randomUUID()).expect(404)
  await ctx.db.$executeRawUnsafe(
    `CREATE FUNCTION reject_checkin_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='appointment.checked_in' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
  )
  await ctx.db.$executeRawUnsafe(
    'CREATE TRIGGER fail_checkin_test BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_checkin_test_audit()',
  )
  try {
    await check(app, row.id).expect(500)
  } finally {
    await ctx.db.$executeRawUnsafe(
      'DROP TRIGGER fail_checkin_test ON "AuditEvent"',
    )
    await ctx.db.$executeRawUnsafe('DROP FUNCTION reject_checkin_test_audit()')
  }
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: row.id } }))
      .status,
    'confirmed',
  )
  assert.equal(
    await ctx.db.checkIn.count({ where: { appointmentId: row.id } }),
    0,
  )
  assert.equal(
    await ctx.db.appointmentHistory.count({
      where: { appointmentId: row.id, action: 'checked_in' },
    }),
    0,
  )
  assert.ok(
    (await ctx.db.reminderJob.count({
      where: { appointmentId: row.id, status: 'pending' },
    })) > 0,
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: row.id, state: 'confirmed' },
    }),
    1,
  )
  await check(app, row.id).expect(200)
})

test('BE-026: agenda usa filtros/contadores e projeções administrativas com identidade só na recepção/admin', async () => {
  const p = await ctx.patient(),
    name = 'Paciente Buscável Fictício'
  await ctx.db.patientProfile.update({
    where: { id: p.patientId },
    data: { fullName: name },
  })
  const first = await ctx.book(p, 8),
    second = await ctx.book(await ctx.patient(), 8, {
      startsAt: ctx.at(8, '09:00'),
    })
  await check(timed(new Date(second.startsAt)).app, second.id).expect(200)
  const all = (await agenda(day(8)).expect(200)).body
  assert.deepEqual(all.totals, { all: 2, confirmed: 1, noShow: 0 })
  const firstProjection = all.items.find(
    (item: { id: string }) => item.id === first.id,
  )
  assert.equal(firstProjection.patient.birthDate, '1990-01-01')
  assert.match(
    firstProjection.patient.cpfMasked,
    /^\*\*\*\.\*\*\*\.\*\*\*-\d{2}$/,
  )
  const filtered = (
    await agenda(day(8), ctx.reception.token, { status: 'confirmed' }).expect(
      200,
    )
  ).body
  assert.equal(filtered.items.length, 1)
  assert.deepEqual(filtered.totals, all.totals)
  const searched = (
    await agenda(day(8), ctx.reception.token, {
      patientQuery: name.toLowerCase(),
    }).expect(200)
  ).body
  assert.equal(searched.items.length, 1)
  assert.equal(searched.items[0].id, first.id)
  const cpf = (
    await ctx.db.patientProfile.findUniqueOrThrow({
      where: { id: p.patientId },
    })
  ).cpf
  assert.equal(
    (
      await agenda(day(8), ctx.reception.token, { patientQuery: cpf }).expect(
        200,
      )
    ).body.items[0].id,
    first.id,
  )
  const manager = await ctx.account('manager')
  const management = (await agenda(day(8), manager.token).expect(200)).body
  assert.equal(management.items[0].patient.birthDate, null)
  assert.equal(management.items[0].patient.cpfMasked, null)
  const own = (
    await agenda(day(8), ctx.professionalAccounts[1].token).expect(200)
  ).body
  assert.equal(own.items.length, 0)
  assert.equal(own.totals.all, 0)
  await agenda(day(8), ctx.professionalAccounts[1].token, {
    professionalId: ctx.professionalIds[0],
  }).expect(403)
  await agenda(day(8), p.token).expect(403)
  await agenda(day(8), ctx.reception.token, { cursor: randomUUID() }).expect(
    404,
  )
  await agenda('invalid').expect(400)
  assert.ok(
    !JSON.stringify(
      await ctx.db.auditEvent.findMany({
        where: { action: 'appointment.agenda_read' },
      }),
    ).includes(name),
  )
})

test('BE-026: pendências sinalizam balcão; revogação impede nova chegada sem ampliar acesso', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 9)
  await ctx.db.user.update({
    where: { id: p.user.id },
    data: { emailVerifiedAt: null },
  })
  await ctx.db.consentEvent.create({
    data: {
      patientId: p.patientId,
      documentVersionId: ctx.documentId,
      action: 'refuse',
      source: 'portal',
      actorUserId: p.user.id,
      consentingPersonName: p.user.fullName,
    },
  })
  const now = new Date(row.startsAt),
    app = timed(now).app
  const checked = (await check(app, row.id).expect(200)).body
  assert.ok(checked.administrativeFlags.includes('email_unverified'))
  assert.ok(checked.administrativeFlags.includes('consent_pending'))
  const revoked = await ctx.patient(),
    blocked = await ctx.book(revoked, 10)
  await ctx.db.consentEvent.create({
    data: {
      patientId: revoked.patientId,
      documentVersionId: ctx.documentId,
      action: 'revoke',
      source: 'portal',
      actorUserId: revoked.user.id,
      consentingPersonName: revoked.user.fullName,
    },
  })
  const response = await check(
    timed(new Date(blocked.startsAt)).app,
    blocked.id,
  ).expect(409)
  assert.equal(response.body.error.code, 'CONSENT_REQUIRED')
  assert.equal(
    await ctx.db.checkIn.count({ where: { appointmentId: blocked.id } }),
    0,
  )
})

test('BE-026: recepção resolve atraso por BE-022 com motivo e nova chegada; não reabre dia anterior nem libera encaixe sem reserva', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 11)
  const now = new Date(
    new Date(row.startsAt).getTime() +
      (ctx.config.appointmentLateToleranceMinutes + 1) * 60_000,
  )
  await check(timed(now).app, row.id).expect(200)
  const reschedule = new RescheduleAppointment(
    ctx.store,
    new PrismaAuditWriter(ctx.db),
    ctx.availability,
    () => now,
  )
  const input = {
    startsAt: ctx.at(12),
    expectedVersion: 2,
    origin: 'reception' as const,
  }
  await assert.rejects(
    reschedule.execute(
      ctx.principal(ctx.reception, 'receptionist'),
      row.id,
      input,
      randomUUID(),
      auditContext(),
    ),
  )
  await assert.rejects(
    reschedule.execute(
      ctx.principal(p, 'patient'),
      row.id,
      { ...input, origin: 'patient', reason: 'teste' },
      randomUUID(),
      auditContext(),
    ),
  )
  const result = await reschedule.execute(
    ctx.principal(ctx.reception, 'receptionist'),
    row.id,
    { ...input, reason: 'Paciente solicita remarcação após chegada tardia' },
    randomUUID(),
    auditContext(),
  )
  assert.equal(result.appointment.status, 'confirmed')
  assert.equal(result.appointment.version, 3)
  assert.equal(
    await ctx.db.checkIn.count({ where: { appointmentId: row.id } }),
    1,
  )
  assert.equal(
    await ctx.db.slotReleaseEvent.count({ where: { appointmentId: row.id } }),
    1,
  )
  assert.equal(
    (await queue(day(11)).expect(200)).body.items.some(
      (item: { id: string }) => item.id === row.id,
    ),
    false,
  )
  await check(timed(new Date(ctx.at(12))).app, row.id).expect(200)
  assert.equal(
    await ctx.db.checkIn.count({ where: { appointmentId: row.id } }),
    2,
  )
  const followingDay = new RescheduleAppointment(
    ctx.store,
    new PrismaAuditWriter(ctx.db),
    ctx.availability,
    () => new Date(ctx.at(13)),
  )
  await assert.rejects(
    followingDay.execute(
      ctx.principal(ctx.reception, 'receptionist'),
      row.id,
      { ...input, startsAt: ctx.at(14), expectedVersion: 4, reason: 'teste' },
      randomUUID(),
      auditContext(),
    ),
  )
})

test('BE-026: paginação real em dia com 32 consultas não repete/omite e recusa cursor de outro filtro', async () => {
  await request(ctx.app)
    .patch(`/v1/admin/specialties/${ctx.specialtyId}`)
    .set('Authorization', ctx.admin.token)
    .send({
      expectedVersion: 1,
      defaultMinutesFirst: 10,
      defaultMinutesReturn: 10,
    })
    .expect(200)
  const ids: string[] = []
  for (let i = 0; i < 32; i++) {
    const p = await ctx.patient(),
      startsAt = new Date(
        new Date(ctx.at(14)).getTime() + (i % 16) * 10 * 60_000,
      ).toISOString()
    const row = await ctx.book(p, 14, {
      startsAt,
      professionalId: ctx.professionalIds[Math.floor(i / 16)],
    })
    ids.push(row.id)
  }
  const first = (await agenda(day(14)).expect(200)).body
  assert.equal(first.items.length, 30)
  assert.equal(first.totals.all, 32)
  assert.ok(first.nextCursor)
  const second = (
    await agenda(day(14), ctx.reception.token, {
      cursor: first.nextCursor,
    }).expect(200)
  ).body
  assert.equal(second.items.length, 2)
  assert.equal(second.nextCursor, null)
  assert.deepEqual(
    [...first.items, ...second.items]
      .map((item: { id: string }) => item.id)
      .sort(),
    ids.sort(),
  )
  const firstOwn = (
    await agenda(day(14), ctx.professionalAccounts[0].token).expect(200)
  ).body
  assert.equal(firstOwn.totals.all, 16)
  const otherCursor = first.items.find(
    (item: { professionalId: string }) =>
      item.professionalId === ctx.professionalIds[1],
  ).id
  await agenda(day(14), ctx.professionalAccounts[0].token, {
    cursor: otherCursor,
  }).expect(404)
  await agenda(day(13), ctx.reception.token, {
    cursor: first.nextCursor,
  }).expect(404)
})

test('BE-026/P-43: data omitida é o dia da clínica; dia explícito preservado e fila exige data', async () => {
  const now = new Date('2030-01-02T01:00:00.000Z'),
    app = timed(now).app
  const current = (
    await request(app)
      .get('/v1/agenda/day')
      .set('Authorization', ctx.reception.token)
      .expect(200)
  ).body
  assert.equal(current.localDate, clinicDate(now, ctx.config.clinicTimeZone))
  assert.notEqual(current.localDate, now.toISOString().slice(0, 10))
  assert.equal(current.clinicTimeZone, ctx.config.clinicTimeZone)
  assert.equal(current.serverNow, now.toISOString())
  const explicit = (
    await request(app)
      .get('/v1/agenda/day?localDate=2030-02-10')
      .set('Authorization', ctx.reception.token)
      .expect(200)
  ).body
  assert.equal(explicit.localDate, '2030-02-10')
  await request(app)
    .get('/v1/agenda/day?localDate=invalid')
    .set('Authorization', ctx.reception.token)
    .expect(400)
  await request(app)
    .get('/v1/professionals/me/queue')
    .set('Authorization', ctx.professionalAccounts[0].token)
    .expect(400)
})

test('BE-026/P-46: origem/prazo na agenda sem motivo/autor e sem ampliar projeção profissional', async () => {
  const p = await ctx.patient(),
    original = await ctx.book(p, 100)
  await request(ctx.app)
    .post(`/v1/appointments/${original.id}/reschedule`)
    .set('Authorization', ctx.reception.token)
    .set('Idempotency-Key', randomUUID())
    .send({
      startsAt: ctx.at(101),
      expectedVersion: 1,
      origin: 'clinic',
      reason: 'Justificativa administrativa restrita',
    })
    .expect(200)
  const staff = (await agenda(day(101)).expect(200)).body.items[0]
  operationalAppointment.parse(staff)
  assert.equal(staff.lastChange.action, 'rescheduled')
  assert.equal(staff.lastChange.origin, 'clinic')
  assert.equal(
    staff.patientChangeDeadline,
    new Date(new Date(staff.startsAt).getTime() - 4 * 3_600_000).toISOString(),
  )
  assert.ok(
    !JSON.stringify(staff).includes('Justificativa administrativa restrita'),
  )
  assert.ok(!JSON.stringify(staff.lastChange).includes('actorUserId'))
  const professional = (
    await agenda(day(101), ctx.professionalAccounts[0].token).expect(200)
  ).body.items[0]
  assert.equal(professional.lastChange, null)
  await request(ctx.app)
    .post(`/v1/appointments/${original.id}/cancel`)
    .set('Authorization', ctx.reception.token)
    .set('Idempotency-Key', randomUUID())
    .send({
      expectedVersion: 2,
      origin: 'clinic',
      reason: 'Justificativa de cancelamento restrita',
    })
    .expect(200)
  const cancelled = (await agenda(day(101)).expect(200)).body.items[0]
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.lastChange.action, 'cancelled')
  assert.equal(cancelled.lastChange.origin, 'clinic')
})
