import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { ListMyAppointments } from '../../src/application/use-cases/list-my-appointments'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { myAppointmentsResponse } from '../../src/shared/infra/http/contracts/appointments'
import { createBookingFixture } from '../support/m1-bookings'

let f: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  f = await createBookingFixture()
})
after(async () => {
  if (f) await f.close()
})
test('BE-022/P-41: política reflete limite exato RN-004 sem cópia da regra no cliente', async () => {
  const p = await f.patient(),
    a = await f.book(p, 0)
  const deadline = new Date(new Date(a.startsAt).getTime() - 4 * 3_600_000)
  for (const delta of [0, 1]) {
    const now = new Date(deadline.getTime() + delta)
    const service = new ListMyAppointments(
      f.store,
      f.config.clinicTimeZone,
      new PrismaAuditWriter(f.db),
      () => now,
    )
    const result = await service.execute(
      f.principal(p, 'patient'),
      {},
      { requestId: randomUUID(), actorRoles: [], authorizationBasis: 'test' },
    )
    assert.equal(result.clinicTimeZone, f.config.clinicTimeZone)
    assert.equal(result.serverNow, now.toISOString())
    assert.deepEqual(result.items[0].selfService, {
      deadline: deadline.toISOString(),
      rescheduleAllowed: delta === 0,
      cancelAllowed: delta === 0,
    })
    assert.equal(result.items[0].lastChange, null)
  }
})
test('BE-022/P-41: última origem é administrativa, cancelamento desabilita ações e sujeito alheio é negado', async () => {
  const p = await f.patient(),
    a = await f.book(p, 1)
  await request(f.app)
    .post(`/v1/appointments/${a.id}/reschedule`)
    .set('Authorization', f.reception.token)
    .set('Idempotency-Key', randomUUID())
    .send({
      startsAt: f.at(2),
      expectedVersion: 1,
      origin: 'clinic',
      reason: 'Motivo privado não expor',
    })
    .expect(200)
  const list = () =>
    request(f.app)
      .get('/v1/me/appointments')
      .set('Authorization', p.token)
      .expect(200)
  const moved = (await list()).body
  myAppointmentsResponse.parse(moved)
  assert.equal(moved.items[0].lastChange.origin, 'clinic')
  assert.equal(moved.items[0].lastChange.action, 'rescheduled')
  const safe = JSON.stringify(moved)
  for (const text of ['Motivo privado', 'actorUserId', 'previous', 'next:'])
    assert.ok(!safe.includes(text))
  await request(f.app)
    .post(`/v1/appointments/${a.id}/cancel`)
    .set('Authorization', p.token)
    .set('Idempotency-Key', randomUUID())
    .send({ expectedVersion: 2, origin: 'patient' })
    .expect(200)
  const cancelled = (await list()).body.items[0]
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.lastChange.action, 'cancelled')
  assert.equal(cancelled.lastChange.origin, 'patient')
  assert.equal(cancelled.selfService.cancelAllowed, false)
  assert.equal(cancelled.selfService.rescheduleAllowed, false)
  const other = await f.patient()
  await request(f.app)
    .get(`/v1/me/appointments?patientId=${p.patientId}`)
    .set('Authorization', other.token)
    .expect(404)
})

test('BE-022/P-41: filtro de visão inclui cancelada futura no histórico antes de paginar', async () => {
  const p = await f.patient(),
    active = await f.book(p, 3),
    cancelled = await f.book(p, 4, { confirmDuplicateSpecialty: true })
  await request(f.app)
    .post(`/v1/appointments/${cancelled.id}/cancel`)
    .set('Authorization', p.token)
    .set('Idempotency-Key', randomUUID())
    .send({ expectedVersion: 1, origin: 'patient' })
    .expect(200)
  for (const view of ['upcoming', 'history']) {
    const result = (
      await request(f.app)
        .get(`/v1/me/appointments?view=${view}`)
        .set('Authorization', p.token)
        .expect(200)
    ).body
    assert.deepEqual(
      result.items.map((item: { id: string }) => item.id),
      [view === 'upcoming' ? active.id : cancelled.id],
    )
  }
  await request(f.app)
    .get('/v1/me/appointments?view=all')
    .set('Authorization', p.token)
    .expect(400)
})
