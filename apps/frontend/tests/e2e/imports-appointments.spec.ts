import { expect, type Page, test } from '@playwright/test'
import { id, row } from '../support/agenda-data'

function report() {
  return {
    batchId: id(72),
    kind: 'appointments',
    sourceSystem: 'planilha_ficticia',
    fileHash: 'b'.repeat(64),
    status: 'preview',
    clinicTimeZone: 'America/Fortaleza',
    createdAt: '2030-05-12T12:00:00Z',
    createdBy: id(90),
    expiresAt: '2030-05-13T12:00:00Z',
    confirmedAt: null,
    cutoffDate: null,
    fileErrors: [] as string[],
    accepted: 2,
    rejected: 0,
    imported: 0,
    existing: 0,
    replayed: false,
    rows: [
      {
        line: 2,
        status: 'accepted',
        errors: [] as string[],
        externalId: 'A-001',
        cpfMasked: '***.***.***-09',
        professionalExternalId: id(21),
        specialtyCode: 'CARDIO',
        roomName: 'Sala Ipê',
        localDate: '2030-05-12',
        startsAt: '2030-05-12T12:00:00Z',
        endsAt: '2030-05-12T13:00:00Z',
        modality: 'onsite',
        appointmentStatus: 'confirmed',
        targetId: undefined as string | undefined,
      },
      {
        line: 3,
        status: 'accepted',
        errors: [] as string[],
        externalId: 'A-002',
        cpfMasked: '***.***.***-10',
        professionalExternalId: id(22),
        specialtyCode: 'CARDIO',
        roomName: '',
        localDate: '2030-05-13',
        startsAt: '2030-05-13T12:00:00Z',
        endsAt: '2030-05-13T13:00:00Z',
        modality: 'remote',
        appointmentStatus: 'confirmed',
        targetId: undefined as string | undefined,
      },
    ],
  }
}
async function setup(page: Page, role = 'admin') {
  const state = {
    report: report(),
    mode: 'ok',
    writes: [] as { path: string; key: string | undefined; body: unknown }[],
    reads: 0,
    queries: [] as string[],
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
        id: id(90),
        patientId: null,
        roles: [role],
        permissions: [],
        profile: {
          fullName: 'Gestão Fictícia',
          email: 'ficticia@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (path.startsWith('/v1/catalog/'))
      return json({ items: [], nextCursor: null })
    if (path === '/v1/agenda/day') {
      const query = new URL(req.url()).searchParams
      state.queries.push(query.toString())
      return json({
        items: [row(2)],
        nextCursor: null,
        totals: { all: 1, confirmed: 0, noShow: 0 },
        localDate: query.get('localDate') ?? '2030-05-12',
        clinicTimeZone: 'America/Fortaleza',
        serverNow: '2030-05-12T15:00:00Z',
      })
    }
    if (path.endsWith('/preview')) {
      state.writes.push({
        path,
        key: req.headers()['idempotency-key'],
        body: req.postData(),
      })
      if (state.mode === 'invalid') {
        state.report.status = 'invalid'
        state.report.fileErrors = ['INVALID_HEADER']
        state.report.rows = []
        return json(
          { error: { code: 'VALIDATION_ERROR', importReport: state.report } },
          400,
        )
      }
      return json(state.report)
    }
    if (path.endsWith('/confirm')) {
      state.writes.push({
        path,
        key: req.headers()['idempotency-key'],
        body: req.postDataJSON(),
      })
      if (state.mode === 'partial_error') {
        state.report.status = 'processing'
        state.report.imported = 1
        state.report.rows[0].status = 'imported'
        state.report.rows[0].targetId = id(101)
        return json({ error: { code: 'INTERNAL_ERROR' } }, 500)
      }
      if (state.mode === 'slow')
        await new Promise((resolve) => setTimeout(resolve, 250))
      const repeated = state.report.status === 'confirmed'
      state.report.imported = repeated ? 0 : 1
      state.report.replayed = repeated
      state.report.status = 'confirmed'
      state.report.accepted = 1
      state.report.rejected = 1
      if (state.mode === 'resume') {
        state.report.accepted = 2
        state.report.rejected = 0
        state.report.rows[1].status = 'imported'
        state.report.rows[1].targetId = id(102)
      } else {
        state.report.rows[0].status = 'rejected'
        state.report.rows[0].errors = ['SLOT_UNAVAILABLE']
        state.report.rows[1].status = 'imported'
        state.report.rows[1].targetId = id(102)
      }
      return json(state.report)
    }
    if (path.startsWith('/v1/imports/')) {
      state.reads++
      if (state.mode === 'foreign')
        return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
      if (state.mode === 'wrong_kind')
        return json({
          ...state.report,
          kind: 'patients',
          rows: [
            {
              line: 2,
              status: 'accepted',
              errors: [],
              fullName: 'DADO NÃO EXIBIR',
            },
          ],
        })
      return json(state.report)
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  await page.goto('/importacoes/agenda')
  return state
}
async function preview(page: Page) {
  await page.getByLabel('Sistema de origem').fill('planilha_ficticia')
  await page.getByLabel('Arquivo CSV de agenda').setInputFiles({
    name: 'agenda.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'external_id;patient_cpf;professional_external_id;specialty_code;room_name;starts_at;ends_at;modality;visit_type;status;source_system',
    ),
  })
  await page.getByRole('button', { name: 'Analisar arquivo' }).click()
}
async function confirm(page: Page) {
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirmar lote' }).click()
}
const region = (page: Page) =>
  page.getByRole('region', { name: 'Relatório de importação' })

test('FE-020: prévia administrativa no fuso da clínica, conflito parcial e replay sem novas consultas', async ({
  page,
}) => {
  const state = await setup(page)
  await preview(page)
  await expect(
    region(page).getByRole('heading', { name: /Prévia pronta/ }),
  ).toBeVisible()
  await expect(region(page).getByText(id(21), { exact: true })).toBeVisible()
  await expect(
    region(page).getByText('Sala Ipê', { exact: true }),
  ).toBeVisible()
  await expect(region(page).getByText('Online · sem sala')).toBeVisible()
  expect(state.writes.filter((x) => x.path.endsWith('/confirm'))).toHaveLength(
    0,
  )
  await confirm(page)
  await expect(
    page.getByText('Importação concluída', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/Intervalo indisponível:/)).toBeVisible()
  const rejected = region(page).getByRole('row').filter({ hasText: 'A-001' })
  await expect(rejected.getByText('Recusada', { exact: true })).toBeVisible()
  await expect(rejected.getByText(/Registro:/)).toHaveCount(0)
  await expect(page.getByText(`Registro: ${id(102)}`)).toBeVisible()
  await confirm(page)
  await expect(
    page.getByText('Lote já confirmado', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/nesta resposta: 0/)).toBeVisible()
  const commands = state.writes.filter((x) => x.path.endsWith('/confirm'))
  expect(commands[0].body).toEqual({ expectedFileHash: 'b'.repeat(64) })
  expect(commands[0].key).toBe(commands[1].key)
  expect(
    state.writes.every((x) => x.path.startsWith('/v1/imports/appointments/')),
  ).toBe(true)
})
test('FE-020: navegação abre dia civil do relatório e detalhe mostra origem/data/importador', async ({
  page,
}) => {
  const state = await setup(page)
  await preview(page)
  await page.getByRole('link', { name: 'Ver agenda de 2030-05-12' }).click()
  await expect(page).toHaveURL(/\/agenda\?date=2030-05-12$/)
  await expect
    .poll(() => state.queries.some((x) => x.includes('localDate=2030-05-12')))
    .toBe(true)
  await page
    .getByRole('button', { name: /Ver atendimento de Paciente Fictício 2/ })
    .click()
  await expect(
    page.getByRole('dialog').getByText(/Origem: CSV demonstração/),
  ).toBeVisible()
  await expect(
    page.getByRole('dialog').getByText(new RegExp(`Importador: ${id(81)}`)),
  ).toBeVisible()
  await expect(
    page.getByRole('dialog').getByText(/Histórico importado/),
  ).toBeVisible()
  await expect(page.getByRole('dialog').getByText(/2030/)).not.toHaveCount(0)
})
test('FE-020: referência inválida é recusada na prévia, sem sucesso antes de confirmar', async ({
  page,
}) => {
  const state = await setup(page)
  state.report.rows[0].status = 'rejected'
  state.report.rows[0].errors = ['PROFESSIONAL_NOT_FOUND']
  state.report.accepted = 1
  state.report.rejected = 1
  await preview(page)
  await expect(
    page.getByText('Profissional não encontrado.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Importação concluída', { exact: true }),
  ).toHaveCount(0)
  expect(state.writes).toHaveLength(1)
})
test('FE-020: arquivo estrutural inválido não habilita confirmação', async ({
  page,
}) => {
  const state = await setup(page)
  state.mode = 'invalid'
  await preview(page)
  await expect(
    page.getByText('Confira o cabeçalho e a ordem das colunas.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Confirmar lote' }),
  ).toHaveCount(0)
})
test('FE-020: falha parcial consulta e retoma sem alegar rollback ou duplicar anteriores', async ({
  page,
}) => {
  const state = await setup(page)
  await preview(page)
  state.mode = 'partial_error'
  await confirm(page)
  await expect(
    page.getByText(/Consulte o lote antes de repetir;/),
  ).toBeVisible()
  await expect(
    page.getByText('Importação concluída', { exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Consultar lote', exact: true })
    .click()
  await expect(page.getByText(/Há processamento parcial/)).toBeVisible()
  await expect(page.getByText(`Registro: ${id(101)}`)).toBeVisible()
  state.mode = 'resume'
  await confirm(page)
  await expect(
    page.getByText('Importação concluída', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(`Registro: ${id(101)}`)).toBeVisible()
  await expect(page.getByText(`Registro: ${id(102)}`)).toBeVisible()
  const commands = state.writes.filter((x) => x.path.endsWith('/confirm'))
  expect(commands[0].key).toBe(commands[1].key)
})
for (const mode of ['foreign', 'wrong_kind'])
  test(`FE-020: leitura ${mode} limpa prévia anterior`, async ({ page }) => {
    const state = await setup(page)
    await preview(page)
    await expect(region(page)).toBeVisible()
    state.mode = mode
    await page
      .getByRole('button', { name: 'Consultar lote', exact: true })
      .click()
    await expect(region(page)).toHaveCount(0)
    await expect(
      page.getByText('DADO NÃO EXIBIR', { exact: true }),
    ).toHaveCount(0)
  })
test('FE-020: gestor em360px e teclado, duplo evento preserva um comando', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const state = await setup(page, 'manager')
  await preview(page)
  await expect(region(page)).toBeVisible()
  const lines = page.getByRole('region', { name: 'Linhas do lote' })
  await lines.focus()
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(() => lines.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/tmp/vidaplena-imports-agenda-360.png',
    fullPage: true,
  })
  state.mode = 'slow'
  await page.getByRole('checkbox').focus()
  await page.keyboard.press('Space')
  await page
    .getByRole('button', { name: 'Confirmar lote' })
    .evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })
  await expect(
    page.getByText('Importação concluída', { exact: true }),
  ).toBeVisible()
  expect(state.writes.filter((x) => x.path.endsWith('/confirm'))).toHaveLength(
    1,
  )
})
test('FE-020: recepção não tem acesso à importação', async ({ page }) => {
  const state = await setup(page, 'receptionist')
  await expect(
    page.getByText('Acesso não disponível', { exact: true }),
  ).toBeVisible()
  expect(state.writes).toHaveLength(0)
})
test('FE-020: data inválida na URL usa o contexto do servidor', async ({
  page,
}) => {
  const state = await setup(page)
  await page.goto('/agenda?date=2030-02-31')
  await expect(page.getByLabel('Data da agenda')).toHaveValue('2030-05-12')
  expect(state.queries.every((x) => !x.includes('localDate'))).toBe(true)
})
