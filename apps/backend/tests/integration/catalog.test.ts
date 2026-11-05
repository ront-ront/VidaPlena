import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { Temporal } from '@js-temporal/polyfill'
import request from 'supertest'
import type { Role } from '../../src/domain/rules/access'
import { localInstant } from '../../src/domain/rules/schedule'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { JwtAccessTokens } from '../../src/infrastructure/security/access-tokens'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { loadConfig } from '../../src/shared/config/environment'

const base = process.env.TEST_DATABASE_URL
if (!base || !new URL(base).pathname.endsWith('_test'))
  throw new Error('Use TEST_DATABASE_URL de banco isolado _test.')
const control = createPrismaClient(base)
const databaseName = `vp_${randomUUID().replaceAll('-', '')}_test`
const url = new URL(base)
url.pathname = `/${databaseName}`
const db = createPrismaClient(url.toString())
const key = randomBytes(32).toString('hex')
let runtime: Awaited<ReturnType<typeof composeBackendApplication>>
let directory = ''
let created = false
let managerToken = '',
  receptionToken = '',
  patientToken = ''
async function account(role: Role, status: 'active' | 'invited' = 'active') {
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      fullName: 'Pessoa Fictícia',
      status,
      roles: { create: { roleCode: role } },
    },
  })
  const session = await db.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
      mfaVerifiedAt: role === 'patient' ? null : new Date(),
    },
  })
  const token = await new JwtAccessTokens(key).issue(
    { userId: user.id, sessionId: session.id },
    new Date(Date.now() + 600_000),
  )
  return { user, token: `Bearer ${token}` }
}
before(async () => {
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  const migration = spawnSync('yarn', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  })
  assert.equal(migration.status, 0, 'Migration isolada deve ser aplicada')
  directory = await mkdtemp(join(tmpdir(), 'vida-catalog-'))
  runtime = await composeBackendApplication(
    loadConfig({
      APP_ENV: 'test',
      DATABASE_URL: url.toString(),
      CORS_ORIGINS: 'http://localhost:3000',
      JWT_SECRET: key,
      FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      FILE_STORAGE_PATH: join(directory, 'files'),
      EMAIL_MAILBOX_PATH: join(directory, 'mail'),
    }),
  )
  managerToken = (await account('manager')).token
  receptionToken = (await account('receptionist')).token
  patientToken = (await account('patient')).token
})
after(async () => {
  if (runtime) await runtime.close()
  await db.$disconnect()
  if (created)
    await control.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
  await control.$disconnect()
  if (directory) await rm(directory, { recursive: true, force: true })
})
const specialty = (code: string) => ({
  code,
  name: 'Especialidade Fictícia',
  active: true,
  allowedModalities: ['onsite'],
  defaultMinutesFirst: 40,
  defaultMinutesReturn: 20,
})

