import { expect, type Page, test } from '@playwright/test'
import { id, row } from '../support/agenda-data'

async function setup(
  page: Page,
  role = 'receptionist',
  eligible = true,
  status = 'confirmed',
  late = false,
) {
  const state = {
    item: row(1, status),
    mode: 'ok',
    queries: [] as string[],
    writes: [] as { path: string; body: Record<string, unknown> }[],
  }
  state.item.noShowEligible = eligible
  if (late)
    state.item.checkIn = {
      arrivedAt: '2030-05-12T15:00:00Z',
      recordedAt: '2030-05-12T15:00:00Z',
      lateFlag: true,
    }
  const origin = new URL(test.info().project.use.baseURL as string).origin
  await page
    .context()
    .addCookies([{ name: 'vp_csrf', value: 'test-only', url: origin }])
  await page.route('**/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': req.headers().origin ?? origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers':
        'authorization,content-type,x-request-id,x-csrf-token',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
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
        patientId: null,
        roles: [role],
        permissions: [],
        profile: {
          fullName: 'Pessoa Fictícia',
          email: 'ficticia@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (path.startsWith('/v1/catalog/'))
      return json({ items: [], nextCursor: null })
    if (path === '/v1/agenda/day') {
      state.queries.push(new URL(req.url()).search)
      return json({
        items: [state.item],
        nextCursor: null,
        totals: {
          all: 1,
          confirmed: state.item.status === 'confirmed' ? 1 : 0,
          noShow: state.item.status === 'no_show' ? 1 : 0,
        },
        localDate: '2030-05-12',
        clinicTimeZone: 'America/Fortaleza',
        serverNow: '2030-05-12T15:00:00Z',
      })
    }
    if (path.endsWith('/absence/history'))
      return json({
        items: [
          {
            version: state.item.absence?.version ?? 1,
            previousKind: null,
            kind: state.item.absence?.kind ?? 'unjustified',
            explanation: 'Justificativa administrativa fictícia',
            occurredAt: '2030-05-12T15:00:00Z',
          },
        ],
      })
    state.writes.push({ path, body: req.postDataJSON() })
    if (state.mode === 'conflict')
      return json({ error: { code: 'CONFLICT' } }, 409)
    if (state.mode === 'lost') return route.abort('failed')
    if (state.mode === 'slow')
      await new Promise((resolve) => setTimeout(resolve, 300))
    if (path.endsWith('/check-in')) {
      state.item.status = 'waiting'
      state.item.version++
      state.item.checkIn = {
        arrivedAt: '2030-05-12T15:00:00Z',
        recordedAt: '2030-05-12T15:00:00Z',
        lateFlag: true,
      }
      return json({
        appointmentId: state.item.id,
        appointmentVersion: state.item.version,
        status: 'waiting',
        ...state.item.checkIn,
        administrativeFlags: [],
      })
    }
    if (path.endsWith('/absence')) {
      const input = req.postDataJSON()
      state.item.status = 'no_show'
      state.item.noShowEligible = false
      state.item.absence = {
        kind: input.kind,
        version: (state.item.absence?.version ?? 0) + 1,
        recordedAt: '2030-05-12T15:00:00Z',
        decidedAt: '2030-05-12T15:00:00Z',
      }
      return json({
        appointmentId: state.item.id,
        status: 'no_show',
        kind: input.kind,
        absenceVersion: state.item.absence.version,
        recordedAt: '2030-05-12T15:00:00Z',
        decidedAt: '2030-05-12T15:00:00Z',
        autoBookingSuspended: false,
        suspendedUntil: null,
        unjustifiedCount: 0,
      })
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  await page.goto('/agenda')
  await page
    .getByRole('button', { name: /Ver atendimento de Paciente Fictício 1/ })
    .click()
  return state
}

test('FE-018: check-in em dois cliques atualiza agenda e exibe decisão de atraso', async ({
  page,
}) => {
  const state = await setup(page)
  await page
    .getByRole('button', { name: 'Registrar chegada', exact: true })
    .click()
  await expect(
    page.getByText('Operação registrada', { exact: true }),
  ).toBeVisible()
  expect(state.writes).toHaveLength(1)
  expect(state.item.status).toBe('waiting')
  await page
    .getByRole('button', { name: /Ver atendimento de Paciente Fictício 1/ })
    .click()
  await expect(
    page.getByRole('link', { name: 'Lista de espera e encaixe' }),
  ).toBeVisible()
})
test('FE-018: elegibilidade do servidor bloqueia ausência antes do prazo', async ({
  page,
}) => {
  const state = await setup(page, 'receptionist', false)
  await expect(
    page.getByRole('button', { name: 'Conferir ausência' }),
  ).toBeDisabled()
  expect(state.writes).toHaveLength(0)
})
test('FE-018: justificativa exigida, ausência e histórico corrigidos sem punição indevida', async ({
  page,
}) => {
  const state = await setup(page)
  await page.getByRole('button', { name: 'Conferir ausência' }).click()
  await page
    .getByLabel('Classificação da ausência')
    .selectOption('clinic_fault')
  await page.getByRole('button', { name: 'Confirmar classificação' }).click()
  await expect(
    page.getByText('Informe a justificativa administrativa.', { exact: true }),
  ).toBeVisible()
  expect(state.writes).toHaveLength(0)
  await page
    .getByLabel('Justificativa administrativa')
    .fill('Falha operacional fictícia')
  await page.getByRole('button', { name: 'Confirmar classificação' }).click()
  await expect(
    page.getByText('Operação registrada', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: /Ver atendimento de Paciente Fictício 1/ })
    .click()
  await expect(
    page.getByRole('list', { name: 'Histórico de ausência' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Corrigir classificação' }).click()
  await page.getByLabel('Classificação da ausência').selectOption('justified')
  await page
    .getByLabel('Justificativa administrativa')
    .fill('Revisão administrativa fictícia')
  await page.getByRole('button', { name: 'Confirmar classificação' }).click()
  await expect(
    page.getByText('Operação registrada', { exact: true }),
  ).toBeVisible()
  expect(state.writes[1].body.expectedVersion).toBe(1)
})
test('FE-018: admin permanece leitor e não recebe ações de presença', async ({
  page,
}) => {
  const state = await setup(page, 'admin')
  await expect(
    page.getByRole('button', { name: 'Registrar chegada' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Conferir ausência' }),
  ).toHaveCount(0)
  expect(state.writes).toHaveLength(0)
})

test('FE-018: gestor corrige com versão e justificativa sem registrar chegada', async ({
  page,
}) => {
  const state = await setup(page, 'manager', false, 'no_show')
  await expect(
    page.getByRole('list', { name: 'Histórico de ausência' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Registrar chegada' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Corrigir classificação' }).click()
  await page
    .getByLabel('Justificativa administrativa')
    .fill('Correção de gestão fictícia')
  await page.getByRole('button', { name: 'Confirmar classificação' }).click()
  await expect(
    page.getByText('Operação registrada', { exact: true }),
  ).toBeVisible()
  expect(state.writes[0].body.expectedVersion).toBe(1)
})
for (const mode of ['conflict', 'lost']) {
  test(`FE-018: erro ${mode} mantém estado sem sucesso e orienta releitura`, async ({
    page,
  }) => {
    const state = await setup(page)
    state.mode = mode
    await page
      .getByRole('button', { name: 'Registrar chegada', exact: true })
      .click()
    await expect(
      page.getByRole('alert').filter({ hasText: /atualize a agenda/i }),
    ).toBeVisible()
    await expect(
      page.getByText('Operação registrada', { exact: true }),
    ).toHaveCount(0)
    expect(state.item.status).toBe('confirmed')
  })
}
test('FE-018: filtro de conferência é enviado e não grava ausências', async ({
  page,
}) => {
  const state = await setup(page)
  await page.getByRole('button', { name: 'Fechar detalhes' }).click()
  await page.getByLabel('Somente ausências para conferir').check()
  await page.getByRole('button', { name: 'Filtrar agenda' }).click()
  await expect
    .poll(() =>
      state.queries.some((value) => value.includes('absenceEligibleOnly=true')),
    )
    .toBe(true)
  expect(state.writes).toHaveLength(0)
})
test('FE-018: 360px, teclado e duplo evento de check-in preservam um comando', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const state = await setup(page)
  state.mode = 'slow'
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page
    .getByRole('button', { name: 'Registrar chegada', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })
  await expect(
    page.getByText('Operação registrada', { exact: true }),
  ).toBeVisible()
  expect(state.writes).toHaveLength(1)
  await page
    .getByRole('button', { name: /Ver atendimento de Paciente Fictício 1/ })
    .click()
  await page.getByRole('button', { name: 'Manter na fila' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: /Ver atendimento de Paciente Fictício 1/,
    }),
  ).toBeFocused()
})

for (const [role, status] of [
  ['receptionist', 'completed'],
  ['manager', 'waiting'],
]) {
  test(`FE-018: opções de atraso não aparecem para ${role}/${status}`, async ({
    page,
  }) => {
    const state = await setup(page, role, false, status, true)
    await expect(
      page.getByRole('button', { name: 'Manter na fila' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Lista de espera e encaixe' }),
    ).toHaveCount(0)
    expect(state.writes).toHaveLength(0)
  })
}
