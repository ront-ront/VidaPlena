import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import type { ReservationInput } from '../../src/application/ports/reservations'
import { ReserveSlot } from '../../src/application/use-cases/reserve-slot'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import {
  isExclusionConflict,
  isReservationRetryConflict,
  PrismaReservationStore,
} from '../../src/infrastructure/persistence/prisma/reservation-store'
import { loadConfig } from '../../src/shared/config/environment'

const base = process.env.TEST_DATABASE_URL
if (!base || !new URL(base).pathname.endsWith('_test'))
  throw new Error('Use TEST_DATABASE_URL de banco isolado _test.')
const control = createPrismaClient(base),
  databaseName = `vp_${randomUUID().replaceAll('-', '')}_test`,
  url = new URL(base)
url.pathname = `/${databaseName}`
const config = loadConfig({
  APP_ENV: 'test',
  DATABASE_URL: url.toString(),
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: randomBytes(32).toString('hex'),
  FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
})
const db = createPrismaClient(config.databaseUrl),
  store = new PrismaReservationStore(db, {
    maxWaitMs: config.reservationTxMaxWaitMs,
    timeoutMs: config.reservationTxTimeoutMs,
    retryAttempts: config.reservationTxRetryAttempts,
  })
let created = false,
  pro1 = '',
  pro2 = '',
  pro3 = '',
  room1 = '',
  room2 = ''
before(async () => {
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  assert.equal(
    spawnSync('yarn', ['prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: config.databaseUrl },
      stdio: 'pipe',
    }).status,
    0,
  )
  const ids = []
  for (let n = 0; n < 3; n++) {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        fullName: 'Profissional Fictício',
        status: 'active',
        roles: { create: { roleCode: 'professional' } },
      },
    })
    ids.push(
      (
        await db.professionalProfile.create({
          data: {
            userId: user.id,
            councilType: 'CRM',
            councilNumber: String(n + 1),
            councilRegion: 'CE',
            modalities: ['onsite', 'remote'],
          },
        })
      ).id,
    )
  }
  ;[pro1, pro2, pro3] = ids
  room1 = (await db.room.create({ data: { name: 'Sala Um' } })).id
  room2 = (await db.room.create({ data: { name: 'Sala Dois' } })).id
})
after(async () => {
  await db.$disconnect()
  if (created)
    await control.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
  await control.$disconnect()
})
function slot(
  day: number,
  professionalId = pro1,
  roomId: string | null = room1,
): ReservationInput {
  return {
    requestKey: randomUUID(),
    professionalId,
    roomId,
    modality: roomId ? 'onsite' : 'remote',
    startsAt: new Date(Date.UTC(2030, 0, day, 10)),
    endsAt: new Date(Date.UTC(2030, 0, day, 11)),
    state: 'confirmed',
    appointmentId: randomUUID(),
  }
}
const reserve = (input: ReservationInput) =>
  store.transaction((tx) => new ReserveSlot(tx).reserve(input))

test('BE-020: PostgreSQL exclui sobreposição mesmo sem lock da aplicação, com duas transações na barreira', async () => {
  let ready = 0,
    release: () => void = () => {}
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const rows = await Promise.allSettled(
    [1, 2].map(() =>
      db.$transaction(async (tx) => {
        ready++
        if (ready === 2) release()
        await barrier
        const input = slot(1)
        return tx.slotReservation.create({
          data: { ...input, roomId: room1, requestHash: 'raw-database-test' },
        })
      }),
    ),
  )
  assert.equal(ready, 2)
  assert.equal(rows.filter((r) => r.status === 'fulfilled').length, 1)
  const failure = rows.find((r) => r.status === 'rejected')
  assert.ok(
    failure?.status === 'rejected' &&
      (isExclusionConflict(failure.reason) ||
        isReservationRetryConflict(failure.reason)),
    'O banco deve rejeitar a transação concorrente por exclusão ou deadlock, sem persistir sobreposição',
  )
  assert.equal(
    await db.slotReservation.count({
      where: { professionalId: pro1, startsAt: slot(1).startsAt },
    }),
    1,
  )
  await assert.rejects(reserve(slot(1, pro2, room1)), {
    code: 'SLOT_UNAVAILABLE',
  })
  const adjacent = {
    ...slot(1),
    startsAt: new Date('2030-01-01T11:00:00Z'),
    endsAt: new Date('2030-01-01T12:00:00Z'),
  }
  assert.equal((await reserve(adjacent)).state, 'confirmed')
})

