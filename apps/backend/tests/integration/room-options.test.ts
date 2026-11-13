import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { FindRoomOptions } from '../../src/application/use-cases/find-room-options'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { createBookingFixture } from '../support/m1-bookings'

let f: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  f = await createBookingFixture()
})
after(async () => {
  if (f) await f.close()
})
const query = (
  offset: number,
  extra: Record<string, string | number> = {},
) => ({
  professionalId: f.professionalIds[0],
  specialtyId: f.specialtyId,
  visitType: 'first',
  startsAt: f.at(offset),
  ...extra,
})
const read = (
  params: Record<string, string | number>,
  token = f.reception.token,
) =>
  request(f.app)
    .get('/v1/appointments/room-options')
    .query(params)
    .set('Authorization', token)
test('BE-021/P-45: sugere sala livre sem reservar; troca explícita e ocupação são revalidadas', async () => {
  const before = await f.db.slotReservation.count(),
    result = await read(query(0)).expect(200)
  assert.equal(result.headers['cache-control'], 'no-store')
  assert.equal(result.body.items.length, 2)
  assert.equal(result.body.suggestedRoomId, result.body.items[0].id)
  assert.equal(await f.db.slotReservation.count(), before)
  assert.equal(
    new Date(result.body.endsAt).getTime() -
      new Date(result.body.startsAt).getTime(),
    60 * 60_000,
  )
  await f.db.room.create({ data: { name: 'Inativa fictícia', active: false } })
  const p = await f.patient(),
    chosen = result.body.items[1].id
  await f.book(p, 0, { roomId: chosen }, f.reception.token)
  const occupied = (await read(query(0)).expect(200)).body
  assert.deepEqual(occupied.items, [])
  assert.equal(occupied.suggestedRoomId, null)
  const other = (
    await read(query(0, { professionalId: f.professionalIds[1] })).expect(200)
  ).body
  assert.equal(other.items.length, 1)
  assert.notEqual(other.items[0].id, chosen)
  assert.deepEqual(Object.keys(other.items[0]).sort(), ['id', 'name'])
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: { action: 'appointment.room_options_read' },
    }),
  )
})
test('BE-021/P-45: remarcação exclui só a reserva validada e versão incorreta não amplia a lista', async () => {
  const p = await f.patient(),
    a = await f.book(p, 1)
  const options = (
    await read(query(1, { appointmentId: a.id, expectedVersion: 1 })).expect(
      200,
    )
  ).body
  assert.equal(options.items.length, 2)
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: {
        action: 'appointment.room_options_read',
        subjectPatientId: p.patientId,
        resourceId: a.id,
      },
    }),
  )
  await read(query(1, { appointmentId: a.id, expectedVersion: 9 })).expect(409)
  await read(
    query(1, { appointmentId: randomUUID(), expectedVersion: 1 }),
  ).expect(404)
  await read(query(1, { appointmentId: a.id })).expect(400)
  await read(query(1, { expectedVersion: 1 })).expect(400)
  await read(
    query(1, { appointmentId: a.id, expectedVersion: 1, visitType: 'return' }),
  ).expect(400)
  // Profissional ocupado por outro atendimento não é liberado pelo ID original.
  const another = await f.patient()
  await f.book(another, 1, {
    professionalId: f.professionalIds[1],
    startsAt: f.at(1),
  })
  assert.deepEqual(
    (
      await read(
        query(1, {
          appointmentId: a.id,
          expectedVersion: 1,
          professionalId: f.professionalIds[1],
        }),
      ).expect(200)
    ).body.items,
    [],
  )
})
test('BE-021/P-45: hold vigente bloqueia, expirado aparece livre sem alterar seu estado e bordas são semiabertas', async () => {
  const rooms = await f.db.room.findMany({
    where: { active: true },
    orderBy: { id: 'asc' },
  })
  const startsAt = new Date(f.at(2)),
    endsAt = new Date(startsAt.getTime() + 3_600_000)
  const hold = await f.db.slotReservation.create({
    data: {
      professionalId: f.professionalIds[0],
      roomId: rooms[0].id,
      modality: 'onsite',
      startsAt,
      endsAt,
      state: 'held',
      expiresAt: new Date(Date.now() + 60_000),
      requestKey: randomUUID(),
      requestHash: randomUUID(),
    },
  })
  assert.deepEqual((await read(query(2)).expect(200)).body.items, [])
  const other = (
    await read(query(2, { professionalId: f.professionalIds[1] })).expect(200)
  ).body
  assert.equal(other.items.length, 1)
  const expiredClock = new FindRoomOptions(
    f.store,
    new PrismaAuditWriter(f.db),
    f.config.clinicTimeZone,
    () => new Date(Date.now() + 120_000),
  )
  const expired = await expiredClock.execute(
    f.principal(f.reception, 'receptionist'),
    {
      professionalId: f.professionalIds[0],
      specialtyId: f.specialtyId,
      visitType: 'first',
      startsAt: f.at(2),
    },
    { requestId: randomUUID(), actorRoles: [], authorizationBasis: 'test' },
  )
  assert.equal(expired.items.length, 2)
  assert.equal(
    (await f.db.slotReservation.findUniqueOrThrow({ where: { id: hold.id } }))
      .state,
    'held',
  )
  const next = (
    await read(query(2, { startsAt: f.at(2, '09:00') })).expect(200)
  ).body
  assert.equal(next.items.length, 2)
})
test('BE-021/P-45: papéis, MFA, grade e OpenAPI respeitam o contrato sem ocupantes', async () => {
  const patient = await f.patient(),
    manager = await f.account('manager')
  for (const token of [
    patient.token,
    f.professionalAccounts[0].token,
    manager.token,
  ])
    await read(query(3), token).expect(403)
  const internal = await f.account('receptionist')
  await f.db.session.update({
    where: { id: internal.session.id },
    data: { mfaVerifiedAt: null },
  })
  await read(query(3), internal.token).expect(401)
  await read(query(3), f.admin.token).expect(200)
  await read(query(3, { startsAt: f.at(3, '12:30') })).expect(409)
  await read(query(3, { modality: 'remote' })).expect(400)
  const doc = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(doc.paths['/appointments/room-options'].get)
})