test('BE-019: API materializa grade e bloqueios sem cache e verifica próxima data', async () => {
  const owner = await account('professional')
  const spec = (
    await request(runtime.app)
      .post('/v1/admin/specialties')
      .set('Authorization', managerToken)
      .send({ ...specialty('DISPONIVEL'), defaultMinutesFirst: 60 })
      .expect(201)
  ).body
  const profile = (
    await request(runtime.app)
      .post('/v1/admin/professionals')
      .set('Authorization', managerToken)
      .send({
        userId: owner.user.id,
        councilType: 'CRM',
        councilNumber: '881234',
        councilRegion: 'CE',
        specialtyIds: [spec.id],
        modalities: ['onsite'],
        active: true,
      })
      .expect(201)
  ).body
  await request(runtime.app)
    .post('/v1/admin/rooms')
    .set('Authorization', managerToken)
    .send({ name: 'Sala disponibilidade', active: true })
    .expect(201)
  const day = Temporal.Now.plainDateISO('America/Fortaleza').add({ days: 7 })
  const rule = {
    weekday: day.dayOfWeek,
    localStart: '08:00',
    localEnd: '12:00',
    effectiveFrom: day.toString(),
    effectiveTo: null,
    modality: 'onsite',
  }
  const block = {
    startsAt: localInstant(
      day.toString(),
      '10:00',
      'America/Fortaleza',
    ).toISOString(),
    endsAt: localInstant(
      day.toString(),
      '11:00',
      'America/Fortaleza',
    ).toISOString(),
    kind: 'break',
    reason: 'Intervalo informado',
  }
  const scheduleRoute = `/v1/professionals/${profile.id}/schedule`
  await request(runtime.app)
    .put(scheduleRoute)
    .set('Authorization', owner.token)
    .send({ expectedVersion: 0, rules: [rule], blocks: [block] })
    .expect(200)
  const filters = {
    specialtyId: spec.id,
    professionalId: profile.id,
    modality: 'onsite',
    visitType: 'first',
    from: day.toString(),
    to: day.toString(),
  }
  await request(runtime.app).get('/v1/availability').query(filters).expect(401)
  const available = await request(runtime.app)
    .get('/v1/availability')
    .query(filters)
    .set('Authorization', receptionToken)
    .expect(200)
  assert.equal(available.body.days[0].slots.length, 3)
  assert.equal(
    available.body.days[0].slots.some(
      (s: { startsAt: string }) => s.startsAt === block.startsAt,
    ),
    false,
  )
  assert.deepEqual(Object.keys(available.body.days[0].slots[0]).sort(), [
    'endsAt',
    'professionalId',
    'roomAvailable',
    'startsAt',
  ])
  const room = await db.room.findFirstOrThrow({ where: { active: true } })
  const held = await db.slotReservation.create({
    data: {
      professionalId: profile.id,
      roomId: room.id,
      modality: 'onsite',
      startsAt: localInstant(day.toString(), '08:00', 'America/Fortaleza'),
      endsAt: localInstant(day.toString(), '09:00', 'America/Fortaleza'),
      state: 'held',
      offerId: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
      requestKey: randomUUID(),
      requestHash: 'availability-test',
    },
  })
  const occupied = await request(runtime.app)
    .get('/v1/availability')
    .query(filters)
    .set('Authorization', receptionToken)
    .expect(200)
  assert.equal(
    occupied.body.days[0].slots.length,
    2,
    'Hold persistido retira o slot imediatamente, sem cache',
  )
  await db.slotReservation.update({
    where: { id: held.id },
    data: { state: 'released' },
  })
  await request(runtime.app)
    .get('/v1/availability')
    .query({ ...filters, modality: 'remote' })
    .set('Authorization', receptionToken)
    .expect(400)
  await request(runtime.app)
    .put(scheduleRoute)
    .set('Authorization', owner.token)
    .send({
      expectedVersion: 1,
      rules: [rule],
      blocks: [
        {
          ...block,
          startsAt: localInstant(
            day.toString(),
            '08:00',
            'America/Fortaleza',
          ).toISOString(),
          endsAt: localInstant(
            day.toString(),
            '12:00',
            'America/Fortaleza',
          ).toISOString(),
        },
      ],
    })
    .expect(200)
  const changed = await request(runtime.app)
    .get('/v1/availability')
    .query(filters)
    .set('Authorization', receptionToken)
    .expect(200)
  assert.equal(changed.body.days.length, 0)
  assert.equal(
    changed.body.nearestAvailableAt,
    localInstant(
      day.add({ days: 7 }).toString(),
      '08:00',
      'America/Fortaleza',
    ).toISOString(),
  )
})

