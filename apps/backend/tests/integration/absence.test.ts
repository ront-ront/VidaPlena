import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { Router } from 'express'
import request from 'supertest'
import { Authorize } from '../../src/application/use-cases/authorize'
import { BookAppointment } from '../../src/application/use-cases/book-appointment'
import { DispatchNotifications } from '../../src/application/use-cases/dispatch-notifications'
import { ManageAbsences } from '../../src/application/use-cases/manage-absences'
import { ManageArrivals } from '../../src/application/use-cases/manage-arrivals'
import { absencePenaltyExpiry } from '../../src/domain/rules/absence'
import { clinicDate } from '../../src/domain/rules/arrival'
import { PortalNotificationChannel } from '../../src/infrastructure/notifications/channels'
import { PrismaAbsenceStore } from '../../src/infrastructure/persistence/prisma/absence-store'
import { PrismaAccessStore } from '../../src/infrastructure/persistence/prisma/access-store'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import {
  consentAwareNotificationCheck,
  PrismaNotificationStore,
} from '../../src/infrastructure/persistence/prisma/notification-store'
import { PrismaOperationalStore } from '../../src/infrastructure/persistence/prisma/operational-store'
import { JwtAccessTokens } from '../../src/infrastructure/security/access-tokens'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { createAbsenceRouter } from '../../src/shared/infra/http/absence-router'
import { createApp } from '../../src/shared/infra/http/app'
import { createOperationalRouter } from '../../src/shared/infra/http/operational-router'
import { seedAbsenceFacts } from '../support/m1-absences'
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
const policy = () => ({
  maxWaitMs: ctx.config.reservationTxMaxWaitMs,
  timeoutMs: ctx.config.reservationTxTimeoutMs,
  retryAttempts: ctx.config.reservationTxRetryAttempts,
  internalMinutes: ctx.config.internalIdleMinutes,
  patientMinutes: ctx.config.patientIdleMinutes,
  reminderScheduleHours: ctx.config.reminderScheduleHoursBefore,
})
function timed(now: Date) {
  const audit = new PrismaAuditWriter(ctx.db),
    tokens = new JwtAccessTokens(ctx.config.jwtSecret)
  const authorize = new Authorize(new PrismaAccessStore(ctx.db), audit)
  const service = new ManageAbsences(
    new PrismaAbsenceStore(
      ctx.db,
      policy(),
      new AesSecretBox(ctx.config.encryptionKey, 'absence'),
    ),
    audit,
    {
      timeZone: ctx.config.clinicTimeZone,
      afterMinutes: ctx.config.appointmentNoshowAfterMinutes,
    },
    () => now,
  )
  const arrivals = new ManageArrivals(
    new PrismaOperationalStore(
      ctx.db,
      policy(),
      ctx.config.appointmentNoshowAfterMinutes,
    ),
    audit,
    {
      timeZone: ctx.config.clinicTimeZone,
      lateToleranceMinutes: ctx.config.appointmentLateToleranceMinutes,
    },
    () => now,
  )
  const router = Router()
  router.use(
    createAbsenceRouter(tokens, authorize, service),
    createOperationalRouter(tokens, authorize, arrivals),
  )
  return { app: createApp(ctx.config, router), service, now }
}
const due = (row: { startsAt: string }) =>
  new Date(
    new Date(row.startsAt).getTime() +
      ctx.config.appointmentNoshowAfterMinutes * 60_000,
  )
const mark = (
  app: ReturnType<typeof createApp>,
  id: string,
  token = ctx.reception.token,
  extra: Record<string, unknown> = {},
) =>
  request(app)
    .post(`/v1/appointments/${id}/absence`)
    .set('Authorization', token)
    .send({ kind: 'unjustified', ...extra })
const correct = (
  app: ReturnType<typeof createApp>,
  id: string,
  token = ctx.reception.token,
  extra: Record<string, unknown> = {},
) =>
  request(app)
    .patch(`/v1/appointments/${id}/absence`)
    .set('Authorization', token)
    .send({
      kind: 'justified',
      explanation: 'Justificativa administrativa fictícia',
      expectedVersion: 1,
      ...extra,
    })
