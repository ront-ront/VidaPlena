import { expect, type Page, test } from '@playwright/test'

const ids = {
  s: '30000000-0000-4000-8000-000000000001',
  remote: '30000000-0000-4000-8000-000000000002',
  p: '30000000-0000-4000-8000-000000000003',
  q: '30000000-0000-4000-8000-000000000004',
  user: '30000000-0000-4000-8000-000000000005',
}
const prof = (id: string, name: string) => ({
  id,
  displayName: name,
  specialtyIds: [ids.s, ids.remote],
  modalities: ['onsite', 'remote'],
})
const slots = [
  {
    professionalId: ids.p,
    startsAt: '2030-05-12T12:00:00.000Z',
    endsAt: '2030-05-12T13:00:00.000Z',
    roomAvailable: true,
  },
  {
    professionalId: ids.q,
    startsAt: '2030-05-12T13:00:00.000Z',
    endsAt: '2030-05-12T14:00:00.000Z',
    roomAvailable: true,
  },
  {
    professionalId: ids.p,
    startsAt: '2030-05-12T14:00:00.000Z',
    endsAt: '2030-05-12T15:00:00.000Z',
    roomAvailable: false,
  },
]
async function setup(page: Page, role = 'patient') {
  let mode: 'normal' | 'empty' | 'removed' | 'error' = 'normal'
  const searches: URLSearchParams[] = [],
    writes: string[] = [],
    reads: string[] = []
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
        'authorization,content-type,x-request-id,x-csrf-token',
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
        id: ids.user,
        patientId: ids.user,
        roles: [role],
        permissions: [],
        profile: {
          fullName: 'Paciente Fictício',
          email: 'paciente@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (req.method() === 'POST') writes.push(path)
    if (req.method() === 'GET') reads.push(path)
    if (path === '/v1/catalog/specialties')
      return json({
        items: url.searchParams.has('cursor')
          ? [
              {
                id: ids.remote,
                name: 'Psicologia online',
                code: 'PSICO',
                modalities: ['remote'],
                durations: { first: 50, return: 30 },
              },
            ]
          : [
              {
                id: ids.s,
                name: 'Cardiologia',
                code: 'CARDIO',
                modalities: ['onsite', 'remote'],
                durations: { first: 60, return: 30 },
              },
            ],
        nextCursor: url.searchParams.has('cursor') ? null : ids.s,
      })
    if (path === '/v1/catalog/professionals')
      return json({
        items: url.searchParams.has('cursor')
          ? [prof(ids.q, 'Dr. Segundo Fictício')]
          : [prof(ids.p, 'Dra. Primeira Fictícia')],
        nextCursor: url.searchParams.has('cursor') ? null : ids.p,
      })
    if (path === '/v1/availability') {
      searches.push(url.searchParams)
      if (mode === 'error')
        return json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503)
      if (mode === 'empty' || mode === 'removed')
        return json({
          days: [],
          nearestAvailableAt:
            mode === 'empty' ? '2030-05-15T12:00:00.000Z' : null,
          clinicTimeZone: 'America/Fortaleza',
        })
      return json({
        days: [
          {
            localDate: url.searchParams.get('from'),
            slots: slots.filter(
              (s) =>
                !url.searchParams.has('professionalId') ||
                s.professionalId === url.searchParams.get('professionalId'),
            ),
          },
        ],
        nearestAvailableAt: slots[0].startsAt,
        clinicTimeZone: 'America/Fortaleza',
      })
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  return {
    searches,
    writes,
    reads,
    setMode: (value: 'normal' | 'empty' | 'removed' | 'error') => {
      mode = value
    },
  }
}
async function search(page: Page, specialty = ids.s) {
  await page.goto('/agendar')
  await page
    .getByLabel('Especialidade', { exact: true })
    .selectOption(specialty)
  await page.getByLabel('Data do atendimento').fill('2030-05-12')
}

test('FE-012: catálogo paginado e horários de todos os profissionais, com seleção sem reserva', async ({
  page,
}) => {
  const api = await setup(page)
  await search(page)
  await expect(
    page.getByRole('button', {
      name: '09:00 até 10:00, Dra. Primeira Fictícia, presencial',
    }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', {
      name: '10:00 até 11:00, Dr. Segundo Fictício, presencial',
    }),
  ).toBeEnabled()
  expect(api.searches.at(-1)?.has('professionalId')).toBe(false)
  await page
    .getByRole('button', {
      name: '09:00 até 10:00, Dra. Primeira Fictícia, presencial',
    })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Horário selecionado' }),
  ).toBeFocused()
  await expect(
    page.getByText('A seleção não reserva o horário.', { exact: false }),
  ).toBeVisible()
  expect(api.writes).toHaveLength(0)
  await expect(
    page.getByRole('combobox', { name: 'Sala', exact: true }),
  ).toHaveCount(0)
})

