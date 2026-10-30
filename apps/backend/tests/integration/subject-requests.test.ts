import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { JwtAccessTokens } from '../../src/infrastructure/security/access-tokens'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { loadConfig } from '../../src/shared/config/environment'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use TEST_DATABASE_URL de um banco isolado _test.')
const control = createPrismaClient(url)
const databaseName = `vp_${randomUUID().replaceAll('-', '')}_test`
const isolated = new URL(url)
isolated.pathname = `/${databaseName}`
const config = loadConfig({
  APP_ENV: 'test',
  DATABASE_URL: isolated.toString(),
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: randomBytes(32).toString('hex'),
  FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PRIVACY_SUBJECT_REQUEST_DAYS: '17',
})
const db = createPrismaClient(config.databaseUrl)
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

async function user(roleCode: 'admin' | 'manager' | 'patient') {
  return db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      fullName: `Usuário ${roleCode}`,
      status: 'active',
      roles: { create: { roleCode } },
    },
  })
}
async function bearer(userId: string, mfa = false) {
  const session = await db.session.create({
    data: {
      userId,
      refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
      ...(mfa ? { mfaVerifiedAt: new Date() } : {}),
    },
  })
  const token = await new JwtAccessTokens(config.jwtSecret).issue(
    { userId, sessionId: session.id },
    new Date(Date.now() + 600_000),
  )
  return `Bearer ${token}`
}

test('pedidos próprios, fila DPO, retenção e exportação cifrada', async () => {
  const app = await composeBackendApplication(config)
  try {
    const admin = await user('admin')
    const manager = await user('manager')
    const patient = await user('patient')
    const stranger = await user('patient')
    const adminToken = await bearer(admin.id, true)
    const managerToken = await bearer(manager.id, true)
    const patientToken = await bearer(patient.id)
    const strangerToken = await bearer(stranger.id)
    const profile = await db.patientProfile.create({
      data: {
        userId: patient.id,
        fullName: 'Paciente Titular',
        birthDate: new Date('1990-01-01'),
        cpf: '12345678901',
        status: 'active',
      },
    })
    const other = await db.patientProfile.create({
      data: {
        userId: stranger.id,
        fullName: 'Outro Paciente',
        birthDate: new Date('1992-01-01'),
        cpf: '98765432100',
        status: 'active',
      },
    })
    const version = await db.consentDocumentVersion.create({
      data: {
        kind: 'data',
        version: 'v1',
        bodyReference: '# Termo sigiloso',
        effectiveAt: new Date(Date.now() - 60_000),
        publishedBy: admin.id,
      },
    })
    await db.consentEvent.create({
      data: {
        patientId: profile.id,
        documentVersionId: version.id,
        action: 'accept',
        actorUserId: patient.id,
        source: 'portal',
        consentingPersonName: patient.fullName,
      },
    })
    await db.consentEvent.create({
      data: {
        patientId: other.id,
        documentVersionId: version.id,
        action: 'accept',
        actorUserId: stranger.id,
        source: 'portal',
        consentingPersonName: stranger.fullName,
      },
    })
    await request(app.app)
      .post('/v1/me/subject-requests')
      .set('Authorization', patientToken)
      .send({ patientId: other.id, kind: 'export' })
      .expect(404)
    const openedAt = Date.now()
    const opened = await request(app.app)
      .post('/v1/me/subject-requests')
      .set('Authorization', patientToken)
      .send({ patientId: profile.id, kind: 'export' })
      .expect(201)
    assert.equal(opened.body.status, 'open')
    assert.ok(
      Math.abs(
        new Date(opened.body.dueAt).getTime() - openedAt - 17 * 86_400_000,
      ) < 10_000,
    )
    const requestId = opened.body.requestId as string
    await request(app.app)
      .get('/v1/privacy/subject-requests')
      .set('Authorization', managerToken)
      .expect(403)
    const fallback = await request(app.app)
      .get('/v1/privacy/subject-requests')
      .set('Authorization', adminToken)
      .expect(200)
    assert.equal(fallback.body.items[0].id, requestId)
    await db.userPermissionGrant.create({
      data: {
        userId: manager.id,
        permissionCode: 'privacy.dpo',
        grantedBy: admin.id,
      },
    })
    await request(app.app)
      .get('/v1/privacy/subject-requests')
      .set('Authorization', adminToken)
      .expect(403)
    const queue = await request(app.app)
      .get('/v1/privacy/subject-requests')
      .set('Authorization', managerToken)
      .expect(200)
    assert.equal(queue.body.items[0].description, undefined)
    const consents = await request(app.app)
      .get('/v1/privacy/consents')
      .set('Authorization', managerToken)
      .query({ patientId: profile.id })
      .expect(200)
    assert.equal(consents.body.items.length, 1)
    assert.equal(consents.body.items[0].version, 'v1')
    assert.equal(consents.body.items[0].signedFileId, undefined)
    assert.equal(
      JSON.stringify(consents.body).includes('Termo sigiloso'),
      false,
    )
    await request(app.app)
      .get('/v1/privacy/consents')
      .set('Authorization', adminToken)
      .expect(403)
    const resolved = await request(app.app)
      .post(`/v1/privacy/subject-requests/${requestId}/resolve`)
      .set('Authorization', managerToken)
      .send({ decision: 'approved', explanation: 'Exportação solicitada.' })
      .expect(200)
    assert.equal(resolved.body.exportReady, true)
    const atRest = await db.dataSubjectExport.findUniqueOrThrow({
      where: { requestId },
    })
    assert.equal(atRest.payloadEncrypted.includes('Paciente Titular'), false)
    await request(app.app)
      .get(`/v1/me/subject-requests/${requestId}/export`)
      .set('Authorization', strangerToken)
      .expect(404)
    await request(app.app)
      .get(`/v1/me/subject-requests/${requestId}/export`)
      .set('Authorization', managerToken)
      .expect(404)
    const download = await request(app.app)
      .get(`/v1/me/subject-requests/${requestId}/export`)
      .set('Authorization', patientToken)
      .expect(200)
    assert.equal(download.body.patient.id, profile.id)
    assert.equal(download.body.consents[0].version, 'v1')
    assert.ok(
      await db.auditEvent.findFirst({
        where: { action: 'privacy.export_downloaded', resourceId: requestId },
      }),
    )
    assert.ok(
      await db.auditEvent.findFirst({
        where: {
          action: 'privacy.consent_metadata_viewed',
          subjectPatientId: profile.id,
        },
      }),
    )
    const erasure = await request(app.app)
      .post('/v1/me/subject-requests')
      .set('Authorization', patientToken)
      .send({ patientId: profile.id, kind: 'erasure' })
      .expect(201)
    await request(app.app)
      .post(`/v1/privacy/subject-requests/${erasure.body.requestId}/resolve`)
      .set('Authorization', managerToken)
      .send({ decision: 'approved', explanation: 'Excluir tudo.' })
      .expect(409)
    const preserved = await request(app.app)
      .post(`/v1/privacy/subject-requests/${erasure.body.requestId}/resolve`)
      .set('Authorization', managerToken)
      .send({
        decision: 'retained',
        explanation: 'Guarda legal sob análise P-01.',
      })
      .expect(200)
    assert.deepEqual(preserved.body.resolution.deleted, [])
    assert.ok(preserved.body.resolution.preserved.includes('clinical.record'))
    assert.ok(await db.patientProfile.findUnique({ where: { id: profile.id } }))
  } finally {
    await app.close()
  }
})