const seed = (patientId: string, dates?: Date[]) =>
  seedAbsenceFacts(
    ctx.db,
    {
      patientId,
      professionalId: ctx.professionalIds[0],
      specialtyId: ctx.specialtyId,
      actorId: ctx.reception.user.id,
    },
    dates,
  )
function bookService(now: Date) {
  return new BookAppointment(
    ctx.store,
    new PrismaAuditWriter(ctx.db),
    ctx.availability,
    () => now,
  )
}
const input = (patientId: string, offset: number) => ({
  patientId,
  professionalId: ctx.professionalIds[0],
  specialtyId: ctx.specialtyId,
  modality: 'onsite' as const,
  visitType: 'first' as const,
  startsAt: ctx.at(offset),
})

test('BE-027: só a conferência manual após prazo grava ausência; repetição concorrente preserva reserva e histórico', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 0),
    at = due(row)
  const beforeApp = timed(new Date(at.getTime() - 1)).app
  await mark(beforeApp, row.id).expect(409)
  assert.equal(
    await ctx.db.absence.count({ where: { appointmentId: row.id } }),
    0,
  )
  const app = timed(at).app
  const list = (
    await request(app)
      .get('/v1/agenda/day')
      .set('Authorization', ctx.reception.token)
      .query({
        localDate: clinicDate(at, ctx.config.clinicTimeZone),
        absenceEligibleOnly: 'true',
      })
      .expect(200)
  ).body
  assert.ok(
    list.items.some(
      (item: { id: string; noShowEligible: boolean }) =>
        item.id === row.id && item.noShowEligible,
    ),
  )
  assert.equal(
    await ctx.db.absence.count({ where: { appointmentId: row.id } }),
    0,
  )
  const results = await Promise.all([
    mark(app, row.id),
    mark(app, row.id),
    mark(app, row.id),
  ])
  for (const response of results) {
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, results[0].body)
  }
  assert.equal(results[0].body.status, 'no_show')
  assert.equal(results[0].body.absenceVersion, 1)
  assert.equal(results[0].body.unjustifiedCount, 1)
  assert.equal(
    await ctx.db.absence.count({ where: { appointmentId: row.id } }),
    1,
  )
  assert.equal(
    await ctx.db.absenceRevision.count({
      where: { absence: { appointmentId: row.id } },
    }),
    1,
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: row.id, state: 'released' },
    }),
    1,
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: row.id, state: 'confirmed' },
    }),
    0,
  )
  assert.equal(
    await ctx.db.slotReleaseEvent.count({ where: { appointmentId: row.id } }),
    0,
  )
  assert.equal(
    await ctx.db.appointmentHistory.count({
      where: { appointmentId: row.id, action: 'no_show' },
    }),
    1,
  )
  assert.equal(
    await ctx.db.reminderJob.count({
      where: { appointmentId: row.id, status: { in: ['pending', 'enqueued'] } },
    }),
    0,
  )
  await mark(app, row.id, ctx.reception.token, {
    kind: 'justified',
    explanation: 'Outra decisão',
  }).expect(409)
})

test('BE-027: chegada, cancelamento, papéis sem permissão e consentimento revogado impedem marcação', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 1),
    app = timed(due(row)).app,
    manager = await ctx.account('manager')
  for (const token of [
    p.token,
    manager.token,
    ctx.admin.token,
    ctx.professionalAccounts[0].token,
  ])
    await mark(app, row.id, token).expect(403)
  await request(app)
    .post(`/v1/appointments/${row.id}/absence`)
    .send({ kind: 'unjustified' })
    .expect(401)
  await mark(app, randomUUID()).expect(404)
  await mark(app, row.id, ctx.reception.token, { kind: 'invalid' }).expect(400)
  await mark(app, row.id, ctx.reception.token, { kind: 'justified' }).expect(
    400,
  )
  await request(app)
    .post(`/v1/appointments/${row.id}/check-in`)
    .set('Authorization', ctx.reception.token)
    .send({})
    .expect(200)
  await mark(app, row.id).expect(409)
  const cancelled = await ctx.book(await ctx.patient(), 2)
  await request(ctx.app)
    .post(`/v1/appointments/${cancelled.id}/cancel`)
    .set('Authorization', ctx.reception.token)
    .set('Idempotency-Key', randomUUID())
    .send({ expectedVersion: 1, origin: 'reception' })
    .expect(200)
  await mark(timed(due(cancelled)).app, cancelled.id).expect(409)
  const revoked = await ctx.patient(),
    target = await ctx.book(revoked, 3)
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
  await mark(timed(due(target)).app, target.id).expect(409)
  await request(app)
    .get('/v1/agenda/day')
    .set('Authorization', manager.token)
    .query({
      localDate: clinicDate(due(row), ctx.config.clinicTimeZone),
      absenceEligibleOnly: 'true',
    })
    .expect(403)
})