test('BE-018: grade própria, snapshots imutáveis, bloqueios, concorrência de versão e negativa auditada', async () => {
  const owner = await account('professional'),
    other = await account('professional')
  const spec = (
    await request(runtime.app)
      .post('/v1/admin/specialties')
      .set('Authorization', managerToken)
      .send(specialty('GRADE'))
      .expect(201)
  ).body
  const profile = (
    await request(runtime.app)
      .post('/v1/admin/professionals')
      .set('Authorization', managerToken)
      .send({
        userId: owner.user.id,
        councilType: 'CRM',
        councilNumber: '991234',
        councilRegion: 'CE',
        specialtyIds: [spec.id],
        modalities: ['onsite'],
        active: true,
      })
      .expect(201)
  ).body
  const route = `/v1/professionals/${profile.id}/schedule`
  const query = '?from=2026-11-01&to=2026-11-30'
  const initial = await request(runtime.app)
    .get(route + query)
    .set('Authorization', owner.token)
    .expect(200)
  assert.equal(initial.body.version, 0)
  const rule = {
    weekday: 1,
    localStart: '08:00',
    localEnd: '12:00',
    effectiveFrom: '2026-11-01',
    effectiveTo: null,
    modality: 'onsite',
  }
  const block = {
    startsAt: '2026-11-09T11:00:00.000Z',
    endsAt: '2026-11-09T15:00:00.000Z',
    kind: 'vacation',
    reason: 'Férias informadas',
  }
  const input = { expectedVersion: 0, rules: [rule], blocks: [block] }
  await request(runtime.app)
    .put(route)
    .set('Authorization', other.token)
    .send(input)
    .expect(403)
  assert.ok(
    await db.auditEvent.count({
      where: {
        actorUserId: other.user.id,
        action: 'authorization.denied',
        resourceId: profile.id,
      },
    }),
  )
  await request(runtime.app)
    .put(route)
    .set('Authorization', owner.token)
    .send(input)
    .expect(200)
  await request(runtime.app)
    .put(route)
    .set('Authorization', owner.token)
    .send({
      ...input,
      expectedVersion: 1,
      rules: [rule, { ...rule, localStart: '10:00' }],
    })
    .expect(400)
  const read = await request(runtime.app)
    .get(route + query)
    .set('Authorization', receptionToken)
    .expect(200)
  assert.equal(read.body.version, 1)
  assert.equal(read.body.blocks[0].kind, 'vacation')
  assert.equal(read.body.clinicTimeZone, 'America/Fortaleza')
  assert.equal(
    (
      await request(runtime.app)
        .get(`${route}?from=2026-12-01&to=2026-12-31`)
        .set('Authorization', owner.token)
        .expect(200)
    ).body.blocks.length,
    0,
  )
  const competing = await Promise.all(
    [1, 2].map(() =>
      request(runtime.app)
        .put(route)
        .set('Authorization', owner.token)
        .send({ ...input, expectedVersion: 1 }),
    ),
  )
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409])
  assert.equal(
    await db.scheduleVersion.count({ where: { professionalId: profile.id } }),
    2,
  )
  assert.equal(
    await db.availabilityRule.count({ where: { professionalId: profile.id } }),
    2,
  )
  await assert.rejects(
    db.scheduleVersion.update({
      where: {
        professionalId_version: { professionalId: profile.id, version: 1 },
      },
      data: { clinicTimeZone: 'UTC' },
    }),
  )
  await request(runtime.app)
    .get(route + query)
    .set('Authorization', other.token)
    .expect(403)
  await request(runtime.app)
    .get(`${route}?from=2026-01-01&to=2026-12-31`)
    .set('Authorization', owner.token)
    .expect(400)
})

