import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import {
  auditedTransaction,
  PrismaAuditWriter,
} from '../../src/infrastructure/persistence/prisma/audit-writer'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use banco isolado _test.')
const db = createPrismaClient(url)
after(() => db.$disconnect())

test('audit is append-only and stores only bounded metadata', async () => {
  const user = await db.user.create({
    data: { email: `${randomUUID()}@example.test`, fullName: 'Fictício' },
  })
  const id = await new PrismaAuditWriter(db).append({
    actorUserId: user.id,
    actorRoles: ['admin'],
    requestId: randomUUID(),
    action: 'account.updated',
    resourceType: 'User',
    resourceId: user.id,
    originIp: '127.0.0.1',
    authorizationBasis: 'role:admin',
    metadata: {
      password: 'secret',
      evolution: 'clinical text',
      status: 'inactive',
      reasonCode: 'unsafe clinical prose',
    },
  })
  const event = await db.auditEvent.findUniqueOrThrow({ where: { id } })
  assert.deepEqual(event.metadataSafe, { status: 'inactive' })
  assert.equal(event.actorUserId, user.id)
  assert.ok(event.occurredAt)
  await assert.rejects(
    db.auditEvent.update({ where: { id }, data: { action: 'changed' } }),
  )
  await assert.rejects(db.auditEvent.delete({ where: { id } }))
  await assert.rejects(db.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent"'))
})

test('audit failure rolls back a sensitive mutation in the same transaction', async () => {
  const email = `${randomUUID()}@example.test`
  await assert.rejects(
    auditedTransaction(db, async (tx, audit) => {
      const user = await tx.user.create({
        data: { email, fullName: 'Rollback fictício' },
      })
      await audit.append({
        actorUserId: randomUUID(),
        actorRoles: ['admin'],
        requestId: randomUUID(),
        action: 'account.created',
        resourceType: 'User',
        resourceId: user.id,
        authorizationBasis: 'seed',
      })
    }),
  )
  assert.equal(await db.user.findUnique({ where: { email } }), null)
})
