import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { after, test } from 'node:test'
import type { NotificationEvent } from '../../src/application/ports/notifications'
import { DispatchNotifications } from '../../src/application/use-cases/dispatch-notifications'
import {
  DevEmailSender,
  EmailNotificationChannel,
  PortalNotificationChannel,
} from '../../src/infrastructure/notifications/channels'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { PrismaNotificationStore } from '../../src/infrastructure/persistence/prisma/notification-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { loadConfig } from '../../src/shared/config/environment'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use banco isolado _test.')
const db = createPrismaClient(url)
after(() => db.$disconnect())
const config = loadConfig({
  APP_ENV: 'test',
  DATABASE_URL: url,
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: randomBytes(32).toString('hex'),
  FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
})
const policy = {
  retrySeconds: config.notificationRetrySeconds,
  maxAttempts: config.notificationMaxAttempts,
}
const box = new AesSecretBox(config.encryptionKey, 'notification')
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  authorizationBasis: 'test',
})
async function account() {
  return db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      fullName: 'Fictício notificações',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
  })
}
function event(
  userId: string,
  type: NotificationEvent['type'] = 'appointment.reminder',
): NotificationEvent {
  return {
    userId,
    type,
    aggregateId: randomUUID(),
    version: 1,
    requestId: randomUUID(),
  }
}

test('concurrent duplicate events deliver once; preferences and queued revocation are rechecked', async () => {
  await mkdir('var/test-mailboxes', { recursive: true })
  const directory = await mkdtemp('var/test-mailboxes/notification-')
  let allowed = true
  const store = new PrismaNotificationStore(db, async () => allowed)
  const sender = new DevEmailSender(directory, 'test', 'http://localhost:3000')
  const dispatcher = new DispatchNotifications(
    store,
    [new EmailNotificationChannel(sender), new PortalNotificationChannel()],
    box,
    policy,
  )
  const user = await account()
  try {
    const input = {
      ...event(user.id, 'account.invited'),
      token: 'fictitious-token-not-a-secret',
    }
    const ids = await Promise.all([
      dispatcher.enqueue(input),
      dispatcher.enqueue(input),
    ])
    assert.equal(ids[0], ids[1])
    const queued = await db.notification.findUniqueOrThrow({
      where: { id: ids[0] },
    })
    assert.ok(!queued.payloadEncrypted?.includes(input.token))
    await Promise.all(ids.map((id) => dispatcher.deliver(id)))
    assert.equal((await readdir(directory)).length, 1)
    const email = JSON.parse(
      await readFile(join(directory, `${ids[0]}.json`), 'utf8'),
    )
    assert.ok(email.actionUrl.includes('/convite?token='))
    assert.equal(
      (await db.notification.findUniqueOrThrow({ where: { id: ids[0] } }))
        .attempts,
      1,
    )
    const list = await store.list(user.id)
    assert.equal(list.items.length, 1)
    assert.ok(!JSON.stringify(list).includes(input.token))
    assert.equal((await store.list((await account()).id)).items.length, 0)
    await store.updatePreferences(
      user.id,
      { channels: ['email'], nonEssentialOptOut: true },
      context(),
    )
    const marketing = await dispatcher.enqueue(event(user.id, 'marketing.news'))
    await dispatcher.deliver(marketing)
    assert.equal(
      (await db.notification.findUniqueOrThrow({ where: { id: marketing } }))
        .deliveryStatus,
      'suppressed',
    )
    const reminder = await dispatcher.enqueue(event(user.id))
    await dispatcher.deliver(reminder)
    assert.equal(
      (await db.notification.findUniqueOrThrow({ where: { id: reminder } }))
        .deliveryStatus,
      'sent',
    )
    const pending = await dispatcher.enqueue(event(user.id))
    await store.updatePreferences(
      user.id,
      { channels: [], nonEssentialOptOut: true },
      context(),
    )
    await dispatcher.deliver(pending)
    const fallback = await db.notification.findUniqueOrThrow({
      where: { id: pending },
    })
    assert.equal(fallback.channel, 'portal')
    assert.equal(fallback.needsReceptionAttention, true)
    assert.ok(
      (await store.attention()).items.some(
        (row) => 'id' in row && row.id === pending,
      ),
    )
    const revoked = await dispatcher.enqueue(event(user.id))
    allowed = false
    await dispatcher.deliver(revoked)
    const blocked = await db.notification.findUniqueOrThrow({
      where: { id: revoked },
    })
    assert.equal(blocked.failureReasonSafe, 'consent_blocked')
    assert.equal(blocked.deliveryStatus, 'suppressed')
    assert.equal(blocked.attempts, 0)
    assert.equal((await readdir(directory)).length, 2)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('retry uses configured delay and idempotent mailbox after ambiguous delivery failure', async () => {
  await mkdir('var/test-mailboxes', { recursive: true })
  const directory = await mkdtemp('var/test-mailboxes/retry-')
  const store = new PrismaNotificationStore(db, async () => true)
  const sender = new DevEmailSender(directory, 'test', 'http://localhost:3000')
  let clock = new Date()
  let failed = false
  const dispatcher = new DispatchNotifications(
    store,
    [
      {
        name: 'email',
        deliver: async (message) => {
          await sender.send(message)
          if (!failed) {
            failed = true
            throw new Error('simulated provider failure with private payload')
          }
        },
      },
    ],
    box,
    policy,
    () => clock,
  )
  const user = await account()
  try {
    const id = await dispatcher.enqueue(event(user.id))
    clock = new Date(Date.now() + 100)
    await dispatcher.deliver(id)
    const pending = await db.notification.findUniqueOrThrow({ where: { id } })
    assert.equal(pending.deliveryStatus, 'retry')
    assert.equal(pending.failureReasonSafe, 'delivery_failed')
    assert.equal(
      pending.scheduledAt.getTime(),
      clock.getTime() + policy.retrySeconds * 1000,
    )
    await dispatcher.deliver(id)
    assert.equal(
      (await db.notification.findUniqueOrThrow({ where: { id } })).attempts,
      1,
    )
    clock = pending.scheduledAt
    await dispatcher.deliver(id)
    assert.equal(
      (await db.notification.findUniqueOrThrow({ where: { id } }))
        .deliveryStatus,
      'sent',
    )
    assert.equal((await readdir(directory)).length, 1)
    assert.equal(
      await db.auditEvent.count({
        where: { resourceId: id, action: 'notification.retry' },
      }),
      1,
    )
    assert.equal(
      await db.auditEvent.count({
        where: { resourceId: id, action: 'notification.sent' },
      }),
      1,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
