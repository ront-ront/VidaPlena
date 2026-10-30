import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mayAccess, type Principal, roles } from '../src/domain/rules/access'

test('five roles require MFA internally and never imply clinical access', () => {
  for (const role of roles) {
    const actor: Principal = {
      userId: 'u',
      sessionId: 's',
      roles: [role],
      permissions: [],
      mfaVerified: true,
    }
    assert.equal(mayAccess(actor, 'admin_users'), role === 'admin')
    assert.equal(
      mayAccess(actor, 'invite_users'),
      ['admin', 'manager'].includes(role),
    )
    assert.equal(mayAccess(actor, 'clinical'), false)
    assert.equal(mayAccess(actor, 'privacy_consents'), false)
    assert.equal(mayAccess(actor, 'own_patient', false), false)
    assert.equal(mayAccess(actor, 'own_patient', true), true)
    actor.mfaVerified = false
    if (role !== 'patient')
      assert.equal(mayAccess(actor, 'own_patient', true), false)
    actor.permissions = ['privacy.dpo']
    assert.equal(mayAccess(actor, 'privacy_consents'), false)
    actor.mfaVerified = true
    assert.equal(
      mayAccess(actor, 'privacy_consents'),
      ['admin', 'manager'].includes(role),
    )
    assert.equal(mayAccess(actor, 'clinical'), false)
  }
  const admin: Principal = {
    userId: 'u',
    sessionId: 's',
    roles: ['admin'],
    permissions: [],
    mfaVerified: true,
  }
  assert.equal(mayAccess(admin, 'privacy_queue', false, true), false)
  assert.equal(mayAccess(admin, 'privacy_queue', false, false), true)
})
