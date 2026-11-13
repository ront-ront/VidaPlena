import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import request from 'supertest'
import type {
  Delivery,
  NotificationChannel,
} from '../../src/application/ports/notifications'
import { DispatchNotifications } from '../../src/application/use-cases/dispatch-notifications'
import { ProcessReminders } from '../../src/application/use-cases/process-reminders'
import { RespondAttendance } from '../../src/application/use-cases/respond-attendance'
import {
  DevEmailSender,
  EmailNotificationChannel,
  PortalNotificationChannel,
} from '../../src/infrastructure/notifications/channels'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import {
  consentAwareNotificationCheck,
  PrismaNotificationStore,
} from '../../src/infrastructure/persistence/prisma/notification-store'
import { PrismaReminderStore } from '../../src/infrastructure/persistence/prisma/reminder-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { createBookingFixture } from '../support/m1-bookings'

let ctx: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  ctx = await createBookingFixture()
})
after(async () => {
  if (ctx) await ctx.close()
})
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  authorizationBasis: 'test',
})
function services(at: Date, channels?: NotificationChannel[]) {
  let clock = at
  const box = new AesSecretBox(ctx.config.encryptionKey, 'notification')
  const store = new PrismaReminderStore(ctx.db, box, {
    hoursBefore: ctx.config.reminderScheduleHoursBefore,
    timeZone: ctx.config.clinicTimeZone,
    onsiteAddress: ctx.config.clinicOnsiteAddress,
  })
  const notifications = new PrismaNotificationStore(
    ctx.db,
    consentAwareNotificationCheck,
    box,
  )
  const sender = new DevEmailSender(
    ctx.config.emailMailboxPath,
    'test',
    ctx.config.frontendOrigin,
  )
  const dispatcher = new DispatchNotifications(
    notifications,
    channels ?? [
      new EmailNotificationChannel(sender),
      new PortalNotificationChannel(),
    ],
    box,
    {
      retrySeconds: ctx.config.notificationRetrySeconds,
      maxAttempts: ctx.config.notificationMaxAttempts,
    },
    () => clock,
  )
  return {
    store,
    notifications,
    dispatcher,
    sender,
    processor: new ProcessReminders(
      store,
      ctx.config.reminderWorkerBatchSize,
      () => clock,
    ),
    advance: (value: Date) => {
      clock = value
    },
  }
}
const jobs = (id: string, version = 1) =>
  ctx.db.reminderJob.findMany({
    where: { appointmentId: id, appointmentVersion: version },
    orderBy: { scheduledAt: 'asc' },
  })
const notices = (jobId: string) =>
  ctx.db.notification.findMany({
    where: { reminderJobId: jobId },
    orderBy: { userId: 'asc' },
  })
async function enqueue(id: string, version = 1, index = 0) {
  const job = (await jobs(id, version))[index]
  const now = new Date(job.scheduledAt.getTime() + 1000)
  const svc = services(now)
  await svc.store.enqueue(job.id, now)
  return { job, svc, now, rows: await notices(job.id) }
}
function move(token: string, id: string, startsAt: string, version = 1) {
  return request(ctx.app)
    .post(`/v1/appointments/${id}/reschedule`)
    .set('Authorization', token)
    .set('Idempotency-Key', randomUUID())
    .send({ startsAt, expectedVersion: version })
}
function cancel(token: string, id: string, version = 1) {
  return request(ctx.app)
    .post(`/v1/appointments/${id}/cancel`)
    .set('Authorization', token)
    .set('Idempotency-Key', randomUUID())
    .send({ origin: 'patient', expectedVersion: version })
}
function respond(token: string, id: string, response: string) {
  return request(ctx.app)
    .post(`/v1/appointments/${id}/attendance-response`)
    .set('Authorization', token)
    .send({ response })
}
async function revoke(p: Awaited<ReturnType<typeof ctx.patient>>) {
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
}

