import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { Temporal } from '@js-temporal/polyfill'
import request from 'supertest'
import { FindAvailability } from '../../src/application/use-cases/find-availability'
import { RescheduleAppointment } from '../../src/application/use-cases/reschedule-appointment'
import type { Principal } from '../../src/domain/rules/access'
import { localInstant } from '../../src/domain/rules/schedule'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { PrismaAvailabilityStore } from '../../src/infrastructure/persistence/prisma/availability-store'
import { PrismaBookingStore } from '../../src/infrastructure/persistence/prisma/booking-store'
import { consentAwareNotificationCheck } from '../../src/infrastructure/persistence/prisma/notification-store'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { createM1Database, fictitiousCpf } from '../support/m1-database'

let ctx: Awaited<ReturnType<typeof createM1Database>>,
  runtime: Awaited<ReturnType<typeof composeBackendApplication>>
let admin: Awaited<ReturnType<typeof ctx.account>>, reception: typeof admin
const professionalIds: string[] = [],
  professionalAccounts: (typeof admin)[] = []
let specialtyId = '',
  documentId = ''
const day = Temporal.Now.plainDateISO('America/Fortaleza').add({ days: 7 })
const at = (offset: number, time = '08:00') =>
  localInstant(
    day.add({ days: offset }).toString(),
    time,
    'America/Fortaleza',
  ).toISOString()
before(async () => {
  ctx = await createM1Database()
  admin = await ctx.account('admin')
  reception = await ctx.account('receptionist')
  documentId = (
    await ctx.db.consentDocumentVersion.create({
      data: {
        kind: 'data',
        version: 'test',
        bodyReference: 'Termo Fictício',
        effectiveAt: new Date(Date.now() - 1000),
        publishedBy: admin.user.id,
      },
    })
  ).id
  specialtyId = (
    await ctx.db.specialty.create({
      data: {
        code: 'RESCHEDULE',
        name: 'Especialidade Fictícia',
        allowedModalities: ['onsite', 'remote'],
        defaultMinutesFirst: 60,
        defaultMinutesReturn: 30,
      },
    })
  ).id
  for (const councilNumber of ['100', '200']) {
    const account = await ctx.account('professional')
    const p = await ctx.db.professionalProfile.create({
      data: {
        userId: account.user.id,
        councilType: 'CRM',
        councilRegion: 'CE',
        councilNumber,
        modalities: ['onsite', 'remote'],
        specialties: { create: { specialtyId } },
      },
    })
    professionalAccounts.push(account)
    professionalIds.push(p.id)
    await ctx.db.scheduleVersion.create({
      data: {
        professionalId: p.id,
        version: 1,
        clinicTimeZone: 'America/Fortaleza',
        publishedBy: admin.user.id,
        rules: {
          create: [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
            {
              weekday,
              localStart: '08:00',
              localEnd: '12:00',
              effectiveFrom: new Date('2026-01-01'),
              modality: 'onsite' as const,
            },
            {
              weekday,
              localStart: '13:00',
              localEnd: '18:00',
              effectiveFrom: new Date('2026-01-01'),
              modality: 'remote' as const,
            },
          ]),
        },
      },
    })
  }
  await ctx.db.room.createMany({
    data: [{ name: 'Sala 1' }, { name: 'Sala 2' }],
  })
  runtime = await composeBackendApplication(ctx.config)
})
after(async () => {
  if (runtime) await runtime.close()
  if (ctx) await ctx.close()
})
async function patient() {
  const account = await ctx.account('patient')
  const profile = await ctx.db.patientProfile.create({
    data: {
      fullName: 'Paciente Fictício',
      userId: account.user.id,
      cpf: fictitiousCpf(),
      birthDate: new Date('1990-01-01'),
    },
  })
  await ctx.db.consentEvent.create({
    data: {
      patientId: profile.id,
      documentVersionId: documentId,
      action: 'accept',
      source: 'portal',
      actorUserId: account.user.id,
      consentingPersonName: account.user.fullName,
    },
  })
  return { ...account, patientId: profile.id }
}
async function book(p: Awaited<ReturnType<typeof patient>>, offset: number) {
  return (
    await request(runtime.app)
      .post('/v1/appointments')
      .set('Authorization', p.token)
      .set('Idempotency-Key', randomUUID())
      .send({
        patientId: p.patientId,
        professionalId: professionalIds[0],
        specialtyId,
        modality: 'onsite',
        visitType: 'first',
        startsAt: at(offset),
      })
      .expect(201)
  ).body.appointment
}
const move = (token: string, id: string, body: object, key = randomUUID()) =>
  request(runtime.app)
    .post(`/v1/appointments/${id}/reschedule`)
    .set('Authorization', token)
    .set('Idempotency-Key', key)
    .send(body)
