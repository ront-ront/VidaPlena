import { expect, type Page, test } from '@playwright/test'

const id = (n: number) =>
  `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const base = {
  id: id(1),
  patientId: id(2),
  professionalId: id(3),
  specialtyId: id(4),
  roomId: id(5),
  roomName: 'Sala Ipê',
  professionalName: 'Dra. Fictícia',
  specialtyName: 'Cardiologia',
  modality: 'onsite',
  visitType: 'first',
  startsAt: '2030-05-11T12:00:00.000Z',
  endsAt: '2030-05-11T13:00:00.000Z',
  durationMinutes: 60,
  version: 1,
  status: 'confirmed',
  bookingSource: 'portal',
  attendanceResponse: null,
}
const slot = {
  professionalId: id(3),
  startsAt: '2030-05-12T12:00:00.000Z',
  endsAt: '2030-05-12T13:00:00.000Z',
  roomAvailable: true,
}
const alternative = {
  ...slot,
  startsAt: '2030-05-12T15:00:00.000Z',
  endsAt: '2030-05-12T16:00:00.000Z',
}
async function setup(
  page: Page,
  options: {
    expired?: boolean
    expiring?: boolean
    role?: string
    paged?: boolean
  } = {},
) {
  let current = { ...base },
    mode = 'success',
    lastChange: unknown = {
      action: 'rescheduled',
      origin: 'clinic',
      occurredAt: '2030-04-01T12:00:00.000Z',
    }
  const reads: URLSearchParams[] = [],
    writes: { path: string; body: Record<string, unknown>; key: string }[] = [],
    commands = new Map<string, unknown>()
  await page
    .context()
    .addCookies([
      { name: 'vp_csrf', value: 'test-only', url: 'http://127.0.0.1:3400' },
    ])
  await page.route('http://127.0.0.1:3434/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname
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
        id: id(6),
        patientId: id(2),
        roles: [options.role ?? 'patient'],
        permissions: [],
        profile: {
          fullName: 'Ana Fictícia',
          email: 'ana@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (path === '/v1/me/dependents')
      return json({
        items: [
          {
            patientId: id(7),
            fullName: 'Dependente Fictício',
            relationship: 'mãe',
            status: 'active',
          },
        ],
      })
    if (path === '/v1/me/appointments') {
      reads.push(url.searchParams)
      if (mode === 'read-error')
        return json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503)
      if (mode === 'foreign')
        return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
      const history = url.searchParams.get('view') === 'history',
        cursor = url.searchParams.get('cursor'),
        selected = url.searchParams.get('patientId')
      const now = options.expired
        ? '2030-05-11T11:00:00.000Z'
        : options.expiring
          ? '2030-05-11T07:59:57.000Z'
          : '2030-05-01T12:00:00.000Z'
      const row = {
        ...current,
        selfService: {
          deadline: '2030-05-11T08:00:00.000Z',
          rescheduleAllowed: current.status === 'confirmed' && !options.expired,
          cancelAllowed: current.status === 'confirmed' && !options.expired,
        },
        lastChange,
      }
      const items =
        selected === id(7)
          ? []
          : history
            ? current.status === 'cancelled'
              ? [row]
              : []
            : current.status === 'cancelled'
              ? []
              : cursor
                ? [{ ...row, id: id(10) }]
                : [row]
      return json({
        items,
        nextCursor: options.paged && !history && !cursor ? id(1) : null,
        clinicTimeZone: 'America/Fortaleza',
        serverNow: now,
      })
    }
    if (path === '/v1/catalog/specialties')
      return json({
        items: [
          {
            id: id(4),
            name: 'Cardiologia',
            code: 'CARDIO',
            modalities: ['onsite', 'remote'],
            durations: { first: 60, return: 30 },
          },
        ],
        nextCursor: null,
      })
    if (path === '/v1/catalog/professionals')
      return json({
        items: [
          {
            id: id(3),
            displayName: 'Dra. Fictícia',
            specialtyIds: [id(4)],
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
    if (path.startsWith('/v1/appointments/') && req.method() === 'POST') {
      const body = req.postDataJSON(),
        key = req.headers()['idempotency-key']
      writes.push({ path, body, key })
      if (mode === 'conflict' && body.startsAt !== alternative.startsAt)
        return json(
          { error: { code: 'SLOT_UNAVAILABLE', alternatives: [alternative] } },
          409,
        )
      if (mode === 'version') return json({ error: { code: 'CONFLICT' } }, 409)
      if (!commands.has(key)) {
        commands.set(key, body)
        current = path.endsWith('/cancel')
          ? { ...current, status: 'cancelled', version: current.version + 1 }
          : {
              ...current,
              startsAt: body.startsAt,
              endsAt:
                body.startsAt === alternative.startsAt
                  ? alternative.endsAt
                  : slot.endsAt,
              modality: body.modality,
              version: current.version + 1,
            }
        lastChange = {
          action: path.endsWith('/cancel') ? 'cancelled' : 'rescheduled',
          origin: 'patient',
          occurredAt: '2030-05-01T12:00:00.000Z',
        }
      }
      if (mode === 'lost') return route.abort('failed')
      return json({ appointment: current, notificationState: 'queued' })
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  return {
    reads,
    writes,
    commands,
    setMode: (value: string) => {
      mode = value
    },
  }
}
const card = (page: Page) => page.getByRole('article').first()
async function open(page: Page) {
  await page.goto('/minhas-consultas')
  await expect(card(page)).toBeVisible()
}

test('FE-014: futuras e detalhes da origem, paginação e filtro de dependente', async ({
  page,
}) => {
  const api = await setup(page, { paged: true })
  await open(page)
  await card(page).getByText('Detalhes do atendimento').click()
  await expect(card(page).getByText(/Remarcação pela clínica/)).toBeVisible()
  await page.getByRole('button', { name: 'Carregar mais consultas' }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  expect(api.reads.at(-1)?.get('cursor')).toBe(id(1))
  await page.getByLabel('Paciente', { exact: true }).selectOption(id(7))
  await expect(
    page.getByRole('heading', { name: 'Nenhuma consulta futura' }),
  ).toBeVisible()
  expect(api.reads.at(-1)?.get('patientId')).toBe(id(7))
  await page.getByRole('button', { name: 'Histórico', exact: true }).click()
  expect(api.reads.at(-1)?.get('view')).toBe('history')
  expect(api.writes).toHaveLength(0)
})

test('FE-014: fora do prazo só orienta recepção e não oferece mutação', async ({
  page,
}) => {
  const api = await setup(page, { expired: true })
  await open(page)
  await expect(
    page.getByText(
      'Para alterar este atendimento, procure a recepção da clínica.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Reagendar', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Cancelar', exact: true }),
  ).toHaveCount(0)
  expect(api.writes).toHaveLength(0)
})

test('FE-014: prazo também termina com a página aberta pelo relógio do servidor', async ({
  page,
}) => {
  await setup(page, { expiring: true })
  await open(page)
  await expect(
    page.getByRole('button', { name: 'Reagendar', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Reagendar', exact: true }),
  ).toHaveCount(0, { timeout: 6000 })
  await expect(
    page.getByText(
      'Para alterar este atendimento, procure a recepção da clínica.',
    ),
  ).toBeVisible()
})

test('FE-014: cancelar exige confirmação, Escape restaura foco e recarga mantém histórico', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Cancelar consulta?' }),
  ).toBeVisible()
  expect(api.writes).toHaveLength(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Cancelar', exact: true }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByLabel('Motivo (opcional)').fill('Mudança de compromisso')
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click()
  await expect(page.getByText('Cancelada', { exact: true })).toBeVisible()
  expect(api.writes).toHaveLength(1)
  expect(api.writes[0].body.expectedVersion).toBe(1)
  expect(api.writes[0].body.origin).toBe('patient')
  await page.reload()
  await page.getByRole('button', { name: 'Histórico', exact: true }).click()
  await expect(page.getByText('Cancelada', { exact: true })).toBeVisible()
  await card(page).getByText('Detalhes do atendimento').click()
  await expect(
    page.getByText(/Cancelamento pelo paciente ou responsável/),
  ).toBeVisible()
})

test('FE-014: conflito preserva original; alternativa só muda após confirmação200', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('conflict')
  await open(page)
  await page.getByRole('button', { name: 'Reagendar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Reagendar consulta' })
  await expect(
    dialog.getByLabel('Especialidade', { exact: true }),
  ).toBeDisabled()
  await expect(dialog.getByLabel('Tipo de atendimento')).toBeDisabled()
  await dialog.getByLabel('Data do atendimento').fill('2030-05-12')
  await dialog.getByRole('button', { name: /09:00 até 10:00/ }).click()
  await dialog.getByRole('button', { name: 'Confirmar novo horário' }).click()
  await expect(
    dialog.getByText(/Este horário deixou de estar disponível/),
  ).toBeVisible()
  // Conteúdo da consulta original continua inalterado enquanto o dialog está aberto.
  await expect(
    page
      .locator('article')
      .first()
      .getByText('11 de maio de 2030 às 09:00', { exact: true }),
  ).toBeAttached()
  await dialog
    .getByRole('button', { name: '12 de maio de 2030 às 12:00' })
    .click()
  expect(api.writes).toHaveLength(1)
  await dialog.getByRole('button', { name: 'Confirmar novo horário' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    card(page).getByText('12 de maio de 2030 às 12:00', { exact: true }),
  ).toBeVisible()
  expect(api.writes[1].body.startsAt).toBe(alternative.startsAt)
  expect(api.writes[1].body).not.toHaveProperty('patientId')
})

test('FE-014: resposta perdida de cancelamento se verifica por recarga sem outro POST', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('lost')
  await open(page)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Não foi possível confirmar a alteração',
    }),
  ).toBeVisible()
  await expect(page.getByText(/O estado pode ter mudado/)).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Histórico', exact: true }).click()
  await expect(page.getByText('Cancelada', { exact: true })).toBeVisible()
  expect(api.writes).toHaveLength(1)
  expect(api.commands.size).toBe(1)
})

test('FE-014: falha de leitura é recuperável e ID arbitrário na URL não seleciona terceiro', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('foreign')
  await page.goto(
    `/minhas-consultas?patientId=${id(99)}&appointmentId=${id(98)}`,
  )
  await expect(
    page.getByRole('heading', {
      name: 'Não foi possível atualizar as consultas',
    }),
  ).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  expect(api.reads.some((query) => query.get('patientId') === id(99))).toBe(
    false,
  )
  api.setMode('success')
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(card(page)).toBeVisible()
})

test('FE-014: perfil interno não consulta o serviço de consultas próprias', async ({
  page,
}) => {
  const api = await setup(page, { role: 'receptionist' })
  await page.goto('/minhas-consultas')
  await expect(
    page.getByRole('heading', { name: 'Acesso não disponível' }),
  ).toBeVisible()
  expect(api.reads).toHaveLength(0)
})

test('FE-014: 360px, foco no diálogo e cancelamento abandonado sem escrita', async ({
  page,
}) => {
  const api = await setup(page)
  await page.setViewportSize({ width: 360, height: 800 })
  await open(page)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Cancelar consulta?' })
  await expect(dialog).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/tmp/vidaplena-fe014-mobile.png',
    fullPage: true,
  })
  await dialog.getByRole('button', { name: 'Voltar sem alterar' }).click()
  await expect(dialog).toHaveCount(0)
  expect(api.writes).toHaveLength(0)
})
