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

test('BE-018/P-36: editor preserva faixas/bloqueios fora da janela num round-trip versionado', async () => {
  const id = f.professionalIds[0],
    path = `/v1/professionals/${id}/schedule`
  const current = (
    await request(f.app)
      .get(`${path}/editor`)
      .set('Authorization', f.admin.token)
      .expect(200)
  ).body
  const outside = {
    weekday: 1,
    localStart: '19:00',
    localEnd: '20:00',
    effectiveFrom: '2030-01-01',
    effectiveTo: '2030-12-31',
    modality: 'onsite',
  }
  const block = {
    startsAt: '2030-01-07T22:00:00.000Z',
    endsAt: '2030-01-07T23:00:00.000Z',
    kind: 'vacation',
    reason: 'Férias de demonstração',
  }
  await request(f.app)
    .put(path)
    .set('Authorization', f.admin.token)
    .send({
      expectedVersion: current.version,
      rules: [...current.rules, outside],
      blocks: [...current.blocks, block],
    })
    .expect(200)
  const filtered = (
    await request(f.app)
      .get(path)
      .query({ from: f.day.toString(), to: f.day.add({ days: 1 }).toString() })
      .set('Authorization', f.reception.token)
      .expect(200)
  ).body
  assert.ok(
    !filtered.rules.some(
      (r: { effectiveFrom: string }) => r.effectiveFrom === '2030-01-01',
    ),
  )
  assert.ok(
    !filtered.blocks.some(
      (b: { startsAt: string }) => b.startsAt === block.startsAt,
    ),
  )
  const full = await request(f.app)
    .get(`${path}/editor`)
    .set('Authorization', f.professionalAccounts[0].token)
    .expect(200)
  assert.equal(full.headers['cache-control'], 'no-store')
  assert.ok(
    full.body.rules.some(
      (r: { effectiveFrom: string }) => r.effectiveFrom === '2030-01-01',
    ),
  )
  assert.ok(
    full.body.blocks.some(
      (b: { startsAt: string }) => b.startsAt === block.startsAt,
    ),
  )
  const input = {
    expectedVersion: full.body.version,
    rules: full.body.rules,
    blocks: full.body.blocks,
  }
  await request(f.app)
    .put(path)
    .set('Authorization', f.professionalAccounts[0].token)
    .send(input)
    .expect(200)
  const after = (
    await request(f.app)
      .get(`${path}/editor`)
      .set('Authorization', f.reception.token)
      .expect(200)
  ).body
  assert.equal(after.version, full.body.version + 1)
  assert.deepEqual(after.rules, full.body.rules)
  assert.deepEqual(after.blocks, full.body.blocks)
  await request(f.app)
    .put(path)
    .set('Authorization', f.admin.token)
    .send(input)
    .expect(409)
  assert.ok(
    await f.db.auditEvent.count({
      where: { action: 'schedule.editor_viewed', resourceId: id },
    }),
  )
})

test('BE-018/P-36: leitura completa mantém RBAC/IDOR e não publica versão na leitura', async () => {
  const p = await f.patient(),
    path = `/v1/professionals/${f.professionalIds[0]}/schedule/editor`,
    count = await f.db.scheduleVersion.count()
  await request(f.app).get(path).expect(401)
  await request(f.app).get(path).set('Authorization', p.token).expect(403)
  await request(f.app)
    .get(path)
    .set('Authorization', f.professionalAccounts[1].token)
    .expect(403)
  await request(f.app)
    .get(path)
    .set('Authorization', f.reception.token)
    .expect(200)
  const manager = await f.account('manager')
  await request(f.app).get(path).set('Authorization', manager.token).expect(200)
  await request(f.app)
    .get(`/v1/professionals/${randomUUID()}/schedule/editor`)
    .set('Authorization', manager.token)
    .expect(404)
  assert.equal(await f.db.scheduleVersion.count(), count)
  assert.ok(
    await f.db.auditEvent.count({
      where: {
        action: 'authorization.denied',
        resourceId: f.professionalIds[0],
        actorUserId: f.professionalAccounts[1].user.id,
      },
    }),
  )
})

test('BE-018/P-36: perfil próprio é resolvido pela sessão com projeção mínima e permissões atuais', async () => {
  const path = '/v1/professionals/me/profile',
    user = f.professionalAccounts[0]
  const r = await request(f.app)
    .get(path)
    .set('Authorization', user.token)
    .expect(200)
  assert.equal(r.headers['cache-control'], 'no-store')
  assert.deepEqual(Object.keys(r.body).sort(), [
    'displayName',
    'id',
    'modalities',
  ])
  assert.equal(r.body.id, f.professionalIds[0])
  for (const token of [f.admin.token, f.reception.token])
    await request(f.app).get(path).set('Authorization', token).expect(403)
  const manager = await f.account('manager')
  await request(f.app).get(path).set('Authorization', manager.token).expect(403)
  const withoutProfile = await f.account('professional')
  await request(f.app)
    .get(path)
    .set('Authorization', withoutProfile.token)
    .expect(404)
  await f.db.professionalProfile.update({
    where: { id: f.professionalIds[0] },
    data: { active: false },
  })
  try {
    await request(f.app).get(path).set('Authorization', user.token).expect(404)
  } finally {
    await f.db.professionalProfile.update({
      where: { id: f.professionalIds[0] },
      data: { active: true },
    })
  }
  await f.db.session.update({
    where: { id: user.session.id },
    data: { mfaVerifiedAt: null },
  })
  try {
    await request(f.app).get(path).set('Authorization', user.token).expect(401)
  } finally {
    await f.db.session.update({
      where: { id: user.session.id },
      data: { mfaVerifiedAt: new Date() },
    })
  }
  await f.db.userRoleAssignment.updateMany({
    where: { userId: user.user.id, roleCode: 'professional', revokedAt: null },
    data: { revokedAt: new Date() },
  })
  await request(f.app).get(path).set('Authorization', user.token).expect(403)
  assert.ok(
    await f.db.auditEvent.count({
      where: {
        action: 'professional.profile_viewed',
        resourceId: f.professionalIds[0],
      },
    }),
  )
})

test('BE-018/P-36: perfil ativo sem grade começa na versão zero e rotas aparecem no OpenAPI', async () => {
  const account = await f.account('professional'),
    profile = await f.db.professionalProfile.create({
      data: {
        userId: account.user.id,
        councilType: 'CRM',
        councilRegion: 'CE',
        councilNumber: `T${Date.now()}`,
        modalities: ['onsite'],
        specialties: { create: { specialtyId: f.specialtyId } },
      },
    })
  const r = (
    await request(f.app)
      .get(`/v1/professionals/${profile.id}/schedule/editor`)
      .set('Authorization', account.token)
      .expect(200)
  ).body
  assert.equal(r.version, 0)
  assert.equal(r.clinicTimeZone, f.config.clinicTimeZone)
  assert.deepEqual(r.rules, [])
  assert.deepEqual(r.blocks, [])
  const document = (await request(f.app).get('/v1/openapi.json').expect(200))
    .body
  assert.ok(document.paths['/professionals/{id}/schedule/editor'])
  assert.ok(document.paths['/professionals/me/profile'])
})
