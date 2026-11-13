import { expect, type Page, test } from '@playwright/test'

const id = '20000000-0000-4000-8000-000000000001',
  other = '20000000-0000-4000-8000-000000000002',
  userId = '20000000-0000-4000-8000-000000000003',
  appointment = '20000000-0000-4000-8000-000000000004'
const basicRule = {
  weekday: 1,
  localStart: '08:00',
  localEnd: '12:00',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  modality: 'onsite',
}
const futureRule = {
  ...basicRule,
  weekday: 6,
  effectiveFrom: '2030-01-01',
  effectiveTo: '2030-12-31',
}
const futureBlock = {
  startsAt: '2030-01-01T11:00:00.123Z',
  endsAt: '2030-01-01T12:00:00.456Z',
  kind: 'vacation',
  reason: 'Férias futuras',
}
type Failure = 'none' | 'impact' | 'conflict' | 'network'
async function setup(page: Page, role = 'manager', empty = false) {
  let version = 1,
    rules = empty ? [] : [basicRule, futureRule],
    blocks = empty ? [] : [futureBlock]
  let failure: Failure = 'none'
  const writes: Array<Record<string, unknown>> = [],
    reads: string[] = []
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
        'authorization,content-type,x-request-id,x-csrf-token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
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
        id: userId,
        patientId: null,
        roles: [role],
        permissions: [],
        profile: {
          fullName: 'Pessoa Fictícia',
          email: 'test@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (req.method() === 'GET') reads.push(path)
    if (path === '/v1/catalog/professionals')
      return json({
        items: [
          {
            id,
            displayName: 'Dra. Pessoa Fictícia',
            modalities: ['onsite', 'remote'],
          },
        ],
        nextCursor: null,
      })
    if (path === '/v1/professionals/me/profile')
      return json({
        id,
        displayName: 'Dra. Pessoa Fictícia',
        modalities: ['onsite', 'remote'],
      })
    if (path === `/v1/professionals/${other}/schedule/editor`)
      return json({ error: { code: 'FORBIDDEN' } }, 403)
    if (path === `/v1/professionals/${id}/schedule/editor`) {
      if (failure === 'network')
        return json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503)
      return json({
        professionalId: id,
        version,
        clinicTimeZone: 'America/Fortaleza',
        rules,
        blocks,
        affectedAppointments: [],
      })
    }
    if (req.method() === 'PUT' && path === `/v1/professionals/${id}/schedule`) {
      const body = req.postDataJSON()
      writes.push(body)
      if (failure === 'conflict') {
        version = 2
        return json({ error: { code: 'CONFLICT' } }, 409)
      }
      if (failure === 'impact')
        return json(
          {
            error: {
              code: 'SCHEDULE_IMPACT_REVIEW',
              affectedAppointments: [
                {
                  id: appointment,
                  startsAt: '2030-01-01T11:00:00.000Z',
                  endsAt: '2030-01-01T12:00:00.000Z',
                },
              ],
            },
          },
          409,
        )
      version += 1
      rules = body.rules
      blocks = body.blocks
      const emergency = blocks.some(
        (b: { kind: string }) => b.kind === 'emergency',
      )
      return json({
        version,
        affectedAppointments: emergency
          ? [
              {
                id: appointment,
                startsAt: '2030-01-01T11:00:00.000Z',
                endsAt: '2030-01-01T12:00:00.000Z',
              },
            ]
          : [],
        affectedAppointmentsResolved: !emergency,
      })
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  return {
    writes,
    reads,
    setFailure: (value: Failure) => {
      failure = value
    },
  }
}
async function open(page: Page, role = 'manager') {
  await page.goto('/agenda/grade')
  if (role !== 'professional')
    await page.getByLabel('Profissional', { exact: true }).selectOption(id)
  await expect(page.getByText(/Versão publicada 1/)).toBeVisible()
}

test('FE-011: publica grade completa sem perder vigências futuras e mantém instantes originais', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  const monday = page.getByRole('group', {
    name: 'Faixa 1 de Segunda-feira',
    exact: true,
  })
  await monday.getByLabel('Início', { exact: true }).fill('09:00')
  await page
    .getByRole('button', { name: 'Publicar grade', exact: true })
    .click()
  await expect(page.getByText('Grade publicada', { exact: true })).toBeVisible()
  expect(api.writes[0].expectedVersion).toBe(1)
  expect(api.writes[0].rules).toEqual([
    { ...basicRule, localStart: '09:00' },
    futureRule,
  ])
  expect(api.writes[0].blocks).toEqual([futureBlock])
  expect(api.reads).toContain(`/v1/professionals/${id}/schedule/editor`)
  expect(api.reads.some((path) => path.endsWith('/schedule'))).toBe(false)
  await expect(page.getByText(/Versão publicada 2/)).toBeVisible()
})

