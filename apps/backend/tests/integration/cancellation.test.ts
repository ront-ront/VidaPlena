import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { CancelAppointment } from '../../src/application/use-cases/cancel-appointment'
import { DispatchNotifications } from '../../src/application/use-cases/dispatch-notifications'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import {
  consentAwareNotificationCheck,
  PrismaNotificationStore,
} from '../../src/infrastructure/persistence/prisma/notification-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { createBookingFixture } from '../support/m1-bookings'
import { fictitiousCpf } from '../support/m1-database'

let ctx: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  ctx = await createBookingFixture()
})
after(async () => {
  if (ctx) await ctx.close()
})
const cancel = (
  token: string,
  id: string,
  extra: Record<string, unknown> = {},
  key = randomUUID(),
) =>
  request(ctx.app)
    .post(`/v1/appointments/${id}/cancel`)
    .set('Authorization', token)
    .set('Idempotency-Key', key)
    .send({ origin: 'patient', expectedVersion: 1, ...extra })
const audit = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  authorizationBasis: 'role',
})
const timed = (now: Date) =>
  new CancelAppointment(
    ctx.store,
    new PrismaAuditWriter(ctx.db),
    ctx.availability,
    () => now,
  )

test('BE-023: cancelamento libera reserva, mantém histórico e publica avisos/evento uma vez', async () => {
  const p = await ctx.patient(),
    original = await ctx.book(p, 0),
    key = randomUUID()
  const response = (await cancel(p.token, original.id, {}, key).expect(200))
    .body
  assert.equal(response.status, 'cancelled')
  assert.equal(response.appointment.version, 2)
  assert.equal(response.waitlistTriggered, true)
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: original.id, state: 'confirmed' },
    }),
    0,
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: original.id, state: 'released' },
    }),
    1,
  )
  const history = await ctx.db.appointmentHistory.findFirstOrThrow({
    where: { appointmentId: original.id, action: 'cancelled' },
  })
  assert.equal(history.origin, 'patient')
  assert.equal(history.actorUserId, p.user.id)
  const event = await ctx.db.slotReleaseEvent.findFirstOrThrow({
    where: { appointmentId: original.id },
  })
  assert.equal(event.kind, 'cancelled')
  assert.equal(event.processedAt, null)
  assert.equal(event.startsAt.toISOString(), original.startsAt)
  await cancel(p.token, original.id, {}, key).expect(200)
  await cancel(
    p.token,
    original.id,
    { reason: 'Payload diferente' },
    key,
  ).expect(409)
  await cancel(p.token, original.id).expect(409)
  assert.equal(
    await ctx.db.slotReleaseEvent.count({
      where: { appointmentId: original.id },
    }),
    1,
  )
  assert.equal(
    await ctx.db.notification.count({
      where: { aggregateId: original.id, templateKey: 'appointment.cancelled' },
    }),
    2,
  )
  await assert.rejects(
    ctx.db.appointment.delete({ where: { id: original.id } }),
  )
  await ctx.book(await ctx.patient(), 0)
})

