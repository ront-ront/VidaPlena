import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { AcceptWaitlistOffer } from '../../src/application/use-cases/accept-waitlist-offer'
import { BookAppointment } from '../../src/application/use-cases/book-appointment'
import { DispatchNotifications } from '../../src/application/use-cases/dispatch-notifications'
import { ProcessWaitlist } from '../../src/application/use-cases/process-waitlist'
import { startWaitlistWorker } from '../../src/infrastructure/jobs/waitlist-worker'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import {
  consentAwareNotificationCheck,
  PrismaNotificationStore,
} from '../../src/infrastructure/persistence/prisma/notification-store'
import { PrismaWaitlistStore } from '../../src/infrastructure/persistence/prisma/waitlist-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { seedAbsenceFacts } from '../support/m1-absences'
import { createBookingFixture } from '../support/m1-bookings'
import { fictitiousCpf } from '../support/m1-database'

let ctx: Awaited<ReturnType<typeof createBookingFixture>>,
  store: PrismaWaitlistStore
type Patient = Awaited<ReturnType<typeof ctx.patient>>
before(async () => {
  ctx = await createBookingFixture()
  store = new PrismaWaitlistStore(ctx.db, {
    maxWaitMs: ctx.config.reservationTxMaxWaitMs,
    timeoutMs: ctx.config.reservationTxTimeoutMs,
    retryAttempts: ctx.config.reservationTxRetryAttempts,
    internalMinutes: ctx.config.internalIdleMinutes,
    patientMinutes: ctx.config.patientIdleMinutes,
    reminderScheduleHours: ctx.config.reminderScheduleHoursBefore,
  })
})
after(async () => {
  if (ctx) await ctx.close()
})
const body = (patientId: string, offset: number) => ({
  patientId,
  specialtyId: ctx.specialtyId,
  modality: 'onsite',
  visitType: 'first',
  dateFrom: ctx.day.add({ days: offset }).toString(),
  dateTo: ctx.day.add({ days: offset }).toString(),
  timePreferences: [
    { weekdays: [1, 2, 3, 4, 5, 6, 7], localStart: '08:00', localEnd: '09:00' },
  ],
})
const enter = (p: Patient, offset: number, token = p.token) =>
  request(ctx.app)
    .post('/v1/waitlist')
    .set('Authorization', token)
    .send(body(p.patientId, offset))
const accept = (p: Patient, offerId: string, key = randomUUID(), extra = {}) =>
  request(ctx.app)
    .post(`/v1/waitlist/offers/${offerId}/accept`)
    .set('Authorization', p.token)
    .set('Idempotency-Key', key)
    .send({ patientId: p.patientId, ...extra })
const processor = (clock: () => Date) =>
  new ProcessWaitlist(
    store,
    ctx.config.clinicTimeZone,
    ctx.config.waitlistOfferTtlMinutes,
    ctx.config.waitlistWorkerBatchSize,
    clock,
  )
async function busy(offset: number) {
  const source = await ctx.patient(),
    other = await ctx.patient()
  const appointment = await ctx.book(source, offset)
  await ctx.book(other, offset, { professionalId: ctx.professionalIds[1] })
  return { source, appointment }
}
async function release(source: Awaited<ReturnType<typeof busy>>) {
  await request(ctx.app)
    .post(`/v1/appointments/${source.appointment.id}/cancel`)
    .set('Authorization', source.source.token)
    .set('Idempotency-Key', randomUUID())
    .send({ origin: 'patient', expectedVersion: 1 })
    .expect(200)
  return ctx.db.slotReleaseEvent.findFirstOrThrow({
    where: { appointmentId: source.appointment.id },
  })
}
const currentClock = () => new Date(Date.now() + 1000)

