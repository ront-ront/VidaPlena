import { expect, type Page, test } from '@playwright/test'

const id = (n: number) =>
  `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const slot = {
  professionalId: id(2),
  startsAt: '2030-05-12T12:00:00.000Z',
  endsAt: '2030-05-12T13:00:00.000Z',
  roomAvailable: true,
}
const later = {
  ...slot,
  startsAt: '2030-05-12T15:00:00.000Z',
  endsAt: '2030-05-12T16:00:00.000Z',
}
async function setup(
  page: Page,
  options: {
    consent?: string
    self?: boolean
    dependent?: boolean
    remote?: boolean
  } = {},
) {
  const calls: { key: string; body: Record<string, unknown> }[] = [],
    keys = new Map<string, unknown>()
  let mode = 'success',
    delay = false
  await page
    .context()
    .addCookies([
      { name: 'vp_csrf', value: 'test-only', url: 'http://127.0.0.1:3400' },
    ])
  await page.route('http://127.0.0.1:3434/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3400',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers':
        'authorization,content-type,x-request-id,x-csrf-token,idempotency-key',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    }
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers, json: body })
    if (req.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers })
    if (path === '/v1/auth/refresh')
      return json({
        accessToken: 'test-only',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      })
    if (path === '/v1/me')
      return json({
        id: id(1),
        patientId: options.self === false ? null : id(3),
        roles: ['patient'],
        permissions: [],
        profile: {
          fullName: 'Ana Fictícia',
          email: 'ana@example.test',
          phone: null,
        },
        consentState: options.consent ?? 'active',
      })
    if (path === '/v1/me/dependents')
      return json({
        items: options.dependent
          ? [
              {
                patientId: id(4),
                fullName: 'Dependente Fictício',
                relationship: 'mãe',
                status: 'active',
              },
              {
                patientId: id(5),
                fullName: 'Vínculo encerrado',
                relationship: 'mãe',
                status: 'inactive',
              },
            ]
          : [],
      })
    if (path === '/v1/catalog/specialties')
      return json({
        items: [
          {
            id: id(6),
            name: 'Cardiologia',
            code: 'CARDIO',
            modalities: options.remote ? ['remote'] : ['onsite'],
            durations: { first: 60, return: 30 },
          },
        ],
        nextCursor: null,
      })
    if (path === '/v1/catalog/professionals')
      return json({
        items: [
          {
            id: id(2),
            displayName: 'Dra. Fictícia',
            specialtyIds: [id(6)],
            modalities: ['onsite', 'remote'],
          },
        ],
        nextCursor: null,
      })
    if (path === '/v1/availability')
      return json({
        days: [{ localDate: '2030-05-12', slots: [slot] }],
        nearestAvailableAt: slot.startsAt,
        clinicTimeZone: 'America/Fortaleza',
      })
    if (path === '/v1/appointments' && req.method() === 'POST') {
      const key = req.headers()['idempotency-key'],
        body = req.postDataJSON()
      calls.push({ key, body })
      if (mode === 'lost') {
        keys.set(key, body)
        return route.abort('failed')
      }
      if (mode === 'duplicate' && !body.confirmDuplicateSpecialty)
        return json(
          {
            error: {
              code: 'DUPLICATE_SPECIALTY_WARNING',
              duplicateAppointments: [
                { id: id(7), startsAt: '2030-06-01T12:00:00.000Z' },
              ],
            },
          },
          409,
        )
      if (mode === 'slot' && body.startsAt === slot.startsAt)
        return json(
          { error: { code: 'SLOT_UNAVAILABLE', alternatives: [later] } },
          409,
        )
      if (
        ['CONSENT_REQUIRED', 'AUTO_BOOKING_SUSPENDED', 'FORBIDDEN'].includes(
          mode,
        )
      )
        return json(
          { error: { code: mode } },
          mode === 'CONSENT_REQUIRED' ? 409 : 403,
        )
      if (delay) await new Promise((resolve) => setTimeout(resolve, 700))
      const existing = keys.get(key)
      if (existing) expect(existing).toEqual(body)
      keys.set(key, body)
      return json(
        {
          appointment: {
            id: id(8),
            patientId: body.patientId,
            professionalId: id(2),
            specialtyId: id(6),
            roomId: options.remote ? null : id(9),
            roomName: options.remote ? null : 'Sala Ipê',
            professionalName: 'Dra. Fictícia',
            specialtyName: 'Cardiologia',
            modality: body.modality,
            visitType: body.visitType,
            startsAt: body.startsAt,
            endsAt:
              body.startsAt === slot.startsAt ? slot.endsAt : later.endsAt,
            durationMinutes: 60,
            version: 1,
            status: mode === 'cancelled' ? 'cancelled' : 'confirmed',
            bookingSource: 'portal',
            attendanceResponse: null,
          },
          notificationState: 'queued',
        },
        mode === 'bad-status' ? 200 : 201,
      )
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  return {
    calls,
    keys,
    setMode: (value: string) => {
      mode = value
    },
    setDelay: () => {
      delay = true
    },
  }
}
async function choose(page: Page) {
  await page.goto('/agendar')
  await page.getByLabel('Especialidade', { exact: true }).selectOption(id(6))
  await page.getByLabel('Data do atendimento').fill('2030-05-12')
  await page.getByRole('button', { name: /09:00 até 10:00/ }).click()
  await expect(page.getByLabel('Para quem é a consulta?')).toBeEnabled()
}
const confirm = (page: Page) =>
  page.getByRole('button', { name: 'Confirmar agendamento', exact: true })

test('FE-013: quatro ações principais, duplo clique e recibo só depois do201', async ({
  page,
}) => {
  const api = await setup(page)
  api.setDelay()
  await choose(page)
  await confirm(page).focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Confirmando…' }),
  ).toBeDisabled()
  await expect(
    page.getByText('Consulta confirmada', { exact: true }),
  ).toHaveCount(0)
  // Segundo evento enquanto o primeiro comando está em voo não gera POST.
  await page
    .getByRole('button', { name: 'Confirmando…' })
    .dispatchEvent('click')
  await expect(
    page.getByText('Consulta confirmada', { exact: true }),
  ).toBeVisible()
  expect(api.calls).toHaveLength(1)
  expect(api.keys.size).toBe(1)
  expect(api.calls[0].body).not.toHaveProperty('roomId')
  await expect(page.getByText('Sala Ipê', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Sala', exact: true }),
  ).toHaveCount(0)
})

test('FE-013: ciência explícita de duplicidade, sem reenvio automático', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('duplicate')
  await choose(page)
  await confirm(page).click()
  await expect(
    page.getByRole('heading', { name: 'Outra consulta nesta especialidade' }),
  ).toBeVisible()
  await expect(confirm(page)).toBeDisabled()
  expect(api.calls).toHaveLength(1)
  await page.getByRole('checkbox', { name: /Estou ciente/ }).check()
  expect(api.calls).toHaveLength(1)
  await confirm(page).click()
  await expect(
    page.getByText('Consulta confirmada', { exact: true }),
  ).toBeVisible()
  expect(api.calls[1].body.confirmDuplicateSpecialty).toBe(true)
  expect(api.calls[1].key).not.toBe(api.calls[0].key)
})

test('FE-013: slot perdido oferece alternativa e preserva filtros e dependente', async ({
  page,
}) => {
  const api = await setup(page, { dependent: true })
  api.setMode('slot')
  await choose(page)
  await page.getByLabel('Para quem é a consulta?').selectOption(id(4))
  await expect(
    page.getByRole('option', { name: 'Vínculo encerrado (dependente)' }),
  ).toHaveCount(0)
  await confirm(page).click()
  await expect(
    page.getByText(/Este horário deixou de estar disponível/),
  ).toBeVisible()
  await page
    .getByRole('button', { name: '12 de maio de 2030 às 12:00' })
    .click()
  await expect(page.getByLabel('Para quem é a consulta?')).toHaveValue(id(4))
  await expect(page.getByLabel('Data do atendimento')).toHaveValue('2030-05-12')
  expect(api.calls).toHaveLength(1)
  await confirm(page).click()
  await expect(
    page.getByText('Consulta confirmada', { exact: true }),
  ).toBeVisible()
  expect(api.calls[1].body.patientId).toBe(id(4))
  expect(api.calls[1].body.startsAt).toBe(later.startsAt)
})

test('FE-013: resposta perdida e refresh reutilizam comando e não fazem POST automático', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('lost')
  await choose(page)
  await confirm(page).click()
  await expect(
    page.getByRole('heading', { name: 'Agendamento não confirmado' }),
  ).toBeVisible()
  await expect(
    page.getByText(/A resposta pode ter se perdido após a reserva/),
  ).toBeVisible()
  expect(api.keys.size).toBe(1)
  const saved = await page.evaluate(() => Object.entries(sessionStorage))
  expect(saved).toHaveLength(1)
  expect(JSON.stringify(saved)).not.toContain(id(3))
  await page.reload()
  expect(api.calls).toHaveLength(1)
  api.setMode('success')
  await choose(page)
  await confirm(page).click()
  await expect(
    page.getByText('Consulta confirmada', { exact: true }),
  ).toBeVisible()
  expect(api.calls).toHaveLength(2)
  expect(api.calls[1].key).toBe(api.calls[0].key)
  expect(api.keys.size).toBe(1)
})

test('FE-013: consentimento e suspensão têm próximo passo sem sucesso', async ({
  page,
}) => {
  const api = await setup(page)
  await choose(page)
  api.setMode('CONSENT_REQUIRED')
  await confirm(page).click()
  await expect(
    page.getByRole('link', { name: 'Minha conta', exact: true }).last(),
  ).toHaveAttribute('href', '/minha-conta')
  api.setMode('AUTO_BOOKING_SUSPENDED')
  await confirm(page).click()
  await expect(
    page.getByText(/O agendamento online está suspenso/),
  ).toBeVisible()
  await expect(
    page.getByText('Consulta confirmada', { exact: true }),
  ).toHaveCount(0)
})

test('FE-013: responsável sem cadastro próprio só envia o dependente e respeita negativa do servidor', async ({
  page,
}) => {
  const api = await setup(page, { self: false, dependent: true })
  api.setMode('FORBIDDEN')
  await choose(page)
  await expect(page.getByLabel('Para quem é a consulta?')).toHaveValue(id(4))
  await confirm(page).click()
  await expect(
    page.getByText(/Você não tem permissão para esta ação/),
  ).toBeVisible()
  expect(api.calls[0].body.patientId).toBe(id(4))
  await expect(
    page.getByText('Consulta confirmada', { exact: true }),
  ).toHaveCount(0)
})

test('FE-013: retorno200 não confirma; replay cancelado exibe o estado atual', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('bad-status')
  await choose(page)
  await confirm(page).click()
  await expect(
    page.getByRole('heading', { name: 'Agendamento não confirmado' }),
  ).toBeVisible()
  await expect(
    page.getByText('Consulta confirmada', { exact: true }),
  ).toHaveCount(0)
  api.setMode('cancelled')
  await confirm(page).click()
  await expect(
    page.getByText('Estado atual da consulta: Cancelada'),
  ).toBeVisible()
  expect(api.calls[1].key).toBe(api.calls[0].key)
})

test('FE-013: online, teclado e360px sem seletor de sala nem entrada de vídeo simulada', async ({
  page,
}) => {
  await setup(page, { remote: true })
  await page.setViewportSize({ width: 360, height: 800 })
  await choose(page)
  await expect(
    page.getByRole('heading', { name: 'Horário selecionado' }),
  ).toBeFocused()
  await confirm(page).focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByText('Consulta confirmada', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Sala atribuída', { exact: true })).toHaveCount(0)
  await expect(
    page.getByText(/O preparo e a entrada na videochamada/),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/tmp/vidaplena-fe013-mobile.png',
    fullPage: true,
  })
})
