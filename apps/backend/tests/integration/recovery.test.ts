import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { DispatchNotifications } from '../../src/application/use-cases/dispatch-notifications'
import { RecoverAccess } from '../../src/application/use-cases/recover-access'
import {
  DevEmailSender,
  EmailNotificationChannel,
  PortalNotificationChannel,
} from '../../src/infrastructure/notifications/channels'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { PrismaAuthStore } from '../../src/infrastructure/persistence/prisma/auth-store'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { PrismaNotificationStore } from '../../src/infrastructure/persistence/prisma/notification-store'
import { PrismaRecoveryStore } from '../../src/infrastructure/persistence/prisma/recovery-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { composeProvisioning } from '../../src/shared/composition/provisioning'
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
const secrets = new AesSecretBox(config.encryptionKey, 'notification')
const authStore = new PrismaAuthStore(db)
let time = new Date()
const recovery = new RecoverAccess(
  new PrismaRecoveryStore(db),
  authStore,
  new PrismaAuditWriter(db),
  provisioning.passwords,
  provisioning.tokens,
  secrets,
  {
    resetMinutes: config.resetLinkMinutes,
    verifyHours: config.emailVerifyLinkHours,
    requestsPerHour: config.resetRequestsPerHour,
    historyCount: config.passwordHistoryCount,
  },
  () => time,
)
const context = () => ({
  actorRoles: [],
  requestId: randomUUID(),
  authorizationBasis: 'test',
})
let created = false
let mailbox = ''
let replacementPassword = ''
before(async () => {
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  mailbox = await mkdtemp(join(tmpdir(), 'vida-recovery-'))
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
  if (mailbox) await rm(mailbox, { recursive: true, force: true })
})

test('reset não enumera contas, limita pedidos, rejeita histórico e revoga sessões', async () => {
  const oldPassword = `Seed-${randomUUID()}`
  const seeded = await provisioning.service.seed(
    {
      email: 'recovery-admin@example.test',
      fullName: 'Admin fictício',
      password: oldPassword,
    },
    context(),
  )
  const existing = await recovery.request(
    'recovery-admin@example.test',
    context(),
  )
  const missing = await recovery.request('unknown@example.test', context())
  assert.deepEqual(existing, missing)
  const message = await db.notification.findFirstOrThrow({
    where: { userId: seeded.userId, templateKey: 'auth.password_reset' },
  })
  assert.ok(message.payloadEncrypted)
  const token = secrets.open(
    message.payloadEncrypted,
    `notification:${seeded.userId}:auth.password_reset`,
  )
  await assert.rejects(recovery.complete(token, oldPassword, context()), {
    code: 'VALIDATION_ERROR',
  })
  const session = await db.session.create({
    data: {
      userId: seeded.userId,
      refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
      mfaVerifiedAt: new Date(),
    },
  })
  const newPassword = `Replacement-${randomUUID()}`
  replacementPassword = newPassword
  await recovery.complete(token, newPassword, context())
  await assert.rejects(
    recovery.complete(token, `YetAnother-${randomUUID()}`, context()),
    {
      code: 'TOKEN_EXPIRED',
    },
  )
  assert.ok(
    (await db.session.findUniqueOrThrow({ where: { id: session.id } }))
      .revokedAt,
  )
  const changed = await db.user.findUniqueOrThrow({
    where: { id: seeded.userId },
  })
  assert.ok(changed.passwordHash)
  assert.ok(
    await provisioning.passwords.verify(newPassword, changed.passwordHash),
  )
  for (let index = 1; index < config.resetRequestsPerHour; index++)
    await recovery.request('recovery-admin@example.test', context())
  await assert.rejects(
    recovery.request('recovery-admin@example.test', context()),
    {
      code: 'RATE_LIMITED',
    },
  )
  assert.equal(
    await db.auditEvent.count({
      where: {
        actorUserId: seeded.userId,
        action: 'auth.password_reset_completed',
      },
    }),
    1,
  )
})