const actor = (
  account: typeof admin,
  role: 'patient' | 'receptionist',
): Principal => ({
  userId: account.user.id,
  sessionId: account.session.id,
  roles: [role],
  permissions: [],
  mfaVerified: role !== 'patient',
  consentState: 'active',
})
function timedService(now: Date) {
  return new RescheduleAppointment(
    new PrismaBookingStore(ctx.db, {
      maxWaitMs: ctx.config.reservationTxMaxWaitMs,
      timeoutMs: ctx.config.reservationTxTimeoutMs,
      retryAttempts: ctx.config.reservationTxRetryAttempts,
      internalMinutes: ctx.config.internalIdleMinutes,
      patientMinutes: ctx.config.patientIdleMinutes,
    }),
    new PrismaAuditWriter(ctx.db),
    new FindAvailability(
      new PrismaAvailabilityStore(ctx.db),
      ctx.config.clinicTimeZone,
      ctx.config.availabilityMaxWindowDays,
      ctx.config.availabilityLookaheadDays,
    ),
    () => now,
  )
}

test('BE-022: troca atômica presencial/remota mantém ID, histórico, versão, origem e idempotência', async () => {
  const p = await patient(),
    original = await book(p, 0),
    key = randomUUID()
  const old = await ctx.db.slotReservation.findFirstOrThrow({
    where: { appointmentId: original.id, state: 'confirmed' },
  })
  const body = {
    startsAt: at(1, '13:00'),
    modality: 'remote',
    expectedVersion: original.version,
  }
  const result = (await move(p.token, original.id, body, key).expect(200)).body
  assert.equal(result.appointment.id, original.id)
  assert.equal(result.appointment.roomId, null)
  assert.equal(result.appointment.version, 2)
  assert.equal(result.previousSlotReleased, true)
  assert.equal(result.origin, 'patient')
  assert.equal(
    (await ctx.db.slotReservation.findUniqueOrThrow({ where: { id: old.id } }))
      .state,
    'released',
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: original.id, state: 'confirmed' },
    }),
    1,
  )
  const history = await ctx.db.appointmentHistory.findFirstOrThrow({
    where: { appointmentId: original.id, action: 'rescheduled' },
  })
  assert.equal(history.origin, 'patient')
  assert.equal((history.previous as { roomId: string }).roomId, original.roomId)
  assert.equal(
    (await move(p.token, original.id, body, key).expect(200)).body.appointment
      .version,
    2,
  )
  await move(
    p.token,
    original.id,
    { ...body, startsAt: at(1, '14:00') },
    key,
  ).expect(409)
  await move(p.token, original.id, {
    ...body,
    startsAt: at(1, '14:00'),
  }).expect(409)
  assert.equal(
    await ctx.db.appointmentHistory.count({
      where: { appointmentId: original.id, action: 'rescheduled' },
    }),
    1,
  )
  const list = (
    await request(runtime.app)
      .get('/v1/me/appointments')
      .set('Authorization', p.token)
      .expect(200)
  ).body
  assert.deepEqual(
    list.items.map((a: { id: string }) => a.id),
    [original.id],
  )
  assert.ok(!('createdBy' in list.items[0]))
  assert.ok(!('reason' in list.items[0]))
})

