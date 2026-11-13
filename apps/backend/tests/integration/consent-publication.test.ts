import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { createM1Database } from '../support/m1-database'

let f: Awaited<ReturnType<typeof createM1Database>>
let app: Awaited<ReturnType<typeof composeBackendApplication>>
let admin: Awaited<ReturnType<typeof f.account>>

before(async () => {
  f = await createM1Database()
  app = await composeBackendApplication(f.config)
  admin = await f.account('admin')
})
after(async () => {
  if (app) await app.close()
  if (f) await f.close()
})

test('BE-011/P-52: primeiro termo usa relógio do servidor, fica vigente e gera auditoria', async () => {
  await request(app.app)
    .get('/v1/consent-documents/current?kind=data')
    .expect(404)
  const before = Date.now()
  const published = await request(app.app)
    .post('/v1/admin/consent-documents')
    .set('Authorization', admin.token)
    .send({
      kind: 'data',
      version: 'primeiro',
      bodyReference: 'Termo fictício para teste de publicação.',
    })
    .expect(201)
  assert.ok(Date.parse(published.body.effectiveAt) >= before)
  assert.ok(Date.parse(published.body.effectiveAt) <= Date.now())
  const current = await request(app.app)
    .get('/v1/consent-documents/current?kind=data')
    .expect(200)
  assert.deepEqual(current.body, {
    id: published.body.id,
    version: 'primeiro',
    body: 'Termo fictício para teste de publicação.',
    effectiveAt: published.body.effectiveAt,
  })
  assert.equal(current.headers['cache-control'], 'no-store')
  assert.equal(
    await f.db.auditEvent.count({
      where: {
        actorUserId: admin.user.id,
        action: 'consent.document_published',
        resourceId: published.body.id,
      },
    }),
    1,
  )
  await assert.rejects(
    f.db.consentDocumentVersion.update({
      where: { id: published.body.id },
      data: { bodyReference: 'Alteração proibida' },
    }),
  )
  await assert.rejects(
    f.db.consentDocumentVersion.delete({ where: { id: published.body.id } }),
  )
})

test('BE-011/P-52: publicação exige admin/MFA e entrada válida, sem writes em falhas', async () => {
  const input = {
    kind: 'data',
    version: 'negado',
    bodyReference: 'Texto de teste',
  }
  const count = await f.db.consentDocumentVersion.count()
  await request(app.app)
    .post('/v1/admin/consent-documents')
    .send(input)
    .expect(401)
  for (const role of [
    'patient',
    'receptionist',
    'professional',
    'manager',
  ] as const) {
    const actor = await f.account(role)
    await request(app.app)
      .post('/v1/admin/consent-documents')
      .set('Authorization', actor.token)
      .send(input)
      .expect(403)
  }
  const noMfa = await f.account('admin')
  await f.db.session.update({
    where: { id: noMfa.session.id },
    data: { mfaVerifiedAt: null },
  })
  await request(app.app)
    .post('/v1/admin/consent-documents')
    .set('Authorization', noMfa.token)
    .send(input)
    .expect(401)
  for (const invalid of [
    { version: ' ' },
    { version: 'v'.repeat(51) },
    { bodyReference: ' ' },
    { bodyReference: 'x'.repeat(200001) },
    { effectiveAt: 'inválido' },
    { effectiveAt: null },
  ]) {
    await request(app.app)
      .post('/v1/admin/consent-documents')
      .set('Authorization', admin.token)
      .send({ ...input, ...invalid })
      .expect(400)
  }
  assert.equal(await f.db.consentDocumentVersion.count(), count)
})

test('BE-011/P-52: vigência explícita continua compatível e duplicidade não sobrescreve versão', async () => {
  const current = await request(app.app)
    .get('/v1/consent-documents/current?kind=data')
    .expect(200)
  const future = new Date(Date.now() + 3600000).toISOString()
  const input = {
    kind: 'data',
    version: 'futuro',
    bodyReference: 'Texto futuro de teste',
    effectiveAt: future,
  }
  const published = await request(app.app)
    .post('/v1/admin/consent-documents')
    .set('Authorization', admin.token)
    .send(input)
    .expect(201)
  assert.equal(published.body.effectiveAt, future)
  const unchanged = await request(app.app)
    .get('/v1/consent-documents/current?kind=data')
    .expect(200)
  assert.equal(unchanged.body.id, current.body.id)
  await request(app.app)
    .post('/v1/admin/consent-documents')
    .set('Authorization', admin.token)
    .send(input)
    .expect(409)
  await request(app.app)
    .post('/v1/admin/consent-documents')
    .set('Authorization', admin.token)
    .send({
      ...input,
      version: 'vigencia-conflitante',
      effectiveAt: current.body.effectiveAt,
    })
    .expect(409)
  assert.equal(await f.db.consentDocumentVersion.count(), 2)
  const doc = (await request(app.app).get('/v1/openapi.json').expect(200)).body
  const schema =
    doc.paths['/admin/consent-documents'].post.requestBody.content[
      'application/json'
    ].schema
  assert.ok(schema.required.includes('version'))
  assert.ok(!schema.required.includes('effectiveAt'))
})
