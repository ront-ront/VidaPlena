import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { PrismaAccessStore } from '../../src/infrastructure/persistence/prisma/access-store'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { composeProvisioning } from '../../src/shared/composition/provisioning'
import { loadConfig } from '../../src/shared/config/environment'

const base = process.env.TEST_DATABASE_URL
if (!base || !new URL(base).pathname.endsWith('_test'))
  throw new Error(
    'Use banco isolado _test com permissão de criar banco temporário.',
  )
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
})
const db = createPrismaClient(config.databaseUrl)
const { service, passwords, tokens } = composeProvisioning(config, db)
const store = new PrismaAccessStore(db)
const secrets = new AesSecretBox(config.encryptionKey, 'notification')
const context = () => ({
  actorRoles: [],
  requestId: randomUUID(),
  authorizationBasis: 'test',
})
const seedPassword = `Seed-${randomUUID()}`
let created = false
before(async () => {
  // Only this generated database is created/dropped; the supplied _test DB is untouched.
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
      code === 0
        ? resolve()
        : reject(new Error('Migration do banco temporário falhou.')),
    )
  })
})
after(async () => {
  await db.$disconnect()
  if (created)
    await control.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
  await control.$disconnect()
})
async function principal(userId: string) {
  const session = await db.session.create({
    data: {
      userId,
      refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 60000),
      mfaVerifiedAt: new Date(),
    },
  })
  const actor = await store.principal(userId, session.id)
  assert.ok(actor)
  return actor
}
async function tokenFor(userId: string) {
  const row = await db.notification.findFirstOrThrow({
    where: { userId, templateKey: 'account.invited', deliveryStatus: 'queued' },
    orderBy: { createdAt: 'desc' },
  })
  assert.ok(row.payloadEncrypted)
  return secrets.open(
    row.payloadEncrypted,
    `notification:${userId}:account.invited`,
  )
}

test('seed is idempotent; internal invitation permissions, one-time activation, expiry, reissue and review are persisted', async () => {
  const first = await service.seed(
    {
      email: 'admin@example.test',
      fullName: 'Admin fictício',
      password: seedPassword,
    },
    context(),
  )
  const original = await db.user.findUniqueOrThrow({
    where: { id: first.userId },
  })
  const second = await service.seed(
    {
      email: 'different@example.test',
      fullName: 'Outro',
      password: `Another-${randomUUID()}`,
    },
    context(),
  )
  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(second.userId, first.userId)
  assert.equal(await db.user.count(), 1)
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: first.userId } }))
      .passwordHash,
    original.passwordHash,
  )
  assert.ok(original.passwordHash)
  assert.ok(await passwords.verify(seedPassword, original.passwordHash))
  const admin = await principal(first.userId)
  const manager = await service.invite(
    admin,
    {
      email: 'manager@example.test',
      fullName: 'Gestor fictício',
      role: 'manager',
    },
    context(),
  )
  const token = await tokenFor(manager.userId)
  const invitation = await db.invitation.findFirstOrThrow({
    where: { userId: manager.userId },
  })
  assert.equal(invitation.tokenHash, tokens.digest(token))
  assert.ok(!JSON.stringify(manager).includes(token))
  await assert.rejects(service.accept(token, 'short', context()), {
    code: 'VALIDATION_ERROR',
  })
  const password = `Manager-${randomUUID()}`
  const activation = await Promise.allSettled([
    service.accept(token, password, context()),
    service.accept(token, password, context()),
  ])
  assert.equal(
    activation.filter((item) => item.status === 'fulfilled').length,
    1,
  )
  assert.equal(
    (
      activation.find(
        (item) => item.status === 'rejected',
      ) as PromiseRejectedResult
    ).reason.code,
    'TOKEN_EXPIRED',
  )
  const managerActor = await principal(manager.userId)
  for (const role of ['admin', 'manager'] as const)
    await assert.rejects(
      service.invite(
        managerActor,
        { email: `${role}@deny.test`, fullName: 'Negado', role },
        context(),
      ),
      { code: 'FORBIDDEN' },
    )
  const reception = await service.invite(
    managerActor,
    {
      email: 'reception@example.test',
      fullName: 'Recepção fictícia',
      role: 'receptionist',
    },
    context(),
  )
  const oldToken = await tokenFor(reception.userId)
  await service.resend(managerActor, reception.userId, context())
  await assert.rejects(service.inspect(oldToken), { code: 'TOKEN_EXPIRED' })
  const newToken = await tokenFor(reception.userId)
  assert.notEqual(newToken, oldToken)
  await db.invitation.updateMany({
    where: { userId: reception.userId, consumedAt: null },
    data: { expiresAt: new Date(0) },
  })
  await assert.rejects(service.accept(newToken, password, context()), {
    code: 'TOKEN_EXPIRED',
  })
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: reception.userId } }))
      .status,
    'invited',
  )
  await db.user.update({
    where: { id: manager.userId },
    data: {
      createdAt: new Date(
        Date.now() - (config.accountInactivityReviewDays + 1) * 86400000,
      ),
    },
  })
  assert.equal((await service.reviewInactive(context())).marked, 1)
  assert.equal((await service.reviewInactive(context())).marked, 0)
  const reviewed = await db.user.findUniqueOrThrow({
    where: { id: manager.userId },
  })
  assert.ok(reviewed.reviewRequiredAt)
  assert.equal(reviewed.status, 'active')
  assert.equal(
    await db.notification.count({
      where: { userId: admin.userId, templateKey: 'account.inactivity_review' },
    }),
    1,
  )
  assert.equal(
    await db.auditEvent.count({
      where: { resourceId: manager.userId, action: 'account.activated' },
    }),
    1,
  )
})
