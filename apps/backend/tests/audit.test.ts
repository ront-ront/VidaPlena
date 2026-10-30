import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  auditRetentionYears,
  safeAuditMetadata,
} from '../src/application/ports/audit-writer'

test('audit retention cannot be configured below its mandatory minimum', () => {
  assert.equal(auditRetentionYears(), 5)
  assert.throws(() => auditRetentionYears(4))
  assert.throws(() => auditRetentionYears(Number.NaN))
  assert.deepEqual(
    safeAuditMetadata({
      token: 'abc',
      password: '123',
      status: 'active',
      payload: { clinical: 'secret' },
    }),
    { status: 'active' },
  )
})
