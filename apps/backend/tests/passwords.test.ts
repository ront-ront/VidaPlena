import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { BcryptPasswords } from '../src/infrastructure/security/passwords'
import { loadConfig } from '../src/shared/config/environment'

test('password policy blocks common/short passwords and bcrypt truncation', async () => {
  const config = loadConfig({
    APP_ENV: 'test',
    DATABASE_URL: 'postgresql://local:local@localhost/test',
    CORS_ORIGINS: 'http://localhost:3000',
    JWT_SECRET: randomBytes(32).toString('hex'),
    FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  })
  const passwords = new BcryptPasswords(
    config.passwordMinLength,
    config.passwordCommonListEnabled,
    config.bcryptRounds,
  )
  for (const password of ['x', '1234567890', 'a'.repeat(73), '😃'.repeat(20)])
    await assert.rejects(passwords.hash(password), { code: 'VALIDATION_ERROR' })
  const value = `Test-${randomUUID()}`
  const hash = await passwords.hash(value)
  assert.ok(hash.startsWith('$2'))
  assert.notEqual(hash, value)
  assert.equal(await passwords.verify(value, hash), true)
  assert.equal(await passwords.verify(`${value}x`, hash), false)
})
