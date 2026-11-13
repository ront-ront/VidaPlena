import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  absencePenaltyExpiry,
  suspensionFromOccurrences,
} from '../src/domain/rules/absence'

test('RN-006 usa meses de calendário, 29 de fevereiro e limite final exclusivo', () => {
  assert.equal(
    absencePenaltyExpiry(
      new Date('2024-02-29T11:00:00Z'),
      'America/Fortaleza',
    ).toISOString(),
    '2025-02-28T11:00:00.000Z',
  )
  const now = new Date('2026-03-01T11:00:00Z'),
    expiries = [0, 1, 2, 3].map(
      (days) => new Date(now.getTime() + days * 86_400_000),
    )
  const four = suspensionFromOccurrences(expiries, new Date(now.getTime() - 1))
  assert.equal(four.unjustifiedCount, 4)
  assert.equal(four.suspendedUntil?.toISOString(), expiries[1].toISOString())
  const state = suspensionFromOccurrences(expiries, now)
  assert.equal(state.unjustifiedCount, 3)
  assert.equal(state.suspendedUntil?.toISOString(), expiries[1].toISOString())
  assert.equal(
    suspensionFromOccurrences(expiries, expiries[1]).suspendedUntil,
    null,
  )
  assert.equal(
    suspensionFromOccurrences([expiries[0], expiries[1]], now).suspendedUntil,
    null,
  )
})
