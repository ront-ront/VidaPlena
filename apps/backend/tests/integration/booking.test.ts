import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { Temporal } from '@js-temporal/polyfill'
import request from 'supertest'
import { DispatchNotifications } from '../../src/application/use-cases/dispatch-notifications'
import { localInstant } from '../../src/domain/rules/schedule'
import {
  consentAwareNotificationCheck,
  PrismaNotificationStore,
} from '../../src/infrastructure/persistence/prisma/notification-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { createM1Database, fictitiousCpf } from '../support/m1-database'

let ctx: Awaited<ReturnType<typeof createM1Database>>
let runtime: Awaited<ReturnType<typeof composeBackendApplication>>
let admin: Awaited<ReturnType<typeof ctx.account>>,
  reception: typeof admin,
  professional: typeof admin
let specialtyId = '',
  professionalId = '',
  documentId = ''
const day = Temporal.Now.plainDateISO('America/Fortaleza').add({ days: 7 })
const at = (offset: number, time: string) =>
  localInstant(
    day.add({ days: offset }).toString(),
    time,
    'America/Fortaleza',
  ).toISOString()
before(async () => {
  ctx = await createM1Database()
  admin = await ctx.account('admin')
  reception = await ctx.account('receptionist')
  professional = await ctx.account('professional')
  documentId = (
    await ctx.db.consentDocumentVersion.create({
      data: {
        kind: 'data',
        version: 'm1-test',
        bodyReference: 'Termo fictício',
        effectiveAt: new Date(Date.now() - 1000),
        publishedBy: admin.user.id,
      },
    })
  ).id
  specialtyId = (
    await ctx.db.specialty.create({
      data: {
        code: 'M1-BOOKING',
        name: 'Especialidade Fictícia',
        allowedModalities: ['onsite', 'remote'],
        defaultMinutesFirst: 60,
        defaultMinutesReturn: 30,
      },
    })
  ).id
  professionalId = (
    await ctx.db.professionalProfile.create({
      data: {
        userId: professional.user.id,
        councilType: 'CRM',
        councilNumber: '12345',
        councilRegion: 'CE',
        modalities: ['onsite', 'remote'],
        specialties: { create: { specialtyId } },
      },
    })
  ).id
  await ctx.db.scheduleVersion.create({
    data: {
      professionalId,
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
  await ctx.db.room.createMany({
    data: [
      { id: randomUUID(), name: 'Sala Um' },
      { id: randomUUID(), name: 'Sala Dois' },
    ],
  })
  runtime = await composeBackendApplication(ctx.config)
})
after(async () => {
  if (runtime) await runtime.close()
  if (ctx) await ctx.close()
})
async function patient(consent = true) {
  const account = await ctx.account('patient')
  const profile = await ctx.db.patientProfile.create({
    data: {
      userId: account.user.id,
      fullName: account.user.fullName,
      birthDate: new Date('1990-01-01'),
      cpf: fictitiousCpf(),
    },
  })
  if (consent)
    await ctx.db.consentEvent.create({
      data: {
        patientId: profile.id,
        documentVersionId: documentId,
        action: 'accept',
        actorUserId: account.user.id,
        source: 'portal',
        consentingPersonName: account.user.fullName,
      },
    })
  return { ...account, patientId: profile.id }
}
const input = (patientId: string, offset = 0, time = '08:00') => ({
  patientId,
  professionalId,
  specialtyId,
  modality: 'onsite',
  visitType: 'first',
  startsAt: at(offset, time),
})
const book = (
  token: string,
  body: ReturnType<typeof input> & Record<string, unknown>,
  key = randomUUID(),
) =>
  request(runtime.app)
    .post('/v1/appointments')
    .set('Authorization', token)
    .set('Idempotency-Key', key)
    .send(body)

test('BE-021: confirmação atômica, idempotente, duração congelada e outbox com falha posterior', async () => {
  const p = await patient(),
    key = randomUUID(),
    body = input(p.patientId)
  const response = await book(p.token, body, key).expect(201)
  const appointment = response.body.appointment
  assert.equal(appointment.durationMinutes, 60)
  assert.equal(appointment.status, 'confirmed')
  assert.ok(appointment.roomId)
  const reservation = await ctx.db.slotReservation.findFirstOrThrow({
    where: { appointmentId: appointment.id, state: 'confirmed' },
  })
  assert.equal(reservation.roomId, appointment.roomId)
  assert.equal(
    (await book(p.token, body, key).expect(201)).body.appointment.id,
    appointment.id,
  )
  await book(p.token, { ...body, startsAt: at(0, '09:00') }, key).expect(409)
  assert.equal(
    await ctx.db.appointment.count({ where: { patientId: p.patientId } }),
    1,
  )
  assert.equal(
    await ctx.db.appointmentHistory.count({
      where: { appointmentId: appointment.id },
    }),
    1,
  )
  const newDuration = await request(runtime.app)
    .patch(`/v1/admin/specialties/${specialtyId}`)
    .set('Authorization', admin.token)
    .send({ expectedVersion: 1, defaultMinutesFirst: 40 })
    .expect(200)
  const next = await book(p.token, {
    ...body,
    startsAt: at(0, '10:00'),
    confirmDuplicateSpecialty: true,
  }).expect(201)
  assert.equal(next.body.appointment.durationMinutes, 40)
  assert.equal(next.body.appointment.specialtyVersion, newDuration.body.version)
  assert.equal(
    (
      await ctx.db.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
      })
    ).durationMinutes,
    60,
  )
  const dispatcher = new DispatchNotifications(
    new PrismaNotificationStore(ctx.db, consentAwareNotificationCheck),
    [
      {
        name: 'email',
        deliver: async () => {
          throw new Error('Falha simulada')
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
      where: { aggregateId: appointment.id, deliveryStatus: 'retry' },
    }),
  )
  assert.equal(
    (
      await ctx.db.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
      })
    ).status,
    'confirmed',
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: appointment.id, state: 'confirmed' },
    }),
    1,
  )
})

