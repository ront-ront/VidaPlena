import { expect, type Page, test } from '@playwright/test'
import { id } from '../support/agenda-data'

const hash = 'a'.repeat(64)
function report() {
  return {
    batchId: id(71),
    kind: 'patients',
    sourceSystem: 'planilha_ficticia',
    fileHash: hash,
    status: 'preview',
    createdAt: '2030-05-12T12:00:00Z',
    createdBy: id(90),
    expiresAt: '2030-05-13T12:00:00Z',
    confirmedAt: null,
    cutoffDate: null,
    fileErrors: [] as string[],
    accepted: 1,
    rejected: 1,
    imported: 0,
    existing: 0,
    replayed: false,
    rows: [
      {
        line: 2,
        status: 'accepted',
        errors: [] as string[],
        externalId: 'P-001',
        fullName: 'Pessoa Fictícia',
        cpfMasked: '***.***.***-09',
      },
      {
        line: 3,
        status: 'rejected',
        errors: ['DUPLICATE_CPF_FILE'],
        externalId: 'P-002',
        fullName: 'Pessoa Repetida',
        cpfMasked: '***.***.***-09',
      },
    ],
  }
}
async function setup(page: Page, role = 'admin') {
  const state = {
    report: report(),
    mode: 'ok',
    confirms: [] as { key: string | undefined; body: unknown }[],
    previews: [] as string[],
    reads: 0,
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
          fullName: 'Admin Fictício',
          email: 'ficticio@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (path.endsWith('/preview')) {
      state.previews.push(req.postData() ?? '')
      if (state.mode === 'large')
        return json({ error: { code: 'IMPORT_TOO_LARGE' } }, 413)
      if (state.mode === 'invalid') {
        state.report.status = 'invalid'
        state.report.fileErrors = ['INVALID_HEADER']
        state.report.rows = []
        state.report.accepted = 0
        return json(
          { error: { code: 'VALIDATION_ERROR', importReport: state.report } },
          400,
        )
      }
      if (state.mode === 'malformed') return json({ unexpected: true })
      return json(state.report)
    }
    if (path.endsWith('/confirm')) {
      state.confirms.push({
        key: req.headers()['idempotency-key'],
        body: req.postDataJSON(),
      })
      if (state.mode === 'expired')
        return json({ error: { code: 'CONFLICT' } }, 409)
      if (state.mode === 'lost') return route.abort('failed')
      if (state.mode === 'slow')
        await new Promise((resolve) => setTimeout(resolve, 250))
      state.report.imported = state.report.status === 'confirmed' ? 0 : 1
      state.report.replayed = state.report.status === 'confirmed'
      state.report.status = 'confirmed'
      state.report.rows[0].status = 'imported'
      return json(state.report)
    }
    if (path.startsWith('/v1/imports/')) {
      state.reads++
      if (state.mode === 'forbidden')
        return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
      return json(state.report)
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  await page.goto('/importacoes/pacientes')
  return state
}
async function preview(page: Page) {
  await page.getByLabel('Sistema de origem').fill('planilha_ficticia')
  await page.getByLabel('Arquivo CSV de pacientes').setInputFiles({
    name: 'pacientes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'external_id;full_name;birth_date;cpf;email;phone;source_system\nP-001;Pessoa Fictícia;1980-05-10;12345678909;;;planilha_ficticia',
    ),
  })
  await page.getByRole('button', { name: 'Analisar arquivo' }).click()
}
const ack = (page: Page) => page.getByRole('checkbox').check()

