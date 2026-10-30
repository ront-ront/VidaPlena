import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { PrismaIdentityReader } from '../../src/infrastructure/persistence/prisma/identity-reader'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error(
    'Configure TEST_DATABASE_URL para banco isolado com sufixo _test.',
  )
const db = createPrismaClient(url)
after(() => db.$disconnect())

test('reference seed contains exactly five roles', async () => {
  assert.deepEqual((await db.role.findMany()).map((r) => r.code).sort(), [
    'admin',
    'manager',
    'patient',
    'professional',
    'receptionist',
  ])
  assert.ok(await db.permission.findUnique({ where: { code: 'privacy.dpo' } }))
})

test('normalized email and CPF uniqueness hold under concurrency', async () => {
  const email = `${randomUUID()}@example.test`
  const accounts = await Promise.allSettled([
    db.user.create({ data: { email, fullName: 'Fictício A' } }),
    db.user.create({
      data: { email: ` ${email.toUpperCase()} `, fullName: 'Fictício B' },
    }),
  ])
  assert.equal(accounts.filter((r) => r.status === 'fulfilled').length, 1)
  const cpf = String(Date.now()).slice(-11)
  const patients = await Promise.allSettled(
    [1, 2].map(() =>
      db.patientProfile.create({
        data: { cpf, fullName: 'Fictício', birthDate: new Date('2015-01-01') },
      }),
    ),
  )
  assert.equal(patients.filter((r) => r.status === 'fulfilled').length, 1)
})

test('two dependents remain scoped and inactive accounts preserve foreign keys', async () => {
  const guardian = await db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      fullName: 'Responsável fictício',
    },
  })
  const base = BigInt(Date.now()) % 90000000000n
  for (let index = 0; index < 2; index++) {
    await db.patientProfile.create({
      data: {
        cpf: String(base + BigInt(index)).padStart(11, '0'),
        fullName: `Dependente ${index}`,
        birthDate: new Date('2018-01-01'),
        guardians: {
          create: {
            guardianUserId: guardian.id,
            relationship: 'responsável legal',
          },
        },
      },
    })
  }
  const reader = new PrismaIdentityReader(db)
  assert.equal((await reader.listDependents(guardian.id)).length, 2)
  assert.deepEqual(await reader.listDependents(randomUUID()), [])
  await db.user.update({
    where: { id: guardian.id },
    data: { status: 'inactive' },
  })
  assert.equal((await reader.findByEmail(guardian.email))?.status, 'inactive')
  await assert.rejects(db.user.delete({ where: { id: guardian.id } }))
  await assert.rejects(
    db.guardianLink.create({
      data: {
        guardianUserId: randomUUID(),
        patientId: randomUUID(),
        relationship: 'invalid',
      },
    }),
  )
})