test('BE-024: espera exige ausência de horário, preferências válidas, consentimento e sujeito autorizado', async () => {
  const p = await ctx.patient(),
    foreign = await ctx.patient()
  const available = await enter(p, 0).expect(409)
  assert.equal(available.body.error.code, 'WAITLIST_NOT_NEEDED')
  assert.ok(available.body.error.alternatives.length)
  await request(ctx.app)
    .post('/v1/waitlist')
    .set('Authorization', p.token)
    .send({
      ...body(foreign.patientId, 0),
      timePreferences: [
        { weekdays: [8], localStart: '08:00', localEnd: '09:00' },
      ],
    })
    .expect(400)
  await request(ctx.app)
    .post('/v1/waitlist')
    .set('Authorization', p.token)
    .send(body(foreign.patientId, 0))
    .expect(404)
  const doctor = ctx.professionalAccounts[0]
  await enter(p, 0, doctor.token).expect(403)
  const source = await busy(1)
  const queued = await enter(p, 1).expect(201)
  await request(ctx.app)
    .post('/v1/waitlist')
    .set('Authorization', p.token)
    .send({
      ...body(p.patientId, 1),
      timePreferences: [
        {
          weekdays: [7, 6, 5, 4, 3, 2, 1],
          localStart: '08:00',
          localEnd: '09:00',
        },
      ],
    })
    .expect(409)
  const view = await request(ctx.app)
    .get('/v1/waitlist')
    .set('Authorization', p.token)
    .expect(200)
  assert.equal(view.body.items[0].id, queued.body.entryId)
  assert.ok(!('createdBy' in view.body.items[0]))
  assert.ok(!('patientName' in view.body.items[0]))
  await request(ctx.app)
    .get('/v1/waitlist')
    .set('Authorization', foreign.token)
    .query({ cursor: queued.body.entryId })
    .expect(404)
  await request(ctx.app)
    .delete(`/v1/waitlist/${queued.body.entryId}`)
    .set('Authorization', foreign.token)
    .expect(404)
  await request(ctx.app)
    .delete(`/v1/waitlist/${queued.body.entryId}`)
    .set('Authorization', p.token)
    .expect(204)
  await release(source)
})

test('BE-024: FIFO, TTL configurado e saída avançam sequencialmente sem hold duplicado', async () => {
  const source = await busy(2),
    a = await ctx.patient(),
    b = await ctx.patient()
  const entryA = (await enter(a, 2).expect(201)).body.entryId,
    entryB = (await enter(b, 2).expect(201)).body.entryId
  const event = await release(source)
  let now = currentClock()
  const worker = processor(() => now)
  await Promise.all([worker.process(event.id), worker.process(event.id)])
  const first = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  assert.equal(first.entryId, entryA)
  assert.equal(
    first.expiresAt.getTime() - first.offeredAt.getTime(),
    ctx.config.waitlistOfferTtlMinutes * 60_000,
  )
  assert.equal(
    await ctx.db.waitlistOffer.count({ where: { releaseEventId: event.id } }),
    1,
  )
  const outsider = await ctx.patient()
  await request(ctx.app)
    .post('/v1/appointments')
    .set('Authorization', outsider.token)
    .set('Idempotency-Key', randomUUID())
    .send({
      patientId: outsider.patientId,
      professionalId: ctx.professionalIds[0],
      specialtyId: ctx.specialtyId,
      modality: 'onsite',
      visitType: 'first',
      startsAt: ctx.at(2),
    })
    .expect(409)
  now = new Date(first.expiresAt.getTime() + 1)
  await worker.process(event.id)
  const next = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  assert.equal(next.entryId, entryB)
  assert.equal(
    (
      await ctx.db.slotReservation.findUniqueOrThrow({
        where: { id: first.slotReservationId },
      })
    ).state,
    'released',
  )
  await accept(a, first.id).expect(409)
  await request(ctx.app)
    .delete(`/v1/waitlist/${entryB}`)
    .set('Authorization', b.token)
    .expect(204)
  now = new Date(now.getTime() + 1)
  await worker.process(event.id)
  assert.ok(
    (
      await ctx.db.slotReleaseEvent.findUniqueOrThrow({
        where: { id: event.id },
      })
    ).processedAt,
  )
  assert.equal(
    await ctx.db.waitlistOffer.count({
      where: { releaseEventId: event.id, status: 'active' },
    }),
    0,
  )
  await ctx.book(outsider, 2)
})

