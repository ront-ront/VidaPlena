import assert from 'node:assert/strict'
import { test } from 'node:test'
import { carePhase, careWindow } from '../src/domain/rules/care-link'

const policy = {
  preHours: 24,
  postDays: 30,
  noShowDays: 1,
  sharedCaseEnabled: true,
  timeZone: 'America/Fortaleza',
}
const appointment = {
  id: 'appointment',
  patientId: 'patient',
  professionalId: 'professional',
  startsAt: new Date('2030-05-12T12:00:00Z'),
  endsAt: new Date('2030-05-12T13:00:00Z'),
  status: 'confirmed',
  version: 1,
}
test('BE-030: janelas por configuração, limites exclusivos e cancelamento', () => {
  const window = careWindow(appointment, policy)
  assert.ok(window)
  assert.equal(
    carePhase(appointment, policy, new Date(+window.startsAt - 1)),
    null,
  )
  assert.equal(carePhase(appointment, policy, window.startsAt), 'pre')
  assert.equal(carePhase(appointment, policy, appointment.startsAt), 'during')
  assert.equal(carePhase(appointment, policy, appointment.endsAt), 'post')
  assert.equal(carePhase(appointment, policy, window.endsAt), null)
  assert.equal(
    carePhase(
      { ...appointment, status: 'cancelled' },
      policy,
      appointment.startsAt,
    ),
    null,
  )
  const noShow = careWindow({ ...appointment, status: 'no_show' }, policy)
  assert.ok(noShow)
  assert.equal(noShow.endsAt.toISOString(), '2030-05-13T12:00:00.000Z')
  const altered = { ...policy, preHours: 2, postDays: 2, noShowDays: 3 }
  assert.equal(
    careWindow(appointment, altered)?.startsAt.toISOString(),
    '2030-05-12T10:00:00.000Z',
  )
  assert.equal(
    careWindow(
      { ...appointment, status: 'no_show' },
      altered,
    )?.endsAt.toISOString(),
    '2030-05-15T12:00:00.000Z',
  )
})
test('BE-030: dias civis preservam fuso na passagem de DST', () => {
  const row = {
    ...appointment,
    startsAt: new Date('2030-03-09T15:00:00Z'),
    endsAt: new Date('2030-03-09T16:00:00Z'),
  }
  assert.equal(
    careWindow(row, {
      ...policy,
      postDays: 1,
      timeZone: 'America/New_York',
    })?.endsAt.toISOString(),
    '2030-03-10T15:00:00.000Z',
  )
})
