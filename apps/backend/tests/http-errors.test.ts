import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { Router } from 'express'
import { ApplicationError } from '../src/application/errors/application-error'
import type { AppConfig } from '../src/shared/config/environment'
import { createApp } from '../src/shared/infra/http/app'
import { objectBody, textField } from '../src/shared/infra/http/validation'

test('HTTP envelope validates input, correlates requests and sanitizes unexpected errors', async () => {
  const router = Router()
  const events: object[] = []
  router.post('/input', (req, res) =>
    res.json({ name: textField(objectBody(req.body), 'name') }),
  )
  router.get('/conflict', () => {
    throw new ApplicationError('CONFLICT')
  })
  router.get('/broken', () => {
    throw new Error('postgresql://secret:password@host/patient')
  })
  const app = createApp(
    { corsOrigins: [] } as unknown as AppConfig,
    router,
    (event) => events.push(event),
  )
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  try {
    for (const [route, status] of [
      ['/missing', 404],
      ['/conflict', 409],
      ['/broken', 500],
    ] as const) {
      const response = await fetch(base + route)
      assert.equal(response.status, status)
      const body = await response.json()
      assert.equal(body.error.requestId, response.headers.get('x-request-id'))
      assert.equal(typeof body.error.message, 'string')
      assert.ok(!JSON.stringify(body).includes('password'))
      assert.ok(!JSON.stringify(body).includes('stack'))
    }
    const invalid = await fetch(`${base}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 12 }),
    })
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).error.details[0].field, 'name')
    const malformed = await fetch(`${base}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{secret',
    })
    assert.equal(malformed.status, 400)
    assert.ok(!(await malformed.text()).includes('secret'))
    assert.equal(events.length, 1)
    assert.ok(!JSON.stringify(events).includes('password'))
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