test('BE-024: aceite concorrente converte o mesmo hold, com idempotência e histórico válido após cancelamento', async () => {
  const source = await busy(3),
    p = await ctx.patient()
  await enter(p, 3).expect(201)
  const event = await release(source)
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  const keys = [randomUUID(), randomUUID()],
    results = await Promise.all(keys.map((key) => accept(p, offer.id, key)))
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
  const index = results.findIndex((r) => r.status === 201),
    appointment = results[index].body.appointment
  assert.equal(
    (await accept(p, offer.id, keys[index]).expect(201)).body.appointment.id,
    appointment.id,
  )
  await accept(p, offer.id, keys[index], {
    confirmDuplicateSpecialty: true,
  }).expect(409)
  const reservation = await ctx.db.slotReservation.findUniqueOrThrow({
    where: { id: offer.slotReservationId },
  })
  assert.equal(reservation.state, 'confirmed')
  assert.equal(reservation.appointmentId, appointment.id)
  assert.equal(reservation.expiresAt, null)
  assert.equal(
    await ctx.db.slotReservation.count({ where: { offerId: offer.id } }),
    1,
  )
  assert.equal(
    await ctx.db.appointment.count({ where: { patientId: p.patientId } }),
    1,
  )
  assert.equal(
    (
      await ctx.db.waitlistEntry.findUniqueOrThrow({
        where: { id: offer.entryId },
      })
    ).status,
    'fulfilled',
  )
  await request(ctx.app)
    .post(`/v1/appointments/${appointment.id}/cancel`)
    .set('Authorization', p.token)
    .set('Idempotency-Key', randomUUID())
    .send({ origin: 'patient', expectedVersion: 1 })
    .expect(200)
  assert.equal(
    (await ctx.db.waitlistOffer.findUniqueOrThrow({ where: { id: offer.id } }))
      .status,
    'accepted',
  )
})

test('BE-024: oferta de terceiro é negada e aceite expirado libera sem criar consulta', async () => {
  const source = await busy(4),
    p = await ctx.patient(),
    foreign = await ctx.patient()
  await enter(p, 4).expect(201)
  const event = await release(source)
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  await accept(foreign, offer.id).expect(404)
  const service = new AcceptWaitlistOffer(
    store,
    new PrismaAuditWriter(ctx.db),
    () => new Date(offer.expiresAt.getTime() + 1),
  )
  await assert.rejects(
    service.execute(
      ctx.principal(p, 'patient'),
      offer.id,
      { patientId: p.patientId },
      randomUUID(),
      { requestId: randomUUID(), actorRoles: [], authorizationBasis: 'role' },
    ),
    { code: 'OFFER_EXPIRED' },
  )
  assert.equal(
    (
      await ctx.db.slotReservation.findUniqueOrThrow({
        where: { id: offer.slotReservationId },
      })
    ).state,
    'released',
  )
  assert.equal(
    await ctx.db.appointment.count({ where: { patientId: p.patientId } }),
    0,
  )
  await accept(p, offer.id).expect(409)
})

test('BE-024: revogação impede envio e aceite de oferta enfileirada', async () => {
  const source = await busy(5),
    p = await ctx.patient()
  await enter(p, 5).expect(201)
  const event = await release(source)
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  const notice = await ctx.db.notification.findFirstOrThrow({
    where: { aggregateId: offer.id, templateKey: 'waitlist.offered' },
  })
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
  let deliveries = 0
  const dispatcher = new DispatchNotifications(
    new PrismaNotificationStore(ctx.db, consentAwareNotificationCheck),
    [
      {
        name: 'email',
        deliver: async () => {
          deliveries++
        },
      },
      {
        name: 'portal',
        deliver: async () => {
          deliveries++
        },
      },
    ],
    new AesSecretBox(ctx.config.encryptionKey, 'notification'),
    {
      retrySeconds: ctx.config.notificationRetrySeconds,
      maxAttempts: ctx.config.notificationMaxAttempts,
    },
  )
  await dispatcher.deliver(notice.id)
  assert.equal(deliveries, 0)
  assert.equal(
    (await ctx.db.notification.findUniqueOrThrow({ where: { id: notice.id } }))
      .deliveryStatus,
    'suppressed',
  )
  await accept(p, offer.id).expect(401)
})

