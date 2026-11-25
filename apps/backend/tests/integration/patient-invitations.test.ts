import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { consentAwareNotificationCheck } from '../../src/infrastructure/persistence/prisma/notification-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { composeNotifications } from '../../src/shared/composition/notifications'
import {
  onsitePatientResponse,
  patientInvitationResponse,
} from '../../src/shared/infra/http/contracts/patient-invitations'
import { createBookingFixture } from '../support/m1-bookings'
import { fictitiousCpf } from '../support/m1-database'

let f: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  f = await createBookingFixture()
})
after(async () => {
  if (f) await f.close()
})
const pdf = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
)
async function invited() {
  const email = `${randomUUID()}@example.test`,
    cpf = fictitiousCpf()
  const created = (
    await request(f.app)
      .post('/v1/patients')
      .set('Authorization', f.reception.token)
      .field(
        'data',
        JSON.stringify({
          patient: {
            fullName: 'Paciente fictício convidado',
            cpf,
            birthDate: '1990-01-01',
            email,
          },
          onsiteConsent: {
            versionId: f.documentId,
            consentingPersonName: 'Paciente fictício convidado',
            accepted: true,
          },
        }),
      )
      .attach('signedTerm', pdf, 'termo.pdf')
      .expect(201)
  ).body
  const user = await f.db.user.findUniqueOrThrow({ where: { email } })
  return { patientId: created.patientId as string, userId: user.id, email, cpf }
}
const resend = (patientId: string, token = f.reception.token) =>
  request(f.app)
    .post(`/v1/patients/${patientId}/invitation`)
    .set('Authorization', token)
const lookup = (cpf: string) =>
  request(f.app)
    .get('/v1/onsite-patients')
    .query({ cpf })
    .set('Authorization', f.reception.token)
async function queued(userId: string) {
  const row = await f.db.notification.findFirstOrThrow({
    where: { userId, templateKey: 'account.invited', deliveryStatus: 'queued' },
  })
  assert.ok(row.payloadEncrypted)
  return {
    row,
    token: new AesSecretBox(f.config.encryptionKey, 'notification').open(
      row.payloadEncrypted,
      `notification:${userId}:account.invited`,
    ),
  }
}
const inspect = (token: string) =>
  request(f.app)
    .post('/v1/auth/invitations/inspect')
    .set('Origin', f.config.frontendOrigin)
    .send({ token })

test('Paciente: convite expirado é renovado sem recriar cadastro, entregue na caixa dev e permite ativação/login', async () => {
  const p = await invited(),
    old = await queued(p.userId),
    original = await f.db.patientProfile.findUniqueOrThrow({
      where: { id: p.patientId },
    }),
    before = Date.now()
  await f.db.invitation.updateMany({
    where: { userId: p.userId },
    data: { expiresAt: new Date(Date.now() - 1) },
  })
  await inspect(old.token).expect(410)
  const found = (await lookup(p.cpf).expect(200)).body
  onsitePatientResponse.parse(found)
  assert.deepEqual(found.invitation, {
    canResend: true,
    unavailableReason: null,
  })
  const renewed = (await resend(p.patientId).expect(201)).body
  patientInvitationResponse.parse(renewed)
  const ttl = +new Date(renewed.invitationExpiresAt) - before
  assert.ok(
    ttl >= f.config.inviteLinkHours * 3600000 &&
      ttl < f.config.inviteLinkHours * 3600000 + 10000,
  )
  const fresh = await queued(p.userId)
  assert.notEqual(fresh.token, old.token)
  assert.ok(!JSON.stringify(renewed).includes(fresh.token))
  assert.equal(
    (await f.db.notification.findUniqueOrThrow({ where: { id: old.row.id } }))
      .deliveryStatus,
    'suppressed',
  )
  assert.deepEqual(
    await f.db.patientProfile.findUniqueOrThrow({ where: { id: p.patientId } }),
    original,
  )
  assert.ok(
    await f.db.auditEvent.findFirst({
      where: {
        action: 'account.invited',
        resourceId: p.userId,
        subjectPatientId: p.patientId,
        authorizationBasis: 'role:onsite_registration',
      },
    }),
  )
  await composeNotifications(
    f.config,
    f.db,
    consentAwareNotificationCheck,
  ).dispatcher.deliver(fresh.row.id)
  const mail = JSON.parse(
    await readFile(
      join(f.config.emailMailboxPath, `${fresh.row.id}.json`),
      'utf8',
    ),
  )
  assert.equal(mail.to, p.email)
  assert.equal(new URL(mail.actionUrl).searchParams.get('token'), fresh.token)
  assert.equal(new URL(mail.actionUrl).pathname, '/convite')
  const password = `Paciente-${randomUUID()}`
  await request(f.app)
    .post('/v1/auth/invitations/accept')
    .set('Origin', f.config.frontendOrigin)
    .send({ token: fresh.token, password })
    .expect(200)
  await inspect(fresh.token).expect(410)
  const login = (
    await request(f.app)
      .post('/v1/auth/login')
      .set('Origin', f.config.frontendOrigin)
      .send({ identifier: p.email, password })
      .expect(200)
  ).body
  assert.ok(login.accessToken)
  await request(f.app)
    .get('/v1/me')
    .set('Authorization', `Bearer ${login.accessToken}`)
    .expect(200)
  const unavailable = (await lookup(p.cpf).expect(200)).body.invitation
  assert.equal(unavailable.canResend, false)
  assert.match(unavailable.unavailableReason, /já foi ativada/)
})