test('BE-021: consentimento, sujeito alheio, suspensão, duplicidade e remoto são revalidados', async () => {
  const p = await patient(),
    foreign = await patient(),
    pending = await patient(false)
  await book(p.token, input(foreign.patientId, 1)).expect(404)
  assert.equal(
    (await book(reception.token, input(pending.patientId, 1)).expect(409)).body
      .error.code,
    'CONSENT_REQUIRED',
  )
  await ctx.db.patientProfile.update({
    where: { id: p.patientId },
    data: { autoBookingSuspendedUntil: new Date(Date.now() + 86_400_000) },
  })
  assert.equal(
    (await book(p.token, input(p.patientId, 1)).expect(403)).body.error.code,
    'AUTO_BOOKING_SUSPENDED',
  )
  await book(reception.token, input(p.patientId, 1)).expect(201)
  assert.equal(
    (await book(reception.token, input(p.patientId, 1, '10:00')).expect(409))
      .body.error.code,
    'DUPLICATE_SPECIALTY_WARNING',
  )
  await book(reception.token, {
    ...input(p.patientId, 1, '13:00'),
    modality: 'remote',
    confirmDuplicateSpecialty: true,
  })
    .expect(201)
    .then((r) => assert.equal(r.body.appointment.roomId, null))
  await book(p.token, {
    ...input(foreign.patientId, 1),
    roomId: randomUUID(),
  }).expect(404)
  assert.equal(
    await ctx.db.appointment.count({ where: { patientId: pending.patientId } }),
    0,
  )
})

test('BE-021: duas confirmações concorrem sem agendamento/reserva parcial e retornam alternativas seguras', async () => {
  const a = await patient(),
    b = await patient()
  const results = await Promise.all([
    book(a.token, input(a.patientId, 2)),
    book(b.token, input(b.patientId, 2)),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
  const failure = results.find((r) => r.status === 409)
  assert.equal(failure?.body.error.code, 'SLOT_UNAVAILABLE')
  assert.ok(Array.isArray(failure?.body.error.alternatives))
  assert.equal(
    await ctx.db.appointment.count({
      where: { patientId: { in: [a.patientId, b.patientId] } },
    }),
    1,
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { startsAt: new Date(at(2, '08:00')), state: 'confirmed' },
    }),
    1,
  )
  await assert.rejects(
    ctx.db.appointment.create({
      data: {
        id: randomUUID(),
        patientId: a.patientId,
        professionalId,
        specialtyId,
        roomId: null,
        modality: 'remote',
        visitType: 'first',
        startsAt: new Date(at(2, '15:00')),
        endsAt: new Date(at(2, '15:40')),
        durationMinutes: 40,
        specialtyVersion: 2,
        status: 'confirmed',
        bookingSource: 'portal',
        createdBy: a.user.id,
      },
    }),
    'Banco não deve aceitar consulta ativa sem reserva correspondente',
  )
})