test('FE-019: prévia não confirma, CPF duplicado tem motivo e confirmação/replay preservam hash/chave', async ({
  page,
}) => {
  const state = await setup(page)
  await expect(
    page.getByRole('button', { name: 'Confirmar lote' }),
  ).toHaveCount(0)
  await preview(page)
  await expect(page.getByText('CPF repetido neste arquivo.')).toBeVisible()
  expect(state.confirms).toHaveLength(0)
  expect(state.previews[0]).toContain('name="sourceSystem"')
  expect(state.previews[0]).toContain('filename="pacientes.csv"')
  await expect(
    page.getByRole('button', { name: 'Confirmar lote' }),
  ).toBeDisabled()
  await ack(page)
  await page.getByRole('button', { name: 'Confirmar lote' }).click()
  await expect(
    page.getByText('Importação concluída', { exact: true }),
  ).toBeVisible()
  await ack(page)
  await page.getByRole('button', { name: 'Confirmar lote' }).click()
  await expect(
    page.getByText('Lote já confirmado', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/nesta resposta: 0/)).toBeVisible()
  expect(state.confirms).toHaveLength(2)
  expect(state.confirms[0].body).toEqual({ expectedFileHash: hash })
  expect(state.confirms[0].key).toMatch(/^[a-f0-9-]{36}$/)
  expect(state.confirms[1].key).toBe(state.confirms[0].key)
})
test('FE-019: erro estrutural 400 exibe relatório e não permite confirmar', async ({
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
  expect(state.confirms).toHaveLength(0)
})
test('FE-019: mudar arquivo ou origem invalida prévia e confirmação', async ({
  page,
}) => {
  await setup(page)
  await preview(page)
  await expect(page.getByText('Prévia pronta', { exact: true })).toBeVisible()
  await page.getByLabel('Sistema de origem').fill('outra_origem')
  await expect(
    page.getByRole('region', { name: 'Relatório de importação' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Analisar arquivo' }).click()
  await expect(page.getByText('Prévia pronta', { exact: true })).toBeVisible()
  await page.getByLabel('Arquivo CSV de pacientes').setInputFiles({
    name: 'outro.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('outro'),
  })
  await expect(
    page.getByRole('button', { name: 'Confirmar lote' }),
  ).toHaveCount(0)
})
test('FE-019: resultado incerto consulta lote e retry usa mesma chave', async ({
  page,
}) => {
  const state = await setup(page)
  await preview(page)
  state.mode = 'lost'
  await ack(page)
  await page.getByRole('button', { name: 'Confirmar lote' }).click()
  await expect(
    page.getByText(/Consulte o lote antes de repetir;/),
  ).toBeVisible()
  await expect(
    page.getByText('Importação concluída', { exact: true }),
  ).toHaveCount(0)
  state.mode = 'ok'
  await page
    .getByRole('button', { name: 'Consultar lote', exact: true })
    .click()
  await expect.poll(() => state.reads).toBe(1)
  await ack(page)
  await page.getByRole('button', { name: 'Confirmar lote' }).click()
  await expect(
    page.getByText('Importação concluída', { exact: true }),
  ).toBeVisible()
  expect(state.confirms[1].key).toBe(state.confirms[0].key)
})
test('FE-019: lote expirado/alterado bloqueia repetição e ausência de permissão limpa relatório', async ({
  page,
}) => {
  const state = await setup(page)
  await preview(page)
  state.mode = 'expired'
  await ack(page)
  await page.getByRole('button', { name: 'Confirmar lote' }).click()
  await expect(
    page.getByRole('button', { name: 'Confirmar lote' }),
  ).toBeDisabled()
  state.mode = 'forbidden'
  await page
    .getByRole('button', { name: 'Consultar lote', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Relatório de importação' }),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Não foi possível concluir a operação' }),
  ).toBeVisible()
})
for (const mode of ['large', 'malformed'])
  test(`FE-019: ${mode} não produz relatório falso`, async ({ page }) => {
    const state = await setup(page)
    state.mode = mode
    await preview(page)
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Não foi possível concluir a operação' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Confirmar lote' }),
    ).toHaveCount(0)
  })
test('FE-019: gestor, 360px, teclado e duplo evento enviam um comando', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const state = await setup(page, 'manager')
  await preview(page)
  state.mode = 'slow'
  await expect(page.getByText('Prévia pronta', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
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
  expect(state.confirms).toHaveLength(1)
})
test('FE-019: recepção não vê relatório ou solicita prévia', async ({
  page,
}) => {
  const state = await setup(page, 'receptionist')
  await expect(
    page.getByText('Acesso não disponível', { exact: true }),
  ).toBeVisible()
  expect(state.previews).toHaveLength(0)
  await expect(
    page.getByRole('region', { name: 'Relatório de importação' }),
  ).toHaveCount(0)
})
