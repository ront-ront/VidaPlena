import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { createBookingFixture } from '../support/m1-bookings'

let f: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  f = await createBookingFixture()
})
after(async () => {
  if (f) await f.close()
})
test('BE-021/P-39: confirmação e replay retornam nomes administrativos sem ampliar catálogo ao paciente', async () => {
  const p = await f.patient(),
    key = randomUUID(),
    body = {
      patientId: p.patientId,
      professionalId: f.professionalIds[0],
      specialtyId: f.specialtyId,
      modality: 'onsite',
      visitType: 'first',
      startsAt: f.at(0),
    }
  const send = () =>
    request(f.app)
      .post('/v1/appointments')
      .set('Authorization', p.token)
      .set('Idempotency-Key', key)
      .send(body)
  const response = (await send().expect(201)).body.appointment
  assert.equal(
    response.professionalName,
    f.professionalAccounts[0].user.fullName,
  )
  assert.equal(response.specialtyName, 'Especialidade Fictícia')
  assert.ok(['Sala 1', 'Sala 2'].includes(response.roomName))
  assert.equal(
    (await send().expect(201)).body.appointment.roomName,
    response.roomName,
  )
  await request(f.app)
    .get('/v1/rooms')
    .set('Authorization', p.token)
    .expect(403)
  const own = (
    await request(f.app)
      .get('/v1/me/appointments')
      .set('Authorization', p.token)
      .expect(200)
  ).body.items
  assert.equal(own[0].roomName, response.roomName)
  assert.equal(own[0].professionalName, response.professionalName)
  assert.equal(own[0].specialtyName, response.specialtyName)
  assert.ok(!JSON.stringify(own).includes('council'))
  assert.ok(!JSON.stringify(own).includes(f.professionalAccounts[0].user.email))
  const other = await f.patient()
  assert.equal(
    (
      await request(f.app)
        .get('/v1/me/appointments')
        .set('Authorization', other.token)
        .expect(200)
    ).body.items.length,
    0,
  )
})
test('BE-021/P-39: remoto não possui sala e leitura permanece consistente após rótulo de catálogo mudar', async () => {
  const p = await f.patient(),
    a = await f.book(p, 1, { modality: 'remote', startsAt: f.at(1, '13:00') })
  assert.equal(a.roomId, null)
  assert.equal(a.roomName, null)
  await f.db.specialty.update({
    where: { id: f.specialtyId },
    data: { name: 'Nome administrativo atualizado' },
  })
  const own = (
    await request(f.app)
      .get('/v1/me/appointments')
      .set('Authorization', p.token)
      .expect(200)
  ).body.items[0]
  assert.equal(own.specialtyName, 'Nome administrativo atualizado')
  assert.equal(own.specialtyId, a.specialtyId)
  assert.equal(own.durationMinutes, a.durationMinutes)
  assert.equal(own.specialtyVersion, a.specialtyVersion)
  assert.equal(own.roomName, null)
})
