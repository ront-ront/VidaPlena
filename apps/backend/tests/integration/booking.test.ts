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
    (
      await book(p.token, {
        ...input(p.patientId),
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
      }).expect(409)
    ).body.error.code,
    'BOOKING_LEAD_TIME',
  )
  await book(professional.token, input(p.patientId, 1)).expect(403)
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

test('BE-021: responsável agenda dependente consentido; terceiro, revogação do vínculo e escolha indevida de sala são negados', async () => {
  const guardian = await patient(),
    outsider = await patient()
  const dependent = await ctx.db.patientProfile.create({
    data: {
      fullName: 'Dependente Fictício',
      cpf: fictitiousCpf(),
      birthDate: new Date('2020-01-01'),
    },
  })
  const link = await ctx.db.guardianLink.create({
    data: {
      guardianUserId: guardian.user.id,
      patientId: dependent.id,
      relationship: 'mãe',
    },
  })
  await ctx.db.consentEvent.create({
    data: {
      patientId: dependent.id,
      documentVersionId: documentId,
      action: 'accept',
      source: 'portal',
      actorUserId: guardian.user.id,
      consentingPersonName: guardian.user.fullName,
      guardianLinkId: link.id,
    },
  })
  const room = await ctx.db.room.findFirstOrThrow({ where: { active: true } })
  await book(guardian.token, {
    ...input(dependent.id, 3),
    roomId: room.id,
  }).expect(403)
  const booked = await book(guardian.token, input(dependent.id, 3)).expect(201)
  assert.equal(
    await ctx.db.notification.count({
      where: {
        aggregateId: booked.body.appointment.id,
        userId: guardian.user.id,
      },
    }),
    1,
  )
  await book(outsider.token, input(dependent.id, 4)).expect(404)
  await ctx.db.guardianLink.update({
    where: { id: link.id },
    data: { status: 'inactive', endedAt: new Date() },
  })
  await book(guardian.token, input(dependent.id, 4)).expect(404)
  assert.equal(
    await ctx.db.appointment.count({ where: { patientId: dependent.id } }),
    1,
  )
})

test('BE-021: falta de sala recusa mesmo com profissional livre; recepção escolhe sala e remoto exige modalidade habilitada', async () => {
  const p = await patient()
  const rooms = await ctx.db.room.findMany({ where: { active: true } })
  for (const room of rooms) {
    const account = await ctx.account('professional')
    const profile = await ctx.db.professionalProfile.create({
      data: {
        userId: account.user.id,
        councilType: 'CRM',
        councilRegion: 'CE',
        councilNumber: randomUUID()
          .replaceAll('-', '')
          .slice(0, 20)
          .toUpperCase(),
        modalities: ['onsite'],
      },
    })
    await ctx.db.slotReservation.create({
      data: {
        professionalId: profile.id,
        roomId: room.id,
        modality: 'onsite',
        startsAt: new Date(at(5, '08:00')),
        endsAt: new Date(at(5, '09:00')),
        state: 'held',
        expiresAt: new Date(Date.now() + 3_600_000),
        offerId: randomUUID(),
        requestKey: randomUUID(),
        requestHash: 'fixture',
      },
    })
  }
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { professionalId, startsAt: new Date(at(5, '08:00')) },
    }),
    0,
  )
  assert.equal(
    (await book(p.token, input(p.patientId, 5)).expect(409)).body.error.code,
    'SLOT_UNAVAILABLE',
  )
  const onsite = await ctx.db.specialty.create({
    data: {
      code: 'ONSITE',
      name: 'Somente presencial',
      allowedModalities: ['onsite'],
      defaultMinutesFirst: 40,
      defaultMinutesReturn: 30,
    },
  })
  await ctx.db.professionalSpecialty.create({
    data: { professionalId, specialtyId: onsite.id },
  })
  await book(p.token, {
    ...input(p.patientId, 5, '13:00'),
    specialtyId: onsite.id,
    modality: 'remote',
  }).expect(400)
  const chosen = await book(reception.token, {
    ...input(p.patientId, 6),
    roomId: rooms[0].id,
  }).expect(201)
  assert.equal(chosen.body.appointment.roomId, rooms[0].id)
  const inactive = await ctx.db.room.create({
    data: { name: 'Sala inativa', active: false },
  })
  assert.equal(
    (
      await book(reception.token, {
        ...input(p.patientId, 10),
        roomId: inactive.id,
        confirmDuplicateSpecialty: true,
      }).expect(409)
    ).body.error.code,
    'SLOT_UNAVAILABLE',
  )
})