test('BE-023: somente profissional responsável cancela pela clínica com motivo', async () => {
  const p = await ctx.patient(),
    original = await ctx.book(p, 1)
  await cancel(ctx.professionalAccounts[1].token, original.id, {
    origin: 'clinic',
    reason: 'Motivo fictício',
  }).expect(404)
  await cancel(ctx.professionalAccounts[0].token, original.id, {
    origin: 'patient',
  }).expect(403)
  await cancel(ctx.professionalAccounts[0].token, original.id, {
    origin: 'clinic',
  }).expect(400)
  const response = (
    await cancel(ctx.professionalAccounts[0].token, original.id, {
      origin: 'clinic',
      reason: 'Indisponibilidade fictícia',
    }).expect(200)
  ).body
  assert.equal(response.origin, 'clinic')
  assert.ok(Array.isArray(response.alternatives))
  const notices = await ctx.db.notification.findMany({
    where: {
      aggregateId: original.id,
      templateKey: 'appointment.cancelled_by_clinic',
    },
  })
  assert.equal(notices.length, 2)
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

test('BE-023: RN-004 bloqueia portal após prazo, aceita limite exato e exige justificativa assistida', async () => {
  const p = await ctx.patient(),
    original = await ctx.book(p, 2)
  const service = timed(
    new Date(new Date(original.startsAt).getTime() - 3 * 3_600_000),
  )
  await assert.rejects(
    service.execute(
      ctx.principal(p, 'patient'),
      original.id,
      { origin: 'patient', expectedVersion: 1 },
      randomUUID(),
      audit(),
    ),
    { code: 'BOOKING_CHANGE_WINDOW' },
  )
  await assert.rejects(
    service.execute(
      ctx.principal(ctx.reception, 'receptionist'),
      original.id,
      { origin: 'reception', expectedVersion: 1 },
      randomUUID(),
      audit(),
    ),
    { code: 'VALIDATION_ERROR' },
  )
  await service.execute(
    ctx.principal(ctx.reception, 'receptionist'),
    original.id,
    {
      origin: 'reception',
      expectedVersion: 1,
      reason: 'Solicitação presencial fictícia',
    },
    randomUUID(),
    audit(),
  )
  const other = await ctx.patient(),
    boundary = await ctx.book(other, 3)
  await timed(
    new Date(new Date(boundary.startsAt).getTime() - 4 * 3_600_000),
  ).execute(
    ctx.principal(other, 'patient'),
    boundary.id,
    { origin: 'patient', expectedVersion: 1 },
    randomUUID(),
    audit(),
  )
})

test('BE-023: responsável cancela dependente, terceiros e gestor não recebem privilégio', async () => {
  const p = await ctx.patient(),
    foreign = await ctx.patient(),
    manager = await ctx.account('manager')
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
      documentVersionId: ctx.documentId,
      action: 'accept',
      actorUserId: p.user.id,
      source: 'portal',
      consentingPersonName: p.user.fullName,
      guardianLinkId: link.id,
    },
  })
  const original = await ctx.book({ ...p, patientId: child.id }, 4)
  await cancel(foreign.token, original.id).expect(404)
  await cancel(manager.token, original.id, {
    origin: 'clinic',
    reason: 'Motivo fictício',
  }).expect(403)
  await cancel(p.token, original.id, {
    origin: 'clinic',
    reason: 'Forjada',
  }).expect(403)
  await cancel(p.token, original.id).expect(200)
})

test('BE-023: revogação bloqueia portal/avisos, mas liberação assistida justificada preserva o registro', async () => {
  const p = await ctx.patient(),
    original = await ctx.book(p, 5)
  await ctx.db.consentEvent.create({
    data: {
      patientId: p.patientId,
      documentVersionId: ctx.documentId,
      action: 'revoke',
      source: 'portal',
      actorUserId: p.user.id,
      consentingPersonName: p.user.fullName,
    },
  })
  await cancel(p.token, original.id).expect(401)
  await cancel(ctx.reception.token, original.id, {
    origin: 'reception',
  }).expect(400)
  const response = (
    await cancel(ctx.reception.token, original.id, {
      origin: 'reception',
      reason: 'Cancelamento solicitado por contato assistido',
    }).expect(200)
  ).body
  assert.equal(response.notificationState, 'unreachable')
  assert.equal(response.appointment.notificationAttention, true)
  assert.equal(
    await ctx.db.notification.count({
      where: {
        aggregateId: original.id,
        deliveryStatus: { in: ['queued', 'retry'] },
      },
    }),
    0,
  )
  assert.equal(
    await ctx.db.notification.count({
      where: { aggregateId: original.id, templateKey: 'appointment.cancelled' },
    }),
    0,
  )
})

test('BE-023: falha de canal posterior mantém cancelamento e sinaliza retry', async () => {
  const p = await ctx.patient(),
    original = await ctx.book(p, 6)
  await cancel(p.token, original.id).expect(200)
  const dispatcher = new DispatchNotifications(
    new PrismaNotificationStore(ctx.db, consentAwareNotificationCheck),
    [
      {
        name: 'email',
        deliver: async () => {
          throw new Error('Falha fictícia de canal')
        },
      },
    ],
    new AesSecretBox(ctx.config.encryptionKey, 'notification'),
    {
      retrySeconds: ctx.config.notificationRetrySeconds,
      maxAttempts: ctx.config.notificationMaxAttempts,
    },
  )
  await dispatcher.runOnce()
  assert.ok(
    await ctx.db.notification.count({
      where: {
        aggregateId: original.id,
        templateKey: 'appointment.cancelled',
        deliveryStatus: 'retry',
      },
    }),
  )
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: original.id } }))
      .status,
    'cancelled',
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: original.id, state: 'confirmed' },
    }),
    0,
  )
})

