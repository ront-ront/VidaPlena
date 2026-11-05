import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  AvailabilityData,
  AvailabilityQuery,
} from '../src/application/ports/availability'
import { FindAvailability } from '../src/application/use-cases/find-availability'
import type { Principal } from '../src/domain/rules/access'

const patient: Principal = {
  userId: 'u',
  sessionId: 's',
  roles: ['patient'],
  permissions: [],
  mfaVerified: false,
  consentState: 'active',
}
const reception: Principal = {
  ...patient,
  roles: ['receptionist'],
  mfaVerified: true,
}
const query: AvailabilityQuery = {
  specialtyId: 'spec',
  modality: 'onsite',
  visitType: 'first',
  from: '2026-11-09',
  to: '2026-11-09',
}
function fixture(): AvailabilityData {
  return {
    specialty: { modalities: ['onsite', 'remote'], first: 60, return: 30 },
    roomIds: ['room'],
    occupied: [],
    professionals: [
      {
        id: 'pro',
        modalities: ['onsite', 'remote'],
        schedule: {
          professionalId: 'pro',
          version: 1,
          clinicTimeZone: 'America/Fortaleza',
          rules: [
            {
              weekday: 1,
              localStart: '08:00',
              localEnd: '12:00',
              effectiveFrom: '2026-01-01',
              effectiveTo: null,
              modality: 'onsite',
            },
          ],
          blocks: [],
        },
      },
    ],
  }
}
function service(data: AvailabilityData) {
  return new FindAvailability(
    { load: async () => data },
    'America/Fortaleza',
    31,
    30,
    () => new Date('2026-11-09T10:00:00Z'),
  )
}
test('disponibilidade aplica antecedência de paciente, bloqueio, ocupação profissional e intervalos adjacentes', async () => {
  const data = fixture()
  data.professionals[0].schedule?.blocks.push({
    startsAt: '2026-11-09T13:00:00Z',
    endsAt: '2026-11-09T14:00:00Z',
    kind: 'vacation',
    reason: 'Teste',
  })
  data.occupied.push({
    professionalId: 'pro',
    roomId: 'room',
    startsAt: new Date('2026-11-09T14:00:00Z'),
    endsAt: new Date('2026-11-09T15:00:00Z'),
  })
  const portal = await service(data).execute(patient, query)
  assert.deepEqual(
    portal.days[0].slots.map((s) => s.startsAt),
    ['2026-11-09T12:00:00.000Z'],
  )
  const internal = await service(data).execute(reception, query)
  assert.deepEqual(
    internal.days[0].slots.map((s) => s.startsAt),
    ['2026-11-09T11:00:00.000Z', '2026-11-09T12:00:00.000Z'],
  )
  assert.equal(JSON.stringify(portal).includes('patientId'), false)
})
test('sala ocupada retira presencial; remoto dispensa sala e filtra modalidade', async () => {
  const data = fixture()
  data.occupied.push({
    professionalId: 'other',
    roomId: 'room',
    startsAt: new Date('2026-11-09T00:00:00Z'),
    endsAt: new Date('2026-11-10T00:00:00Z'),
  })
  assert.equal((await service(data).execute(reception, query)).days.length, 0)
  if (data.professionals[0].schedule)
    data.professionals[0].schedule.rules[0].modality = 'remote'
  const remote = await service(data).execute(reception, {
    ...query,
    modality: 'remote',
  })
  assert.equal(remote.days[0].slots.length, 4)
  if (data.specialty) data.specialty.modalities = ['onsite']
  await assert.rejects(
    service(data).execute(reception, { ...query, modality: 'remote' }),
    { code: 'VALIDATION_ERROR' },
  )
})
test('janela vazia só aponta próxima data verificada e usa duração de retorno', async () => {
  const data = fixture()
  const next = await service(data).execute(patient, {
    ...query,
    from: '2026-11-10',
    to: '2026-11-10',
  })
  assert.equal(next.days.length, 0)
  assert.equal(next.nearestAvailableAt, '2026-11-16T11:00:00.000Z')
  const returns = await service(data).execute(reception, {
    ...query,
    visitType: 'return',
  })
  assert.equal(returns.days[0].slots.length, 8)
  data.professionals = []
  assert.equal(
    (await service(data).execute(patient, query)).nearestAvailableAt,
    null,
  )
  await assert.rejects(
    service(data).execute(patient, { ...query, to: '2027-01-01' }),
    { code: 'VALIDATION_ERROR' },
  )
})