test('FE-011: faixas sobrepostas apontam erros nas duas linhas sem publicar', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  await page
    .getByRole('button', { name: 'Adicionar faixa de Segunda-feira' })
    .click()
  const rule = page.getByRole('group', {
    name: 'Faixa 2 de Segunda-feira',
    exact: true,
  })
  await rule.getByLabel('Início', { exact: true }).fill('10:00')
  await rule.getByLabel('Término', { exact: true }).fill('13:00')
  await page
    .getByRole('button', { name: 'Publicar grade', exact: true })
    .click()
  await expect(
    page.getByText(
      'Faixas sobrepostas neste dia. Ajuste os horários ou a vigência.',
    ),
  ).toHaveCount(2)
  expect(api.writes).toHaveLength(0)
  await expect(page.getByText(/Versão publicada 1/)).toBeVisible()
})

test('FE-011: bloqueio local usa fuso da clínica e emergência publicada mostra consultas preservadas', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  await page
    .getByRole('button', { name: 'Adicionar bloqueio', exact: true })
    .click()
  const block = page.getByRole('group', { name: 'Bloqueio 2', exact: true })
  await block.getByLabel('Tipo de bloqueio').selectOption('emergency')
  await block.getByLabel('Início do bloqueio').fill('2030-01-01T08:00')
  await block.getByLabel('Término do bloqueio').fill('2030-01-01T09:00')
  await block
    .getByLabel('Motivo do bloqueio')
    .fill('Ausência informada pela clínica')
  await page
    .getByRole('button', { name: 'Publicar grade', exact: true })
    .click()
  await expect(page.getByText('Grade publicada', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Pendências na grade publicada' }),
  ).toBeVisible()
  await expect(page.getByText(`Consulta ${appointment}`)).toBeVisible()
  const blocks = api.writes[0].blocks as Array<{
    startsAt: string
    endsAt: string
  }>
  expect(blocks[1].startsAt).toBe('2030-01-01T11:00:00.000Z')
  expect(blocks[1].endsAt).toBe('2030-01-01T12:00:00.000Z')
})

test('FE-011: impacto ordinário não anuncia publicação e mantém o rascunho', async ({
  page,
}) => {
  const api = await setup(page)
  api.setFailure('impact')
  await open(page)
  const monday = page.getByRole('group', {
    name: 'Faixa 1 de Segunda-feira',
    exact: true,
  })
  await monday.getByLabel('Início', { exact: true }).fill('09:00')
  await page
    .getByRole('button', { name: 'Publicar grade', exact: true })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'Alteração não publicada: consultas afetadas',
    }),
  ).toBeVisible()
  await expect(page.getByText('Grade publicada', { exact: true })).toHaveCount(
    0,
  )
  await expect(monday.getByLabel('Início', { exact: true })).toHaveValue(
    '09:00',
  )
  await expect(page.getByText(/Versão publicada 1/)).toBeVisible()
})

test('FE-011: conflito de versão preserva edição até recarga explícita', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  const monday = page.getByRole('group', {
    name: 'Faixa 1 de Segunda-feira',
    exact: true,
  })
  await monday.getByLabel('Início', { exact: true }).fill('09:00')
  api.setFailure('conflict')
  await page
    .getByRole('button', { name: 'Publicar grade', exact: true })
    .click()
  await expect(
    page.getByText(/Outra pessoa publicou uma versão mais recente/),
  ).toBeVisible()
  await expect(monday.getByLabel('Início', { exact: true })).toHaveValue(
    '09:00',
  )
  api.setFailure('none')
  await page
    .getByRole('button', { name: 'Recarregar e descartar alterações' })
    .click()
  await expect(page.getByText(/Versão publicada 2/)).toBeVisible()
  await expect(monday.getByLabel('Início', { exact: true })).toHaveValue(
    '08:00',
  )
  await page
    .getByRole('button', { name: 'Publicar grade', exact: true })
    .click()
  expect(api.writes.at(-1)?.expectedVersion).toBe(2)
})

test('FE-011: profissional abre própria grade e link alheio não expõe editor', async ({
  page,
}) => {
  await setup(page, 'professional')
  await open(page, 'professional')
  await expect(page.getByLabel('Profissional', { exact: true })).toBeDisabled()
  await page.goto(`/agenda/grade?professionalId=${other}`)
  await expect(
    page.getByRole('heading', { name: 'Acesso não disponível' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Publicar grade' }),
  ).toHaveCount(0)
})

test('FE-011: grade inicial vazia, falha recuperável, teclado e tablet sem overflow', async ({
  page,
}) => {
  const api = await setup(page, 'receptionist', true)
  api.setFailure('network')
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/agenda/grade')
  await page.getByLabel('Profissional', { exact: true }).selectOption(id)
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar a grade' }),
  ).toBeVisible()
  api.setFailure('none')
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(
    page.getByText('Sem faixa de atendimento.', { exact: true }),
  ).toHaveCount(7)
  await page
    .getByRole('button', { name: 'Adicionar faixa de Segunda-feira' })
    .click()
  const monday = page.getByRole('group', {
    name: 'Faixa 1 de Segunda-feira',
    exact: true,
  })
  await monday.getByLabel('Término', { exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(
    monday.getByLabel('Vigência a partir de', { exact: true }),
  ).toBeFocused()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/tmp/vidaplena-fe011-tablet.png',
    fullPage: true,
  })
})
