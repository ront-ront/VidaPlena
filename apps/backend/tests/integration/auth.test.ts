import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { Secret, TOTP } from 'otpauth'
import request from 'supertest'
import { Authenticate } from '../../src/application/use-cases/authenticate'
import { PrismaAccessStore } from '../../src/infrastructure/persistence/prisma/access-store'
import { PrismaAuthStore } from '../../src/infrastructure/persistence/prisma/auth-store'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { JwtAccessTokens } from '../../src/infrastructure/security/access-tokens'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { AuthenticatorTotp } from '../../src/infrastructure/security/totp'
import { composeProvisioning } from '../../src/shared/composition/provisioning'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { loadConfig } from '../../src/shared/config/environment'

const base = process.env.TEST_DATABASE_URL
if (!base || !new URL(base).pathname.endsWith('_test'))
  throw new Error('Use TEST_DATABASE_URL de um banco isolado _test.')
const control = createPrismaClient(base)
const databaseName = `vp_${randomUUID().replaceAll('-', '')}_test`
const url = new URL(base)
url.pathname = `/${databaseName}`
const config = loadConfig({
  APP_ENV: 'test',
  DATABASE_URL: url.toString(),
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: randomBytes(32).toString('hex'),
  FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  AUTH_BCRYPT_ROUNDS: '10',
})
const db = createPrismaClient(config.databaseUrl)
const provisioning = composeProvisioning(config, db)
const store = new PrismaAuthStore(db)
const access = new PrismaAccessStore(db)
const jwt = new JwtAccessTokens(config.jwtSecret)
let time = new Date()
const now = () => time
let auth: Authenticate
let seedPassword = ''
let mfaSecret = ''
const context = () => ({
  actorRoles: [],
  requestId: randomUUID(),
  authorizationBasis: 'test',
})
let created = false
before(async () => {
  auth = new Authenticate(
    store,
    provisioning.passwords,
    provisioning.tokens,
    jwt,
    new AuthenticatorTotp(),
    new AesSecretBox(config.encryptionKey, 'mfa'),
    {
      accessMinutes: config.accessTokenMinutes,
      refreshDays: config.refreshTokenDays,
      internalIdleMinutes: config.internalIdleMinutes,
      patientIdleMinutes: config.patientIdleMinutes,
      failedLimit: config.failedLoginLimit,
      lockMinutes: config.lockMinutes,
      challengeMinutes: config.mfaChallengeMinutes,
    },
    await provisioning.passwords.hash('dummy-password-for-testing'),
    now,
  )
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

test('MFA TOTP, refresh rotativo e reuse revogam a sessão; inatividade invalida o principal', async () => {
  const password = `Seed-${randomUUID()}`
  seedPassword = password
  const seeded = await provisioning.service.seed(
    { email: 'admin-auth@example.test', fullName: 'Admin fictício', password },
    context(),
  )
  const challenge = await auth.login(
    'admin-auth@example.test',
    password,
    context(),
  )
  assert.equal(challenge.status, 'mfa_required')
  if (challenge.status !== 'mfa_required') return
  const enrollment = await auth.enroll(challenge.challengeId, context())
  mfaSecret = enrollment.secret
  const totp = new TOTP({
    issuer: 'VidaPlena',
    label: 'Teste',
    secret: Secret.fromBase32(enrollment.secret),
    digits: 6,
    period: 30,
  })
  const code = totp.generate({ timestamp: time.getTime() })
  const signedIn = await auth.verifyMfa(challenge.challengeId, code, context())
  assert.equal(signedIn.status, 'authenticated')
  assert.ok(await jwt.verify(signedIn.accessToken))
  const proof = await jwt.verify(signedIn.accessToken)
  assert.ok(proof)
  assert.ok(await access.principal(proof.userId, proof.sessionId))
  await assert.rejects(auth.verifyMfa(challenge.challengeId, code, context()), {
    code: 'UNAUTHENTICATED',
  })
  const rotated = await auth.refresh(
    signedIn.refreshToken,
    signedIn.csrfToken,
    context(),
  )
  assert.notEqual(rotated.refreshToken, signedIn.refreshToken)
  await assert.rejects(
    auth.refresh(signedIn.refreshToken, signedIn.csrfToken, context()),
    { code: 'UNAUTHENTICATED' },
  )
  await assert.rejects(
    auth.refresh(rotated.refreshToken, rotated.csrfToken, context()),
    { code: 'UNAUTHENTICATED' },
  )
  assert.equal(await access.principal(proof.userId, proof.sessionId), null)

  time = new Date(time.getTime() + 30_000)
  const second = await auth.login(
    'admin-auth@example.test',
    password,
    context(),
  )
  assert.equal(second.status, 'mfa_required')
  if (second.status !== 'mfa_required') return
  const session = await auth.verifyMfa(
    second.challengeId,
    totp.generate({ timestamp: time.getTime() }),
    context(),
  )
  const secondProof = await jwt.verify(session.accessToken)
  assert.ok(secondProof)
  await db.session.update({
    where: { id: secondProof.sessionId },
    data: {
      lastActivityAt: new Date(
        Date.now() - (config.internalIdleMinutes + 1) * 60_000,
      ),
    },
  })
  assert.equal(
    await access.principal(seeded.userId, secondProof.sessionId),
    null,
  )
  assert.equal(
    await db.auditEvent.count({
      where: { actorUserId: seeded.userId, action: 'auth.refresh_reused' },
    }),
    1,
  )
})

test('HTTP real exige Origin/CSRF e nunca inclui refresh no JSON', async () => {
  await db.user.update({
    where: { email: 'admin-auth@example.test' },
    data: { lockUntil: null, failedLoginCount: 0, mfaLastUsedStep: null },
  })
  const runtime = await composeBackendApplication(config)
  try {
    const app = request.agent(runtime.app)
    const blocked = await app
      .post('/v1/auth/login')
      .send({ identifier: 'admin-auth@example.test', password: seedPassword })
      .expect(403)
    assert.equal(blocked.body.error.code, 'FORBIDDEN')
    const login = await app
      .post('/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ identifier: 'admin-auth@example.test', password: seedPassword })
      .expect(202)
    assert.equal(login.body.status, 'mfa_required')
    assert.equal(login.body.accessToken, undefined)
    const otp = new TOTP({
      issuer: 'VidaPlena',
      label: 'Teste',
      secret: Secret.fromBase32(mfaSecret),
      digits: 6,
      period: 30,
    }).generate({ timestamp: Date.now() })
    const verified = await app
      .post('/v1/auth/mfa/verify')
      .set('Origin', 'http://localhost:3000')
      .send({ challengeId: login.body.challengeId, code: otp })
      .expect(200)
    assert.ok(verified.body.accessToken)
    assert.equal(verified.body.refreshToken, undefined)
    assert.equal(verified.body.csrfToken, undefined)
    const setCookies = verified.headers['set-cookie'] as string[]
    assert.ok(
      setCookies.some(
        (item) => item.startsWith('vp_refresh=') && item.includes('HttpOnly'),
      ),
    )
    const csrf = setCookies
      .find((item) => item.startsWith('vp_csrf='))
      ?.split(';')[0]
      .split('=')[1]
    assert.ok(csrf)
    const me = await app
      .get('/v1/me')
      .set('Authorization', `Bearer ${verified.body.accessToken}`)
      .expect(200)
    assert.equal(me.body.profile.email, 'admin-auth@example.test')
    await app
      .post('/v1/auth/refresh')
      .set('Origin', 'http://localhost:3000')
      .expect(403)
    const refreshed = await app
      .post('/v1/auth/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .expect(200)
    assert.ok(refreshed.body.accessToken)
    assert.equal(refreshed.body.refreshToken, undefined)
    assert.equal(
      (await app.get('/v1/openapi.json').expect(200)).body.openapi,
      '3.1.0',
    )
  } finally {
    await runtime.close()
  }
})

test('falhas de senha ativam bloqueio temporário e notificações auditáveis', async () => {
  const password = `Seed-${randomUUID()}`
  const seeded = await provisioning.service.seed(
    { email: 'ignored@example.test', fullName: 'Ignorado', password },
    context(),
  )
  // Seed is idempotent: use the existing admin from the previous test.
  assert.equal(seeded.created, false)
  for (let index = 0; index < config.failedLoginLimit; index++)
    await assert.rejects(
      auth.login('admin-auth@example.test', 'senha-incorreta', context()),
      {
        code:
          index === config.failedLoginLimit - 1
            ? 'ACCOUNT_LOCKED'
            : 'UNAUTHENTICATED',
      },
    )
  await assert.rejects(
    auth.login('admin-auth@example.test', password, context()),
    { code: 'ACCOUNT_LOCKED' },
  )
  const row = await db.user.findUniqueOrThrow({ where: { id: seeded.userId } })
  assert.ok(row.lockUntil && row.lockUntil > time)
  assert.equal(
    await db.notification.count({
      where: { userId: seeded.userId, templateKey: 'auth.account_locked' },
    }),
    1,
  )
  assert.equal(
    await db.auditEvent.count({
      where: { actorUserId: seeded.userId, action: 'auth.account_locked' },
    }),
    1,
  )
})
