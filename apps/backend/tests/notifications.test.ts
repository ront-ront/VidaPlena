import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import {
  deliveryPolicy,
  notificationCategory,
} from '../src/domain/rules/notifications'
import { DevEmailSender } from '../src/infrastructure/notifications/channels'
import { AesSecretBox } from '../src/infrastructure/security/aes-secret-box'

test('marketing preference does not disable essentials; no external channel falls back to portal', () => {
  const optedOut = { channels: ['email' as const], nonEssentialOptOut: true }
  assert.equal(notificationCategory('marketing.news'), 'nonessential')
  assert.equal(
    deliveryPolicy('nonessential', optedOut, true, true).channel,
    null,
  )
  assert.equal(
    deliveryPolicy('essential', optedOut, true, true).channel,
    'email',
  )
  assert.deepEqual(
    deliveryPolicy(
      'essential',
      { channels: [], nonEssentialOptOut: true },
      true,
      true,
    ),
    { channel: 'portal', reason: null, needsReceptionAttention: true },
  )
  assert.equal(
    deliveryPolicy('essential', optedOut, false, true).reason,
    'consent_blocked',
  )
  assert.throws(
    () =>
      new DevEmailSender('var/mailbox', 'production', 'https://vida.example'),
  )
})

test('notification secrets use authenticated encryption bound to purpose', () => {
  const box = new AesSecretBox(randomBytes(32), 'notification')
  const value = box.seal('fake-test-token', 'user:one')
  assert.ok(!value.includes('fake-test-token'))
  assert.equal(box.open(value, 'user:one'), 'fake-test-token')
  assert.throws(() => box.open(value, 'user:two'))
  const changed = Buffer.from(value, 'base64url')
  changed[changed.length - 1] ^= 1
  assert.throws(() => box.open(changed.toString('base64url'), 'user:one'))
})