test('BE-025: confirmação planeja parâmetros; execução concorrente/reinício entrega dois eventos sem tokens ou dados clínicos', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 0),
    planned = await jobs(row.id)
  assert.equal(planned.length, ctx.config.reminderScheduleHoursBefore.length)
  assert.deepEqual(
    planned.map((j) => j.hoursBefore),
    ctx.config.reminderScheduleHoursBefore,
  )
  for (const job of planned) {
    assert.equal(
      new Date(row.startsAt).getTime() - job.scheduledAt.getTime(),
      job.hoursBefore * 3_600_000,
    )
    const svc = services(new Date(job.scheduledAt.getTime() + 1000))
    await Promise.all([svc.processor.runOnce(), svc.processor.runOnce()])
    const rows = await notices(job.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].userId, p.user.id)
    assert.ok(
      rows[0].payloadEncrypted &&
        !rows[0].payloadEncrypted.includes('Pessoa Fictícia'),
    )
    await Promise.all([
      svc.dispatcher.deliver(rows[0].id),
      svc.dispatcher.deliver(rows[0].id),
    ])
    const restarted = services(new Date(job.scheduledAt.getTime() + 2000))
    await restarted.processor.runOnce()
    await restarted.dispatcher.deliver(rows[0].id)
    const sent = await ctx.db.notification.findUniqueOrThrow({
      where: { id: rows[0].id },
    })
    assert.equal(sent.deliveryStatus, 'sent')
    assert.equal(sent.attempts, 1)
    const email = JSON.parse(
      await readFile(
        join(ctx.config.emailMailboxPath, `${sent.id}.json`),
        'utf8',
      ),
    )
    assert.match(email.text, /Presencial/)
    assert.ok(email.text.includes(ctx.config.clinicOnsiteAddress))
    assert.ok(email.text.includes(ctx.professionalAccounts[0].user.fullName))
    assert.equal(email.actionUrl, undefined)
    assert.ok(!JSON.stringify(email).includes(p.patientId))
    assert.ok(!JSON.stringify(email).includes('diagnóstico'))
    const portal = await svc.notifications.list(p.user.id)
    assert.ok(
      portal.items.some((item) => 'text' in item && item.text === email.text),
    )
  }
  assert.equal(
    await ctx.db.reminderJob.count({
      where: { appointmentId: row.id, firstSuccessfulAt: { not: null } },
    }),
    2,
  )
})

test('BE-025: marketing opt-out não bloqueia essencial; preferência atual sem externo usa portal e sinaliza recepção', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 1)
  const { svc, rows } = await enqueue(row.id)
  await svc.notifications.updatePreferences(
    p.user.id,
    { channels: [], nonEssentialOptOut: true },
    context(),
  )
  await svc.dispatcher.deliver(rows[0].id)
  const sent = await ctx.db.notification.findUniqueOrThrow({
    where: { id: rows[0].id },
  })
  assert.equal(sent.channel, 'portal')
  assert.equal(sent.deliveryStatus, 'sent')
  assert.equal(sent.needsReceptionAttention, true)
  assert.deepEqual(sent.preferenceSnapshot, {
    channels: [],
    nonEssentialOptOut: true,
  })
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: row.id } }))
      .notificationAttention,
    true,
  )
  assert.ok(
    (await svc.notifications.attention()).items.some(
      (item) => 'id' in item && item.id === sent.id,
    ),
  )
  const second = await enqueue(row.id, 1, 1)
  await second.svc.notifications.updatePreferences(
    p.user.id,
    { channels: ['email'], nonEssentialOptOut: true },
    context(),
  )
  await second.svc.dispatcher.deliver(second.rows[0].id)
  assert.equal(
    (
      await ctx.db.notification.findUniqueOrThrow({
        where: { id: second.rows[0].id },
      })
    ).channel,
    'email',
  )
})

test('BE-025: revogação antes do job ou após outbox bloqueia conteúdo e envio', async () => {
  const beforePatient = await ctx.patient(),
    beforeRow = await ctx.book(beforePatient, 2)
  await revoke(beforePatient)
  const before = await enqueue(beforeRow.id)
  assert.equal(before.rows.length, 0)
  assert.equal((await jobs(beforeRow.id))[0].status, 'suppressed')
  const p = await ctx.patient(),
    row = await ctx.book(p, 3),
    pending = await enqueue(row.id)
  await revoke(p)
  await pending.svc.dispatcher.deliver(pending.rows[0].id)
  const denied = await ctx.db.notification.findUniqueOrThrow({
    where: { id: pending.rows[0].id },
  })
  assert.equal(denied.deliveryStatus, 'suppressed')
  assert.equal(denied.attempts, 0)
  assert.equal(denied.payloadEncrypted, null)
  assert.equal((await jobs(row.id))[0].firstSuccessfulAt, null)
  // The contact-verification channel override must also respect current consent.
  const verification = await pending.svc.dispatcher.enqueue({
    type: 'contact.verification_requested',
    aggregateId: p.user.id,
    version: 1,
    userId: p.user.id,
    patientId: p.patientId,
    requestId: randomUUID(),
    token: 'token-ficticio',
  })
  await pending.svc.dispatcher.deliver(verification)
  const verificationResult = await ctx.db.notification.findUniqueOrThrow({
    where: { id: verification },
  })
  assert.equal(verificationResult.deliveryStatus, 'suppressed')
  assert.equal(verificationResult.attempts, 0)
})