test('BE-020: conflito de aplicação não deixa parcial; recursos independentes coexistem e remoto dispensa sala', async () => {
  const results = await Promise.allSettled([reserve(slot(2)), reserve(slot(2))])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    results.filter(
      (r) => r.status === 'rejected' && r.reason.code === 'SLOT_UNAVAILABLE',
    ).length,
    1,
  )
  await reserve(slot(2, pro2, room2))
  await assert.rejects(reserve({ ...slot(2, pro3), roomId: undefined }), {
    code: 'SLOT_UNAVAILABLE',
  })
  await reserve(slot(2, pro3, null))
  const key = randomUUID()
  await assert.rejects(
    store.transaction(async (tx) => {
      await new ReserveSlot(tx).reserve({ ...slot(3), requestKey: key })
      throw new Error('Falha posterior de negócio/auditoria')
    }),
  )
  assert.equal(
    await db.slotReservation.count({ where: { requestKey: key } }),
    0,
  )
})

test('BE-020: chave idempotente repete reserva sem duplicar e rejeita payload diferente', async () => {
  const input = slot(4)
  const first = await reserve(input)
  const repeated = await reserve(
    Object.fromEntries(Object.entries(input).reverse()) as ReservationInput,
  )
  assert.equal(repeated.id, first.id)
  await assert.rejects(
    reserve({ ...input, endsAt: new Date('2030-01-04T11:30:00Z') }),
    { code: 'CONFLICT' },
  )
  assert.equal(
    await db.slotReservation.count({ where: { requestKey: input.requestKey } }),
    1,
  )
})

test('BE-020: hold expirado libera antes de nova reserva; aceite converte o mesmo hold e não aceita vencido', async () => {
  let now = new Date('2029-12-01T10:00:00Z')
  const input: ReservationInput = {
    ...slot(5),
    state: 'held',
    appointmentId: null,
    offerId: randomUUID(),
    expiresAt: new Date(now.getTime() + 60_000),
  }
  const held = await store.transaction((tx) =>
    new ReserveSlot(tx, () => now).reserve(input),
  )
  now = new Date(now.getTime() + 120_000)
  await assert.rejects(
    store.transaction((tx) =>
      new ReserveSlot(tx, () => now).confirmHold(held.id, randomUUID()),
    ),
    { code: 'OFFER_EXPIRED' },
  )
  await store.transaction((tx) =>
    new ReserveSlot(tx, () => now).reserve({
      ...slot(5),
      requestKey: randomUUID(),
    }),
  )
  assert.equal(
    (await db.slotReservation.findUniqueOrThrow({ where: { id: held.id } }))
      .state,
    'released',
  )
  const next = await store.transaction((tx) =>
    new ReserveSlot(tx, () => now).reserve({
      ...slot(6),
      state: 'held',
      appointmentId: null,
      offerId: randomUUID(),
      expiresAt: new Date(now.getTime() + 60_000),
    }),
  )
  const appointmentId = randomUUID()
  const confirmed = await store.transaction((tx) =>
    new ReserveSlot(tx, () => now).confirmHold(next.id, appointmentId),
  )
  assert.equal(confirmed.id, next.id)
  assert.equal(confirmed.state, 'confirmed')
  assert.equal(confirmed.expiresAt, null)
  assert.equal(
    (
      await store.transaction((tx) =>
        new ReserveSlot(tx, () => now).confirmHold(next.id, appointmentId),
      )
    ).id,
    next.id,
  )
})

test('BE-020: troca falha preserva original; troca válida é atômica e idempotente', async () => {
  const original = await reserve(slot(7))
  await reserve(slot(8))
  await assert.rejects(
    store.transaction((tx) =>
      new ReserveSlot(tx).replace(original.id, slot(8)),
    ),
    { code: 'SLOT_UNAVAILABLE' },
  )
  assert.equal(
    (await db.slotReservation.findUniqueOrThrow({ where: { id: original.id } }))
      .state,
    'confirmed',
  )
  const input = { ...slot(9), appointmentId: original.appointmentId }
  const next = await store.transaction((tx) =>
    new ReserveSlot(tx).replace(original.id, input),
  )
  assert.equal(
    (await db.slotReservation.findUniqueOrThrow({ where: { id: original.id } }))
      .state,
    'released',
  )
  assert.equal(
    (
      await store.transaction((tx) =>
        new ReserveSlot(tx).replace(original.id, input),
      )
    ).id,
    next.id,
  )
  await assert.rejects(
    db.slotReservation.delete({ where: { id: original.id } }),
  )
})
