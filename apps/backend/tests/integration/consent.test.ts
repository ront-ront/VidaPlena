import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import request from 'supertest'
import type { NotificationMessage } from '../../src/application/ports/notifications'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import {
  dataConsentState,
  userDataConsentState,
} from '../../src/infrastructure/persistence/prisma/consent-state'
import { consentAwareNotificationCheck } from '../../src/infrastructure/persistence/prisma/notification-store'
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
const fileDirectory = join(tmpdir(), `vp-consent-files-${randomUUID()}`)
const config = loadConfig({
  APP_ENV: 'test',
  DATABASE_URL: isolated.toString(),
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: randomBytes(32).toString('hex'),
  FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  FILE_STORAGE_PATH: fileDirectory,
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
  await rm(fileDirectory, { recursive: true, force: true })
})

async function bearer(userId: string, mfa = false) {
  const session = await db.session.create({
    data: {
      userId,
      refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
      ...(mfa ? { mfaVerifiedAt: new Date() } : {}),
    },
  })
  const access = await new JwtAccessTokens(config.jwtSecret).issue(
    { userId, sessionId: session.id },
    new Date(Date.now() + 600_000),
  )
  return `Bearer ${access}`
}

function cpf(prefix: string) {
  let value = prefix
  for (const length of [9, 10]) {
    const sum = [...value].reduce(
      (total, digit, index) => total + Number(digit) * (length + 1 - index),
      0,
    )
    const check = (sum * 10) % 11
    value += check === 10 ? '0' : String(check)
  }
  return value
}

test('cadastro e aceite são atômicos; versão nova exige aceite e revogação bloqueia sessão', async () => {
  const app = await composeBackendApplication(config)
  try {
    const admin = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        fullName: 'Admin fictício',
        status: 'active',
        roles: { create: { roleCode: 'admin' } },
      },
    })
    const adminToken = await bearer(admin.id, true)
    const suffix = randomUUID().slice(0, 8)
    const published = await request(app.app)
      .post('/v1/admin/consent-documents')
      .set('Authorization', adminToken)
      .send({
        kind: 'data',
        version: `teste-${suffix}-1`,
        bodyReference: '# Termo de dados de teste',
        effectiveAt: new Date(Date.now() - 3_600_000).toISOString(),
      })
      .expect(201)
    const documentId = published.body.id as string
    const identity = cpf('987123456')
    const registration = {
      mode: 'self',
      patient: {
        fullName: 'Paciente de Consentimento',
        birthDate: '1990-01-01',
        cpf: identity,
        phone: '(85) 98888-7777',
        email: `${randomUUID()}@example.test`,
      },
      password: 'Senha-Segura-2026!',
      consent: { versionId: documentId, accepted: true },
    }
    await request(app.app)
      .post('/v1/patient-registrations')
      .set('Origin', 'http://localhost:3000')
      .send({
        ...registration,
        consent: { ...registration.consent, accepted: false },
      })
      .expect(400)
    assert.equal(await db.patientProfile.count({ where: { cpf: identity } }), 0)
    const created = await request(app.app)
      .post('/v1/patient-registrations')
      .set('Origin', 'http://localhost:3000')
      .send(registration)
      .expect(201)
    const patientId = created.body.patientId as string
    const profile = await db.patientProfile.findUniqueOrThrow({
      where: { id: patientId },
    })
    assert.ok(profile.userId)
    assert.equal(await userDataConsentState(db, profile.userId), 'active')
    const notification = {
      id: randomUUID(),
      userId: profile.userId,
      patientId,
      templateKey: 'auth.password_reset',
      category: 'essential',
      payloadEncrypted: null,
      requestId: randomUUID(),
      attempts: 0,
    } as NotificationMessage
    assert.equal(
      await db.$transaction((tx) =>
        consentAwareNotificationCheck(tx, notification),
      ),
      true,
    )
    await assert.rejects(
      db.consentEvent.update({
        where: { id: created.body.consentEventId },
        data: { action: 'refuse' },
      }),
    )
    const patientToken = await bearer(profile.userId)
    const dependent = await request(app.app)
      .post('/v1/patient-registrations')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', patientToken)
      .send({
        mode: 'dependent',
        patient: {
          fullName: 'Dependente Fictício',
          birthDate: '2015-01-01',
          cpf: cpf('321654987'),
          phone: '(85) 97777-8888',
        },
        guardianRelationship: 'mãe',
        consent: { versionId: documentId, accepted: true },
      })
      .expect(201)
    const dependentEvent = await db.consentEvent.findUniqueOrThrow({
      where: { id: dependent.body.consentEventId },
    })
    assert.ok(dependentEvent.guardianLinkId)
    assert.equal(dependentEvent.consentingPersonName, profile.fullName)
    await request(app.app)
      .post('/v1/me/consents')
      .set('Authorization', patientToken)
      .send({ patientId, versionId: documentId, action: 'refuse' })
      .expect(201)
    assert.equal(await userDataConsentState(db, profile.userId), 'pending')
    await request(app.app)
      .post('/v1/me/consents')
      .set('Authorization', patientToken)
      .send({ patientId, versionId: documentId, action: 'accept' })
      .expect(201)
    assert.equal(await userDataConsentState(db, profile.userId), 'active')
    const second = await request(app.app)
      .post('/v1/admin/consent-documents')
      .set('Authorization', adminToken)
      .send({
        kind: 'data',
        version: `teste-${suffix}-2`,
        bodyReference: '# Termo atualizado de teste',
        effectiveAt: new Date(Date.now() - 1_000).toISOString(),
      })
      .expect(201)
    assert.equal(await userDataConsentState(db, profile.userId), 'pending')
    await request(app.app)
      .get('/v1/me/dependents')
      .set('Authorization', patientToken)
      .expect(403)
    const pendingProfile = await request(app.app)
      .get('/v1/me')
      .set('Authorization', patientToken)
      .expect(200)
    assert.equal(pendingProfile.body.consentState, 'pending')
    const foreignPatientId = randomUUID()
    await request(app.app)
      .post('/v1/me/consents')
      .set('Authorization', patientToken)
      .send({
        patientId: foreignPatientId,
        versionId: second.body.id,
        action: 'accept',
      })
      .expect(404)
    assert.equal(
      await db.auditEvent.count({
        where: {
          actorUserId: profile.userId,
          action: 'authorization.denied',
          resourceType: 'consent_patient',
          resourceId: foreignPatientId,
        },
      }),
      1,
    )
    await request(app.app)
      .post('/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({
        identifier: registration.patient.email,
        password: registration.password,
      })
      .expect(200)
    await request(app.app)
      .post('/v1/me/consents')
      .set('Authorization', patientToken)
      .send({ patientId, versionId: second.body.id, action: 'accept' })
      .expect(201)
    assert.equal(await userDataConsentState(db, profile.userId), 'active')
    const dependents = await request(app.app)
      .get('/v1/me/dependents')
      .set('Authorization', patientToken)
      .expect(200)
    assert.equal(dependents.body.items.length, 1)
    const history = await request(app.app)
      .get('/v1/me/consents')
      .set('Authorization', patientToken)
      .expect(200)
    assert.equal(history.body.items.length, 5)
    assert.equal(
      await db.auditEvent.count({
        where: {
          actorUserId: profile.userId,
          action: 'consent.history_viewed',
        },
      }),
      1,
    )
    await request(app.app)
      .post('/v1/me/consents/revoke')
      .set('Authorization', patientToken)
      .send({ patientId, versionId: second.body.id })
      .expect(201)
    assert.equal(await userDataConsentState(db, profile.userId), 'revoked')
    await request(app.app)
      .post('/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({
        identifier: registration.patient.email,
        password: registration.password,
      })
      .expect(409)
    assert.equal(
      await db.$transaction((tx) =>
        consentAwareNotificationCheck(tx, notification),
      ),
      false,
    )
    await request(app.app)
      .get('/v1/me/dependents')
      .set('Authorization', patientToken)
      .expect(401)
    assert.equal(await db.consentEvent.count({ where: { patientId } }), 5)
    assert.ok(await db.patientProfile.findUnique({ where: { id: patientId } }))
  } finally {
    await app.close()
  }
})