test('BE-025: remarcação/cancelamento invalidam jobs e outbox antigos; novo planejamento respeita teto global', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 4),
    old = await enqueue(row.id)
  await move(p.token, row.id, ctx.at(5)).expect(200)
  assert.ok((await jobs(row.id)).every((job) => job.status === 'cancelled'))
  await old.svc.dispatcher.deliver(old.rows[0].id)
  assert.equal(
    (
      await ctx.db.notification.findUniqueOrThrow({
        where: { id: old.rows[0].id },
      })
    ).attempts,
    0,
  )
  const fresh = await jobs(row.id, 2)
  assert.equal(fresh.length, ctx.config.reminderScheduleHoursBefore.length)
  const first = await enqueue(row.id, 2, 0)
  await first.svc.dispatcher.deliver(first.rows[0].id)
  await move(p.token, row.id, ctx.at(6), 2).expect(200)
  const next = await jobs(row.id, 3)
  const svc = services(new Date(next[1].scheduledAt.getTime() + 1000))
  await Promise.all(
    next.map((job) =>
      svc.store.enqueue(job.id, new Date(next[1].scheduledAt.getTime() + 1000)),
    ),
  )
  const queued = await ctx.db.notification.findMany({
    where: {
      aggregateId: row.id,
      aggregateVersion: 3n,
      templateKey: 'appointment.reminder',
    },
  })
  await Promise.all(queued.map((item) => svc.dispatcher.deliver(item.id)))
  assert.equal(
    await ctx.db.reminderJob.count({
      where: { appointmentId: row.id, firstSuccessfulAt: { not: null } },
    }),
    2,
  )
  assert.equal(
    await ctx.db.notification.count({
      where: {
        aggregateId: row.id,
        templateKey: 'appointment.reminder',
        deliveryStatus: 'sent',
      },
    }),
    2,
  )
  await cancel(p.token, row.id, 3).expect(200)
  assert.equal(
    await ctx.db.reminderJob.count({
      where: { appointmentId: row.id, status: { in: ['pending', 'enqueued'] } },
    }),
    0,
  )
})

test('BE-025: falha ambígua e retry usam mesma caixa idempotente; falha persistente sinaliza contato', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 7),
    pending = await enqueue(row.id)
  let failed = false
  const svc = services(pending.now, [
    {
      name: 'email',
      deliver: async (message: Delivery) => {
        await pending.svc.sender.send(message)
        if (!failed) {
          failed = true
          throw new Error('conteúdo privado de provedor')
        }
      },
    },
  ])
  await svc.dispatcher.deliver(pending.rows[0].id)
  const retry = await ctx.db.notification.findUniqueOrThrow({
    where: { id: pending.rows[0].id },
  })
  assert.equal(retry.deliveryStatus, 'retry')
  assert.equal(retry.failureReasonSafe, 'delivery_failed')
  assert.equal(
    retry.scheduledAt.getTime(),
    pending.now.getTime() + ctx.config.notificationRetrySeconds * 1000,
  )
  await svc.dispatcher.deliver(retry.id)
  assert.equal(
    (await ctx.db.notification.findUniqueOrThrow({ where: { id: retry.id } }))
      .attempts,
    1,
  )
  svc.advance(retry.scheduledAt)
  await svc.dispatcher.deliver(retry.id)
  assert.equal(
    (await ctx.db.notification.findUniqueOrThrow({ where: { id: retry.id } }))
      .deliveryStatus,
    'sent',
  )
  assert.equal(
    (await readdir(ctx.config.emailMailboxPath)).filter(
      (name) => name === `${retry.id}.json`,
    ).length,
    1,
  )
  const second = await enqueue(row.id, 1, 1)
  const broken = services(second.now, [
    {
      name: 'email',
      deliver: async () => {
        throw new Error('privado')
      },
    },
  ])
  for (let i = 0; i < ctx.config.notificationMaxAttempts; i++) {
    await broken.dispatcher.deliver(second.rows[0].id)
    broken.advance(
      (
        await ctx.db.notification.findUniqueOrThrow({
          where: { id: second.rows[0].id },
        })
      ).scheduledAt,
    )
  }
  const final = await ctx.db.notification.findUniqueOrThrow({
    where: { id: second.rows[0].id },
  })
  assert.equal(final.deliveryStatus, 'failed')
  assert.equal(final.needsReceptionAttention, true)
  assert.equal((await jobs(row.id))[1].status, 'failed')
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: row.id } }))
      .notificationAttention,
    true,
  )
  assert.ok(
    !JSON.stringify(
      await ctx.db.auditEvent.findMany({ where: { resourceId: final.id } }),
    ).includes('privado'),
  )
})