test('BE-027: terceira falta suspende só portal; recepção segue apta e aviso essencial é deduplicado', async () => {
  const p = await ctx.patient()
  const facts = await seed(p.patientId, [
    new Date(Date.now() - 20 * 86_400_000),
    new Date(Date.now() - 10 * 86_400_000),
  ])
  const row = await ctx.book(p, 4),
    at = due(row),
    app = timed(at).app
  const result = (await mark(app, row.id).expect(200)).body
  assert.equal(result.autoBookingSuspended, true)
  assert.equal(result.unjustifiedCount, 3)
  const expectedExpiry = absencePenaltyExpiry(
    facts[0].startsAt,
    ctx.config.clinicTimeZone,
  )
  assert.equal(result.suspendedUntil, expectedExpiry.toISOString())
  const messages = await ctx.db.notification.findMany({
    where: {
      patientId: p.patientId,
      templateKey: 'patient.auto_booking_suspended',
    },
  })
  assert.equal(messages.length, 1)
  assert.equal(messages[0].userId, ctx.reception.user.id)
  await mark(app, row.id).expect(200)
  assert.equal(
    await ctx.db.notification.count({
      where: {
        patientId: p.patientId,
        templateKey: 'patient.auto_booking_suspended',
      },
    }),
    1,
  )
  await assert.rejects(
    bookService(at).execute(
      ctx.principal(p, 'patient'),
      input(p.patientId, 5),
      randomUUID(),
      auditContext(),
    ),
    { code: 'AUTO_BOOKING_SUSPENDED' },
  )
  const assisted = await bookService(at).execute(
    ctx.principal(ctx.reception, 'receptionist'),
    input(p.patientId, 5),
    randomUUID(),
    auditContext(),
  )
  assert.equal(assisted.appointment.bookingSource, 'reception')
  const box = new AesSecretBox(ctx.config.encryptionKey, 'notification')
  const dispatcher = new DispatchNotifications(
    new PrismaNotificationStore(ctx.db, consentAwareNotificationCheck, box),
    [new PortalNotificationChannel()],
    box,
    {
      retrySeconds: ctx.config.notificationRetrySeconds,
      maxAttempts: ctx.config.notificationMaxAttempts,
    },
    () => at,
  )
  await dispatcher.deliver(messages[0].id)
  assert.equal(
    (
      await ctx.db.notification.findUniqueOrThrow({
        where: { id: messages[0].id },
      })
    ).deliveryStatus,
    'sent',
  )
})

