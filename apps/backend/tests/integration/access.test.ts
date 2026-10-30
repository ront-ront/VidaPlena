import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import { Router } from 'express'
import { AdministerAccess } from '../../src/application/use-cases/administer-access'
import { Authorize } from '../../src/application/use-cases/authorize'
import type { Role } from '../../src/domain/rules/access'
import { PrismaAccessStore } from '../../src/infrastructure/persistence/prisma/access-store'
import { PrismaAuditWriter } from '../../src/infrastructure/persistence/prisma/audit-writer'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import type { AppConfig } from '../../src/shared/config/environment'
import { createAccessRouter } from '../../src/shared/infra/http/access-router'
import { createApp } from '../../src/shared/infra/http/app'
import { accessGuard } from '../../src/shared/infra/http/middleware/access'
import { uuidField } from '../../src/shared/infra/http/validation'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use banco isolado _test.')
const control = createPrismaClient(url)
const databaseName = `vp_${randomUUID().replaceAll('-', '')}_test`
const isolated = new URL(url)
isolated.pathname = `/${databaseName}`
const db = createPrismaClient(isolated.toString())
const store = new PrismaAccessStore(db)
const authorize = new Authorize(store, new PrismaAuditWriter(db))
const administer = new AdministerAccess(store)
const fixtures: string[] = []
let created = false
before(async () => {
  await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  created = true
  await new Promise<void>((resolve, reject) => {
    const child = spawn('yarn', ['prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: isolated.toString() },
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
  await db.user.updateMany({
    where: { id: { in: fixtures } },
    data: { status: 'inactive' },
  })
  await db.$disconnect()
  if (created)
    await control.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
  await control.$disconnect()
})
const context = () => ({
  requestId: randomUUID(),
  actorRoles: [],
  authorizationBasis: 'test',
})
async function account(role: Role) {
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      fullName: 'Fictício RBAC',
      status: 'active',
      roles: { create: { roleCode: role } },
    },
  })
  fixtures.push(user.id)
  return session(user.id)
}
async function session(userId: string) {
  const row = await db.session.create({
    data: {
      userId,
      refreshTokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 60000),
      mfaVerifiedAt: new Date(),
    },
  })
  const actor = await store.principal(userId, row.id)
  assert.ok(actor)
  return actor
}

test('HTTP guard enforces resource ownership and immediately revoked grants; changes and denials are audited', async () => {
  const admin = await account('admin')
  const manager = await account('manager')
  const patient = await account('patient')
  const ownProfile = await db.patientProfile.create({
    data: {
      userId: patient.userId,
      fullName: 'Paciente fictício RBAC',
      birthDate: new Date('1990-01-01'),
      cpf: `${Date.now()}`.slice(-11),
    },
  })
  const term = await db.consentDocumentVersion.create({
    data: {
      kind: 'data',
      version: 'rbac-test-1',
      bodyReference: 'Termo fictício',
      effectiveAt: new Date(Date.now() - 1000),
      publishedBy: admin.userId,
    },
  })
  await db.consentEvent.create({
    data: {
      patientId: ownProfile.id,
      documentVersionId: term.id,
      action: 'accept',
      actorUserId: patient.userId,
      source: 'portal',
      consentingPersonName: 'Paciente fictício RBAC',
    },
  })
  const dependent = await db.patientProfile.create({
    data: {
      fullName: 'Dependente fictício',
      birthDate: new Date('2015-01-01'),
      cpf: `${Date.now()}`.slice(-11),
      guardians: {
        create: { guardianUserId: patient.userId, relationship: 'mãe' },
      },
    },
  })
  const proofs = new Map([
    ['admin', admin],
    ['manager', manager],
    ['patient', patient],
  ])
  const verifier = {
    verify: async (token: string) => proofs.get(token) ?? null,
  }
  const router = Router()
  router.use(createAccessRouter(verifier, authorize, administer, store))
  router.get(
    '/patients/:id',
    accessGuard(verifier, authorize, 'own_patient', (req) =>
      uuidField({ id: req.params.id }, 'id'),
    ),
    (_req, res) => res.json({ permitted: true }),
  )
  const server = createServer(
    createApp({ corsOrigins: [] } as unknown as AppConfig, router),
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  try {
    const get = (id: string, token?: string) =>
      fetch(`${base}/patients/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    assert.equal((await get(dependent.id)).status, 401)
    assert.equal((await get(dependent.id, 'forged')).status, 401)
    assert.equal((await get(dependent.id, 'patient')).status, 200)
    assert.equal((await get(randomUUID(), 'patient')).status, 404)
    const grant = (token: string, enabled: boolean) =>
      fetch(`${base}/admin/users/${manager.userId}/permissions/privacy.dpo`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      })
    assert.equal((await grant('manager', true)).status, 403)
    const response = await grant('admin', true)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).dpoDesignated, true)
    assert.equal(await store.principal(manager.userId, manager.sessionId), null)
    const fresh = await session(manager.userId)
    assert.ok(await authorize.execute(fresh, 'privacy_consents', context()))
    await assert.rejects(authorize.execute(fresh, 'clinical', context()), {
      code: 'FORBIDDEN',
    })
    assert.equal((await grant('admin', false)).status, 200)
    await assert.rejects(
      authorize.execute(fresh, 'privacy_consents', context()),
      { code: 'UNAUTHENTICATED' },
    )
    await administer.execute(
      admin,
      patient.userId,
      { kind: 'status', status: 'inactive' },
      context(),
    )
    assert.equal((await get(dependent.id, 'patient')).status, 401)
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: patient.userId } }))
        .status,
      'inactive',
    )
    assert.equal(await store.hasDpo(), false)
    assert.ok(await authorize.execute(admin, 'privacy_queue', context()))
    await assert.rejects(
      administer.execute(
        admin,
        patient.userId,
        { kind: 'dpo', enabled: true },
        context(),
      ),
      { code: 'VALIDATION_ERROR' },
    )
    assert.equal(
      await db.auditEvent.count({
        where: { resourceId: manager.userId, action: 'access.dpo_changed' },
      }),
      2,
    )
    assert.ok(
      (await db.auditEvent.count({
        where: { actorUserId: patient.userId, action: 'authorization.denied' },
      })) > 0,
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.user.update({
      where: { id: admin.userId },
      data: { status: 'inactive' },
    })
  }
})

test('concurrent removals preserve last active admin and reject deactivation without changes', async () => {
  const first = await account('admin')
  const second = await account('admin')
  const results = await Promise.allSettled(
    [first, second].map((actor) =>
      administer.execute(
        actor,
        actor.userId,
        { kind: 'roles', roles: ['manager'] },
        context(),
      ),
    ),
  )
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  )
  const rejected = results.find(
    (result) => result.status === 'rejected',
  ) as PromiseRejectedResult
  assert.equal(rejected.reason.code, 'CONFLICT')
  const remaining = results[0].status === 'rejected' ? first : second
  await assert.rejects(
    administer.execute(
      remaining,
      remaining.userId,
      { kind: 'status', status: 'inactive' },
      context(),
    ),
    { code: 'CONFLICT' },
  )
  assert.ok(
    (
      await store.principal(remaining.userId, remaining.sessionId)
    )?.roles.includes('admin'),
  )
  assert.equal(
    await db.auditEvent.count({
      where: { resourceId: remaining.userId, action: 'access.status_changed' },
    }),
    0,
  )
})