test('BE-024: vínculo do responsável é revalidado na oferta, no envio e no aceite', async () => {
  const source = await busy(6),
    parent = await ctx.patient()
  const child = await ctx.db.patientProfile.create({
    data: {
      fullName: 'Dependente Fictício',
      cpf: fictitiousCpf(),
      birthDate: new Date('2020-01-01'),
    },
  })
  const link = await ctx.db.guardianLink.create({
    data: {
      patientId: child.id,
      guardianUserId: parent.user.id,
      relationship: 'mãe',
    },
  })
  await ctx.db.consentEvent.create({
    data: {
      patientId: child.id,
      documentVersionId: ctx.documentId,
      action: 'accept',
      source: 'portal',
      actorUserId: parent.user.id,
      consentingPersonName: parent.user.fullName,
      guardianLinkId: link.id,
    },
  })
  const represented = { ...parent, patientId: child.id }
  await enter(represented, 6).expect(201)
  const event = await release(source)
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  const notice = await ctx.db.notification.findFirstOrThrow({
    where: { aggregateId: offer.id, userId: parent.user.id },
  })
  await ctx.db.guardianLink.update({
    where: { id: link.id },
    data: { status: 'inactive', endedAt: new Date() },
  })
  await accept(represented, offer.id).expect(404)
  await ctx.db.$transaction(async (tx) =>
    assert.equal(
      await consentAwareNotificationCheck(tx, {
        ...notice,
        aggregateVersion: Number(notice.aggregateVersion),
      } as Parameters<typeof consentAwareNotificationCheck>[1]),
      false,
    ),
  )
})

test('BE-024: encaixe exige motivo/ator, permanece fora dos slots regulares e nunca sobrepõe', async () => {
  const p = await ctx.patient(),
    manager = await ctx.account('manager'),
    other = await ctx.patient()
  const input = {
    patientId: p.patientId,
    specialtyId: ctx.specialtyId,
    professionalId: ctx.professionalIds[0],
    modality: 'onsite',
    visitType: 'first',
    startsAt: ctx.at(7, '07:00'),
    reason: 'Encaixe fictício justificado',
  }
  const postFitIn = (token: string, body: object, key = randomUUID()) =>
    request(ctx.app)
      .post('/v1/appointments/fit-ins')
      .set('Authorization', token)
      .set('Idempotency-Key', key)
      .send(body)
  await postFitIn(p.token, input).expect(403)
  await postFitIn(ctx.admin.token, input).expect(403)
  await postFitIn(ctx.reception.token, { ...input, reason: ' ' }).expect(400)
  const key = randomUUID(),
    created = (await postFitIn(ctx.reception.token, input, key).expect(201))
      .body.appointment
  assert.equal(created.bookingSource, 'fit_in')
  assert.equal(
    (await postFitIn(ctx.reception.token, input, key).expect(201)).body
      .appointment.id,
    created.id,
  )
  await postFitIn(ctx.reception.token, {
    ...input,
    patientId: other.patientId,
  }).expect(409)
  await postFitIn(ctx.reception.token, {
    ...input,
    patientId: other.patientId,
    startsAt: ctx.at(7, '08:00'),
  }).expect(400)
  const room = await ctx.db.room.findFirstOrThrow()
  await postFitIn(manager.token, {
    ...input,
    patientId: other.patientId,
    startsAt: ctx.at(7, '06:00'),
    roomId: room.id,
  }).expect(403)
  await postFitIn(manager.token, {
    ...input,
    patientId: other.patientId,
    startsAt: ctx.at(7, '06:00'),
  }).expect(201)
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: created.id } }))
      .reason,
    input.reason,
  )
})

