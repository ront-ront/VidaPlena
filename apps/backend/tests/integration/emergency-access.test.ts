import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { AuthorizeClinical } from '../../src/application/use-cases/authorize-clinical'
import { DispatchNotifications } from '../../src/application/use-cases/dispatch-notifications'
import { ManageCareLinks } from '../../src/application/use-cases/manage-care-links'
import { ManageEmergencyAccess } from '../../src/application/use-cases/manage-emergency-access'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { PrismaCareLinkStore } from '../../src/infrastructure/persistence/prisma/care-link-store'
import { PrismaEmergencyAccessStore } from '../../src/infrastructure/persistence/prisma/emergency-access-store'
import {
  consentAwareNotificationCheck,
  PrismaNotificationStore,
} from '../../src/infrastructure/persistence/prisma/notification-store'
import { AesSecretBox } from '../../src/infrastructure/security/aes-secret-box'
import { loadConfig } from '../../src/shared/config/environment'
import {
  emergencyDetailSchema,
  emergencyQueueSchema,
  emergencyReviewSchema,
} from '../../src/shared/infra/http/contracts/emergency-access'
import { createBookingFixture } from '../support/m1-bookings'

let f: Awaited<ReturnType<typeof createBookingFixture>>
before(async () => {
  f = await createBookingFixture()
})
after(async () => {
  if (f) await f.close()
})
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  originClient: 'test',
  authorizationBasis: 'test',
})
const professional = () =>
  f.principal(f.professionalAccounts[0], 'professional')
function services(
  now = new Date(),
  duration = f.config.emergencyAccessDurationMinutes,
) {
  const audit = new PrismaAuditWriter(f.db),
    links = new PrismaCareLinkStore(
      f.db,
      f.config.careLinkPolicy,
      {
        internalMinutes: f.config.internalIdleMinutes,
        patientMinutes: f.config.patientIdleMinutes,
      },
      new AesSecretBox(f.config.encryptionKey, 'care-link'),
    )
  const store = new PrismaEmergencyAccessStore(
    f.db,
    links,
    new AesSecretBox(f.config.encryptionKey, 'emergency-access'),
  )
  return {
    store,
    emergency: new ManageEmergencyAccess(store, audit, duration, () => now),
    clinical: new AuthorizeClinical(
      store,
      new ManageCareLinks(links, audit, f.config.careLinkPolicy, () => now),
      audit,
      () => now,
    ),
  }
}
async function grant(
  patientId: string,
  justification = 'Motivo excepcional de teste',
) {
  return (
    await request(f.app)
      .post('/v1/clinical/emergency-access')
      .set('Authorization', f.professionalAccounts[0].token)
      .send({ patientId, justification })
      .expect(201)
  ).body as { grantId: string; expiresAt: string }
}
const detail = (id: string, token = f.admin.token) =>
  request(f.app)
    .get(`/v1/clinical/emergency-access/${id}`)
    .set('Authorization', token)
const review = (id: string, outcome = 'approved', token = f.admin.token) =>
  request(f.app)
    .post(`/v1/admin/emergency-access/${id}/review`)
    .set('Authorization', token)
    .send({ outcome, notes: 'Revisão administrativa de teste' })