test('Paciente: reenvio invalida também convite ainda válido e admin pode reenviar', async () => {
  const p = await invited(),
    old = await queued(p.userId)
  await inspect(old.token).expect(200)
  await resend(p.patientId, f.admin.token).expect(201)
  await inspect(old.token).expect(410)
  await inspect((await queued(p.userId)).token).expect(200)
  const api = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(api.paths['/patients/{id}/invitation'].post)
})

test('Paciente: contas ativas/inativas, sem conta e consentimento revogado/pendente não geram convite', async () => {
  const active = await f.patient(),
    inactive = await invited(),
    revoked = await invited(),
    pending = await invited()
  await f.db.user.update({
    where: { id: inactive.userId },
    data: { status: 'inactive' },
  })
  for (const [p, action] of [
    [revoked, 'revoke'],
    [pending, 'refuse'],
  ] as const)
    await f.db.consentEvent.create({
      data: {
        patientId: p.patientId,
        documentVersionId: f.documentId,
        source: 'portal',
        actorUserId: p.userId,
        consentingPersonName: 'Paciente fictício',
        action,
      },
    })
  const assisted = await f.db.patientProfile.create({
    data: {
      fullName: 'Paciente sem conta',
      cpf: fictitiousCpf(),
      birthDate: new Date('1990-01-01'),
    },
  })
  for (const patientId of [
    active.patientId,
    inactive.patientId,
    revoked.patientId,
    pending.patientId,
    assisted.id,
  ]) {
    const before = await f.db.invitation.count()
    const response = await resend(patientId).expect(409)
    assert.equal(response.body.error.details[0].field, 'invitation')
    assert.equal(await f.db.invitation.count(), before)
  }
  await resend(randomUUID()).expect(404)
})

test('Paciente: RBAC, MFA e payload não permitem convidar conta arbitrária', async () => {
  const p = await invited(),
    manager = await f.account('manager'),
    patient = await f.patient()
  for (const token of [
    manager.token,
    f.professionalAccounts[0].token,
    patient.token,
  ])
    await resend(p.patientId, token).expect(403)
  await request(f.app)
    .post(`/v1/patients/${p.patientId}/invitation`)
    .expect(401)
  await f.db.session.update({
    where: { id: f.reception.session.id },
    data: { mfaVerifiedAt: null },
  })
  try {
    await resend(p.patientId).expect(401)
  } finally {
    await f.db.session.update({
      where: { id: f.reception.session.id },
      data: { mfaVerifiedAt: new Date() },
    })
  }
  await resend(p.patientId)
    .send({ email: 'outro@example.test', userId: f.admin.user.id })
    .expect(400)
  await resend(f.admin.user.id).expect(404)
})

test('Paciente: reenvios concorrentes deixam somente um convite utilizável', async () => {
  const p = await invited()
  await Promise.all([
    resend(p.patientId).expect(201),
    resend(p.patientId, f.admin.token).expect(201),
  ])
  assert.equal(
    await f.db.invitation.count({
      where: { userId: p.userId, consumedAt: null },
    }),
    1,
  )
  assert.equal(
    await f.db.notification.count({
      where: {
        userId: p.userId,
        templateKey: 'account.invited',
        deliveryStatus: 'queued',
      },
    }),
    1,
  )
  await inspect((await queued(p.userId)).token).expect(200)
})

test('Paciente: falha de auditoria reverte token anterior, novo convite e outbox', async () => {
  const p = await invited(),
    old = await queued(p.userId),
    before = await f.db.invitation.count({ where: { userId: p.userId } })
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_patient_invite_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='account.invited' THEN RAISE EXCEPTION 'forced_patient_invite_audit'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER "fail_patient_invite_audit" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_patient_invite_audit()',
  )
  try {
    await resend(p.patientId).expect(500)
    assert.equal(
      await f.db.invitation.count({ where: { userId: p.userId } }),
      before,
    )
    assert.equal(
      (await f.db.notification.findUniqueOrThrow({ where: { id: old.row.id } }))
        .deliveryStatus,
      'queued',
    )
    await inspect(old.token).expect(200)
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER "fail_patient_invite_audit" ON "AuditEvent"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_patient_invite_audit()')
  }
})