test('BE-021: consulta assistida sem conta digital sinaliza atenção sem perder reserva', async () => {
  const profile = await ctx.db.patientProfile.create({
    data: {
      fullName: 'Paciente Assistido Fictício',
      cpf: fictitiousCpf(),
      birthDate: new Date('1980-01-01'),
    },
  })
  const evidence = await ctx.db.fileObject.create({
    data: {
      category: 'attachment',
      ownerPatientId: profile.id,
      uploadedBy: reception.user.id,
      linkedResourceType: 'ConsentEvidence',
      linkedResourceId: profile.id,
      storageKey: randomUUID(),
      contentTypeDetected: 'application/pdf',
      size: 10n,
      sha256: '0'.repeat(64),
      encryptionKeyRef: 'test',
      scanStatus: 'skipped_dev',
    },
  })
  await ctx.db.consentEvent.create({
    data: {
      patientId: profile.id,
      documentVersionId: documentId,
      action: 'accept',
      source: 'onsite',
      signedFileId: evidence.id,
      actorUserId: reception.user.id,
      consentingPersonName: profile.fullName,
    },
  })
  const response = await book(reception.token, input(profile.id, 11)).expect(
    201,
  )
  assert.equal(response.body.notificationState, 'unreachable')
  assert.equal(response.body.appointment.notificationAttention, true)
  assert.equal(
    await ctx.db.slotReservation.count({
      where: {
        appointmentId: response.body.appointment.id,
        state: 'confirmed',
      },
    }),
    1,
  )
  assert.equal(
    await ctx.db.notification.count({
      where: { aggregateId: response.body.appointment.id },
    }),
    1,
  )
})

test('BE-021: inativação ou remoção de modalidade com consulta futura exige resolver os impactos', async () => {
  const p = await patient()
  const booked = (await book(p.token, input(p.patientId, 7)).expect(201)).body
    .appointment
  const resources = [
    {
      route: `/v1/admin/specialties/${specialtyId}`,
      version: (
        await ctx.db.specialty.findUniqueOrThrow({ where: { id: specialtyId } })
      ).version,
    },
    {
      route: `/v1/admin/professionals/${professionalId}`,
      version: (
        await ctx.db.professionalProfile.findUniqueOrThrow({
          where: { id: professionalId },
        })
      ).version,
    },
    {
      route: `/v1/admin/rooms/${booked.roomId}`,
      version: (
        await ctx.db.room.findUniqueOrThrow({ where: { id: booked.roomId } })
      ).version,
    },
  ]
  for (const resource of resources) {
    const result = await request(runtime.app)
      .patch(resource.route)
      .set('Authorization', admin.token)
      .send({ expectedVersion: resource.version, active: false })
      .expect(409)
    assert.equal(result.body.error.code, 'SCHEDULE_IMPACT_REVIEW')
    assert.ok(
      result.body.error.affectedAppointments.some(
        (a: { id: string }) => a.id === booked.id,
      ),
    )
    assert.deepEqual(
      Object.keys(result.body.error.affectedAppointments[0]).sort(),
      ['endsAt', 'id', 'startsAt'],
    )
  }
  assert.equal(
    (await ctx.db.room.findUniqueOrThrow({ where: { id: booked.roomId } }))
      .active,
    true,
  )
  const modality = await request(runtime.app)
    .patch(`/v1/admin/specialties/${specialtyId}`)
    .set('Authorization', admin.token)
    .send({
      expectedVersion: resources[0].version,
      allowedModalities: ['remote'],
    })
    .expect(409)
  assert.ok(
    modality.body.error.affectedAppointments.some(
      (a: { id: string }) => a.id === booked.id,
    ),
  )
  assert.equal(
    (await ctx.db.specialty.findUniqueOrThrow({ where: { id: specialtyId } }))
      .active,
    true,
  )
  assert.equal(
    (
      await ctx.db.professionalProfile.findUniqueOrThrow({
        where: { id: professionalId },
      })
    ).active,
    true,
  )
})