test('recepção registra consentimento presencial com termo real e sem arquivo órfão em erro', async () => {
  const app = await composeBackendApplication(config)
  try {
    const reception = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        fullName: 'Recepção fictícia',
        status: 'active',
        roles: { create: { roleCode: 'receptionist' } },
      },
    })
    const token = await bearer(reception.id, true)
    const publisher = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        fullName: 'Publicador fictício',
      },
    })
    await db.consentDocumentVersion.create({
      data: {
        kind: 'data',
        version: `presencial-${randomUUID()}`,
        bodyReference: 'Termo presencial de teste',
        effectiveAt: new Date(Date.now() - 100),
        publishedBy: publisher.id,
      },
    })
    const version = await request(app.app)
      .get('/v1/consent-documents/current?kind=data')
      .expect(200)
    const patient = {
      fullName: 'Paciente Presencial Fictícia',
      birthDate: '1989-07-01',
      cpf: cpf('456987123'),
      phone: '(85) 98888-6666',
    }
    const data = {
      patient,
      onsiteConsent: {
        versionId: version.body.id,
        consentingPersonName: patient.fullName,
        accepted: true,
      },
    }
    const pdf = Buffer.from(
      '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
    )
    const beforeFiles = await db.fileObject.count()
    await request(app.app)
      .post('/v1/patients')
      .set('Authorization', token)
      .field('data', JSON.stringify(data))
      .attach('signedTerm', pdf, 'falso.jpg')
      .expect(422)
    assert.equal(
      await db.patientProfile.count({ where: { cpf: patient.cpf } }),
      0,
    )
    assert.equal(await db.fileObject.count(), beforeFiles)
    const result = await request(app.app)
      .post('/v1/patients')
      .set('Authorization', token)
      .field('data', JSON.stringify(data))
      .attach('signedTerm', pdf, 'termo.pdf')
    assert.equal(result.status, 201, JSON.stringify(result.body))
    assert.equal(result.body.accountState, 'assisted')
    const event = await db.consentEvent.findUniqueOrThrow({
      where: { id: result.body.consentEventId },
    })
    assert.equal(event.signedFileId, result.body.signedFileId)
    assert.equal(event.source, 'onsite')
    assert.equal(event.consentingPersonName, patient.fullName)
    const nextVersion = await db.consentDocumentVersion.create({
      data: {
        kind: 'data',
        version: `presencial-novo-${randomUUID()}`,
        bodyReference: 'Termo presencial atualizado',
        effectiveAt: new Date(Date.now() - 50),
        publishedBy: publisher.id,
      },
    })
    const repeated = await request(app.app)
      .post(`/v1/patients/${result.body.patientId}/onsite-consents`)
      .set('Authorization', token)
      .field(
        'data',
        JSON.stringify({
          versionId: nextVersion.id,
          consentingPersonName: patient.fullName,
          accepted: true,
        }),
      )
      .attach('signedTerm', pdf, 'termo.pdf')
    assert.equal(repeated.status, 201, JSON.stringify(repeated.body))
    assert.notEqual(repeated.body.consentEventId, event.id)
    assert.equal(
      (await db.consentEvent.findUniqueOrThrow({ where: { id: event.id } }))
        .documentVersionId,
      version.body.id,
    )
    assert.equal(
      await db.consentEvent.count({
        where: { patientId: result.body.patientId },
      }),
      2,
    )
    const minor = {
      fullName: 'Menor Fictício Presencial',
      birthDate: '2016-01-01',
      cpf: cpf('741852963'),
      phone: '(85) 96666-5555',
    }
    const withoutGuardian = await request(app.app)
      .post('/v1/patients')
      .set('Authorization', token)
      .field(
        'data',
        JSON.stringify({
          patient: minor,
          onsiteConsent: {
            versionId: nextVersion.id,
            consentingPersonName: 'Pessoa sem vínculo',
            accepted: true,
          },
        }),
      )
      .attach('signedTerm', pdf, 'termo.pdf')
      .expect(400)
    assert.equal(withoutGuardian.body.error.code, 'VALIDATION_ERROR')
    assert.equal(
      await db.patientProfile.count({ where: { cpf: minor.cpf } }),
      0,
    )
    const guardian = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        fullName: 'Mãe Fictícia Presencial',
        status: 'active',
        roles: { create: { roleCode: 'patient' } },
      },
    })
    const guardianProfile = await db.patientProfile.create({
      data: {
        userId: guardian.id,
        fullName: guardian.fullName,
        birthDate: new Date('1985-01-01'),
        cpf: cpf('963852741'),
      },
    })
    await db.consentEvent.create({
      data: {
        patientId: guardianProfile.id,
        documentVersionId: nextVersion.id,
        action: 'accept',
        actorUserId: guardian.id,
        source: 'portal',
        consentingPersonName: guardian.fullName,
      },
    })
    const represented = await request(app.app)
      .post('/v1/patients')
      .set('Authorization', token)
      .field(
        'data',
        JSON.stringify({
          patient: minor,
          guardianUserId: guardian.id,
          guardianRelationship: 'mãe',
          onsiteConsent: {
            versionId: nextVersion.id,
            consentingPersonName: guardian.fullName,
            consentingRelationship: 'mãe',
            accepted: true,
          },
        }),
      )
      .attach('signedTerm', pdf, 'termo.pdf')
      .expect(201)
    const representedEvent = await db.consentEvent.findUniqueOrThrow({
      where: { id: represented.body.consentEventId },
    })
    assert.ok(representedEvent.guardianLinkId)
    assert.equal(representedEvent.consentingRelationship, 'mãe')
    const evidenceFile = await db.fileObject.findUniqueOrThrow({
      where: { id: represented.body.signedFileId },
    })
    assert.equal(evidenceFile.ownerPatientId, represented.body.patientId)
    assert.equal(
      await dataConsentState(db, represented.body.patientId),
      'active',
    )
    assert.equal(await userDataConsentState(db, guardian.id), 'active')
    await assert.rejects(
      db.fileObject.update({
        where: { id: represented.body.signedFileId },
        data: { scanStatus: 'changed' },
      }),
    )
    await request(app.app)
      .post(`/v1/files/${represented.body.signedFileId}/download-link`)
      .set('Authorization', token)
      .expect(404)
    const guardianToken = await bearer(guardian.id)
    const link = await request(app.app)
      .post(`/v1/files/${represented.body.signedFileId}/download-link`)
      .set('Authorization', guardianToken)
      .expect(200)
    await request(app.app)
      .get(link.body.url)
      .set('Authorization', guardianToken)
      .expect(200)
    assert.equal(
      await db.auditEvent.count({
        where: {
          action: 'file.downloaded',
          resourceId: represented.body.signedFileId,
        },
      }),
      1,
    )
  } finally {
    await app.close()
  }
})