test('BE-025: confirmação declarada é idempotente e cannot_attend oferece cancelamento sem liberar reserva ou acionar espera', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 8)
  const first = (await respond(p.token, row.id, 'confirm').expect(200)).body
  assert.equal(first.response, 'confirm')
  assert.equal(first.requiresCancellation, false)
  assert.equal(first.waitlistTriggered, false)
  const listing = (
    await request(ctx.app)
      .get('/v1/me/appointments')
      .set('Authorization', p.token)
      .expect(200)
  ).body
  assert.deepEqual(
    listing.items.find((item: { id: string }) => item.id === row.id)
      .attendanceResponse,
    { response: 'confirm', respondedAt: first.respondedAt },
  )
  assert.deepEqual(
    (await respond(p.token, row.id, 'confirm').expect(200)).body,
    first,
  )
  assert.equal(
    await ctx.db.attendanceResponse.count({ where: { appointmentId: row.id } }),
    1,
  )
  const cannot = (await respond(p.token, row.id, 'cannot_attend').expect(200))
    .body
  assert.equal(cannot.requiresCancellation, true)
  assert.equal(cannot.cancellationPath, `/v1/appointments/${row.id}/cancel`)
  assert.equal(cannot.waitlistTriggered, false)
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
  assert.equal(
    await ctx.db.slotReleaseEvent.count({ where: { appointmentId: row.id } }),
    0,
  )
  assert.equal(
    await ctx.db.attendanceResponse.count({ where: { appointmentId: row.id } }),
    2,
  )
  await assert.rejects(
    ctx.db.attendanceResponse.updateMany({
      where: { appointmentId: row.id },
      data: { response: 'confirm' },
    }),
  )
  await cancel(p.token, row.id).expect(200)
  assert.equal(
    await ctx.db.slotReleaseEvent.count({ where: { appointmentId: row.id } }),
    1,
  )
  await respond(p.token, row.id, 'confirm').expect(409)
})

test('BE-025: resposta impede IDOR, perfil interno, consentimento revogado e estado passado; RN-004 orienta recepção', async () => {
  const p = await ctx.patient(),
    other = await ctx.patient(),
    row = await ctx.book(p, 9)
  await respond(other.token, row.id, 'confirm').expect(404)
  await respond(ctx.reception.token, row.id, 'confirm').expect(403)
  await respond(p.token, row.id, 'invalid').expect(400)
  const now = new Date(new Date(row.startsAt).getTime() - 3_600_000)
  const service = new RespondAttendance(
    ctx.store,
    new PrismaAuditWriter(ctx.db),
    () => now,
  )
  const result = await service.execute(
    ctx.principal(p, 'patient'),
    row.id,
    'cannot_attend',
    context(),
  )
  assert.equal(result.receptionContactRequired, true)
  assert.equal(result.cancellationPath, null)
  const past = new RespondAttendance(
    ctx.store,
    new PrismaAuditWriter(ctx.db),
    () => new Date(row.startsAt),
  )
  await assert.rejects(
    past.execute(ctx.principal(p, 'patient'), row.id, 'confirm', context()),
  )
  await revoke(p)
  await respond(p.token, row.id, 'confirm').expect(401)
  assert.equal(
    (await ctx.db.auditEvent.count({
      where: { resourceId: row.id, action: 'authorization.denied' },
    })) >= 2,
    true,
  )
})