test('link vencido não redefine a senha e histórico recente continua vedado', async () => {
  const admin = await db.user.findUniqueOrThrow({
    where: { email: 'recovery-admin@example.test' },
  })
  time = new Date(time.getTime() + 61 * 60_000)
  await recovery.request(admin.email, context())
  const expiredMessage = await db.notification.findFirstOrThrow({
    where: { userId: admin.id, templateKey: 'auth.password_reset' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  assert.ok(expiredMessage.payloadEncrypted)
  const expiredToken = secrets.open(
    expiredMessage.payloadEncrypted,
    `notification:${admin.id}:auth.password_reset`,
  )
  time = new Date(time.getTime() + (config.resetLinkMinutes + 1) * 60_000)
  await assert.rejects(
    recovery.complete(expiredToken, `Different-${randomUUID()}`, context()),
    { code: 'TOKEN_EXPIRED' },
  )
  await recovery.request(admin.email, context())
  const freshMessage = await db.notification.findFirstOrThrow({
    where: { userId: admin.id, templateKey: 'auth.password_reset' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  assert.ok(freshMessage.payloadEncrypted)
  const freshToken = secrets.open(
    freshMessage.payloadEncrypted,
    `notification:${admin.id}:auth.password_reset`,
  )
  await assert.rejects(
    recovery.complete(freshToken, replacementPassword, context()),
    { code: 'VALIDATION_ERROR' },
  )
})

test('e-mail novo só substitui o antigo após prova no novo endereço; telefone exige confirmação presencial', async () => {
  const admin = await db.user.findUniqueOrThrow({
    where: { email: 'recovery-admin@example.test' },
  })
  const session = await db.session.create({
    data: {
      userId: admin.id,
      refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
      mfaVerifiedAt: new Date(),
    },
  })
  const actor = {
    userId: admin.id,
    sessionId: session.id,
    roles: ['admin' as const],
    permissions: [],
    mfaVerified: true,
  }
  const newEmail = 'new-admin@example.test'
  await recovery.requestEmailChange(actor, newEmail, context())
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: admin.id } })).email,
    admin.email,
  )
  const message = await db.notification.findFirstOrThrow({
    where: { userId: admin.id, templateKey: 'contact.verification_requested' },
  })
  assert.ok(message.payloadEncrypted)
  const token = secrets.open(
    message.payloadEncrypted,
    `notification:${admin.id}:contact.verification_requested`,
  )
  const dispatcher = new DispatchNotifications(
    new PrismaNotificationStore(db, undefined, secrets),
    [
      new PortalNotificationChannel(),
      new EmailNotificationChannel(
        new DevEmailSender(mailbox, 'test', 'http://localhost:3000'),
      ),
    ],
    secrets,
    { retrySeconds: 1, maxAttempts: 2 },
  )
  await dispatcher.deliver(message.id)
  const delivery = JSON.parse(
    await readFile(join(mailbox, `${message.id}.json`), 'utf8'),
  )
  assert.equal(delivery.to, newEmail)
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: admin.id } })).email,
    admin.email,
  )
  await recovery.confirmEmail(token, context())
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: admin.id } })).email,
    newEmail,
  )
  await assert.rejects(recovery.confirmEmail(token, context()), {
    code: 'TOKEN_EXPIRED',
  })
  const patient = await db.user.create({
    data: {
      email: 'patient-phone@example.test',
      fullName: 'Paciente fictício',
      status: 'active',
      roles: { create: { roleCode: 'patient', grantedBy: admin.id } },
    },
  })
  const newSession = await db.session.create({
    data: {
      userId: admin.id,
      refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
      mfaVerifiedAt: new Date(),
    },
  })
  await recovery.confirmPhoneOnsite(
    { ...actor, sessionId: newSession.id },
    patient.id,
    '+5585999999999',
    context(),
  )
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: patient.id } })).phone,
    '+5585999999999',
  )
})