test('BE-017: salas têm capacidade unitária, nome ativo único, versão, RBAC e inativação sem DELETE', async () => {
  await request(runtime.app)
    .get('/v1/rooms')
    .set('Authorization', patientToken)
    .expect(403)
  await request(runtime.app)
    .post('/v1/admin/rooms')
    .set('Authorization', receptionToken)
    .send({ name: 'Sala negada', active: true })
    .expect(403)
  await request(runtime.app)
    .post('/v1/admin/rooms')
    .set('Authorization', managerToken)
    .send({ name: 'Sala invalida', active: true, capacity: 2 })
    .expect(400)
  const rows = await Promise.all(
    ['Sala   A', 'sala a'].map((name) =>
      request(runtime.app)
        .post('/v1/admin/rooms')
        .set('Authorization', managerToken)
        .send({ name, active: true }),
    ),
  )
  assert.deepEqual(rows.map((r) => r.status).sort(), [201, 409])
  const room = rows.find((r) => r.status === 201)?.body
  assert.equal(room.capacity, 1)
  const list = await request(runtime.app)
    .get('/v1/rooms?active=true')
    .set('Authorization', receptionToken)
    .expect(200)
  assert.ok(list.body.items.some((item: { id: string }) => item.id === room.id))
  await request(runtime.app)
    .patch(`/v1/admin/rooms/${room.id}`)
    .set('Authorization', managerToken)
    .send({ expectedVersion: 1, active: false })
    .expect(200)
  await request(runtime.app)
    .patch(`/v1/admin/rooms/${room.id}`)
    .set('Authorization', managerToken)
    .send({ expectedVersion: 1, name: 'Versao antiga' })
    .expect(409)
  const replacement = await request(runtime.app)
    .post('/v1/admin/rooms')
    .set('Authorization', managerToken)
    .send({ name: 'SALA A', active: true })
    .expect(201)
  await request(runtime.app)
    .patch(`/v1/admin/rooms/${room.id}`)
    .set('Authorization', managerToken)
    .send({ expectedVersion: 2, active: true })
    .expect(409)
  assert.equal(
    (await db.room.findUniqueOrThrow({ where: { id: room.id } })).active,
    false,
  )
  await assert.rejects(db.room.delete({ where: { id: replacement.body.id } }))
  await assert.rejects(
    db.room.update({
      where: { id: replacement.body.id },
      data: { capacity: 2 },
    }),
  )
  assert.equal(
    await db.auditEvent.count({
      where: { resourceId: room.id, action: 'room.updated' },
    }),
    1,
  )
})

test('especialidades validam duração, duplicidade concorrente, versão, RBAC e projeção pública', async () => {
  await request(runtime.app)
    .post('/v1/admin/specialties')
    .send(specialty('SEM-AUTH'))
    .expect(401)
  await request(runtime.app)
    .post('/v1/admin/specialties')
    .set('Authorization', receptionToken)
    .send(specialty('NEGADO'))
    .expect(403)
  await request(runtime.app)
    .post('/v1/admin/specialties')
    .set('Authorization', managerToken)
    .send({ ...specialty('INVALIDA'), defaultMinutesFirst: 0 })
    .expect(400)
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      request(runtime.app)
        .post('/v1/admin/specialties')
        .set('Authorization', managerToken)
        .send(specialty('DUPLICADA')),
    ),
  )
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409])
  const saved = concurrent.find((r) => r.status === 201)?.body
  assert.ok(saved.id)
  const updated = await request(runtime.app)
    .patch(`/v1/admin/specialties/${saved.id}`)
    .set('Authorization', managerToken)
    .send({ expectedVersion: 1, defaultMinutesFirst: 50 })
    .expect(200)
  assert.equal(updated.body.defaultMinutesFirst, 50)
  assert.equal(updated.body.defaultMinutesReturn, 20)
  assert.equal(updated.body.version, 2)
  await request(runtime.app)
    .patch(`/v1/admin/specialties/${saved.id}`)
    .set('Authorization', managerToken)
    .send({ expectedVersion: 1, name: 'Versão antiga' })
    .expect(409)
  const visible = await request(runtime.app)
    .get('/v1/catalog/specialties')
    .set('Authorization', managerToken)
    .expect(200)
  const projection = visible.body.items.find(
    (s: { id: string }) => s.id === saved.id,
  )
  assert.deepEqual(projection.modalities, ['onsite'])
  assert.deepEqual(projection.durations, { first: 50, return: 20 })
  assert.equal(projection.version, undefined)
  await request(runtime.app)
    .get('/v1/admin/specialties')
    .set('Authorization', receptionToken)
    .expect(403)
  await request(runtime.app)
    .patch(`/v1/admin/specialties/${saved.id}`)
    .set('Authorization', managerToken)
    .send({ expectedVersion: 2, active: false })
    .expect(200)
  const rename = await request(runtime.app)
    .patch(`/v1/admin/specialties/${saved.id}`)
    .set('Authorization', managerToken)
    .send({ expectedVersion: 3, name: 'Inativa renomeada' })
    .expect(200)
  assert.equal(
    rename.body.active,
    false,
    'PATCH parcial não reativa por default',
  )
  assert.equal(
    (
      await request(runtime.app)
        .get('/v1/catalog/specialties')
        .set('Authorization', managerToken)
    ).body.items.some((s: { id: string }) => s.id === saved.id),
    false,
  )
  await assert.rejects(db.specialty.delete({ where: { id: saved.id } }))
  assert.ok(
    await db.auditEvent.count({
      where: { resourceId: saved.id, action: 'catalog.specialty_updated' },
    }),
  )
})