test('BE-027: classificações não punitivas e correções mantêm revisões cifradas e revertem suspensão', async () => {
  const p = await ctx.patient()
  await seed(p.patientId, [
    new Date(Date.now() - 20 * 86_400_000),
    new Date(Date.now() - 10 * 86_400_000),
  ])
  const row = await ctx.book(p, 6),
    at = due(row),
    app = timed(at).app
  await mark(app, row.id).expect(200)
  const manager = await ctx.account('manager'),
    text = 'Paciente informou impedimento pessoal fictício'
  const fixed = (
    await correct(app, row.id, manager.token, { explanation: text }).expect(200)
  ).body
  assert.equal(fixed.autoBookingSuspended, false)
  assert.equal(fixed.unjustifiedCount, 2)
  assert.equal(fixed.absenceVersion, 2)
  const current = await ctx.db.absence.findUniqueOrThrow({
    where: { appointmentId: row.id },
    include: { revisions: { orderBy: { version: 'asc' } } },
  })
  assert.equal(current.revisions.length, 2)
  assert.equal(current.revisions[0].kind, 'unjustified')
  assert.equal(current.revisions[1].previousKind, 'unjustified')
  assert.equal(current.decidedBy, manager.user.id)
  assert.ok(!JSON.stringify(current).includes(text))
  const decrypted = new AesSecretBox(ctx.config.encryptionKey, 'absence').open(
    current.explanationEncrypted ?? '',
    `absence:${current.id}`,
  )
  assert.equal(decrypted, text)
  await assert.rejects(
    ctx.db.absenceRevision.updateMany({
      where: { absenceId: current.id },
      data: { kind: 'unjustified' },
    }),
  )
  await assert.rejects(ctx.db.absence.delete({ where: { id: current.id } }))
  await correct(app, row.id, manager.token, { expectedVersion: 1 }).expect(409)
  await correct(app, row.id, manager.token, {
    expectedVersion: 2,
    explanation: '',
  }).expect(400)
  await correct(app, row.id, p.token, { expectedVersion: 2 }).expect(403)
  const allowed = await bookService(at).execute(
    ctx.principal(p, 'patient'),
    input(p.patientId, 7),
    randomUUID(),
    auditContext(),
  )
  assert.equal(allowed.appointment.bookingSource, 'portal')
  const restored = (
    await correct(app, row.id, manager.token, {
      kind: 'unjustified',
      expectedVersion: 2,
      explanation: 'Revisão administrativa fictícia da classificação',
    }).expect(200)
  ).body
  assert.equal(restored.autoBookingSuspended, true)
  assert.equal(restored.absenceVersion, 3)
  assert.equal(
    await ctx.db.absenceRevision.count({ where: { absenceId: current.id } }),
    3,
  )
  assert.equal(
    (
      await ctx.db.appointment.findUniqueOrThrow({
        where: { id: allowed.appointment.id },
      })
    ).status,
    'confirmed',
  )
  const review = (
    await request(app)
      .get('/v1/agenda/day')
      .set('Authorization', manager.token)
      .query({ localDate: clinicDate(at, ctx.config.clinicTimeZone) })
      .expect(200)
  ).body
  assert.equal(
    review.items.find((item: { id: string }) => item.id === row.id).absence
      .version,
    3,
  )
  assert.ok(!JSON.stringify(review).includes(text))

  const other = await ctx.book(await ctx.patient(), 8),
    nonPunitive = timed(due(other)).app
  assert.equal(
    (
      await mark(nonPunitive, other.id, ctx.reception.token, {
        kind: 'clinic_fault',
        explanation: 'Falha operacional fictícia',
      }).expect(200)
    ).body.unjustifiedCount,
    0,
  )
  assert.ok(
    !JSON.stringify(
      await ctx.db.auditEvent.findMany({
        where: { subjectPatientId: p.patientId },
      }),
    ).includes(text),
  )
})

test('BE-027: dois ajustes concorrentes exigem versão; justificativa mantém a decisão anterior', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 9),
    app = timed(due(row)).app
  await mark(app, row.id).expect(200)
  const responses = await Promise.all([
    correct(app, row.id),
    correct(app, row.id, ctx.reception.token, { kind: 'clinic_fault' }),
  ])
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
  const absence = await ctx.db.absence.findUniqueOrThrow({
    where: { appointmentId: row.id },
  })
  assert.equal(absence.version, 2)
  assert.equal(
    await ctx.db.absenceRevision.count({ where: { absenceId: absence.id } }),
    2,
  )
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: row.id } }))
      .status,
    'no_show',
  )
})

test('BE-027: limite móvel expira sem job e ignora cache manual e fatos fora da janela', async () => {
  const p = await ctx.patient(),
    facts = await seed(p.patientId)
  const first = await ctx.db.absence.findUniqueOrThrow({
    where: { appointmentId: facts[0].id },
  })
  const before = new Date(first.penaltyExpiresAt.getTime() - 1),
    after = first.penaltyExpiresAt
  await assert.rejects(
    bookService(before).execute(
      ctx.principal(p, 'patient'),
      input(p.patientId, 390),
      randomUUID(),
      auditContext(),
    ),
    { code: 'AUTO_BOOKING_SUSPENDED' },
  )
  // A stale cache cannot extend a penalty after the calendar boundary.
  await ctx.db.patientProfile.update({
    where: { id: p.patientId },
    data: {
      autoBookingSuspendedUntil: new Date(after.getTime() + 365 * 86_400_000),
    },
  })
  const result = await bookService(after).execute(
    ctx.principal(p, 'patient'),
    input(p.patientId, 390),
    randomUUID(),
    auditContext(),
  )
  assert.equal(result.appointment.status, 'confirmed')
  const old = await ctx.patient()
  await seed(old.patientId, [
    new Date('2020-01-01'),
    new Date('2020-02-01'),
    new Date('2020-03-01'),
  ])
  const permitted = await bookService(new Date()).execute(
    ctx.principal(old, 'patient'),
    input(old.patientId, 10),
    randomUUID(),
    auditContext(),
  )
  assert.equal(permitted.appointment.status, 'confirmed')
})

