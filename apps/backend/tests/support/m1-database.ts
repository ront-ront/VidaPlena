import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Role } from '../../src/domain/rules/access'
import { createPrismaClient } from '../../src/infrastructure/persistence/prisma/client'
import { JwtAccessTokens } from '../../src/infrastructure/security/access-tokens'
import { loadConfig } from '../../src/shared/config/environment'

export async function createM1Database() {
  const base = process.env.TEST_DATABASE_URL
  if (!base || !new URL(base).pathname.endsWith('_test'))
    throw new Error('Use TEST_DATABASE_URL de banco isolado _test.')
  const control = createPrismaClient(base),
    databaseName = `vp_${randomUUID().replaceAll('-', '')}_test`,
    url = new URL(base)
  url.pathname = `/${databaseName}`
  const directory = await mkdtemp(join(tmpdir(), 'vida-m1-'))
  const config = loadConfig({
    APP_ENV: 'test',
    DATABASE_URL: url.toString(),
    CORS_ORIGINS: 'http://localhost:3000',
    JWT_SECRET: randomBytes(32).toString('hex'),
    FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    FILE_STORAGE_PATH: join(directory, 'files'),
    EMAIL_MAILBOX_PATH: join(directory, 'mail'),
    NOTIFICATION_POLL_SECONDS: '3600',
    WAITLIST_POLL_SECONDS: '3600',
  })
  const db = createPrismaClient(config.databaseUrl)
  let created = false
  const close = async () => {
    await db.$disconnect()
    if (created)
      await control.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`)
    await control.$disconnect()
    await rm(directory, { recursive: true, force: true })
  }
  try {
    await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
    created = true
    assert.equal(
      spawnSync('yarn', ['prisma', 'migrate', 'deploy'], {
        env: { ...process.env, DATABASE_URL: config.databaseUrl },
        stdio: 'pipe',
      }).status,
      0,
      'Migrations isoladas devem ser aplicadas',
    )
  } catch (error) {
    await close()
    throw error
  }
  async function account(role: Role) {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        fullName: `Pessoa Fictícia ${role}`,
        status: 'active',
        emailVerifiedAt: new Date(),
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
    const token = await new JwtAccessTokens(config.jwtSecret).issue(
      { userId: user.id, sessionId: session.id },
      new Date(Date.now() + 600_000),
    )
    return { user, session, token: `Bearer ${token}` }
  }
  return { db, config, close, account }
}
export function fictitiousCpf() {
  let value = String(
    BigInt(`0x${randomBytes(4).toString('hex')}`) % 1_000_000_000n,
  ).padStart(9, '0')
  if (/^([0-9])\1+$/.test(value)) value = '123456789'
  for (const length of [9, 10]) {
    const sum = [...value].reduce(
        (s, d, i) => s + Number(d) * (length + 1 - i),
        0,
      ),
      check = (sum * 10) % 11
    value += check === 10 ? '0' : String(check)
  }
  return value
}