test('BE-023: cancelar e reagendar simultaneamente efetivam só uma transição', async () => {
  const p = await ctx.patient(),
    original = await ctx.book(p, 7)
  const results = await Promise.all([
    cancel(p.token, original.id),
    request(ctx.app)
      .post(`/v1/appointments/${original.id}/reschedule`)
      .set('Authorization', p.token)
      .set('Idempotency-Key', randomUUID())
      .send({ startsAt: ctx.at(8), expectedVersion: 1 }),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  const row = await ctx.db.appointment.findUniqueOrThrow({
    where: { id: original.id },
  })
  assert.equal(row.version, 2)
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: original.id, state: 'confirmed' },
    }),
    row.status === 'confirmed' ? 1 : 0,
  )
  assert.equal(
    await ctx.db.appointmentHistory.count({
      where: { appointmentId: original.id },
    }),
    2,
  )
  assert.equal(
    await ctx.db.slotReleaseEvent.count({
      where: { appointmentId: original.id },
    }),
    1,
  )
})

test('BE-023: falha da auditoria reverte liberação, consulta, evento e avisos', async () => {
  const p = await ctx.patient(),
    original = await ctx.book(p, 9)
  await ctx.db.$executeRawUnsafe(
    `CREATE FUNCTION test_reject_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='appointment.cancelled' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$`,
  )
  await ctx.db.$executeRawUnsafe(
    `CREATE TRIGGER test_reject_cancel BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_cancel()`,
  )
  try {
    await cancel(p.token, original.id).expect(500)
    assert.equal(
      (
        await ctx.db.appointment.findUniqueOrThrow({
          where: { id: original.id },
        })
      ).version,
      1,
    )
    assert.equal(
      await ctx.db.slotReservation.count({
        where: { appointmentId: original.id, state: 'confirmed' },
      }),
      1,
    )
    assert.equal(
      await ctx.db.slotReleaseEvent.count({
        where: { appointmentId: original.id },
      }),
      0,
    )
    assert.equal(
      await ctx.db.appointmentHistory.count({
        where: { appointmentId: original.id },
      }),
      1,
    )
    assert.equal(
      await ctx.db.notification.count({
        where: { aggregateId: original.id, deliveryStatus: 'queued' },
      }),
      2,
    )
  } finally {
    await ctx.db.$executeRawUnsafe(
      `DROP TRIGGER test_reject_cancel ON "AuditEvent"`,
    )
    await ctx.db.$executeRawUnsafe(`DROP FUNCTION test_reject_cancel()`)
  }
})

test('BE-023: resolução por cancelamento permite inativar recursos preservando FKs históricas', async () => {
  const p = await ctx.patient(),
    account = await ctx.account('professional')
  const specialty = await ctx.db.specialty.create({
    data: {
      code: 'DEDICATED',
      name: 'Especialidade Dedicada',
      allowedModalities: ['onsite'],
      defaultMinutesFirst: 60,
      defaultMinutesReturn: 30,
    },
  })
  const profile = await ctx.db.professionalProfile.create({
    data: {
      userId: account.user.id,
      councilType: 'CRM',
      councilRegion: 'CE',
      councilNumber: '300',
      modalities: ['onsite'],
      specialties: { create: { specialtyId: specialty.id } },
    },
  })
  const room = await ctx.db.room.create({ data: { name: 'Sala Dedicada' } })
  await ctx.db.scheduleVersion.create({
    data: {
      professionalId: profile.id,
      version: 1,
      clinicTimeZone: ctx.config.clinicTimeZone,
      publishedBy: ctx.admin.user.id,
      rules: {
        create: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday,
          localStart: '08:00',
          localEnd: '12:00',
          effectiveFrom: new Date('2026-01-01'),
          modality: 'onsite',
        })),
      },
    },
  })
  const original = await ctx.book(
    p,
    10,
    { professionalId: profile.id, specialtyId: specialty.id, roomId: room.id },
    ctx.reception.token,
  )
  const routes = [
    `/v1/admin/professionals/${profile.id}`,
    `/v1/admin/rooms/${room.id}`,
    `/v1/admin/specialties/${specialty.id}`,
  ]
  for (const route of routes)
    assert.equal(
      (
        await request(ctx.app)
          .patch(route)
          .set('Authorization', ctx.admin.token)
          .send({ expectedVersion: 1, active: false })
          .expect(409)
      ).body.error.code,
      'SCHEDULE_IMPACT_REVIEW',
    )
  await cancel(ctx.reception.token, original.id, {
    origin: 'reception',
  }).expect(200)
  for (const route of routes)
    await request(ctx.app)
      .patch(route)
      .set('Authorization', ctx.admin.token)
      .send({ expectedVersion: 1, active: false })
      .expect(200)
  const historical = await ctx.db.appointment.findUniqueOrThrow({
    where: { id: original.id },
  })
  assert.equal(historical.roomId, room.id)
  assert.equal(historical.professionalId, profile.id)
  assert.equal(historical.specialtyId, specialty.id)
})