test('BE-027: correção/revogação invalidam aviso pendente, falha de canal não desfaz decisão', async () => {
  const p = await ctx.patient()
  await seed(p.patientId, [
    new Date(Date.now() - 20 * 86_400_000),
    new Date(Date.now() - 10 * 86_400_000),
  ])
  const row = await ctx.book(p, 11),
    at = due(row),
    app = timed(at).app
  await mark(app, row.id).expect(200)
  const message = await ctx.db.notification.findFirstOrThrow({
    where: {
      patientId: p.patientId,
      templateKey: 'patient.auto_booking_suspended',
    },
  })
  const box = new AesSecretBox(ctx.config.encryptionKey, 'notification')
  const dispatcher = new DispatchNotifications(
    new PrismaNotificationStore(ctx.db, consentAwareNotificationCheck, box),
    [
      {
        name: 'email',
        deliver: async () => {
          throw new Error('Falha fictícia privada')
        },
      },
    ],
    box,
    {
      retrySeconds: ctx.config.notificationRetrySeconds,
      maxAttempts: ctx.config.notificationMaxAttempts,
    },
    () => at,
  )
  await dispatcher.deliver(message.id)
  assert.equal(
    (await ctx.db.notification.findUniqueOrThrow({ where: { id: message.id } }))
      .deliveryStatus,
    'retry',
  )
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: row.id } }))
      .status,
    'no_show',
  )
  await correct(app, row.id).expect(200)
  const retryAt = (
    await ctx.db.notification.findUniqueOrThrow({ where: { id: message.id } })
  ).scheduledAt
  const retry = new DispatchNotifications(
    new PrismaNotificationStore(ctx.db, consentAwareNotificationCheck, box),
    [new PortalNotificationChannel()],
    box,
    {
      retrySeconds: ctx.config.notificationRetrySeconds,
      maxAttempts: ctx.config.notificationMaxAttempts,
    },
    () => retryAt,
  )
  await retry.deliver(message.id)
  assert.equal(
    (await ctx.db.notification.findUniqueOrThrow({ where: { id: message.id } }))
      .deliveryStatus,
    'suppressed',
  )
  const p2 = await ctx.patient()
  await seed(p2.patientId, [
    new Date(Date.now() - 20 * 86_400_000),
    new Date(Date.now() - 10 * 86_400_000),
  ])
  const revokedRow = await ctx.book(p2, 12),
    now = due(revokedRow)
  await mark(timed(now).app, revokedRow.id).expect(200)
  const revokedMessage = await ctx.db.notification.findFirstOrThrow({
    where: {
      patientId: p2.patientId,
      templateKey: 'patient.auto_booking_suspended',
    },
  })
  await ctx.db.consentEvent.create({
    data: {
      patientId: p2.patientId,
      documentVersionId: ctx.documentId,
      action: 'revoke',
      source: 'portal',
      actorUserId: p2.user.id,
      consentingPersonName: p2.user.fullName,
    },
  })
  const blocked = new DispatchNotifications(
    new PrismaNotificationStore(ctx.db, consentAwareNotificationCheck, box),
    [new PortalNotificationChannel()],
    box,
    {
      retrySeconds: ctx.config.notificationRetrySeconds,
      maxAttempts: ctx.config.notificationMaxAttempts,
    },
    () => now,
  )
  await blocked.deliver(revokedMessage.id)
  assert.equal(
    (
      await ctx.db.notification.findUniqueOrThrow({
        where: { id: revokedMessage.id },
      })
    ).deliveryStatus,
    'suppressed',
  )
})

