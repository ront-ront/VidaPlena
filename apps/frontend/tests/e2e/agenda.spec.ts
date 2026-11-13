import { expect, type Page, test } from '@playwright/test'

import { id, row } from '../support/agenda-data'

async function setup(page: Page, role = 'receptionist') {
  let mode = 'normal'
  const calls: URLSearchParams[] = [],
    writes: string[] = []
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
        id: id(90),
        patientId: role === 'patient' ? id(91) : null,
        roles: [role],
        permissions: [],
        profile: {
          fullName: 'Pessoa Fictícia',
          email: 'pessoa@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (req.method() !== 'GET') writes.push(path)
    if (path === '/v1/catalog/specialties')
      return json({
        items: [
          {
            id: id(50),
            name: 'Cardiologia',
            code: 'CARDIO',
            modalities: ['onsite'],
            durations: { first: 60, return: 30 },
          },
        ],
        nextCursor: null,
      })
    if (path === '/v1/catalog/professionals')
      return json({
        items: (url.searchParams.has('cursor') ? [3] : [1, 2]).map((n) => ({
          id: id(n + 20),
          displayName: `Profissional ${n}`,
          modalities: ['onsite'],
          specialtyIds: [id(50)],
        })),
        nextCursor: url.searchParams.has('cursor') ? null : id(21),
      })
    if (path === '/v1/agenda/day') {
      calls.push(url.searchParams)
      if (mode === 'error')
        return json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503)
      const selected = url.searchParams.get('status'),
        all = [row(1), row(2, 'waiting'), row(3, 'no_show')]
      const matches =
        mode === 'empty'
          ? []
          : all.filter((r) => !selected || r.status === selected)
      const pageRows = url.searchParams.has('cursor')
        ? matches.slice(2)
        : matches.slice(0, 2)
      if (role === 'manager')
        for (const item of pageRows) {
          Object.assign(item.patient, { birthDate: null, cpfMasked: null })
        }
      return json({
        items: pageRows,
        nextCursor:
          matches.length > 2 && !url.searchParams.has('cursor') ? id(2) : null,
        totals: {
          all: mode === 'empty' ? 0 : 3,
          confirmed: mode === 'empty' ? 0 : 1,
          noShow: mode === 'empty' ? 0 : 1,
        },
        localDate: url.searchParams.get('localDate') ?? '2030-05-12',
        clinicTimeZone: 'America/Fortaleza',
        serverNow: '2030-05-12T11:00:00.000Z',
      })
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  return {
    calls,
    writes,
    setMode: (value: string) => {
      mode = value
    },
  }
}
async function open(page: Page) {
  await page.goto('/agenda')
  await expect(
    page.getByRole('region', { name: 'Grade diária de atendimentos' }),
  ).toBeVisible()
}

test('FE-015: dia/fuso do servidor, totais reais e grade por profissional com flags textuais', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  await expect(page.getByLabel('Data da agenda')).toHaveValue('2030-05-12')
  expect(api.calls[0].has('localDate')).toBe(false)
  const stats = page.getByRole('definition')
  await expect(stats).toHaveCount(3)
  await expect(page.getByText('No-show', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('columnheader', { name: 'Hora', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('columnheader', { name: 'Cardiologia Profissional 1' }),
  ).toBeVisible()
  await expect(
    page.getByText('Sem contato externo', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Chegada com atraso', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Importado', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Avisos exigem atenção', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('CONTEÚDO CLÍNICO NÃO EXIBIR', { exact: false }),
  ).toHaveCount(0)
  await expect(page.getByText(/Há mais atendimentos/)).toBeVisible()
  await expect(
    page
      .getByRole('combobox', { name: 'Profissional', exact: true })
      .getByRole('option', { name: 'Profissional 3', exact: true }),
  ).toHaveCount(1)
  expect(api.writes).toHaveLength(0)
})

test('FE-015: filtros e navegação de dia preservam contexto e não alteram URL da aplicação', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  const readsBeforeInvalid = api.calls.length
  await page.getByLabel('Data da agenda').fill('')
  await page.getByRole('button', { name: 'Filtrar agenda' }).click()
  await expect(page.getByText(/Confira a data e os filtros/)).toBeVisible()
  expect(api.calls).toHaveLength(readsBeforeInvalid)
  await page.getByLabel('Data da agenda').fill('2030-05-12')
  await page.getByLabel('Buscar paciente por nome ou CPF').fill('Paciente')
  await page.getByLabel('Especialidade', { exact: true }).selectOption(id(50))
  await page.getByLabel('Profissional', { exact: true }).selectOption(id(21))
  await page.getByLabel('Situação', { exact: true }).selectOption('confirmed')
  await page.getByRole('button', { name: 'Filtrar agenda' }).click()
  await expect
    .poll(() => api.calls.at(-1)?.get('patientQuery'))
    .toBe('Paciente')
  await expect(
    page.getByText(/Grade completa para os filtros aplicados/),
  ).toBeVisible()
  expect(api.calls.at(-1)?.get('status')).toBe('confirmed')
  await page.getByRole('button', { name: 'Próximo dia' }).click()
  await expect(page.getByLabel('Data da agenda')).toHaveValue('2030-05-13')
  expect(api.calls.at(-1)?.get('patientQuery')).toBe('Paciente')
  expect(page.url()).not.toContain('Paciente')
  await page.getByRole('button', { name: 'Limpar filtros e ver hoje' }).click()
  await expect(page.getByLabel('Buscar paciente por nome ou CPF')).toHaveValue(
    '',
  )
  await expect.poll(() => api.calls.at(-1)?.has('localDate')).toBe(false)
})

test('FE-015: paginação completa grade, detalhe administrativo e Escape restaura foco', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  await page.getByRole('button', { name: 'Carregar mais atendimentos' }).click()
  await expect(page.getByText(/3 atendimentos carregados/)).toBeVisible()
  expect(api.calls.at(-1)?.get('cursor')).toBe(id(2))
  const slot = page.getByRole('button', {
    name: 'Ver atendimento de Paciente Fictício 2 às 10:00',
  })
  await slot.click()
  const dialog = page.getByRole('dialog', { name: 'Detalhes do atendimento' })
  await expect(dialog.getByText(/CSV demonstração/)).toBeVisible()
  await expect(dialog.getByText(/Chegada registrada/)).toBeVisible()
  await expect(
    dialog.getByText('CPF: ***.***.***-09', { exact: true }),
  ).toBeVisible()
  await expect(dialog.getByText(/CONTEÚDO CLÍNICO/)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(slot).toBeFocused()
  expect(api.writes).toHaveLength(0)
})

test('FE-015: erro e vazio preservam data/busca e permitem nova consulta', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  await page.getByLabel('Buscar paciente por nome ou CPF').fill('Paciente')
  api.setMode('error')
  await page.getByRole('button', { name: 'Filtrar agenda' }).click()
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar a agenda' }),
  ).toBeVisible()
  await expect(page.getByLabel('Buscar paciente por nome ou CPF')).toHaveValue(
    'Paciente',
  )
  await expect(page.getByLabel('Data da agenda')).toHaveValue('2030-05-12')
  api.setMode('empty')
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(
    page.getByRole('heading', { name: 'Nenhum atendimento nesta seleção' }),
  ).toBeVisible()
  api.setMode('normal')
  await page.getByRole('button', { name: 'Atualizar agenda' }).click()
  await expect(
    page.getByRole('region', { name: 'Grade diária de atendimentos' }),
  ).toBeVisible()
})

test('FE-015: gestor recebe somente identidade permitida e não usa mutações', async ({
  page,
}) => {
  const api = await setup(page, 'manager')
  await open(page)
  await page
    .getByRole('button', {
      name: 'Ver atendimento de Paciente Fictício 1 às 09:00',
    })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Detalhes do atendimento' })
  await expect(dialog.getByText(/CPF:/)).toHaveCount(0)
  await expect(dialog.getByText(/Nascimento:/)).toHaveCount(0)
  expect(api.writes).toHaveLength(0)
})

test('FE-015: paciente não carrega a agenda administrativa', async ({
  page,
}) => {
  const api = await setup(page, 'patient')
  await page.goto('/agenda')
  await expect(
    page.getByRole('heading', { name: 'Acesso não disponível' }),
  ).toBeVisible()
  expect(api.calls).toHaveLength(0)
})

test('FE-015: 760px, rolagem própria por teclado e grade mínima620px', async ({
  page,
}) => {
  await setup(page)
  await page.setViewportSize({ width: 760, height: 900 })
  await open(page)
  await page.getByRole('button', { name: 'Carregar mais atendimentos' }).click()
  const region = page.getByRole('region', {
    name: 'Grade diária de atendimentos',
  })
  expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  )
  expect(
    await page
      .getByRole('table')
      .evaluate((el) => el.getBoundingClientRect().width >= 620),
  ).toBe(true)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await region.focus()
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(() => region.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0)
  await page.screenshot({
    path: '/tmp/vidaplena-fe015-tablet.png',
    fullPage: true,
  })
})
