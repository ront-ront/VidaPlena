import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { PreparePatientRegistration } from '../../src/application/use-cases/prepare-patient-registration'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { PrismaPatientRegistrationStore } from '../../src/infrastructure/persistence/prisma/patient-registration-store'
import { JwtAccessTokens } from '../../src/infrastructure/security/access-tokens'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { CryptoOpaqueTokens } from '../../src/infrastructure/security/passwords'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { loadConfig } from '../../src/shared/config/environment'

const base = process.env.TEST_DATABASE_URL
if (!base || !new URL(base).pathname.endsWith('_test'))
  throw new Error('Use TEST_DATABASE_URL de um banco isolado _test.')
const control = createPrismaClient(base)
const databaseName = `vp_${randomUUID().replaceAll('-', '')}_test`
const url = new URL(base)
url.pathname = `/${databaseName}`
const config = loadConfig({
  APP_ENV: 'test',
  DATABASE_URL: url.toString(),
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: randomBytes(32).toString('hex'),
  FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
})
const db = createPrismaClient(config.databaseUrl)
const secret = new AesSecretBox(config.encryptionKey, 'notification')
const store = new PrismaPatientRegistrationStore(db, secret)
const service = new PreparePatientRegistration(
  store,
  config.patientLegalAdultAgeYears,
)
let created = false
before(async () => {
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  await new Promise<void>((resolve, reject) => {
    const child = spawn('yarn', ['prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: config.databaseUrl },
      stdio: 'pipe',
    })
    child.stdout.resume()
    child.stderr.resume()
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Migration de teste falhou.')),
    )
  })
})
after(async () => {
  await db.$disconnect()
  if (created)
    await control.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
  await control.$disconnect()
})

function cpf(prefix: string) {
  let result = prefix
  for (const length of [9, 10]) {
    const sum = [...result].reduce(
      (total, digit, index) => total + Number(digit) * (length + 1 - index),
      0,
    )
    const check = (sum * 10) % 11
    result += check === 10 ? '0' : String(check)
  }
  return result
}
function patient(name: string, identity: string, birthDate = '2015-01-01') {
  return service.prepare(
    { fullName: name, birthDate, cpf: identity, phone: '(85) 99999-9999' },
    'dependent',
  )
}

test('dois dependentes são isolados por responsável e CPF concorrente só cria um perfil', async () => {
  const guardian = service.prepare(
    {
      fullName: 'Responsável Fictício',
      birthDate: '1985-01-01',
      cpf: cpf('123456789'),
      phone: '(85) 99999-9999',
      email: 'guardian@example.test',
    },
    'self',
  )
  const other = service.prepare(
    {
      fullName: 'Outro Responsável',
      birthDate: '1980-01-01',
      cpf: cpf('987654321'),
      phone: '(85) 98888-8888',
      email: 'other-guardian@example.test',
    },
    'self',
  )
  const firstAccount = await store.transaction((tx) =>
    tx.createSelf(guardian, 'bcrypt-test-hash'),
  )
  const secondAccount = await store.transaction((tx) =>
    tx.createSelf(other, 'bcrypt-test-hash'),
  )
  const publisher = await db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      fullName: 'Publicador fictício',
    },
  })
  const term = await db.consentDocumentVersion.create({
    data: {
      kind: 'data',
      version: 'cadastro-test-1',
      bodyReference: 'Termo fictício',
      effectiveAt: new Date(Date.now() - 1000),
      publishedBy: publisher.id,
    },
  })
  for (const account of [firstAccount, secondAccount])
    await db.consentEvent.create({
      data: {
        patientId: account.patientId,
        documentVersionId: term.id,
        action: 'accept',
        actorUserId: account.accountId,
        source: 'portal',
        consentingPersonName: 'Responsável fictício',
      },
    })
  await store.transaction((tx) =>
    tx.createDependent(
      patient('Dependente Um', cpf('111444777')),
      firstAccount.accountId,
      'mãe',
    ),
  )
  await store.transaction((tx) =>
    tx.createDependent(
      patient('Dependente Dois', cpf('222555888')),
      firstAccount.accountId,
      'mãe',
    ),
  )
  assert.equal(
    (await service.dependents(firstAccount.accountId)).items.length,
    2,
  )
  assert.equal(
    (await service.dependents(secondAccount.accountId)).items.length,
    0,
  )
  const duplicate = patient('Terceiro', cpf('333666999'))
  const attempts = await Promise.allSettled([
    store.transaction((tx) =>
      tx.createDependent(duplicate, firstAccount.accountId, 'mãe'),
    ),
    store.transaction((tx) =>
      tx.createDependent(duplicate, firstAccount.accountId, 'mãe'),
    ),
  ])
  assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1)
  assert.equal(
    (
      attempts.find(
        (item) => item.status === 'rejected',
      ) as PromiseRejectedResult
    ).reason.code,
    'CONFLICT',
  )
  const app = await composeBackendApplication(config)
  try {
    const tokens = new JwtAccessTokens(config.jwtSecret)
    const firstSession = await db.session.create({
      data: {
        userId: firstAccount.accountId,
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    })
    const secondSession = await db.session.create({
      data: {
        userId: secondAccount.accountId,
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    })
    const expiresAt = new Date(Date.now() + 600_000)
    const firstToken = await tokens.issue(
      { userId: firstAccount.accountId, sessionId: firstSession.id },
      expiresAt,
    )
    const secondToken = await tokens.issue(
      { userId: secondAccount.accountId, sessionId: secondSession.id },
      expiresAt,
    )
    const own = await request(app.app)
      .get('/v1/me/dependents')
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200)
    const unrelated = await request(app.app)
      .get('/v1/me/dependents')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200)
    assert.equal(own.body.items.length, 3)
    assert.deepEqual(unrelated.body.items, [])
  } finally {
    await app.close()
  }
})