test('BE-027: falha transacional reverte ausência, reserva, política e outbox', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 13),
    app = timed(due(row)).app
  await ctx.db.$executeRawUnsafe(
    `CREATE FUNCTION reject_absence_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='absence.recorded' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
  )
  await ctx.db.$executeRawUnsafe(
    'CREATE TRIGGER fail_absence_test BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_absence_test_audit()',
  )
  try {
    await mark(app, row.id).expect(500)
  } finally {
    await ctx.db.$executeRawUnsafe(
      'DROP TRIGGER fail_absence_test ON "AuditEvent"',
    )
    await ctx.db.$executeRawUnsafe('DROP FUNCTION reject_absence_test_audit()')
  }
  assert.equal(
    await ctx.db.absence.count({ where: { appointmentId: row.id } }),
    0,
  )
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: row.id } }))
      .status,
    'confirmed',
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: row.id, state: 'confirmed' },
    }),
    1,
  )
})

test('BE-027: decisão tardia preserva ocorrência original e não reinicia janela de 12 meses', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 14)
  const at = new Date(
    absencePenaltyExpiry(
      new Date(row.startsAt),
      ctx.config.clinicTimeZone,
    ).getTime() + 1,
  )
  const result = (await mark(timed(at).app, row.id).expect(200)).body
  assert.equal(result.unjustifiedCount, 0)
  assert.equal(result.autoBookingSuspended, false)
  const saved = await ctx.db.absence.findUniqueOrThrow({
    where: { appointmentId: row.id },
  })
  assert.equal(saved.occurredAt.toISOString(), row.startsAt)
  assert.equal(saved.recordedAt.toISOString(), at.toISOString())
})

test('BE-027: aviso administrativo mínimo permite pendência de termo e revalida papel do destinatário', async () => {
  const box = new AesSecretBox(ctx.config.encryptionKey, 'notification')
  const dispatcher = (now: Date) =>
    new DispatchNotifications(
      new PrismaNotificationStore(ctx.db, consentAwareNotificationCheck, box),
      [new PortalNotificationChannel()],
      box,
      {
        retrySeconds: ctx.config.notificationRetrySeconds,
        maxAttempts: ctx.config.notificationMaxAttempts,
      },
      () => now,
    )
  const p = await ctx.patient()
  await seed(p.patientId, [
    new Date(Date.now() - 20 * 86_400_000),
    new Date(Date.now() - 10 * 86_400_000),
  ])
  const row = await ctx.book(p, 15),
    at = due(row)
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
  await mark(timed(at).app, row.id).expect(200)
  const message = await ctx.db.notification.findFirstOrThrow({
    where: {
      patientId: p.patientId,
      templateKey: 'patient.auto_booking_suspended',
    },
  })
  await dispatcher(at).deliver(message.id)
  assert.equal(
    (await ctx.db.notification.findUniqueOrThrow({ where: { id: message.id } }))
      .deliveryStatus,
    'sent',
  )
  const other = await ctx.patient()
  await seed(other.patientId, [
    new Date(Date.now() - 20 * 86_400_000),
    new Date(Date.now() - 10 * 86_400_000),
  ])
  const target = await ctx.book(other, 16),
    now = due(target)
  await mark(timed(now).app, target.id).expect(200)
  const queued = await ctx.db.notification.findFirstOrThrow({
    where: {
      patientId: other.patientId,
      templateKey: 'patient.auto_booking_suspended',
    },
  })
  const assignment = await ctx.db.userRoleAssignment.findFirstOrThrow({
    where: {
      userId: ctx.reception.user.id,
      roleCode: 'receptionist',
      revokedAt: null,
    },
  })
  await ctx.db.userRoleAssignment.update({
    where: { id: assignment.id },
    data: { revokedAt: new Date() },
  })
  try {
    await dispatcher(now).deliver(queued.id)
    assert.equal(
      (
        await ctx.db.notification.findUniqueOrThrow({
          where: { id: queued.id },
        })
      ).deliveryStatus,
      'suppressed',
    )
  } finally {
    await ctx.db.userRoleAssignment.update({
      where: { id: assignment.id },
      data: { revokedAt: null },
    })
  }
})