test('BE-024: falhas posteriores revertem hold/oferta e depois o aceite inteiro', async () => {
  const source = await busy(8),
    p = await ctx.patient()
  const entryId = (await enter(p, 8).expect(201)).body.entryId,
    event = await release(source)
  await ctx.db.$executeRawUnsafe(
    `CREATE FUNCTION test_reject_waitlist_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" IN ('waitlist.offered','waitlist.accepted') THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$`,
  )
  await ctx.db.$executeRawUnsafe(
    `CREATE TRIGGER test_reject_waitlist_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_waitlist_audit()`,
  )
  try {
    await assert.rejects(processor(currentClock).process(event.id))
    assert.equal(
      await ctx.db.waitlistOffer.count({ where: { releaseEventId: event.id } }),
      0,
    )
    assert.equal(
      (await ctx.db.waitlistEntry.findUniqueOrThrow({ where: { id: entryId } }))
        .status,
      'waiting',
    )
    assert.equal(
      await ctx.db.slotReservation.count({
        where: {
          professionalId: ctx.professionalIds[0],
          startsAt: new Date(ctx.at(8)),
          state: 'held',
        },
      }),
      0,
    )
  } finally {
    await ctx.db.$executeRawUnsafe(
      `DROP TRIGGER test_reject_waitlist_audit ON "AuditEvent"`,
    )
    await ctx.db.$executeRawUnsafe(`DROP FUNCTION test_reject_waitlist_audit()`)
  }
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  await ctx.db.$executeRawUnsafe(
    `CREATE FUNCTION test_reject_waitlist_accept() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='waitlist.accepted' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$`,
  )
  await ctx.db.$executeRawUnsafe(
    `CREATE TRIGGER test_reject_waitlist_accept BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_waitlist_accept()`,
  )
  try {
    await accept(p, offer.id).expect(500)
    assert.equal(
      await ctx.db.appointment.count({ where: { patientId: p.patientId } }),
      0,
    )
    assert.equal(
      (
        await ctx.db.slotReservation.findUniqueOrThrow({
          where: { id: offer.slotReservationId },
        })
      ).state,
      'held',
    )
    assert.equal(
      (
        await ctx.db.waitlistOffer.findUniqueOrThrow({
          where: { id: offer.id },
        })
      ).status,
      'active',
    )
    assert.equal(
      await ctx.db.bookingCommand.count({
        where: { actorId: p.user.id, operation: 'waitlist_accept' },
      }),
      0,
    )
  } finally {
    await ctx.db.$executeRawUnsafe(
      `DROP TRIGGER test_reject_waitlist_accept ON "AuditEvent"`,
    )
    await ctx.db.$executeRawUnsafe(
      `DROP FUNCTION test_reject_waitlist_accept()`,
    )
  }
})

test('BE-024: trabalhador reinicia sem duplicar oferta persistida e encerra graciosamente', async () => {
  const source = await busy(9),
    p = await ctx.patient()
  await enter(p, 9).expect(201)
  const event = await release(source)
  async function tick() {
    let resolve!: () => void, reject!: (error: Error) => void
    const done = new Promise<void>((ok, fail) => {
      resolve = ok
      reject = fail
    })
    const worker = startWaitlistWorker(
      processor(currentClock),
      0.01,
      (status) =>
        status === 'succeeded' ? resolve() : reject(new Error('worker failed')),
    )
    const timeout = setTimeout(() => reject(new Error('worker timeout')), 5000)
    try {
      await done
    } finally {
      clearTimeout(timeout)
      await worker.close()
    }
  }
  await tick()
  await tick()
  assert.equal(
    await ctx.db.waitlistOffer.count({
      where: { releaseEventId: event.id, status: 'active' },
    }),
    1,
  )
})

test('BE-024: aceite assistido avisa duplicidade e mantém consulta anterior até decisão explícita', async () => {
  const source = await busy(10),
    p = await ctx.patient()
  const previous = await ctx.book(p, 30)
  await enter(p, 10).expect(201)
  const event = await release(source)
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  const warning = await accept(p, offer.id).expect(409)
  assert.equal(warning.body.error.code, 'DUPLICATE_SPECIALTY_WARNING')
  assert.equal(
    (
      await ctx.db.slotReservation.findUniqueOrThrow({
        where: { id: offer.slotReservationId },
      })
    ).state,
    'held',
  )
  const accepted = await accept(
    { ...p, token: ctx.reception.token },
    offer.id,
    randomUUID(),
    { confirmDuplicateSpecialty: true },
  ).expect(201)
  assert.equal(accepted.body.appointment.bookingSource, 'reception')
  assert.equal(
    (
      await ctx.db.appointment.findUniqueOrThrow({
        where: { id: accepted.body.appointment.id },
      })
    ).createdBy,
    ctx.reception.user.id,
  )
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: previous.id } }))
      .status,
    'confirmed',
  )
  assert.equal(
    await ctx.db.appointment.count({
      where: { patientId: p.patientId, status: 'confirmed' },
    }),
    2,
  )
})