test('BE-025: responsáveis elegíveis recebem mesmo evento; vínculo retirado bloqueia destinatário já enfileirado', async () => {
  const p = await ctx.patient(),
    guardian = await ctx.patient()
  const link = await ctx.db.guardianLink.create({
    data: {
      patientId: p.patientId,
      guardianUserId: guardian.user.id,
      relationship: 'responsável legal',
    },
  })
  const row = await ctx.book(p, 10),
    pending = await enqueue(row.id)
  assert.equal(pending.rows.length, 2)
  for (const notice of pending.rows)
    await pending.svc.dispatcher.deliver(notice.id)
  assert.equal((await jobs(row.id))[0].status, 'completed')
  assert.equal(
    await ctx.db.reminderJob.count({
      where: { appointmentId: row.id, firstSuccessfulAt: { not: null } },
    }),
    1,
  )
  await respond(guardian.token, row.id, 'confirm').expect(200)
  const next = await enqueue(row.id, 1, 1)
  await ctx.db.guardianLink.update({
    where: { id: link.id },
    data: { status: 'inactive', endedAt: new Date() },
  })
  for (const notice of next.rows) await next.svc.dispatcher.deliver(notice.id)
  const guardianNotice = next.rows.find((n) => n.userId === guardian.user.id)
  assert.ok(guardianNotice)
  const revoked = await ctx.db.notification.findUniqueOrThrow({
    where: { id: guardianNotice.id },
  })
  assert.equal(revoked.deliveryStatus, 'suppressed')
  assert.equal(
    await ctx.db.reminderJob.count({
      where: { appointmentId: row.id, firstSuccessfulAt: { not: null } },
    }),
    2,
  )
  await respond(guardian.token, row.id, 'confirm').expect(404)
})

test('BE-025: envio em curso serializa cancelamento; após commit nenhum aviso antigo sai', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 11),
    pending = await enqueue(row.id)
  let release!: () => void, entered!: () => void
  const barrier = new Promise<void>((resolve) => {
      release = resolve
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve
    })
  const svc = services(pending.now, [
    {
      name: 'email',
      deliver: async () => {
        entered()
        await barrier
      },
    },
  ])
  const sending = svc.dispatcher.deliver(pending.rows[0].id)
  await started
  const cancelling = cancel(p.token, row.id).then((value) => value)
  release()
  await sending
  assert.equal((await cancelling).status, 200)
  const second = (await jobs(row.id))[1]
  await svc.store.enqueue(
    second.id,
    new Date(second.scheduledAt.getTime() + 1000),
  )
  assert.equal((await notices(second.id)).length, 0)
  await svc.dispatcher.deliver(pending.rows[0].id)
  assert.equal(
    (
      await ctx.db.notification.findUniqueOrThrow({
        where: { id: pending.rows[0].id },
      })
    ).attempts,
    1,
  )
})

test('BE-025: reconciliação recupera consulta legada sem jobs, mantém idempotência e ignora importação', async () => {
  // Simulate the pre-BE-025 database using a transaction-local trigger bypass only in this isolated fixture.
  const p = await ctx.patient(),
    row = await ctx.book(p, 12)
  await ctx.db.$transaction(async (tx) => {
    await tx.$executeRaw`ALTER TABLE "ReminderJob" DISABLE TRIGGER reminder_no_delete`
    await tx.reminderJob.deleteMany({ where: { appointmentId: row.id } })
    await tx.$executeRaw`ALTER TABLE "ReminderJob" ENABLE TRIGGER reminder_no_delete`
  })
  const svc = services(new Date())
  assert.equal(
    await svc.store.reconcile(new Date(), ctx.config.reminderWorkerBatchSize),
    1,
  )
  assert.equal(
    (await jobs(row.id)).length,
    ctx.config.reminderScheduleHoursBefore.length,
  )
  assert.equal(
    await svc.store.reconcile(new Date(), ctx.config.reminderWorkerBatchSize),
    0,
  )
  const imported = await ctx.book(await ctx.patient(), 13)
  // Only fixture setup: historical imported records are not created by the booking HTTP route.
  await ctx.db.$transaction(async (tx) => {
    await tx.$executeRaw`ALTER TABLE "ReminderJob" DISABLE TRIGGER reminder_no_delete`
    await tx.reminderJob.deleteMany({ where: { appointmentId: imported.id } })
    await tx.$executeRaw`ALTER TABLE "ReminderJob" ENABLE TRIGGER reminder_no_delete`
    await tx.appointment.update({
      where: { id: imported.id },
      data: { bookingSource: 'imported' },
    })
  })
  assert.equal(
    await svc.store.reconcile(new Date(), ctx.config.reminderWorkerBatchSize),
    0,
  )
  assert.equal((await jobs(imported.id)).length, 0)
})

