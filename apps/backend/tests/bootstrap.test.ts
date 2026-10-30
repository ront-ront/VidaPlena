import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { composeApplication } from '../src/shared/composition/root'
import {
  ConfigurationError,
  loadConfig,
} from '../src/shared/config/environment'
import { startServer } from '../src/shared/infra/http/bootstrap'

const validEnv = () => ({
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://local:local@localhost/test',
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: randomBytes(32).toString('hex'),
  FILE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
})

test('configuration rejects invalid values without disclosing secrets', () => {
  const env = validEnv()
  env.DATABASE_URL = 'private-secret-value'
  assert.throws(
    () => loadConfig(env),
    (error) => {
      assert.ok(error instanceof ConfigurationError)
      assert.ok(error.message.includes('DATABASE_URL'))
      assert.ok(!error.message.includes(env.DATABASE_URL))
      assert.ok(!error.message.includes(env.JWT_SECRET))
      return true
    },
  )
  assert.throws(() => loadConfig({}), ConfigurationError)
})

test('production rejects dev providers and insecure origins', () => {
  assert.throws(
    () => loadConfig({ ...validEnv(), APP_ENV: 'production' }),
    ConfigurationError,
  )
  const config = loadConfig({
    ...validEnv(),
    APP_ENV: 'production',
    ENVIRONMENT_ID: 'production-br',
    DATA_REGION_COUNTRY: 'BR',
    CORS_ORIGINS: 'https://vida.example',
    SIGNATURE_PROVIDER: 'disabled',
    MALWARE_SCANNER: 'disabled',
  })
  assert.equal(config.cookieSecure, true)
})

test('CORS allowlist and graceful close release every resource once', async () => {
  const config = { ...loadConfig(validEnv()), port: 0 }
  let closed = 0
  const composition = composeApplication(config, [
    {
      close: async () => {
        closed++
      },
    },
  ])
  const runtime = await startServer(config, composition)
  const url = `http://127.0.0.1:${(runtime.server.address() as AddressInfo).port}`
  try {
    const allowed = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
      },
    })
    assert.equal(
      allowed.headers.get('access-control-allow-origin'),
      'http://localhost:3000',
    )
    const denied = await fetch(url, {
      headers: { Origin: 'https://untrusted.example' },
    })
    assert.equal(denied.headers.get('access-control-allow-origin'), null)
  } finally {
    await Promise.all([runtime.close(), runtime.close()])
  }
  assert.equal(closed, 1)
  assert.equal(runtime.server.listening, false)
})

test('Zod validates environment numbers, origins, keys and deployed-only rules', () => {
  for (const [field, value] of [
    ['PORT', ''],
    ['PORT', '1.5'],
    ['PORT', '65536'],
    ['AUDIT_RETENTION_YEARS', '4'],
    ['FILE_ENCRYPTION_KEY', 'invalid-key'],
    ['CORS_ORIGINS', 'http://localhost:3000/path'],
    ['CORS_ORIGINS', 'http://localhost:3000,'],
    ['FRONTEND_ORIGIN', 'https://unknown.example'],
    ['NOTIFICATION_MAX_ATTEMPTS', '0'],
    ['APP_ENV', 'unknown'],
  ]) {
    assert.throws(
      () => loadConfig({ ...validEnv(), [field]: value }),
      (error) => {
        assert.ok(error instanceof ConfigurationError)
        assert.ok(error.fields.includes(field), field)
        return true
      },
    )
  }
  const config = loadConfig({
    ...validEnv(),
    PORT: '4444',
    NOTIFICATION_RETRY_SECONDS: '90',
  })
  assert.equal(config.port, 4444)
  assert.equal(config.notificationRetrySeconds, 90)
  assert.ok(Buffer.isBuffer(config.encryptionKey))
  assert.equal(config.cookieSameSite, 'lax')
  assert.throws(
    () =>
      loadConfig({
        ...validEnv(),
        APP_ENV: 'production',
        ENVIRONMENT_ID: 'production-br',
        DATA_REGION_COUNTRY: 'BR',
        CORS_ORIGINS: 'https://vida.example',
        SIGNATURE_PROVIDER: 'disabled',
        MALWARE_SCANNER: 'disabled',
        EMAIL_SENDER: 'dev',
      }),
    ConfigurationError,
  )
})