test('BE-022: conflito e concorrência preservam original sem histórico falso', async () => {
  const a = await patient(),
    b = await patient(),
    apptA = await book(a, 2),
    apptB = await book(b, 3)
  const results = await Promise.all([
    move(a.token, apptA.id, { startsAt: at(4), expectedVersion: 1 }),
    move(b.token, apptB.id, { startsAt: at(4), expectedVersion: 1 }),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  const loser = results[0].status === 409 ? apptA : apptB
  const persisted = await ctx.db.appointment.findUniqueOrThrow({
    where: { id: loser.id },
  })
  assert.equal(persisted.startsAt.toISOString(), loser.startsAt)
  assert.equal(persisted.version, 1)
  assert.equal(
    await ctx.db.appointmentHistory.count({
      where: { appointmentId: loser.id },
    }),
    1,
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: {
        appointmentId: loser.id,
        startsAt: new Date(loser.startsAt),
        state: 'confirmed',
      },
    }),
    1,
  )
  assert.equal(
    await ctx.db.notification.count({
      where: { aggregateId: loser.id, templateKey: 'appointment.rescheduled' },
    }),
    0,
  )
})

test('BE-022: prazo usa horário original, exceção assistida exige motivo, autoria e origem clínica', async () => {
  const p = await patient(),
    original = await book(p, 5)
  const service = timedService(
    new Date(new Date(original.startsAt).getTime() - 3 * 3_600_000),
  )
  const body = { startsAt: at(6), expectedVersion: 1 }
  await assert.rejects(
    service.execute(actor(p, 'patient'), original.id, body, randomUUID(), {
      requestId: randomUUID(),
      actorRoles: [],
      authorizationBasis: 'role',
    }),
    { code: 'BOOKING_CHANGE_WINDOW' },
  )
  await assert.rejects(
    service.execute(
      actor(reception, 'receptionist'),
      original.id,
      body,
      randomUUID(),
      { requestId: randomUUID(), actorRoles: [], authorizationBasis: 'role' },
    ),
    { code: 'VALIDATION_ERROR' },
  )
  const moved = await service.execute(
    actor(reception, 'receptionist'),
    original.id,
    { ...body, origin: 'clinic', reason: 'Ausência do profissional fictício' },
    randomUUID(),
    { requestId: randomUUID(), actorRoles: [], authorizationBasis: 'role' },
  )
  assert.equal(moved.origin, 'clinic')
  assert.ok(Array.isArray(moved.alternatives))
  const history = await ctx.db.appointmentHistory.findFirstOrThrow({
    where: { appointmentId: original.id, action: 'rescheduled' },
  })
  assert.equal(history.actorUserId, reception.user.id)
  assert.equal(history.origin, 'clinic')
  assert.ok(history.reason)
  assert.equal(
    await ctx.db.notification.count({
      where: {
        aggregateId: original.id,
        templateKey: 'appointment.rescheduled_by_clinic',
      },
    }),
    2,
  )
})

test('BE-022: troca de profissional notifica anterior/novo e invalida avisos antigos sem remover histórico', async () => {
  const p = await patient(),
    original = await book(p, 7)
  const result = await move(reception.token, original.id, {
    startsAt: at(8),
    professionalId: professionalIds[1],
    expectedVersion: 1,
    origin: 'clinic',
    reason: 'Cobertura fictícia',
  }).expect(200)
  assert.equal(result.body.appointment.professionalId, professionalIds[1])
  assert.equal(
    await ctx.db.notification.count({
      where: {
        aggregateId: original.id,
        templateKey: 'appointment.confirmed',
        deliveryStatus: 'suppressed',
      },
    }),
    2,
  )
  const notices = await ctx.db.notification.findMany({
    where: {
      aggregateId: original.id,
      templateKey: 'appointment.rescheduled_by_clinic',
    },
  })
  assert.equal(notices.length, 3)
  await ctx.db.$transaction(async (tx) => {
    for (const notice of notices)
      assert.equal(
        await consentAwareNotificationCheck(tx, {
          ...notice,
          aggregateVersion: Number(notice.aggregateVersion),
        } as Parameters<typeof consentAwareNotificationCheck>[1]),
        true,
      )
  })
})