test('BE-025: remoto usa caminho administrativo do portal sem simular sala de vídeo', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 14, {
      startsAt: ctx.at(14, '13:00'),
      modality: 'remote',
    })
  const pending = await enqueue(row.id)
  await pending.svc.dispatcher.deliver(pending.rows[0].id)
  const message = JSON.parse(
    await readFile(
      join(ctx.config.emailMailboxPath, `${pending.rows[0].id}.json`),
      'utf8',
    ),
  )
  assert.match(message.text, /Online/)
  assert.match(message.text, /\/minhas-consultas/)
  assert.ok(!message.text.includes(ctx.config.clinicOnsiteAddress))
  assert.equal(message.actionUrl, undefined)
})

test('BE-025: reconciliação de versão criada perto da consulta ignora estágio vencido e entrega apenas futuro', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 15)
  const startsAt = new Date(row.startsAt)
  const now = new Date(startsAt.getTime() - 3 * 3_600_000)
  await ctx.db.$transaction(async (tx) => {
    await tx.$executeRaw`ALTER TABLE "ReminderJob" DISABLE TRIGGER reminder_no_delete`
    await tx.reminderJob.deleteMany({ where: { appointmentId: row.id } })
    await tx.$executeRaw`ALTER TABLE "ReminderJob" ENABLE TRIGGER reminder_no_delete`
    // A pre-upgrade consultation whose current version was created three hours before its start.
    await tx.appointment.update({
      where: { id: row.id },
      data: { updatedAt: now },
    })
  })
  const svc = services(now)
  await svc.store.reconcile(now, ctx.config.reminderWorkerBatchSize)
  const planned = await jobs(row.id)
  for (const job of planned) {
    assert.equal(job.status, job.scheduledAt < now ? 'skipped' : 'pending')
    await svc.store.enqueue(job.id, now)
    assert.equal((await notices(job.id)).length, 0)
  }
  const future = planned.filter((job) => job.scheduledAt >= now)
  assert.ok(future.length > 0)
  for (const job of future) {
    const due = new Date(job.scheduledAt.getTime() + 1000)
    svc.advance(due)
    await svc.store.enqueue(job.id, due)
    const rows = await notices(job.id)
    assert.equal(rows.length, 1)
    await svc.dispatcher.deliver(rows[0].id)
  }
  assert.equal(
    await ctx.db.notification.count({
      where: {
        aggregateId: row.id,
        templateKey: 'appointment.reminder',
        deliveryStatus: 'sent',
      },
    }),
    future.length,
  )
})

test('BE-025: remarcação exige declaração nova; respostas com mesmo timestamp preservam ordem de inserção', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 16)
  const now = new Date()
  const service = new RespondAttendance(
    ctx.store,
    new PrismaAuditWriter(ctx.db),
    () => now,
  )
  for (const response of ['confirm', 'cannot_attend', 'confirm'] as const)
    await service.execute(
      ctx.principal(p, 'patient'),
      row.id,
      response,
      context(),
    )
  assert.equal(
    await ctx.db.attendanceResponse.count({ where: { appointmentId: row.id } }),
    3,
  )
  await service.execute(
    ctx.principal(p, 'patient'),
    row.id,
    'confirm',
    context(),
  )
  assert.equal(
    await ctx.db.attendanceResponse.count({ where: { appointmentId: row.id } }),
    3,
  )
  const moved = (await move(p.token, row.id, ctx.at(17)).expect(200)).body
  assert.equal(moved.appointment.attendanceResponse, null)
  const fresh = (await respond(p.token, row.id, 'confirm').expect(200)).body
  assert.equal(fresh.appointmentVersion, 2)
  assert.equal(
    await ctx.db.attendanceResponse.count({ where: { appointmentId: row.id } }),
    4,
  )
})

test('BE-025: sem adaptador externo ativo o lembrete fica no portal mesmo com e-mail confirmado', async () => {
  const p = await ctx.patient(),
    row = await ctx.book(p, 18),
    pending = await enqueue(row.id)
  const disabled = services(pending.now, [new PortalNotificationChannel()])
  await disabled.dispatcher.deliver(pending.rows[0].id)
  const result = await ctx.db.notification.findUniqueOrThrow({
    where: { id: pending.rows[0].id },
  })
  assert.equal(result.deliveryStatus, 'sent')
  assert.equal(result.channel, 'portal')
  assert.equal(result.needsReceptionAttention, true)
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: row.id } }))
      .notificationAttention,
    true,
  )
  assert.ok(
    (await disabled.notifications.list(p.user.id)).items.some(
      (item) => 'id' in item && item.id === result.id,
    ),
  )
  await assert.rejects(
    readFile(join(ctx.config.emailMailboxPath, `${result.id}.json`), 'utf8'),
  )
})
