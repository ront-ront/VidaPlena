import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  civilWindow,
  localInstant,
  type ScheduleRule,
  validSchedule,
} from '../src/domain/rules/schedule'

const rule: ScheduleRule = {
  weekday: 1,
  localStart: '08:00',
  localEnd: '12:00',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  modality: 'onsite',
}
test('grade usa intervalos locais adjacentes e vigência civil; rejeita sobreposição inclusive entre modalidades', () => {
  assert.equal(
    validSchedule(
      [rule, { ...rule, localStart: '12:00', localEnd: '16:00' }],
      [],
      'America/Fortaleza',
    ),
    true,
  )
  assert.equal(
    validSchedule(
      [rule, { ...rule, modality: 'remote', localStart: '11:00' }],
      [],
      'America/Fortaleza',
    ),
    false,
  )
  assert.equal(
    validSchedule(
      [
        { ...rule, effectiveTo: '2026-01-31' },
        { ...rule, effectiveFrom: '2026-02-01' },
      ],
      [],
      'America/Fortaleza',
    ),
    true,
  )
  assert.equal(
    validSchedule(
      [{ ...rule, localStart: '12:00', localEnd: '08:00' }],
      [],
      'America/Fortaleza',
    ),
    false,
  )
})
test('conversão local respeita fuso, meia-noite e recusa DST ambíguo/inexistente', () => {
  assert.equal(
    localInstant('2026-01-01', '08:00', 'America/Fortaleza').toISOString(),
    '2026-01-01T11:00:00.000Z',
  )
  assert.equal(
    localInstant('2026-01-01', '24:00', 'America/Fortaleza').toISOString(),
    '2026-01-02T03:00:00.000Z',
  )
  assert.throws(() => localInstant('2026-03-08', '02:30', 'America/New_York'))
  assert.throws(() => localInstant('2026-11-01', '01:30', 'America/New_York'))
  const window = civilWindow('2026-03-08', '2026-03-08', 'America/New_York', 1)
  assert.equal(
    (window.endsAt.getTime() - window.startsAt.getTime()) / 3_600_000,
    23,
  )
  assert.throws(() =>
    civilWindow('2026-01-01', '2026-01-03', 'America/Fortaleza', 2),
  )
})