test('FE-012: vazio mostra próxima data e permite buscar novamente sem prometer vaga', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('empty')
  await search(page)
  await expect(
    page.getByRole('heading', { name: 'Nenhum horário neste período' }),
  ).toBeVisible()
  await expect(page.getByText(/Próxima data disponível/)).toBeVisible()
  await page.getByRole('button', { name: 'Ver próxima data' }).click()
  await expect(page.getByLabel('Data do atendimento')).toHaveValue('2030-05-15')
  await expect.poll(() => api.searches.at(-1)?.get('from')).toBe('2030-05-15')
  expect(api.writes).toHaveLength(0)
})

test('FE-012: modalidade indisponível não aparece e sala ocupada não é selecionável', async ({
  page,
}) => {
  await setup(page)
  await search(page)
  await expect(
    page.getByRole('button', {
      name: '11:00 até 12:00, Dra. Primeira Fictícia, presencial',
    }),
  ).toBeDisabled()
  await page
    .getByLabel('Especialidade', { exact: true })
    .selectOption(ids.remote)
  await expect(page.getByLabel('Modalidade', { exact: true })).toHaveValue(
    'remote',
  )
  await expect(
    page
      .getByLabel('Modalidade', { exact: true })
      .getByRole('option', { name: 'Presencial', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: '11:00 até 12:00, Dra. Primeira Fictícia, online',
    }),
  ).toBeEnabled()
})

test('FE-012: atualização remove seleção vencida e filtros opcionais seguem para o servidor', async ({
  page,
}) => {
  const api = await setup(page)
  await search(page)
  await page
    .getByRole('button', {
      name: '09:00 até 10:00, Dra. Primeira Fictícia, presencial',
    })
    .click()
  api.setMode('removed')
  await page.getByRole('button', { name: 'Atualizar horários' }).click()
  await expect(
    page.getByText(
      'O horário selecionado deixou de estar disponível. Escolha outro horário.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Horário selecionado' }),
  ).toHaveCount(0)
  api.setMode('normal')
  await page.getByLabel('Profissional (opcional)').selectOption(ids.q)
  await page.getByLabel('Tipo de atendimento').selectOption('return')
  await expect(
    page.getByRole('button', {
      name: '10:00 até 11:00, Dr. Segundo Fictício, presencial',
    }),
  ).toBeEnabled()
  await expect
    .poll(() => api.searches.at(-1)?.get('professionalId'))
    .toBe(ids.q)
  await expect.poll(() => api.searches.at(-1)?.get('visitType')).toBe('return')
})

test('FE-012: erro recuperável, campos preservados e teclado a 360 px sem overflow', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('error')
  await page.setViewportSize({ width: 360, height: 800 })
  await search(page)
  await expect(
    page.getByRole('heading', { name: 'Não foi possível buscar horários' }),
  ).toBeVisible()
  api.setMode('normal')
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(
    page.getByRole('button', {
      name: '09:00 até 10:00, Dra. Primeira Fictícia, presencial',
    }),
  ).toBeEnabled()
  await expect(page.getByLabel('Data do atendimento')).toHaveValue('2030-05-12')
  await page.getByLabel('Modalidade', { exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Tipo de atendimento')).toBeFocused()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page
    .getByRole('button', {
      name: '09:00 até 10:00, Dra. Primeira Fictícia, presencial',
    })
    .click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/tmp/vidaplena-fe012-mobile.png',
    fullPage: true,
  })
})

test('FE-012: perfil interno não abre o fluxo do paciente nem consulta seus serviços', async ({
  page,
}) => {
  const api = await setup(page, 'receptionist')
  await page.goto('/agendar')
  await expect(
    page.getByRole('heading', { name: 'Acesso não disponível' }),
  ).toBeVisible()
  expect(api.reads).toHaveLength(0)
})