test('BE-022: IDOR, origem forjada, conta profissional e cursor alheio não ampliam acesso', async () => {
  const p = await patient(),
    foreign = await patient(),
    original = await book(p, 9)
  const body = { startsAt: at(10), expectedVersion: 1 }
  await move(foreign.token, original.id, body).expect(404)
  await move(p.token, original.id, {
    ...body,
    origin: 'clinic',
    reason: 'Forjada',
  }).expect(403)
  await move(professionalAccounts[0].token, original.id, body).expect(403)
  await request(runtime.app)
    .get('/v1/me/appointments')
    .set('Authorization', foreign.token)
    .query({ cursor: original.id })
    .expect(404)
  await request(runtime.app)
    .get('/v1/me/appointments')
    .set('Authorization', foreign.token)
    .query({ patientId: p.patientId })
    .expect(404)
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: original.id } }))
      .version,
    1,
  )
  assert.ok(
    await ctx.db.auditEvent.count({
      where: { resourceId: original.id, action: 'authorization.denied' },
    }),
  )
})

test('BE-022: limite RN-004 inclui exatamente quatro horas e novo horário ainda respeita RN-003', async () => {
  const p = await patient(),
    original = await book(p, 16)
  const now = new Date(new Date(original.startsAt).getTime() - 4 * 3_600_000),
    service = timedService(now)
  const context = {
    requestId: randomUUID(),
    actorRoles: [],
    authorizationBasis: 'role',
  }
  await assert.rejects(
    service.execute(
      actor(p, 'patient'),
      original.id,
      {
        startsAt: new Date(now.getTime() + 3_600_000).toISOString(),
        expectedVersion: 1,
      },
      randomUUID(),
      context,
    ),
    { code: 'BOOKING_LEAD_TIME' },
  )
  const moved = await service.execute(
    actor(p, 'patient'),
    original.id,
    { startsAt: at(17), expectedVersion: 1 },
    randomUUID(),
    { ...context, requestId: randomUUID() },
  )
  assert.equal(moved.appointment.version, 2)
})

test('BE-022: falha posterior de auditoria mantém consulta, reserva e avisos originais', async () => {
  const p = await patient(),
    original = await book(p, 12)
  const reservation = await ctx.db.slotReservation.findFirstOrThrow({
    where: { appointmentId: original.id, state: 'confirmed' },
  })
  await ctx.db.$executeRawUnsafe(
    `CREATE FUNCTION test_reject_reschedule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='appointment.rescheduled' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$`,
  )
  await ctx.db.$executeRawUnsafe(
    `CREATE TRIGGER test_reject_reschedule BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_reschedule()`,
  )
  try {
    await move(p.token, original.id, {
      startsAt: at(13),
      expectedVersion: 1,
    }).expect(500)
    const after = await ctx.db.appointment.findUniqueOrThrow({
      where: { id: original.id },
    })
    assert.equal(after.version, 1)
    assert.equal(after.startsAt.toISOString(), original.startsAt)
    assert.equal(
      (
        await ctx.db.slotReservation.findUniqueOrThrow({
          where: { id: reservation.id },
        })
      ).state,
      'confirmed',
    )
    assert.equal(
      await ctx.db.appointmentHistory.count({
        where: { appointmentId: original.id },
      }),
      1,
    )
    assert.equal(
      await ctx.db.bookingCommand.count({
        where: { appointmentId: original.id, operation: 'reschedule' },
      }),
      0,
    )
    assert.equal(
      await ctx.db.notification.count({
        where: { aggregateId: original.id, deliveryStatus: 'queued' },
      }),
      2,
    )
  } finally {
    await ctx.db.$executeRawUnsafe(
      `DROP TRIGGER test_reject_reschedule ON "AuditEvent"`,
    )
    await ctx.db.$executeRawUnsafe(`DROP FUNCTION test_reject_reschedule()`)
  }
})