test('BE-021: grade ordinária preserva consultas; bloqueio emergencial mantém reserva e enfileira aviso idempotente', async () => {
  const p = await patient()
  const booked = (await book(p.token, input(p.patientId, 8)).expect(201)).body
    .appointment
  const route = `/v1/professionals/${professionalId}/schedule`
  const snapshot = (
    await request(runtime.app)
      .get(route)
      .set('Authorization', admin.token)
      .query({ from: day.toString(), to: day.add({ days: 15 }).toString() })
      .expect(200)
  ).body
  const publish = (body: object) =>
    request(runtime.app).put(route).set('Authorization', admin.token).send(body)
  const blocked = await publish({
    expectedVersion: snapshot.version,
    rules: [],
    blocks: [],
  }).expect(409)
  assert.equal(blocked.body.error.code, 'SCHEDULE_IMPACT_REVIEW')
  assert.equal(
    await ctx.db.scheduleVersion.count({ where: { professionalId } }),
    1,
  )
  const body = {
    expectedVersion: snapshot.version,
    rules: snapshot.rules,
    blocks: [
      {
        startsAt: at(8, '08:00'),
        endsAt: at(8, '09:00'),
        kind: 'emergency',
        reason: 'Indisponibilidade emergencial fictícia',
      },
    ],
  }
  const published = await publish(body).expect(200)
  assert.equal(published.body.affectedAppointmentsResolved, false)
  assert.ok(
    published.body.affectedAppointments.some(
      (a: { id: string }) => a.id === booked.id,
    ),
  )
  assert.equal(
    (await ctx.db.appointment.findUniqueOrThrow({ where: { id: booked.id } }))
      .status,
    'confirmed',
  )
  assert.equal(
    await ctx.db.slotReservation.count({
      where: { appointmentId: booked.id, state: 'confirmed' },
    }),
    1,
  )
  const notices = await ctx.db.notification.count({
    where: {
      aggregateId: booked.id,
      templateKey: 'appointment.schedule_changed',
    },
  })
  assert.equal(notices, 2)
  await publish(body).expect(409)
  assert.equal(
    await ctx.db.notification.count({
      where: {
        aggregateId: booked.id,
        templateKey: 'appointment.schedule_changed',
      },
    }),
    notices,
  )
  const after = (
    await request(runtime.app)
      .get(route)
      .set('Authorization', admin.token)
      .query({
        from: day.add({ days: 8 }).toString(),
        to: day.add({ days: 8 }).toString(),
      })
      .expect(200)
  ).body
  assert.deepEqual(
    after.affectedAppointments.map((a: { id: string }) => a.id),
    [booked.id],
  )
})

test('BE-021: falha de auditoria reverte consulta, reserva, histórico, comando e outbox', async () => {
  const p = await patient()
  await ctx.db.$executeRawUnsafe(
    `CREATE FUNCTION test_reject_booking_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='appointment.confirmed' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$`,
  )
  await ctx.db.$executeRawUnsafe(
    `CREATE TRIGGER test_reject_booking_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_booking_audit()`,
  )
  try {
    await book(p.token, input(p.patientId, 9)).expect(500)
    assert.equal(
      await ctx.db.appointment.count({ where: { patientId: p.patientId } }),
      0,
    )
    assert.equal(
      await ctx.db.slotReservation.count({
        where: { professionalId, startsAt: new Date(at(9, '08:00')) },
      }),
      0,
    )
    assert.equal(
      await ctx.db.notification.count({ where: { patientId: p.patientId } }),
      0,
    )
    assert.equal(
      await ctx.db.bookingCommand.count({ where: { actorId: p.user.id } }),
      0,
    )
    assert.equal(
      await ctx.db.appointmentHistory.count({
        where: { actorUserId: p.user.id },
      }),
      0,
    )
  } finally {
    await ctx.db.$executeRawUnsafe(
      `DROP TRIGGER test_reject_booking_audit ON "AuditEvent"`,
    )
    await ctx.db.$executeRawUnsafe(`DROP FUNCTION test_reject_booking_audit()`)
  }
})