test('BE-024/P-49: salas de encaixe respeitam permissão, fora da grade e exclusão de campos extras', async () => {
  const manager = await f.account('manager'),
    patient = await f.patient()
  const params = query(30, { startsAt: f.at(30, '12:30') })
  const fitOptions = (
    token: string,
    extra: Record<string, string | number> = {},
  ) =>
    request(f.app)
      .get('/v1/appointments/fit-ins/room-options')
      .query({ ...params, ...extra })
      .set('Authorization', token)
  await read(params, f.reception.token).expect(409)
  for (const token of [f.reception.token, manager.token]) {
    const options = (await fitOptions(token).expect(200)).body
    assert.equal(options.items.length, 2)
    assert.equal(options.suggestedRoomId, options.items[0].id)
  }
  for (const token of [
    patient.token,
    f.admin.token,
    f.professionalAccounts[0].token,
  ])
    await fitOptions(token).expect(403)
  await fitOptions(manager.token, { appointmentId: randomUUID() }).expect(400)
  await fitOptions(manager.token, { startsAt: f.at(30, '08:00') }).expect(400)
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: {
        action: 'appointment.fit_in_room_options_read',
        actorUserId: manager.user.id,
      },
    }),
  )
  const doc = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(doc.paths['/appointments/fit-ins/room-options'].get)
})

test('BE-024/P-49: sugestão de encaixe não cria reserva e confirmação concorrente continua recusada', async () => {
  const manager = await f.account('manager'),
    patient = await f.patient(),
    params = query(31, { startsAt: f.at(31, '12:30') })
  const count = await f.db.slotReservation.count()
  await request(f.app)
    .get('/v1/appointments/fit-ins/room-options')
    .query(params)
    .set('Authorization', manager.token)
    .expect(200)
  assert.equal(await f.db.slotReservation.count(), count)
  const input = {
    ...params,
    patientId: patient.patientId,
    modality: 'onsite',
    reason: 'Encaixe fictício justificado',
  }
  await request(f.app)
    .post('/v1/appointments/fit-ins')
    .set('Authorization', manager.token)
    .set('Idempotency-Key', randomUUID())
    .send(input)
    .expect(201)
  const options = (
    await request(f.app)
      .get('/v1/appointments/fit-ins/room-options')
      .query(params)
      .set('Authorization', manager.token)
      .expect(200)
  ).body
  assert.deepEqual(options.items, [])
  const collision = await request(f.app)
    .post('/v1/appointments/fit-ins')
    .set('Authorization', f.reception.token)
    .set('Idempotency-Key', randomUUID())
    .send({ ...input, confirmDuplicateSpecialty: true })
    .expect(409)
  assert.equal(collision.body.error.code, 'SLOT_UNAVAILABLE')
  assert.equal(await f.db.slotReservation.count(), count + 1)
})

test('BE-024/P-50: gestor identifica apenas nome/ID para encaixe sem acesso ao cadastro presencial', async () => {
  const p = await f.patient(),
    manager = await f.account('manager'),
    cpf = (
      await f.db.patientProfile.findUniqueOrThrow({
        where: { id: p.patientId },
      })
    ).cpf
  for (const token of [manager.token, f.reception.token]) {
    const response = await request(f.app)
      .get('/v1/patients/fit-in-candidate')
      .query({ cpf })
      .set('Authorization', token)
      .expect(200)
    assert.deepEqual(Object.keys(response.body).sort(), [
      'fullName',
      'patientId',
    ])
    assert.equal(response.body.patientId, p.patientId)
    assert.equal(response.headers['cache-control'], 'no-store')
  }
  await request(f.app)
    .get('/v1/onsite-patients')
    .query({ cpf })
    .set('Authorization', manager.token)
    .expect(403)
  for (const token of [p.token, f.admin.token, f.professionalAccounts[0].token])
    await request(f.app)
      .get('/v1/patients/fit-in-candidate')
      .query({ cpf })
      .set('Authorization', token)
      .expect(403)
  await request(f.app)
    .get('/v1/patients/fit-in-candidate')
    .query({ cpf: '11111111111' })
    .set('Authorization', manager.token)
    .expect(400)
  const event = await f.db.auditEvent.findFirstOrThrow({
    where: { action: 'patient.fit_in_lookup', subjectPatientId: p.patientId },
  })
  assert.ok(!JSON.stringify(event.metadataSafe).includes(cpf))
})
