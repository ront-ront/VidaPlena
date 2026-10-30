import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import type { PrismaClient } from '../src/generated/prisma/client'
import {
  createServiceContainer,
  services,
} from '../src/shared/composition/container'
import { type AppConfig, loadConfig } from '../src/shared/config/environment'
import {
  inviteUserBody,
  notificationPreferencesBody,
} from '../src/shared/infra/http/contracts/m0'
import { openApiDocument } from '../src/shared/infra/http/openapi'
import { parseInput } from '../src/shared/infra/http/parse-input'

function config(origin: string) {
  return loadConfig({
    APP_ENV: 'test',
    DATABASE_URL: 'postgresql://local:local@localhost/test',
    CORS_ORIGINS: origin,
    JWT_SECRET: randomBytes(32).toString('hex'),
    FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  })
}

test('application containers isolate registrations and resolve real service factories', () => {
  const firstConfig = config('http://localhost:3000')
  const secondConfig = config('http://localhost:4000')
  const first = createServiceContainer(firstConfig, {} as PrismaClient)
  const second = createServiceContainer(secondConfig, {} as PrismaClient)
  assert.equal(first.resolve<AppConfig>(services.config), firstConfig)
  assert.equal(second.resolve<AppConfig>(services.config), secondConfig)
  assert.notEqual(
    first.resolve(services.provisionAccounts),
    second.resolve(services.provisionAccounts),
  )
  assert.equal(typeof first.resolve(services.authorize), 'object')
})

test('Zod contracts validate HTTP input and feed OpenAPI 3.1 without exposing submitted values', () => {
  const input = { email: 'a@b.test', fullName: 'Fictícia', role: 'manager' }
  assert.deepEqual(parseInput(inviteUserBody, input), input)
  assert.equal(
    notificationPreferencesBody.safeParse({
      channels: ['sms'],
      nonEssentialOptOut: false,
    }).success,
    false,
  )
  assert.throws(
    () => parseInput(inviteUserBody, { ...input, email: 'secret.invalid' }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(!JSON.stringify(error).includes('secret.invalid'))
      return true
    },
  )
  assert.equal(openApiDocument.openapi, '3.1.0')
  assert.ok(openApiDocument.paths['/admin/users']?.post)
  assert.ok(openApiDocument.paths['/auth/invitations/accept']?.post)
  assert.ok(!openApiDocument.paths['/clinical/evolutions'])
})
