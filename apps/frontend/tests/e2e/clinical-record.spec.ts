import { expect, type Page, test } from '@playwright/test'
import { id, row } from '../support/agenda-data'

async function setup(page: Page, role = 'professional') {
  let mode: 'normal' | 'denied' | 'empty' | 'pre' | 'wrong' = 'normal',
    expiry = Date.now() + 3600000
  const calls: string[] = []
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
    calls.push(`${req.method()} ${path}${url.search}`)
    if (path === '/v1/auth/refresh')
      return json({
        accessToken: 'test-only',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      })
    if (path === '/v1/me')
      return json({
        id: id(90),
        patientId: role === 'patient' ? id(11) : null,
        roles: [role],
        permissions: [],
        profile: {
          fullName: 'Profissional Fictício',
          email: 'profissional@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (path === '/v1/scheduling/context')
      return json({
        clinicTimeZone: 'America/Fortaleza',
        serverNow: '2030-05-12T12:00:00.000Z',
        localDate: '2030-05-12',
      })
    if (path === '/v1/catalog/specialties')
      return json({
        items: [
          {
            id: id(50),
            code: 'CARDIO',
            name: 'Cardiologia',
            modalities: ['onsite'],
            durations: { first: 60, return: 30 },
          },
        ],
        nextCursor: null,
      })
    if (path === '/v1/agenda/day' || path === '/v1/professionals/me/queue')
      return json({
        items:
          mode === 'empty'
            ? []
            : [row(1, path.includes('queue') ? 'waiting' : 'confirmed')],
        nextCursor: null,
        ...(path === '/v1/agenda/day'
          ? {
              localDate: url.searchParams.get('localDate') ?? '2030-05-12',
              clinicTimeZone: 'America/Fortaleza',
              serverNow: '2030-05-12T12:00:00.000Z',
              totals: { all: 1, confirmed: 1, noShow: 0 },
            }
          : {}),
      })
    if (path === `/v1/clinical/records/${id(11)}`) {
      if (mode === 'denied')
        return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
      return json({
        recordId: id(100),
        recordNumber: 'VP-TESTE-001',
        patient: {
          id: mode === 'wrong' ? id(12) : id(11),
          name: 'Mariana Fictícia',
          birthDate: '1990-06-15',
        },
        lastEncounterAt:
          mode === 'empty' || mode === 'pre'
            ? null
            : '2030-05-01T12:00:00.000Z',
        firstVisit: mode === 'pre' ? null : mode === 'empty',
        alerts: [
          {
            id: id(60),
            patientId: id(11),
            kind: 'allergy',
            term: 'Dipirona fictícia',
            substanceCode: null,
            verificationState: 'reported',
            active: true,
            version: 1,
            author: { id: id(21), name: 'Profissional Fictício' },
            date: '2030-05-01T12:00:00.000Z',
          },
        ],
        currentEncounter: null,
        linkBasis: {
          id: id(101),
          expiresAt: new Date(expiry).toISOString(),
          kind: 'care_link',
          scope: mode === 'pre' ? 'pre' : 'during',
        },
      })
    }
    if (path === `/v1/clinical/records/${id(11)}/timeline`) {
      if (mode === 'denied')
        return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
      if (mode === 'empty' || mode === 'pre')
        return json({ items: [], nextCursor: null, restricted: mode === 'pre' })
      const older = url.searchParams.has('cursor')
      return json({
        items: [
          {
            id: id(older ? 104 : 102),
            resourceId: id(older ? 105 : 103),
            type: older ? 'imported_history' : 'encounter',
            date: older
              ? '2029-01-01T12:00:00.000Z'
              : '2030-05-01T12:00:00.000Z',
            specialty: { id: id(50), name: 'Cardiologia' },
            professional: { id: id(21), name: 'Profissional Fictício' },
            modality: 'onsite',
            summary: older
              ? 'Histórico fictício anterior'
              : 'Consulta de retorno fictícia',
            importedOrigin: older
              ? {
                  origin: 'Acervo em papel fictício',
                  importedAt: '2030-01-01T12:00:00.000Z',
                  importedBy: id(90),
                }
              : null,
          },
        ],
        nextCursor: older ? null : `encounter:${id(102)}`,
        restricted: false,
      })
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  return {
    calls,
    mode: (value: typeof mode) => {
      mode = value
    },
    expire: (value: number) => {
      expiry = value
    },
  }
}
test('FE-021: agenda própria e fila abrem cabeçalho/alertas/timeline sem iniciar atendimento', async ({
  page,
}) => {
  const s = await setup(page)
  await page.goto('/clinico/agenda')
  await expect(
    page.getByRole('heading', { name: 'Paciente Fictício 1' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Pacientes aguardando', exact: true })
    .click()
  await expect(
    page.getByText('Aguardando atendimento', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Abrir prontuário de Paciente Fictício 1' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Mariana Fictícia' }),
  ).toBeVisible()
  await expect(page.getByText('39 anos', { exact: false })).toBeVisible()
  await expect(page.getByText('Alergia: Dipirona fictícia')).toBeVisible()
  await expect(
    page.getByText('Relatado · aguarda confirmação clínica'),
  ).toBeVisible()
  await expect(page.getByText('Consulta de retorno fictícia')).toBeVisible()
  expect(
    s.calls.some((c) => c.startsWith('POST /v1/clinical/encounters')),
  ).toBe(false)
  expect(s.calls.some((c) => c.includes('professionalId='))).toBe(false)
  await page.screenshot({
    path: '/tmp/vidaplena-fe021-desktop-light.png',
    fullPage: true,
  })
})
test('FE-021: paginação e filtros usam blocos no servidor, com origem importada visível', async ({
  page,
}) => {
  const s = await setup(page)
  await page.goto(`/prontuarios/${id(11)}`)
  await expect(
    page.getByRole('button', { name: 'Carregar registros anteriores' }),
  ).toBeVisible()
  const initialCalls = s.calls.filter((c) => c.includes('/timeline')).length
  await page
    .getByRole('button', { name: 'Carregar registros anteriores' })
    .click()
  await expect(
    page.getByText('Acervo em papel fictício', { exact: false }),
  ).toBeVisible()
  expect(s.calls.filter((c) => c.includes('/timeline')).length).toBe(
    initialCalls + 1,
  )
  await page.getByLabel('De', { exact: true }).fill('2030-05-01')
  await page.getByLabel('Até (inclusive)').fill('2030-05-12')
  await page.getByLabel('Especialidade', { exact: true }).selectOption(id(50))
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect
    .poll(() =>
      s.calls.some(
        (c) =>
          c.includes('from=2030-05-01T03%3A00%3A00Z') &&
          c.includes('to=2030-05-13T03%3A00%3A00Z'),
      ),
    )
    .toBe(true)
  await expect(page.getByText('Histórico fictício anterior')).toHaveCount(0)
})
test('FE-021: negação ao atualizar remove conteúdo anterior e oferece caminho de urgência', async ({
  page,
}) => {
  const s = await setup(page)
  await page.goto(`/prontuarios/${id(11)}`)
  await expect(
    page.getByRole('heading', { name: 'Mariana Fictícia' }),
  ).toBeVisible()
  await expect(page.getByText('Consulta de retorno fictícia')).toBeVisible()
  s.mode('denied')
  await page.getByRole('button', { name: 'Atualizar acesso' }).click()
  await expect(
    page.getByText('Acesso ao prontuário indisponível'),
  ).toBeVisible()
  await expect(page.getByText('Mariana Fictícia')).toHaveCount(0)
  await expect(
    page.getByText('Dipirona fictícia', { exact: false }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Solicitar acesso de urgência' }),
  ).toHaveAttribute('href', `/prontuarios/acesso-urgente?patientId=${id(11)}`)
  s.mode('normal')
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(
    page.getByRole('heading', { name: 'Mariana Fictícia' }),
  ).toBeVisible()
})
test('FE-021: primeira consulta e pré-consulta não fabricam eventos', async ({
  page,
}) => {
  const s = await setup(page)
  s.mode('empty')
  await page.goto(`/prontuarios/${id(11)}`)
  await expect(
    page.getByRole('heading', { name: 'Primeira consulta' }),
  ).toBeVisible()
  await expect(page.getByText('Consulta de retorno fictícia')).toHaveCount(0)
  s.mode('pre')
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Leitura pré-consulta limitada' }),
  ).toBeVisible()
  await expect(page.getByLabel('De', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Alergia: Dipirona fictícia')).toBeVisible()
})
test('FE-021: resposta de outro paciente é recusada e expiração remove dados', async ({
  page,
}) => {
  const s = await setup(page)
  s.mode('wrong')
  await page.goto(`/prontuarios/${id(11)}`)
  await expect(
    page.getByText('Não foi possível abrir o prontuário'),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Mariana Fictícia' }),
  ).toHaveCount(0)
  s.mode('normal')
  s.expire(Date.now() + 3000)
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(
    page.getByRole('heading', { name: 'Mariana Fictícia' }),
  ).toBeVisible()
  await expect(page.getByText('Acesso ao prontuário indisponível')).toBeVisible(
    { timeout: 8000 },
  )
  await expect(
    page.getByRole('heading', { name: 'Mariana Fictícia' }),
  ).toHaveCount(0)
})
for (const role of ['patient', 'receptionist', 'manager', 'admin'])
  test(`FE-021: ${role} não lê prontuário nem consulta APIs clínicas`, async ({
    page,
  }) => {
    const s = await setup(page, role)
    await page.goto(`/prontuarios/${id(11)}`)
    await expect(
      page.getByRole('heading', { name: 'Acesso não disponível' }),
    ).toBeVisible()
    expect(s.calls.some((c) => c.includes('/clinical/records/'))).toBe(false)
  })
test('FE-021: tablet/mobile e tema escuro mantêm identificação, alertas e filtros utilizáveis', async ({
  page,
}) => {
  await setup(page)
  await page.addInitScript(() => localStorage.setItem('vp-theme', 'dark'))
  for (const width of [820, 360]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/prontuarios/${id(11)}`)
    await expect(
      page.getByRole('heading', { name: 'Mariana Fictícia' }),
    ).toBeVisible()
    await expect(page.getByText('Alergia: Dipirona fictícia')).toBeVisible()
    await page.getByLabel('Tipo de registro').focus()
    await expect(page.getByLabel('Tipo de registro')).toBeFocused()
    const input = await page.getByLabel('Tipo de registro').boundingBox()
    const patientHeader = await page
      .getByRole('region', { name: 'Identificação do paciente' })
      .boundingBox()
    expect(input?.y).toBeGreaterThanOrEqual(
      Math.max(0, (patientHeader?.y ?? 0) + (patientHeader?.height ?? 0)),
    )
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `/tmp/vidaplena-fe021-${width}-dark.png`,
      fullPage: true,
    })
  }
})
