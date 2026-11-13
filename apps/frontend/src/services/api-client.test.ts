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

test('impacto de catálogo preserva apenas referências administrativas válidas', async () => {
  const appointment = {
    id: '10000000-0000-4000-8000-000000000001',
    startsAt: '2026-12-01T12:00:00.000Z',
    endsAt: '2026-12-01T13:00:00.000Z',
  }
  for (const [input, expected] of [
    [[{ ...appointment, clinicalText: 'não expor' }], [appointment]],
    [{ unexpected: true }, []],
  ] as const) {
    const client = new ApiClient('http://localhost:3333', (async () =>
      json(
        {
          error: {
            code: 'SCHEDULE_IMPACT_REVIEW',
            affectedAppointments: input,
          },
        },
        409,
      )) as typeof fetch)
    await assert.rejects(
      client.request(
        '/v1/admin/rooms',
        { method: 'PATCH' },
        { authenticated: false },
      ),
      (cause) => {
        assert.ok(cause instanceof ApiError)
        assert.deepEqual(cause.affectedAppointments, expected)
        assert.ok(
          !JSON.stringify(cause.affectedAppointments).includes('clinicalText'),
        )
        assert.ok(cause.message.includes('consultas afetadas'))
        return true
      },
    )
  }
})

test('contexto de conflito aceita somente alternativas e consultas próprias tipadas', async () => {
  const slot = {
    startsAt: '2030-05-12T15:00:00.000Z',
    endsAt: '2030-05-12T16:00:00.000Z',
    professionalId: '10000000-0000-4000-8000-000000000001',
    roomAvailable: true,
  }
  const duplicate = {
    id: '10000000-0000-4000-8000-000000000002',
    startsAt: slot.startsAt,
  }
  const client = new ApiClient('http://localhost:3333', (async () =>
    json(
      {
        error: {
          code: 'SLOT_UNAVAILABLE',
          alternatives: [{ ...slot, patientName: 'não expor' }],
          duplicateAppointments: [{ ...duplicate, clinicalText: 'não expor' }],
        },
      },
      409,
    )) as typeof fetch)
  await assert.rejects(
    client.request(
      '/v1/appointments',
      { method: 'POST' },
      { authenticated: false },
    ),
    (cause) => {
      assert.ok(cause instanceof ApiError)
      assert.deepEqual(cause.alternatives, [slot])
      assert.deepEqual(cause.duplicateAppointments, [duplicate])
      return true
    },
  )
})

test('confirmação exige 201 e preserva a chave no retry por rotação de sessão', async () => {
  const keys: (string | null)[] = []
  const client = new ApiClient(
    'http://localhost:3333',
    (async (url, init) => {
      if (String(url).endsWith('/auth/refresh'))
        return json({
          accessToken: 'renewed',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        })
      keys.push(new Headers(init?.headers).get('Idempotency-Key'))
      return keys.length === 1
        ? json({ error: { code: 'UNAUTHENTICATED' } }, 401)
        : json({ appointment: {} }, 200)
    }) as typeof fetch,
    () => 'csrf',
  )
  client.adoptSession({
    accessToken: 'old',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  })
  await assert.rejects(
    client.request(
      '/v1/appointments',
      { method: 'POST', headers: { 'Idempotency-Key': 'command' } },
      { expectedStatus: 201 },
    ),
    (cause) => cause instanceof ApiError && cause.status === 502,
  )
  assert.deepEqual(keys, ['command', 'command'])
})
