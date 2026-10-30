import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { JwtAccessTokens } from '../../src/infrastructure/security/access-tokens'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { loadConfig } from '../../src/shared/config/environment'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use TEST_DATABASE_URL de um banco isolado _test.')
const control = createPrismaClient(url)
const databaseName = `vp_${randomUUID().replaceAll('-', '')}_test`
const isolated = new URL(url)
isolated.pathname = `/${databaseName}`
const config = loadConfig({
  APP_ENV: 'test',
  DATABASE_URL: isolated.toString(),
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: randomBytes(32).toString('hex'),
  FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
})
const db = createPrismaClient(config.databaseUrl)
let created = false
before(async () => {
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  await new Promise<void>((resolve, reject) => {
    const child = spawn('yarn', ['prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: config.databaseUrl },
      stdio: 'pipe',
    })
    child.stdout.resume()
    child.stderr.resume()
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Migration de teste falhou.')),
    )
  })
})
after(async () => {
  await db.$disconnect()
  if (created)
    await control.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
  await control.$disconnect()
})

test('readiness e endpoint de métricas exigem dependência e admin MFA', async () => {
  const runtime = await composeBackendApplication(config)
  try {
    const ready = await request(runtime.app).get('/health/ready').expect(200)
    assert.equal(ready.body.status, 'ready')
    const admin = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        fullName: 'Admin de Operação',
        status: 'active',
        roles: { create: { roleCode: 'admin' } },
      },
    })
    const session = await db.session.create({
      data: {
        userId: admin.id,
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
        mfaVerifiedAt: new Date(),
      },
    })
    const token = await new JwtAccessTokens(config.jwtSecret).issue(
      { userId: admin.id, sessionId: session.id },
      new Date(Date.now() + 600_000),
    )
    await request(runtime.app).get('/v1/admin/ops/metrics').expect(401)
    const metrics = await request(runtime.app)
      .get('/v1/admin/ops/metrics')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    assert.match(metrics.text, /vidaplena_readiness 1/)
    assert.match(metrics.text, /vidaplena_http_requests_total/)
    assert.match(metrics.text, /vidaplena_notification_backlog 0/)
    assert.match(metrics.headers['content-type'], /text\/plain/)
    assert.equal(metrics.text.includes(admin.email), false)
    const today = new Date()
    const firstStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 15, 1),
    )
    const firstEnd = new Date(firstStart.getTime() + 3_600_000)
    const nextStart = new Date(firstEnd.getTime() + 3_600_000)
    const nextEnd = new Date(nextStart.getTime() + 3_600_000)
    const noticeReference = 'aviso-clinica-2026-001'
    await request(runtime.app)
      .post('/v1/admin/ops/maintenance-windows')
      .send({
        startsAt: firstStart.toISOString(),
        endsAt: firstEnd.toISOString(),
        noticeReference,
      })
      .expect(401)
    const registered = await request(runtime.app)
      .post('/v1/admin/ops/maintenance-windows')
      .set('Authorization', `Bearer ${token}`)
      .send({
        startsAt: firstStart.toISOString(),
        endsAt: firstEnd.toISOString(),
        noticeReference,
      })
      .expect(201)
    assert.equal(registered.body.noticeReference, noticeReference)
    await request(runtime.app)
      .post('/v1/admin/ops/maintenance-windows')
      .set('Authorization', `Bearer ${token}`)
      .send({
        startsAt: firstStart.toISOString(),
        endsAt: firstEnd.toISOString(),
        noticeReference,
      })
      .expect(409)
    await request(runtime.app)
      .post('/v1/admin/ops/maintenance-windows')
      .set('Authorization', `Bearer ${token}`)
      .send({
        startsAt: nextStart.toISOString(),
        endsAt: nextEnd.toISOString(),
        noticeReference,
      })
      .expect(201)
    await request(runtime.app)
      .post('/v1/admin/ops/maintenance-windows')
      .set('Authorization', `Bearer ${token}`)
      .send({
        startsAt: new Date(nextEnd.getTime() + 3_600_000).toISOString(),
        endsAt: new Date(nextEnd.getTime() + 5_400_000).toISOString(),
        noticeReference,
      })
      .expect(409)
    await request(runtime.app)
      .post('/v1/admin/ops/maintenance-windows')
      .set('Authorization', `Bearer ${token}`)
      .send({
        startsAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 25 * 3_600_000).toISOString(),
        noticeReference,
      })
      .expect(409)
    const windows = await request(runtime.app)
      .get('/v1/admin/ops/maintenance-windows')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    assert.equal(windows.body.items.length, 2)
    assert.ok(
      await db.auditEvent.findFirst({
        where: {
          action: 'ops.maintenance_registered',
          resourceId: registered.body.id,
        },
      }),
    )
  } finally {
    await runtime.close()
  }
})
