import { expect, type Page, test } from '@playwright/test'

const ids = {
  specialty: '10000000-0000-4000-8000-000000000001',
  professional: '10000000-0000-4000-8000-000000000002',
  room: '10000000-0000-4000-8000-000000000003',
  user: '10000000-0000-4000-8000-000000000004',
  appointment: '10000000-0000-4000-8000-000000000005',
}
const specialty = () => ({
  id: ids.specialty,
  code: 'CARDIO',
  name: 'Cardiologia',
  active: true,
  allowedModalities: ['onsite', 'remote'],
  defaultMinutesFirst: 60,
  defaultMinutesReturn: 30,
  version: 1,
})
const professional = () => ({
  id: ids.professional,
  userId: ids.user,
  displayName: 'Dra. Pessoa Fictícia',
  councilType: 'CRM',
  councilRegion: 'CE',
  councilNumber: '1234',
  specialtyIds: [ids.specialty],
  modalities: ['onsite'],
  active: true,
  version: 1,
})
const room = () => ({
  id: ids.room,
  name: 'Sala 1',
  active: true,
  capacity: 1,
  version: 1,
})
async function mock(
  page: Page,
  role = 'manager',
  options: { empty?: boolean; error?: boolean; paginated?: boolean } = {},
) {
  let specialties = options.empty ? [] : [specialty()],
    professionals = [professional()],
    rooms = [room()]
  const requests: Array<{ path: string; body: Record<string, unknown> }> = []
  if (options.paginated)
    specialties.push({
      ...specialty(),
      id: '10000000-0000-4000-8000-000000000006',
      code: 'PSICO',
      name: 'Psicologia',
    })
  const reads: string[] = []
  let impact = false,
    duplicate = false,
    networkError = options.error ?? false
  await page
    .context()
    .addCookies([
      { name: 'vp_csrf', value: 'test-only', url: 'http://127.0.0.1:3400' },
    ])
  await page.route('http://127.0.0.1:3434/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname,
      method = req.method()
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3400',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers':
        'authorization,content-type,x-request-id,x-csrf-token',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    }
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers, json: body })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/v1/auth/refresh')
      return json({
        accessToken: 'test-only',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      })
    if (path === '/v1/me')
      return json({
        id: ids.user,
        patientId: null,
        roles: [role],
        permissions: [],
        profile: {
          fullName: 'Gestor Fictício',
          email: 'demo@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (path === '/v1/admin/users')
      return json({
        items: [
          {
            id: ids.user,
            fullName: 'Dra. Pessoa Fictícia',
            email: 'prof@example.test',
            status: 'active',
            roles: ['professional'],
            permissions: [],
            lastLoginAt: null,
            reviewRequiredAt: null,
          },
        ],
        nextCursor: null,
        dpoDesignated: false,
        dpoHolders: [],
      })
    if (method === 'GET') {
      reads.push(path)
      if (networkError)
        return json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503)
      const values =
        path === '/v1/admin/specialties'
          ? specialties
          : path === '/v1/admin/professionals'
            ? professionals
            : path === '/v1/rooms'
              ? rooms
              : null
      if (values) {
        if (options.paginated && path === '/v1/admin/specialties') {
          const offset = url.searchParams.has('cursor') ? 1 : 0
          return json({
            items: values.slice(offset, offset + 1),
            nextCursor: offset === 0 ? values[0].id : null,
          })
        }
        const active = url.searchParams.get('active')
        return json({
          items: values.filter(
            (x) => active === null || x.active === (active === 'true'),
          ),
          nextCursor: null,
        })
      }
    }
    if (
      (method === 'POST' || method === 'PATCH') &&
      path.startsWith('/v1/admin/')
    ) {
      const body = req.postDataJSON()
      requests.push({ path, body })
      if (duplicate) return json({ error: { code: 'CONFLICT' } }, 409)
      if (impact && body.active === false)
        return json(
          {
            error: {
              code: 'SCHEDULE_IMPACT_REVIEW',
              affectedAppointments: [
                {
                  id: ids.appointment,
                  startsAt: '2026-12-01T12:00:00.000Z',
                  endsAt: '2026-12-01T13:00:00.000Z',
                },
              ],
            },
          },
          409,
        )
      if (path.includes('/specialties')) {
        const item = { ...specialty(), ...body, version: 2 }
        specialties = [item]
        return json(item, method === 'POST' ? 201 : 200)
      }
      if (path.includes('/professionals')) {
        const item = { ...professional(), ...body, version: 2 }
        professionals = [item]
        return json(item, method === 'POST' ? 201 : 200)
      }
      if (path.includes('/rooms')) {
        const item = { ...room(), ...body, version: 2 }
        rooms = [item]
        return json(item, method === 'POST' ? 201 : 200)
      }
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  return {
    requests,
    reads,
    setImpact: (v: boolean) => {
      impact = v
    },
    setDuplicate: (v: boolean) => {
      duplicate = v
    },
    setError: (v: boolean) => {
      networkError = v
    },
  }
}

test('FE-010: gestor edita duração com versão e mantém campos quando há duplicidade', async ({
  page,
}) => {
  const api = await mock(page)
  await page.goto('/gestao/catalogo')
  await expect(
    page.getByRole('cell', { name: /^Cardiologia CARDIO/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Editar Cardiologia' }).click()
  await expect(
    page.getByRole('heading', { name: 'Editar cadastro' }),
  ).toBeFocused()
  await page.getByLabel('Primeira consulta (minutos)').fill('45')
  api.setDuplicate(true)
  await page.getByRole('button', { name: 'Salvar cadastro' }).click()
  await expect(page.getByText(/já existe um código/)).toBeVisible()
  await expect(page.getByLabel('Primeira consulta (minutos)')).toHaveValue('45')
  api.setDuplicate(false)
  await page.getByRole('button', { name: 'Salvar cadastro' }).click()
  await expect(
    page.getByText('Cadastro salvo.', { exact: false }),
  ).toBeVisible()
  expect(api.requests.at(-1)?.body.expectedVersion).toBe(1)
  expect(api.requests.at(-1)?.body.defaultMinutesFirst).toBe(45)
  await expect(page.getByText(/Primeira: 45 min/)).toBeVisible()
})

test('FE-010: inativação pede confirmação e mostra impacto sem declarar sucesso', async ({
  page,
}) => {
  const api = await mock(page)
  api.setImpact(true)
  await page.goto('/gestao/catalogo')
  await page.getByRole('button', { name: 'Salas', exact: true }).click()
  await page.getByRole('button', { name: 'Editar Sala 1' }).click()
  await page.getByLabel('Cadastro ativo').uncheck()
  await page.getByRole('button', { name: 'Salvar cadastro' }).click()
  expect(api.requests.length).toBe(0)
  await page.getByRole('button', { name: 'Revisar e inativar' }).click()
  await expect(
    page.getByRole('heading', { name: 'Consultas precisam ser resolvidas' }),
  ).toBeVisible()
  await expect(page.getByText(`Consulta ${ids.appointment}`)).toBeVisible()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Sala 1')
  await expect(page.getByText('Cadastro salvo.', { exact: false })).toHaveCount(
    0,
  )
  await expect(page.getByRole('button', { name: /Excluir/ })).toHaveCount(0)
  api.setImpact(false)
  await page.getByRole('button', { name: 'Revisar e inativar' }).click()
  await expect(
    page.getByText('Cadastro salvo.', { exact: false }),
  ).toBeVisible()
  await expect(page.getByText('Inativo', { exact: true })).toBeVisible()
})

test('FE-010: cria especialidade e sala, valida formulário e mantém capacidade unitária', async ({
  page,
}) => {
  const api = await mock(page, 'manager', { empty: true })
  await page.goto('/gestao/catalogo')
  await expect(
    page.getByRole('heading', { name: 'Nenhum cadastro nesta página' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Adicionar especialidade' })
    .first()
    .click()
  await page.getByRole('button', { name: 'Salvar cadastro' }).click()
  await expect(page.getByText('Informe o nome.', { exact: true })).toBeVisible()
  expect(api.requests.length).toBe(0)
  await page.getByLabel('Nome', { exact: true }).fill('Psicologia')
  await page.getByLabel('Código da especialidade').fill('PSICO')
  await page.getByLabel('Primeira consulta (minutos)').fill('50')
  await page.getByLabel('Retorno (minutos)').fill('30')
  await page.getByRole('button', { name: 'Salvar cadastro' }).click()
  await expect(
    page.getByText('Cadastro salvo.', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Salas', exact: true }).click()
  await page
    .getByRole('button', { name: 'Adicionar sala', exact: true })
    .first()
    .click()
  await page.getByLabel('Nome', { exact: true }).fill('Sala 2')
  await page.getByRole('button', { name: 'Salvar cadastro' }).click()
  await expect(
    page.getByText('Cadastro salvo.', { exact: false }),
  ).toBeVisible()
  expect(api.requests.at(-1)?.body).toEqual({ name: 'Sala 2', active: true })
})

test('FE-010: vínculo profissional usa conta e especialidade existentes com conselho e UF', async ({
  page,
}) => {
  const api = await mock(page)
  await page.goto('/gestao/catalogo')
  await page.getByRole('button', { name: 'Profissionais', exact: true }).click()
  await page.getByRole('button', { name: 'Adicionar profissional' }).click()
  await page.getByLabel('Conta profissional').selectOption(ids.user)
  await page.getByLabel('Conselho', { exact: true }).fill('CRM')
  await page.getByLabel('Número do registro').fill('4321')
  await page.getByLabel('UF do conselho').selectOption('CE')
  await page.getByLabel('Cardiologia', { exact: true }).check()
  await page.getByRole('button', { name: 'Salvar cadastro' }).click()
  await expect(
    page.getByText('Cadastro salvo.', { exact: false }),
  ).toBeVisible()
  expect(api.requests.at(-1)?.body).toMatchObject({
    userId: ids.user,
    councilType: 'CRM',
    councilNumber: '4321',
    councilRegion: 'CE',
    specialtyIds: [ids.specialty],
    modalities: ['onsite'],
  })
  await page
    .getByRole('button', { name: 'Editar Dra. Pessoa Fictícia' })
    .click()
  await expect(page.getByLabel('Conta profissional')).toBeDisabled()
})

test('FE-010: filtros, falha recuperável e 360 px sem overflow no viewport', async ({
  page,
}) => {
  const api = await mock(page, 'admin', { error: true })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/gestao/catalogo')
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar o catálogo' }),
  ).toBeVisible()
  api.setError(false)
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(
    page.getByRole('button', { name: 'Editar Cardiologia' }),
  ).toBeVisible()
  await page.getByLabel('Buscar nesta página').fill('inexistente')
  await expect(
    page.getByRole('heading', { name: 'Nenhum cadastro nesta página' }),
  ).toBeVisible()
  await page.getByLabel('Buscar nesta página').fill('')
  await page.getByLabel('Situação', { exact: true }).selectOption('false')
  await expect(
    page.getByRole('heading', { name: 'Nenhum cadastro nesta página' }),
  ).toBeVisible()
  await page.getByLabel('Situação', { exact: true }).selectOption('')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page
    .getByRole('button', { name: 'Adicionar especialidade' })
    .first()
    .click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.getByLabel('Nome', { exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Código da especialidade')).toBeFocused()
  await page.screenshot({
    path: '/tmp/vidaplena-fe010-mobile.png',
    fullPage: true,
  })
})

test('FE-010: recepção não vê controles e não consulta endpoints de gestão', async ({
  page,
}) => {
  const api = await mock(page, 'receptionist')
  await page.goto('/gestao/catalogo')
  await expect(
    page.getByRole('heading', { name: 'Acesso não disponível' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /Adicionar/ })).toHaveCount(0)
  expect(api.requests.length).toBe(0)
  expect(api.reads.length).toBe(0)
})

test('FE-010: paginação avança e volta sem misturar registros ou omitir contexto', async ({
  page,
}) => {
  await mock(page, 'manager', { paginated: true })
  await page.goto('/gestao/catalogo')
  await expect(
    page.getByRole('button', { name: 'Editar Cardiologia' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Anterior', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Próxima', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Editar Psicologia' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Editar Cardiologia' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Próxima', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Anterior', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Editar Cardiologia' }),
  ).toBeVisible()
})