test('perfis exigem conta profissional, conselho único e modalidades compatíveis; catálogo omite dados privados', async () => {
  const onsite = (
    await request(runtime.app)
      .post('/v1/admin/specialties')
      .set('Authorization', managerToken)
      .send(specialty('PRESENCIAL'))
      .expect(201)
  ).body
  const professional = await account('professional', 'invited')
  const input = {
    userId: professional.user.id,
    councilType: 'crm',
    councilNumber: '001234',
    councilRegion: 'ce',
    specialtyIds: [onsite.id],
    modalities: ['onsite'],
    active: true,
  }
  await request(runtime.app)
    .post('/v1/admin/professionals')
    .set('Authorization', managerToken)
    .send({ ...input, councilNumber: 'inválido!' })
    .expect(400)
  await request(runtime.app)
    .post('/v1/admin/professionals')
    .set('Authorization', managerToken)
    .send({ ...input, modalities: ['remote'] })
    .expect(400)
  const wrong = await account('receptionist')
  await request(runtime.app)
    .post('/v1/admin/professionals')
    .set('Authorization', managerToken)
    .send({ ...input, userId: wrong.user.id })
    .expect(400)
  const profile = (
    await request(runtime.app)
      .post('/v1/admin/professionals')
      .set('Authorization', managerToken)
      .send(input)
      .expect(201)
  ).body
  assert.equal(profile.councilType, 'CRM')
  assert.equal(profile.councilRegion, 'CE')
  const second = await account('professional')
  await request(runtime.app)
    .post('/v1/admin/professionals')
    .set('Authorization', managerToken)
    .send({ ...input, userId: second.user.id })
    .expect(409)
  const pending = await request(runtime.app)
    .get('/v1/catalog/professionals')
    .set('Authorization', managerToken)
    .expect(200)
  assert.equal(
    pending.body.items.some((p: { id: string }) => p.id === profile.id),
    false,
  )
  await db.user.update({
    where: { id: professional.user.id },
    data: { status: 'active' },
  })
  const publicList = await request(runtime.app)
    .get('/v1/catalog/professionals')
    .set('Authorization', managerToken)
    .expect(200)
  const projected = publicList.body.items.find(
    (p: { id: string }) => p.id === profile.id,
  )
  assert.deepEqual(Object.keys(projected).sort(), [
    'displayName',
    'id',
    'modalities',
    'specialtyIds',
  ])
  assert.equal(
    (
      await request(runtime.app)
        .get('/v1/catalog/professionals?modality=remote')
        .set('Authorization', managerToken)
    ).body.items.length,
    0,
  )
  await request(runtime.app)
    .patch(`/v1/admin/professionals/${profile.id}`)
    .set('Authorization', managerToken)
    .send({ expectedVersion: 1, userId: second.user.id })
    .expect(400)
  await request(runtime.app)
    .patch(`/v1/admin/professionals/${profile.id}`)
    .set('Authorization', managerToken)
    .send({ expectedVersion: 1, active: false })
    .expect(200)
  assert.equal(
    await db.professionalSpecialty.count({
      where: { professionalId: profile.id },
    }),
    1,
    'Inativação mantém vínculo histórico',
  )
  await assert.rejects(
    db.professionalProfile.delete({ where: { id: profile.id } }),
  )
  await request(runtime.app)
    .get('/v1/admin/professionals')
    .set('Authorization', patientToken)
    .expect(403)
  const docs = await request(runtime.app).get('/v1/openapi.json').expect(200)
  assert.ok(docs.body.paths['/admin/professionals/{id}'].patch)
})
