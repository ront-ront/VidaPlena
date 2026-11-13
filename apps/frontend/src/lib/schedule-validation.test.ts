import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ScheduleSnapshot } from '../services/schedule'
import {
  type BlockDraft,
  editSchedule,
  prepareSchedule,
  type RuleDraft,
} from './schedule-validation'

const rule = (extra: Partial<RuleDraft> = {}): RuleDraft => ({
  key: crypto.randomUUID(),
  weekday: 1,
  localStart: '08:00',
  localEnd: '09:00',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  modality: 'onsite',
  ...extra,
})
const block = (extra: Partial<BlockDraft> = {}): BlockDraft => ({
  key: crypto.randomUUID(),
  startLocal: '2026-11-01T08:00',
  endLocal: '2026-11-01T09:00',
  kind: 'vacation',
  reason: 'Férias informadas',
  ...extra,
})
test('conversão usa fuso da clínica; sobreposição aponta ambas as faixas e adjacência permanece válida', () => {
  const a = rule(),
    b = rule({ localStart: '08:30', localEnd: '10:00' })
  const collision = prepareSchedule([a, b], [], 'America/Fortaleza')
  assert.equal(collision.data, undefined)
  assert.ok(collision.errors['rules.0.localStart'])
  assert.ok(collision.errors['rules.1.localStart'])
  const result = prepareSchedule(
    [a, rule({ localStart: '09:00', localEnd: '10:00' })],
    [block()],
    'America/Fortaleza',
  )
  assert.deepEqual(result.errors, {})
  assert.equal(result.data?.blocks[0].startsAt, '2026-11-01T11:00:00.000Z')
  assert.equal(
    prepareSchedule([rule({ localEnd: '07:00' })], [], 'America/Fortaleza')
      .data,
    undefined,
  )
})
test('horário local inexistente ou ambíguo é recusado sem escolher offset silenciosamente', () => {
  for (const time of ['2026-03-08T02:30', '2026-11-01T01:30']) {
    const result = prepareSchedule(
      [],
      [block({ startLocal: time, endLocal: '2026-11-02T03:00' })],
      'America/New_York',
    )
    assert.equal(result.data, undefined)
    assert.ok(result.errors['blocks.0.startLocal'])
  }
})
test('snapshot completo não editado preserva instante original com milissegundos inclusive em DST ambíguo', () => {
  const snapshot: ScheduleSnapshot = {
    professionalId: crypto.randomUUID(),
    version: 4,
    clinicTimeZone: 'America/New_York',
    affectedAppointments: [],
    rules: [rule()],
    blocks: [
      {
        startsAt: '2026-11-01T05:30:00.123Z',
        endsAt: '2026-11-01T07:30:00.456Z',
        kind: 'vacation',
        reason: 'Histórico de bloco',
      },
    ],
  }
  const draft = editSchedule(snapshot),
    result = prepareSchedule(draft.rules, draft.blocks, snapshot.clinicTimeZone)
  assert.deepEqual(result.data?.blocks, snapshot.blocks)
  assert.equal(result.data?.rules.length, 1)
})