test('BE-024: sem conta digital ativa mantém prioridade com contato e aceite assistidos', async () => {
  const source = await busy(11),
    p = await ctx.patient()
  await ctx.db.user.update({
    where: { id: p.user.id },
    data: { status: 'inactive' },
  })
  await enter(p, 11, ctx.reception.token).expect(201)
  const event = await release(source)
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  assert.equal(offer.manualContactRequired, true)
  assert.equal(
    await ctx.db.notification.count({
      where: { aggregateId: offer.id, templateKey: 'waitlist.offered' },
    }),
    0,
  )
  const view = await request(ctx.app)
    .get('/v1/waitlist')
    .set('Authorization', ctx.reception.token)
    .query({ patientId: p.patientId })
    .expect(200)
  assert.equal(view.body.items[0].offer.manualContactRequired, true)
  await accept({ ...p, token: ctx.reception.token }, offer.id).expect(201)
})

test('BE-024: suspensão limita aceite online e preserva interesse/aceite pela recepção', async () => {
  const source = await busy(12),
    p = await ctx.patient()
  await seedAbsenceFacts(ctx.db, {
    patientId: p.patientId,
    professionalId: ctx.professionalIds[0],
    specialtyId: ctx.specialtyId,
    actorId: ctx.reception.user.id,
  })
  await enter(p, 12).expect(201)
  const event = await release(source)
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  assert.equal(offer.manualContactRequired, true)
  assert.equal(
    (await accept(p, offer.id).expect(403)).body.error.code,
    'AUTO_BOOKING_SUSPENDED',
  )
  await accept({ ...p, token: ctx.reception.token }, offer.id).expect(201)
})

test('BE-024: nova reserva expira hold vencido e fecha oferta atomicamente antes do worker', async () => {
  const source = await busy(13),
    p = await ctx.patient(),
    newcomer = await ctx.patient()
  await enter(p, 13).expect(201)
  const event = await release(source)
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  const service = new BookAppointment(
    ctx.store,
    new PrismaAuditWriter(ctx.db),
    ctx.availability,
    () => new Date(offer.expiresAt.getTime() + 1),
  )
  const booked = await service.execute(
    ctx.principal(newcomer, 'patient'),
    {
      patientId: newcomer.patientId,
      specialtyId: ctx.specialtyId,
      professionalId: ctx.professionalIds[0],
      modality: 'onsite',
      visitType: 'first',
      startsAt: ctx.at(13),
    },
    randomUUID(),
    { requestId: randomUUID(), actorRoles: [], authorizationBasis: 'role' },
  )
  assert.equal(booked.appointment.status, 'confirmed')
  assert.equal(
    (await ctx.db.waitlistOffer.findUniqueOrThrow({ where: { id: offer.id } }))
      .status,
    'expired',
  )
  assert.equal(
    (
      await ctx.db.waitlistEntry.findUniqueOrThrow({
        where: { id: offer.entryId },
      })
    ).status,
    'waiting',
  )
  assert.equal(
    (
      await ctx.db.slotReservation.findUniqueOrThrow({
        where: { id: offer.slotReservationId },
      })
    ).state,
    'released',
  )
})

