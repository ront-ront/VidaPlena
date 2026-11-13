import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bookingCommand, commandNonce } from './booking-command'

const body = {
  patientId: 'patient-id',
  professionalId: 'professional-id',
  specialtyId: 'specialty-id',
  modality: 'onsite',
  visitType: 'first',
  startsAt: '2030-05-12T12:00:00.000Z',
}
test('comando retoma UUID persistido sem armazenar payload e isola ator/ciência', async () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  const first = await bookingCommand('actor-id', body, storage)
  assert.equal(first.persisted, true)
  const key = [...values.keys()][0]
  // Simula outro runtime: a chave já persistida prevalece sobre o cache de memória.
  const otherKey = crypto.randomUUID()
  values.set(key, otherKey)
  assert.equal(
    (await bookingCommand('actor-id', { ...body }, storage)).key,
    otherKey,
  )
  assert.notEqual(
    (
      await bookingCommand(
        'actor-id',
        { ...body, confirmDuplicateSpecialty: true },
        storage,
      )
    ).key,
    otherKey,
  )
  assert.notEqual(
    (await bookingCommand('another-actor', body, storage)).key,
    otherKey,
  )
  const persisted = JSON.stringify([...values])
  for (const value of [
    'patient-id',
    'actor-id',
    'professional-id',
    body.startsAt,
  ])
    assert.ok(!persisted.includes(value))
})
test('armazenamento indisponível preserva nonce em memória e informa a limitação', async () => {
  const storage = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  const first = await bookingCommand('fallback', body, storage)
  const retry = await bookingCommand('fallback', body, storage)
  assert.equal(first.persisted, false)
  assert.equal(retry.key, first.key)
})

test('comandos de alteração isolam operação, versão e destino sem persistir motivo', async () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  const cancel = ['actor', 'cancel', 'appointment', 1, 'motivo privado', null]
  const first = await commandNonce(cancel, storage)
  assert.equal((await commandNonce([...cancel], storage)).key, first.key)
  assert.notEqual(
    (
      await commandNonce(
        [
          'actor',
          'reschedule',
          'appointment',
          1,
          'motivo privado',
          body.startsAt,
        ],
        storage,
      )
    ).key,
    first.key,
  )
  assert.notEqual(
    (
      await commandNonce(
        ['actor', 'cancel', 'appointment', 2, 'motivo privado', null],
        storage,
      )
    ).key,
    first.key,
  )
  assert.ok(!JSON.stringify([...values]).includes('motivo privado'))
})
