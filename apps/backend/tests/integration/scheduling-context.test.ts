import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { clinicDate } from '../../src/domain/rules/arrival'
import { schedulingContextResponse } from '../../src/shared/infra/http/contracts/availability'
import { createBookingFixture } from '../support/m1-bookings'

let f: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  f = await createBookingFixture()
})
after(async () => {
  if (f) await f.close()
})
test('BE-019/P-48: contexto temporal autenticado para os cinco perfis sem agenda nem política', async () => {
  const patient = await f.patient(),
    manager = await f.account('manager')
  for (const token of [
    patient.token,
    manager.token,
    f.admin.token,
    f.reception.token,
    f.professionalAccounts[0].token,
  ]) {
    const response = await request(f.app)
      .get('/v1/scheduling/context')
      .set('Authorization', token)
      .expect(200)
    const parsed = schedulingContextResponse.parse(response.body)
    assert.deepEqual(Object.keys(response.body).sort(), [
      'clinicTimeZone',
      'localDate',
      'serverNow',
    ])
    assert.equal(parsed.clinicTimeZone, f.config.clinicTimeZone)
    assert.equal(
      parsed.localDate,
      clinicDate(new Date(parsed.serverNow), f.config.clinicTimeZone),
    )
    assert.equal(response.headers['cache-control'], 'no-store')
  }
  await request(f.app).get('/v1/scheduling/context').expect(401)
  const user = await f.account('manager')
  await f.db.session.update({
    where: { id: user.session.id },
    data: { mfaVerifiedAt: null },
  })
  await request(f.app)
    .get('/v1/scheduling/context')
    .set('Authorization', user.token)
    .expect(401)
  const doc = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(doc.paths['/scheduling/context'].get)
})