test('BE-024: encaixe respeita bloqueios e banco impede oferta sem hold consistente', async () => {
  const p = await ctx.patient()
  const route = `/v1/professionals/${ctx.professionalIds[0]}/schedule`
  const snapshot = (
    await request(ctx.app)
      .get(route)
      .set('Authorization', ctx.admin.token)
      .query({
        from: ctx.day.toString(),
        to: ctx.day.add({ days: 20 }).toString(),
      })
      .expect(200)
  ).body
  await request(ctx.app)
    .put(route)
    .set('Authorization', ctx.admin.token)
    .send({
      expectedVersion: snapshot.version,
      rules: snapshot.rules,
      blocks: [
        ...snapshot.blocks,
        {
          startsAt: ctx.at(14, '07:00'),
          endsAt: ctx.at(14, '08:00'),
          kind: 'vacation',
          reason: 'Bloqueio fictício',
        },
      ],
    })
    .expect(200)
  await request(ctx.app)
    .post('/v1/appointments/fit-ins')
    .set('Authorization', ctx.reception.token)
    .set('Idempotency-Key', randomUUID())
    .send({
      patientId: p.patientId,
      specialtyId: ctx.specialtyId,
      professionalId: ctx.professionalIds[0],
      modality: 'onsite',
      visitType: 'first',
      startsAt: ctx.at(14, '07:00'),
      reason: 'Tentativa fictícia',
    })
    .expect(409)
  const source = await busy(15)
  const entryId = (await enter(p, 15).expect(201)).body.entryId
  await assert.rejects(
    ctx.db.waitlistEntry.update({
      where: { id: entryId },
      data: { status: 'offered' },
    }),
  )
  const event = await release(source)
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  await assert.rejects(
    ctx.db.waitlistOffer.update({
      where: { id: offer.id },
      data: { expiresAt: new Date(offer.expiresAt.getTime() + 60_000) },
    }),
  )
  await assert.rejects(ctx.db.waitlistOffer.delete({ where: { id: offer.id } }))
})

test('BE-024: mudança da duração após oferta invalida hold e não confirma dados antigos', async () => {
  const source = await busy(16),
    p = await ctx.patient()
  await enter(p, 16).expect(201)
  const event = await release(source)
  await processor(currentClock).process(event.id)
  const offer = await ctx.db.waitlistOffer.findFirstOrThrow({
    where: { releaseEventId: event.id, status: 'active' },
  })
  const specialty = await ctx.db.specialty.findUniqueOrThrow({
    where: { id: ctx.specialtyId },
  })
  await request(ctx.app)
    .patch(`/v1/admin/specialties/${ctx.specialtyId}`)
    .set('Authorization', ctx.admin.token)
    .send({ expectedVersion: specialty.version, defaultMinutesFirst: 40 })
    .expect(200)
  assert.equal(
    (await accept(p, offer.id).expect(409)).body.error.code,
    'SLOT_UNAVAILABLE',
  )
  assert.equal(
    (await ctx.db.waitlistOffer.findUniqueOrThrow({ where: { id: offer.id } }))
      .status,
    'cancelled',
  )
  assert.equal(
    (
      await ctx.db.slotReservation.findUniqueOrThrow({
        where: { id: offer.slotReservationId },
      })
    ).state,
    'released',
  )
  assert.equal(
    await ctx.db.appointment.count({ where: { patientId: p.patientId } }),
    0,
  )
})

test('BE-024: inscrições simultâneas reutilizam a transação sem esgotar o pool', async () => {
  await busy(17)
  const patients = await Promise.all(
    Array.from({ length: 12 }, () => ctx.patient()),
  )
  const responses = await Promise.all(patients.map((p) => enter(p, 17)))
  assert.deepEqual(
    responses.map((r) => r.status),
    Array(12).fill(201),
  )
  assert.equal(
    await ctx.db.waitlistEntry.count({
      where: {
        patientId: { in: patients.map((p) => p.patientId) },
        status: 'waiting',
      },
    }),
    12,
  )
})

test('BE-024: oportunidade ocupada antes do consumo não produz oferta falsa nem sobreposição', async () => {
  const source = await busy(18),
    p = await ctx.patient(),
    newcomer = await ctx.patient()
  const entryId = (await enter(p, 18).expect(201)).body.entryId
  const event = await release(source)
  await ctx.book(newcomer, 18)
  await processor(currentClock).process(event.id)
  assert.equal(
    await ctx.db.waitlistOffer.count({ where: { releaseEventId: event.id } }),
    0,
  )
  assert.equal(
    (await ctx.db.waitlistEntry.findUniqueOrThrow({ where: { id: entryId } }))
      .status,
    'waiting',
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: {
        professionalId: ctx.professionalIds[0],
        startsAt: new Date(ctx.at(18)),
        state: 'confirmed',
      },
    }),
    1,
  )
  assert.ok(
    (
      await ctx.db.slotReleaseEvent.findUniqueOrThrow({
        where: { id: event.id },
      })
    ).processedAt,
  )
})
