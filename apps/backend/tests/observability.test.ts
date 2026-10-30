import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Router } from 'express'
import pino from 'pino'
import request from 'supertest'
import { OperationalTelemetry } from '../src/infrastructure/observability/operational-telemetry'
import { loadConfig } from '../src/shared/config/environment'
import { createApp } from '../src/shared/infra/http/app'

const config = loadConfig({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_SECRET: 'x'.repeat(32),
  FILE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
})

function fixture() {
  const lines: string[] = []
  const logger = pino(
    { base: undefined, level: 'info' },
    {
      write: (chunk: string) => {
        lines.push(chunk)
      },
    },
  )
  const telemetry = new OperationalTelemetry(logger, {
    slowRequestMs: 100,
    alertsEnabled: true,
  })
  const routes = Router()
  routes.post('/error/:secret', () => {
    throw new Error('senha, CPF e conteúdo clínico secretos')
  })
  return { lines, telemetry, routes }
}

test('health reflete a dependência essencial sem expor segredo', async () => {
  const { lines, telemetry, routes } = fixture()
  const ready = createApp(
    config,
    routes,
    telemetry.unexpectedError.bind(telemetry),
    telemetry,
    async () => true,
  )
  await request(ready).get('/health/live').expect(200, { status: 'alive' })
  await request(ready).get('/health/ready').expect(200, { status: 'ready' })
  const failed = createApp(
    config,
    routes,
    telemetry.unexpectedError.bind(telemetry),
    telemetry,
    async () => {
      throw new Error('postgresql://private')
    },
  )
  const response = await request(failed).get('/health/ready').expect(503)
  assert.deepEqual(response.body, { status: 'unavailable' })
  const metrics = await telemetry.metrics()
  assert.match(metrics, /vidaplena_readiness 0/)
  assert.match(
    metrics,
    /vidaplena_operational_alerts_total\{kind="readiness_failed"\} 1/,
  )
  assert.equal(JSON.stringify(lines).includes('postgresql://private'), false)
})

test('erro e resposta compartilham requestId; logs e métricas não capturam payload ou path privado', async () => {
  const { lines, telemetry, routes } = fixture()
  const app = createApp(
    config,
    routes,
    telemetry.unexpectedError.bind(telemetry),
    telemetry,
    async () => true,
  )
  const response = await request(app)
    .post('/v1/error/token-privado')
    .set('Authorization', 'Bearer token-privado')
    .send({
      password: 'segredo-123',
      cpf: '12345678901',
      evolution: 'diagnóstico sigiloso',
    })
    .expect(500)
  const requestId = response.body.error.requestId as string
  assert.equal(response.headers['x-request-id'], requestId)
  const parsed = lines.map(
    (line) => JSON.parse(line) as Record<string, unknown>,
  )
  assert.ok(
    parsed.some(
      (entry) =>
        entry.event === 'http.unexpected_error' &&
        entry.requestId === requestId,
    ),
  )
  assert.ok(
    parsed.some(
      (entry) =>
        entry.event === 'http.request' && entry.requestId === requestId,
    ),
  )
  assert.ok(
    parsed.some(
      (entry) => entry.event === 'ops.alert' && entry.kind === 'http_5xx',
    ),
  )
  for (const secret of [
    'segredo-123',
    '12345678901',
    'diagnóstico sigiloso',
    'token-privado',
  ])
    assert.equal(JSON.stringify(lines).includes(secret), false)
  const metrics = await telemetry.metrics()
  assert.match(metrics, /vidaplena_http_requests_total/)
  assert.match(metrics, /vidaplena_http_duration_seconds/)
  assert.equal(metrics.includes('token-privado'), false)
  telemetry.jobResult('consent_evidence_reconcile', 'failed', 0)
  assert.match(
    await telemetry.metrics(),
    /vidaplena_jobs_total\{job="consent_evidence_reconcile",status="failed"\} 1/,
  )
  assert.ok(lines.some((line) => line.includes('job_failed')))
})
