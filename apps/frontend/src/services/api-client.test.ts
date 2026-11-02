import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiClient, ApiError } from './api-client'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('duas chamadas protegidas recuperam sessão com uma rotação', async () => {
  let refreshCount = 0
  const client = new ApiClient(
    'http://localhost:3333',
    (async (url, init) => {
      if (String(url).endsWith('/v1/auth/refresh')) {
        refreshCount += 1
        assert.equal(new Headers(init?.headers).get('X-CSRF-Token'), 'csrf')
        await new Promise((resolve) => setTimeout(resolve, 10))
        return json({
          accessToken: 'new-token',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        })
      }
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer new-token',
      )
      return json({ ok: true })
    }) as typeof fetch,
    () => 'csrf',
  )

  const results = await Promise.all([
    client.request<{ ok: boolean }>('/v1/me'),
    client.request<{ ok: boolean }>('/v1/me'),
  ])
  assert.deepEqual(results, [{ ok: true }, { ok: true }])
  assert.equal(refreshCount, 1)
})

test('refresh revogado limpa sessão e impede acesso', async () => {
  let lost = 0
  const client = new ApiClient(
    'http://localhost:3333',
    (async () =>
      json({ error: { code: 'UNAUTHENTICATED' } }, 401)) as typeof fetch,
    () => 'csrf',
  )
  client.setSessionLostHandler(() => {
    lost += 1
  })
  await assert.rejects(client.request('/v1/me'), (error) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 401)
    return true
  })
  assert.equal(lost, 1)
})

test('409 e 429 têm mensagens acionáveis sem código bruto', async () => {
  for (const [status, code] of [
    [409, 'CONFLICT'],
    [429, 'RATE_LIMITED'],
  ] as const) {
    const client = new ApiClient('http://localhost:3333', (async () =>
      json(
        { error: { code, requestId: 'support-id' } },
        status,
      )) as typeof fetch)
    await assert.rejects(
      client.request(
        '/v1/auth/login',
        { method: 'POST' },
        { authenticated: false },
      ),
      (error) => {
        assert.ok(error instanceof ApiError)
        assert.equal(error.status, status)
        assert.equal(error.requestId, 'support-id')
        assert.ok(error.message.length > 20)
        assert.ok(!error.message.includes(code))
        return true
      },
    )
  }
})