test('cadastro presencial sem e-mail não cria conta; menor sem responsável é recusado', async () => {
  const minor = patient('Menor sem responsável', cpf('444777111'))
  await assert.rejects(
    store.transaction((tx) => tx.createOnsite(minor, randomUUID())),
    { code: 'VALIDATION_ERROR' },
  )
  const adult = service.prepare(
    {
      fullName: 'Adulto sem e-mail',
      birthDate: '1990-03-01',
      cpf: cpf('555888222'),
      phone: '(85) 97777-7777',
    },
    'onsite',
  )
  const result = await store.transaction((tx) =>
    tx.createOnsite(adult, randomUUID()),
  )
  assert.equal(result.accountId, null)
  assert.equal(
    (
      await db.patientProfile.findUniqueOrThrow({
        where: { id: result.patientId },
      })
    ).userId,
    null,
  )
  const reception = await db.user.create({
    data: {
      email: 'reception-patient@example.test',
      fullName: 'Recepção Fictícia',
      status: 'active',
      roles: { create: { roleCode: 'receptionist' } },
    },
  })
  const withEmail = service.prepare(
    {
      fullName: 'Adulto com e-mail',
      birthDate: '1991-03-01',
      cpf: cpf('666999333'),
      phone: '(85) 96666-6666',
      email: 'onsite@example.test',
    },
    'onsite',
  )
  const tokens = new CryptoOpaqueTokens()
  const token = tokens.issue()
  const invited = await store.transaction((tx) =>
    tx.createOnsite(withEmail, reception.id, undefined, undefined, {
      tokenHash: tokens.digest(token),
      expiresAt: new Date(Date.now() + 48 * 3_600_000),
      token,
      requestId: randomUUID(),
    }),
  )
  assert.ok(invited.accountId)
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: invited.accountId } }))
      .status,
    'invited',
  )
  const invitation = await db.invitation.findFirstOrThrow({
    where: { userId: invited.accountId },
  })
  assert.equal(invitation.tokenHash, tokens.digest(token))
  const notice = await db.notification.findFirstOrThrow({
    where: { userId: invited.accountId, templateKey: 'account.invited' },
  })
  assert.ok(notice.payloadEncrypted)
  assert.ok(!JSON.stringify(notice).includes(token))
  assert.equal(
    secret.open(
      notice.payloadEncrypted,
      `notification:${invited.accountId}:account.invited`,
    ),
    token,
  )
})