test('BE-022: responsável lista e remarca dependente, e perde acesso quando vínculo termina', async () => {
  const p = await patient()
  const child = await ctx.db.patientProfile.create({
    data: {
      fullName: 'Dependente Fictício',
      birthDate: new Date('2020-01-01'),
      cpf: fictitiousCpf(),
    },
  })
  const link = await ctx.db.guardianLink.create({
    data: {
      patientId: child.id,
      guardianUserId: p.user.id,
      relationship: 'mãe',
    },
  })
  await ctx.db.consentEvent.create({
    data: {
      patientId: child.id,
      documentVersionId: documentId,
      action: 'accept',
      source: 'portal',
      actorUserId: p.user.id,
      consentingPersonName: p.user.fullName,
      guardianLinkId: link.id,
    },
  })
  const original = await book({ ...p, patientId: child.id }, 14)
  await move(p.token, original.id, {
    startsAt: at(15),
    expectedVersion: 1,
  }).expect(200)
  const list = await request(runtime.app)
    .get('/v1/me/appointments')
    .set('Authorization', p.token)
    .query({ patientId: child.id })
    .expect(200)
  assert.deepEqual(
    list.body.items.map((a: { id: string }) => a.id),
    [original.id],
  )
  await ctx.db.guardianLink.update({
    where: { id: link.id },
    data: { status: 'inactive', endedAt: new Date() },
  })
  await move(p.token, original.id, {
    startsAt: at(18),
    expectedVersion: 2,
  }).expect(404)
  const revoked = await request(runtime.app)
    .get('/v1/me/appointments')
    .set('Authorization', p.token)
    .expect(200)
  assert.equal(revoked.body.items.length, 0)
})

test('BE-022: paginação própria não duplica consultas e filtros usam datas civis', async () => {
  const p = await patient()
  await ctx.db.$transaction(async (tx) => {
    const appointments = Array.from({ length: 31 }, (_, index) => ({
      id: randomUUID(),
      patientId: p.patientId,
      professionalId: professionalIds[0],
      specialtyId,
      modality: 'remote' as const,
      visitType: 'first',
      startsAt: new Date(at(30 + index, '13:00')),
      endsAt: new Date(at(30 + index, '14:00')),
      durationMinutes: 60,
      specialtyVersion: 1,
      bookingSource: 'portal',
      createdBy: p.user.id,
    }))
    await tx.appointment.createMany({ data: appointments })
    await tx.slotReservation.createMany({
      data: appointments.map((a) => ({
        appointmentId: a.id,
        professionalId: a.professionalId,
        modality: a.modality,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        state: 'confirmed',
        requestKey: randomUUID(),
        requestHash: 'fixture',
      })),
    })
  })
  const page = await request(runtime.app)
    .get('/v1/me/appointments')
    .set('Authorization', p.token)
    .expect(200)
  assert.equal(page.body.items.length, 30)
  assert.ok(page.body.nextCursor)
  const last = await request(runtime.app)
    .get('/v1/me/appointments')
    .set('Authorization', p.token)
    .query({ cursor: page.body.nextCursor })
    .expect(200)
  assert.equal(last.body.items.length, 1)
  assert.equal(last.body.nextCursor, null)
  assert.equal(
    new Set(
      [...page.body.items, ...last.body.items].map((a: { id: string }) => a.id),
    ).size,
    31,
  )
  const from = day.add({ days: 30 }).toString(),
    to = day.add({ days: 31 }).toString()
  const filtered = await request(runtime.app)
    .get('/v1/me/appointments')
    .set('Authorization', p.token)
    .query({ from, to, status: 'confirmed' })
    .expect(200)
  assert.equal(filtered.body.items.length, 2)
  await request(runtime.app)
    .get('/v1/me/appointments')
    .set('Authorization', p.token)
    .query({ from: to, to: from })
    .expect(400)
})