test('BE-031: justificativa, papéis e IDs inválidos não concedem urgência', async () => {
  const p = await f.patient(),
    before = await f.db.emergencyAccessGrant.count()
  for (const token of [
    f.admin.token,
    f.reception.token,
    p.token,
    (await f.account('manager')).token,
  ]) {
    await request(f.app)
      .post('/v1/clinical/emergency-access')
      .set('Authorization', token)
      .send({ patientId: p.patientId, justification: 'Teste' })
      .expect(403)
  }
  for (const justification of ['', '   ', 'a'.repeat(1001)])
    await request(f.app)
      .post('/v1/clinical/emergency-access')
      .set('Authorization', f.professionalAccounts[0].token)
      .send({ patientId: p.patientId, justification })
      .expect(400)
  await request(f.app)
    .post('/v1/clinical/emergency-access')
    .set('Authorization', f.professionalAccounts[0].token)
    .send({ patientId: randomUUID(), justification: 'Teste' })
    .expect(404)
  assert.equal(await f.db.emergencyAccessGrant.count(), before)
})
test('BE-031: grant, outbox e auditoria são atômicos, cifrados e sem conteúdo nas mensagens', async () => {
  const p = await f.patient(),
    justification = 'Justificativa privada para teste',
    result = await grant(p.patientId, justification)
  const row = await f.db.emergencyAccessGrant.findUniqueOrThrow({
    where: { id: result.grantId },
  })
  assert.equal(
    +row.expiresAt - +row.grantedAt,
    f.config.emergencyAccessDurationMinutes * 60000,
  )
  assert.ok(!row.justificationEncrypted.includes(justification))
  const notifications = await f.db.notification.findMany({
    where: { aggregateId: row.id },
  })
  assert.ok(
    notifications.some(
      (n) =>
        n.userId === f.admin.user.id &&
        n.templateKey === 'privacy.emergency_requested',
    ),
  )
  assert.ok(
    notifications.some(
      (n) =>
        n.userId === f.admin.user.id && n.templateKey === 'privacy.dpo_missing',
    ),
  )
  assert.ok(
    notifications.every(
      (n) =>
        n.patientId === null &&
        n.payloadEncrypted === null &&
        n.category === 'essential',
    ),
  )
  const audit = await f.db.auditEvent.findFirstOrThrow({
    where: { resourceId: row.id, action: 'emergency_access.granted' },
  })
  assert.equal(audit.authorizationBasis, `emergency_access:${row.id}`)
  assert.equal(
    audit.metadataSafe &&
      (audit.metadataSafe as { reasonCode: string }).reasonCode,
    'no_dpo',
  )
  assert.ok(!JSON.stringify(audit).includes(justification))
  const response = await detail(row.id).expect(200)
  emergencyDetailSchema.parse(response.body)
  assert.equal(response.body.justification, justification)
  assert.equal(response.headers['cache-control'], 'no-store')
  await detail(row.id, f.professionalAccounts[0].token).expect(200)
  await detail(row.id, f.professionalAccounts[1].token).expect(404)
  await detail(row.id, p.token).expect(404)
  await detail(row.id, f.reception.token).expect(404)
})
test('BE-031: cada uso tem base de urgência e expiração exata sem encerrar a sessão', async () => {
  const p = await f.patient(),
    now = new Date(),
    s = services(now, 2)
  const g = await s.emergency.request(
    professional(),
    { patientId: p.patientId, justification: 'Teste do relógio' },
    context(),
  )
  const expiry = new Date(g.expiresAt)
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await services(new Date(+expiry - 1)).clinical.authorize(
          professional(),
          p.patientId,
          context(),
        )
      ).source,
      'emergency',
    )
  await assert.rejects(
    services(new Date(+now - 1)).clinical.authorize(
      professional(),
      p.patientId,
      context(),
    ),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  const concurrent = await Promise.allSettled(
    [0, 1, 2].map(() =>
      services(expiry).clinical.authorize(
        professional(),
        p.patientId,
        context(),
      ),
    ),
  )
  assert.ok(
    concurrent.every(
      (r) =>
        r.status === 'rejected' && r.reason.code === 'NOT_FOUND_OR_FORBIDDEN',
    ),
  )
  const events = await f.db.auditEvent.findMany({
    where: { subjectPatientId: p.patientId, action: 'clinical.access_checked' },
  })
  assert.equal(events.length, 2)
  assert.ok(
    events.every(
      (e) =>
        e.authorizationBasis === `emergency_access:${g.grantId}` &&
        e.originClient === 'test',
    ),
  )
  assert.equal(
    (
      await services(expiry).emergency.detail(
        professional(),
        g.grantId,
        context(),
      )
    ).status,
    'expired',
  )
  assert.equal(
    await f.db.auditEvent.count({
      where: { resourceId: p.patientId, action: 'authorization.denied' },
    }),
    4,
  )
})
test('BE-031: perfil, MFA, papel e conta são reavaliados por leitura', async () => {
  const p = await f.patient(),
    g = await grant(p.patientId),
    account = f.professionalAccounts[0]
  await f.db.professionalProfile.update({
    where: { id: f.professionalIds[0] },
    data: { active: false },
  })
  try {
    await assert.rejects(
      services().clinical.authorize(professional(), p.patientId, context()),
      { code: 'FORBIDDEN' },
    )
  } finally {
    await f.db.professionalProfile.update({
      where: { id: f.professionalIds[0] },
      data: { active: true },
    })
  }
  await f.db.session.update({
    where: { id: account.session.id },
    data: { mfaVerifiedAt: null },
  })
  try {
    await assert.rejects(
      services().clinical.authorize(professional(), p.patientId, context()),
      { code: 'FORBIDDEN' },
    )
  } finally {
    await f.db.session.update({
      where: { id: account.session.id },
      data: { mfaVerifiedAt: new Date() },
    })
  }
  await f.db.userRoleAssignment.updateMany({
    where: {
      userId: account.user.id,
      roleCode: 'professional',
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
  try {
    await assert.rejects(
      services().clinical.authorize(professional(), p.patientId, context()),
      { code: 'FORBIDDEN' },
    )
  } finally {
    await f.db.userRoleAssignment.create({
      data: { userId: account.user.id, roleCode: 'professional' },
    })
  }
  await f.db.user.update({
    where: { id: account.user.id },
    data: { status: 'inactive' },
  })
  try {
    await assert.rejects(
      services().clinical.authorize(professional(), p.patientId, context()),
      { code: 'FORBIDDEN' },
    )
  } finally {
    await f.db.user.update({
      where: { id: account.user.id },
      data: { status: 'active' },
    })
  }
  assert.equal(
    (
      await services().clinical.authorize(
        professional(),
        p.patientId,
        context(),
      )
    ).id,
    g.grantId,
  )
})
test('BE-031: revisão única concorrente, rejeição imediata e evidência imutável no banco', async () => {
  const p = await f.patient(),
    g = await grant(p.patientId),
    original = await f.db.emergencyAccessGrant.findUniqueOrThrow({
      where: { id: g.grantId },
    })
  const attempts = await Promise.all([
    review(g.grantId, 'rejected'),
    review(g.grantId, 'rejected'),
  ])
  assert.deepEqual(attempts.map((a) => a.status).sort(), [200, 409])
  const body = attempts.find((a) => a.status === 200)?.body
  emergencyReviewSchema.parse(body)
  await assert.rejects(
    services().clinical.authorize(professional(), p.patientId, context()),
    { code: 'NOT_FOUND_OR_FORBIDDEN' },
  )
  const d = (await detail(g.grantId).expect(200)).body
  assert.equal(d.status, 'revoked')
  assert.equal(d.review.outcome, 'rejected')
  assert.deepEqual(
    await f.db.emergencyAccessGrant.findUniqueOrThrow({
      where: { id: g.grantId },
    }),
    original,
  )
  const stored = await f.db.emergencyAccessReview.findUniqueOrThrow({
    where: { grantId: g.grantId },
  })
  assert.ok(!stored.notesEncrypted.includes('Revisão administrativa'))
  await assert.rejects(
    f.db.emergencyAccessGrant.update({
      where: { id: g.grantId },
      data: { expiresAt: new Date(Date.now() + 86400000) },
    }),
  )
  await assert.rejects(
    f.db.emergencyAccessGrant.delete({ where: { id: g.grantId } }),
  )
  await assert.rejects(
    f.db.emergencyAccessReview.update({
      where: { id: stored.id },
      data: { outcome: 'approved' },
    }),
  )
  await assert.rejects(
    f.db.emergencyAccessReview.delete({ where: { id: stored.id } }),
  )
})
test('BE-031: DPO revisa só metadados, recebe aviso e perde autorização após retirada', async () => {
  const manager = await f.account('manager'),
    p = await f.patient()
  await f.db.userPermissionGrant.create({
    data: {
      userId: manager.user.id,
      permissionCode: 'privacy.dpo',
      grantedBy: f.admin.user.id,
    },
  })
  const g = await grant(p.patientId)
  const messages = await f.db.notification.findMany({
    where: { aggregateId: g.grantId },
  })
  assert.ok(
    messages.some(
      (m) =>
        m.userId === manager.user.id &&
        m.templateKey === 'privacy.emergency_requested',
    ),
  )
  assert.ok(!messages.some((m) => m.templateKey === 'privacy.dpo_missing'))
  const checked = await review(g.grantId, 'approved', manager.token).expect(200)
  emergencyReviewSchema.parse(checked.body)
  const d = (await detail(g.grantId, manager.token).expect(200)).body
  assert.equal(d.expiresAt, g.expiresAt)
  assert.ok(!('evolutions' in d) && !('record' in d))
  await assert.rejects(
    services().clinical.authorize(
      f.principal(manager, 'manager'),
      p.patientId,
      context(),
    ),
    { code: 'FORBIDDEN' },
  )
  const notification = messages.find((m) => m.userId === manager.user.id)
  assert.ok(notification)
  await f.db.userPermissionGrant.updateMany({
    where: {
      userId: manager.user.id,
      permissionCode: 'privacy.dpo',
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
  await review(g.grantId, 'approved', manager.token).expect(403)
  await f.db.$transaction(async (tx) => {
    assert.equal(
      await consentAwareNotificationCheck(tx, {
        ...notification,
        templateKey: 'privacy.emergency_requested',
        category: 'essential',
        aggregateVersion: 1,
      }),
      false,
    )
  })
})
test('BE-031: fila paginada e filtros não vazam justificativa nem notas', async () => {
  const p = await f.patient(),
    s = services()
  for (let i = 0; i < 32; i++)
    await s.emergency.request(
      professional(),
      { patientId: p.patientId, justification: 'Texto privado da fila' },
      context(),
    )
  const page = (
    await request(f.app)
      .get('/v1/admin/emergency-access?status=pending')
      .set('Authorization', f.admin.token)
      .expect(200)
  ).body
  emergencyQueueSchema.parse(page)
  assert.equal(page.items.length, 30)
  assert.ok(page.nextCursor)
  assert.ok(
    !JSON.stringify(page).includes('Texto privado') &&
      !JSON.stringify(page).includes('notes'),
  )
  const next = (
    await request(f.app)
      .get(
        `/v1/admin/emergency-access?status=pending&cursor=${page.nextCursor}`,
      )
      .set('Authorization', f.admin.token)
      .expect(200)
  ).body
  assert.ok(next.items.length > 0)
  assert.ok(
    next.items.every(
      (r: { grantId: string }) =>
        !page.items.some((x: { grantId: string }) => x.grantId === r.grantId),
    ),
  )
  await request(f.app)
    .get('/v1/admin/emergency-access')
    .set('Authorization', f.professionalAccounts[0].token)
    .expect(403)
  await request(f.app)
    .get('/v1/admin/emergency-access')
    .set('Authorization', (await f.account('manager')).token)
    .expect(403)
  await request(f.app)
    .get('/v1/admin/emergency-access?status=invalid')
    .set('Authorization', f.admin.token)
    .expect(400)
  await request(f.app)
    .get(`/v1/admin/emergency-access?cursor=${randomUUID()}`)
    .set('Authorization', f.admin.token)
    .expect(404)
})
test('BE-031: falha ao criar outbox não deixa grant ou auditoria parcial', async () => {
  const p = await f.patient(),
    before = await f.db.emergencyAccessGrant.count(),
    events = await f.db.auditEvent.count({
      where: { action: 'emergency_access.granted' },
    })
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fail_emergency_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."templateKey"='privacy.emergency_requested' THEN RAISE EXCEPTION 'test outbox unavailable'; END IF; RETURN NEW; END $$`,
  )
  await f.db.$executeRawUnsafe(
    `CREATE TRIGGER test_emergency_outbox BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION fail_emergency_outbox()`,
  )
  try {
    await assert.rejects(
      services().emergency.request(
        professional(),
        { patientId: p.patientId, justification: 'Teste atômico' },
        context(),
      ),
    )
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER test_emergency_outbox ON "Notification"',
    )
    await f.db.$executeRawUnsafe('DROP FUNCTION fail_emergency_outbox()')
  }
  assert.equal(await f.db.emergencyAccessGrant.count(), before)
  assert.equal(
    await f.db.auditEvent.count({
      where: { action: 'emergency_access.granted' },
    }),
    events,
  )
})
test('BE-031: falha no transporte mantém retry e alerta sem conteúdo clínico', async () => {
  const p = await f.patient(),
    g = await grant(p.patientId),
    row = await f.db.notification.findFirstOrThrow({
      where: {
        aggregateId: g.grantId,
        templateKey: 'privacy.emergency_requested',
        userId: f.admin.user.id,
      },
    })
  const sent: string[] = [],
    store = new PrismaNotificationStore(f.db, consentAwareNotificationCheck)
  const dispatcher = new DispatchNotifications(
    store,
    [
      {
        name: 'email',
        deliver: async (message) => {
          sent.push(JSON.stringify(message))
          throw new Error('transport test')
        },
      },
    ],
    new AesSecretBox(f.config.encryptionKey, 'notification'),
    { retrySeconds: 1, maxAttempts: 3 },
  )
  await dispatcher.deliver(row.id)
  const retry = await f.db.notification.findUniqueOrThrow({
    where: { id: row.id },
  })
  assert.equal(retry.deliveryStatus, 'retry')
  assert.equal(retry.failureReasonSafe, 'delivery_failed')
  assert.ok(sent[0].includes('aguardando revisão'))
  assert.ok(
    !sent[0].includes(p.patientId) && !sent[0].includes('Motivo excepcional'),
  )
  await f.db.notificationPreference.upsert({
    where: { userId: f.admin.user.id },
    create: {
      userId: f.admin.user.id,
      channels: ['portal'],
      nonEssentialOptOut: true,
    },
    update: { channels: ['portal'] },
  })
  const portal: string[] = []
  const success = new DispatchNotifications(
    store,
    [
      {
        name: 'portal',
        deliver: async (m) => {
          portal.push(m.text)
        },
      },
    ],
    new AesSecretBox(f.config.encryptionKey, 'notification'),
    { retrySeconds: 1, maxAttempts: 3 },
    () => new Date(+retry.scheduledAt + 1),
  )
  await success.deliver(row.id)
  assert.equal(
    (await f.db.notification.findUniqueOrThrow({ where: { id: row.id } }))
      .deliveryStatus,
    'sent',
  )
  assert.equal(portal.length, 1)
})
test('BE-031: env Zod configura prazo, contratos OpenAPI são publicados', async () => {
  const env = {
    DATABASE_URL: 'postgresql://example.test/db',
    CORS_ORIGINS: 'http://localhost:3000',
    JWT_SECRET: 'a'.repeat(32),
    FILE_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  }
  assert.equal(
    loadConfig({ ...env, EMERGENCY_ACCESS_DURATION_MINUTES: '17' })
      .emergencyAccessDurationMinutes,
    17,
  )
  assert.throws(() =>
    loadConfig({ ...env, EMERGENCY_ACCESS_DURATION_MINUTES: '0' }),
  )
  assert.throws(() =>
    loadConfig({ ...env, EMERGENCY_ACCESS_DURATION_MINUTES: 'invalid' }),
  )
  const spec = (await request(f.app).get('/v1/openapi.json').expect(200)).body
  assert.ok(spec.paths['/clinical/emergency-access'].post)
  assert.ok(spec.paths['/admin/emergency-access/{id}/review'].post)
  assert.ok(spec.paths['/admin/emergency-access'].get)
})
