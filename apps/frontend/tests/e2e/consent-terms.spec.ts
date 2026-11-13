import { expect, type Page, test } from '@playwright/test'

const ids = {
  user: '71000000-0000-4000-8000-000000000001',
  term: '71000000-0000-4000-8000-000000000002',
  nextTerm: '71000000-0000-4000-8000-000000000003',
  patient: '71000000-0000-4000-8000-000000000004',
  consent: '71000000-0000-4000-8000-000000000005',
  file: '71000000-0000-4000-8000-000000000006',
}
const document = (version = 'v1') => ({
  id: version === 'v1' ? ids.term : ids.nextTerm,
  version,
  body: `Texto fictício completo do termo ${version}.`,
  effectiveAt: new Date(Date.now() - 10000).toISOString(),
})

async function mock(
  page: Page,
  role = 'admin',
  initial: ReturnType<typeof document> | null = null,
) {
  const control = {
    current: initial,
    readError: false,
    reads: 0,
    postMode: 'ok',
    posts: [] as { path: string; body: Record<string, unknown> }[],
  }
  const siteOrigin = new URL(test.info().project.use.baseURL as string).origin
  await page
    .context()
    .addCookies([{ name: 'vp_csrf', value: 'test-only', url: siteOrigin }])
  await page.route('**/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': req.headers().origin ?? siteOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers':
        'authorization,content-type,x-request-id,x-csrf-token',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    }
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers, json: body })
    const error = (status: number, code: string) =>
      json({ error: { code, requestId: 'test-only' } }, status)
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
        patientId: role === 'patient' ? ids.patient : null,
        roles: [role],
        permissions: [],
        profile: {
          fullName: 'Pessoa Fictícia',
          email: 'demo@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (path === '/v1/consent-documents/current') {
      control.reads++
      if (control.readError) return error(503, 'SERVICE_UNAVAILABLE')
      return control.current
        ? json(control.current)
        : error(404, 'NOT_FOUND_OR_FORBIDDEN')
    }
    if (req.method() === 'POST' && path === '/v1/admin/consent-documents') {
      const body = req.postDataJSON()
      control.posts.push({ path, body })
      if (control.postMode === 'conflict') return error(409, 'CONFLICT')
      if (control.postMode === 'invalid') return json({ id: 'inválido' }, 201)
      if (control.postMode === 'slow')
        await new Promise((resolve) => setTimeout(resolve, 400))
      control.current = {
        ...document(String(body.version)),
        body: String(body.bodyReference),
        effectiveAt: new Date().toISOString(),
      }
      if (control.postMode === 'lost') return route.abort('failed')
      const { body: _, ...receipt } = control.current
      return json(receipt, 201)
    }
    if (req.method() === 'POST' && path === '/v1/patient-registrations') {
      const body = req.postDataJSON()
      control.posts.push({ path, body })
      if (control.postMode === 'newVersion') {
        control.current = document('v2')
        control.postMode = 'ok'
        return error(409, 'CONFLICT')
      }
      if (control.postMode === 'conflict') return error(409, 'CONFLICT')
      return json(
        {
          patientId: ids.patient,
          accountState: 'active',
          consentEventId: ids.consent,
        },
        201,
      )
    }
    if (path === '/v1/onsite-patients')
      return json({
        patientId: ids.patient,
        fullName: 'Paciente Fictício',
        birthDate: '1990-01-01T00:00:00.000Z',
      })
    if (
      req.method() === 'GET' &&
      path === `/v1/patients/${ids.patient}/onsite-consents`
    )
      return json({ items: [] })
    if (
      req.method() === 'POST' &&
      (path === '/v1/patients' ||
        path === `/v1/patients/${ids.patient}/onsite-consents`)
    ) {
      const raw = req.postData() ?? ''
      const data = /name="data"\r?\n\r?\n([\s\S]*?)\r?\n--/.exec(raw)?.[1]
      if (!data) throw new Error('Parte data ausente no multipart de teste')
      const body = JSON.parse(data)
      control.posts.push({ path, body })
      if (control.postMode === 'newVersion') {
        control.current = document('v2')
        control.postMode = 'ok'
        return error(409, 'CONFLICT')
      }
      if (control.postMode === 'conflict') return error(409, 'CONFLICT')
      return json(
        {
          patientId: ids.patient,
          accountState: 'assisted',
          consentEventId: ids.consent,
          signedFileId: ids.file,
          state: 'active',
        },
        201,
      )
    }
    return error(404, 'NOT_FOUND_OR_FORBIDDEN')
  })
  return control
}

async function draft(page: Page) {
  await page.getByLabel('Versão', { exact: true }).fill('v1')
  await page
    .getByLabel('Texto completo do termo', { exact: true })
    .fill(document().body)
  await page
    .getByRole('button', { name: 'Revisar publicação', exact: true })
    .click()
  return page.getByRole('dialog')
}

test('FE-042: primeiro termo, validação, revisão cancelável e publicação real pelo contrato', async ({
  page,
}) => {
  const control = await mock(page)
  await page.goto('/admin/termos')
  await expect(
    page.getByRole('heading', { name: 'Nenhum termo publicado' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Revisar publicação', exact: true })
    .click()
  await expect(
    page.getByText('Informe a versão.', { exact: true }),
  ).toBeVisible()
  expect(control.posts).toHaveLength(0)
  const dialog = await draft(page)
  await expect(dialog.getByLabel('Texto que será publicado')).toHaveValue(
    document().body,
  )
  await dialog.getByRole('button', { name: 'Voltar para editar' }).click()
  await expect(page.getByLabel('Versão', { exact: true })).toHaveValue('v1')
  expect(control.posts).toHaveLength(0)
  await page
    .getByRole('button', { name: 'Revisar publicação', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Confirmar publicação' }).click()
  await expect(page.getByText('Termo publicado', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Texto do termo vigente')).toHaveValue(
    document().body,
  )
  expect(control.posts).toEqual([
    {
      path: '/v1/admin/consent-documents',
      body: {
        kind: 'data',
        version: 'v1',
        bodyReference: document().body,
      },
    },
  ])
  await expect(page.getByLabel('Versão', { exact: true })).toHaveValue('')
  await expect(
    page.getByRole('link', { name: 'Ir para cadastro de paciente' }),
  ).toHaveAttribute('href', '/recepcao/pacientes/novo')
})

test('FE-042: conflito mantém rascunho, não anuncia sucesso e permite conferir vigente', async ({
  page,
}) => {
  const control = await mock(page)
  control.postMode = 'conflict'
  await page.goto('/admin/termos')
  await expect(
    page.getByRole('heading', { name: 'Nenhum termo publicado' }),
  ).toBeVisible()
  const dialog = await draft(page)
  await dialog.getByRole('button', { name: 'Confirmar publicação' }).click()
  await expect(
    page.getByText(/A versão já existe ou a vigência conflita/),
  ).toBeVisible()
  await expect(page.getByText('Termo publicado', { exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByLabel('Versão', { exact: true })).toHaveValue('v1')
  await expect(
    page.getByLabel('Texto completo do termo', { exact: true }),
  ).toHaveValue(document().body)
  control.current = document('v2')
  await page.getByRole('button', { name: 'Atualizar termo vigente' }).click()
  await expect(page.getByLabel('Texto do termo vigente')).toHaveValue(
    document('v2').body,
  )
})

for (const mode of ['lost', 'invalid']) {
  test(`FE-042: resposta ${mode} preserva texto e orienta conferir antes de repetir`, async ({
    page,
  }) => {
    const control = await mock(page)
    control.postMode = mode
    await page.goto('/admin/termos')
    await expect(
      page.getByRole('heading', { name: 'Nenhum termo publicado' }),
    ).toBeVisible()
    const dialog = await draft(page)
    await dialog.getByRole('button', { name: 'Confirmar publicação' }).click()
    await expect(
      page.getByText(/Não foi possível confirmar a publicação/),
    ).toBeVisible()
    await expect(
      page.getByText('Termo publicado', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByLabel('Texto completo do termo', { exact: true }),
    ).toHaveValue(document().body)
    expect(control.posts).toHaveLength(1)
  })
}

test('FE-042: erro de leitura permite retry e duplo evento produz uma publicação', async ({
  page,
}) => {
  const control = await mock(page)
  control.readError = true
  await page.goto('/admin/termos')
  await expect(
    page.getByRole('heading', { name: 'Não foi possível consultar o termo' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Revisar publicação', exact: true }),
  ).toBeDisabled()
  control.readError = false
  await page
    .getByRole('button', { name: 'Tentar novamente', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Nenhum termo publicado' }),
  ).toBeVisible()
  control.postMode = 'slow'
  const dialog = await draft(page)
  await dialog
    .getByRole('button', { name: 'Confirmar publicação' })
    .evaluate((button) => {
      button.click()
      button.click()
    })
  await expect(page.getByText('Termo publicado', { exact: true })).toBeVisible()
  expect(control.posts).toHaveLength(1)
})

for (const role of ['manager', 'receptionist', 'professional', 'patient']) {
  test(`FE-042: ${role} não recebe menu nem formulário administrativo`, async ({
    page,
  }) => {
    const control = await mock(page, role)
    await page.goto('/admin/termos')
    await expect(
      page.getByRole('heading', { name: 'Acesso não disponível' }),
    ).toBeVisible()
    await expect(
      page.getByLabel('Texto completo do termo', { exact: true }),
    ).toHaveCount(0)
    expect(control.posts).toHaveLength(0)
    expect(control.reads).toBe(0)
  })
}

test('FE-042: revisão em360px, teclado e retorno ao formulário sem publicar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await mock(page, 'admin', document('v2'))
  await page.goto('/admin/termos')
  await expect(page.getByLabel('Texto do termo vigente')).toBeVisible()
  const dialog = await draft(page)
  await expect(dialog).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/tmp/vidaplena-consent-review-mobile.png',
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Revisar publicação', exact: true }),
  ).toBeFocused()
  await expect(
    page.getByLabel('Texto completo do termo', { exact: true }),
  ).toHaveValue(document().body)
})

async function fillRegistration(page: Page) {
  await page
    .getByLabel('Nome completo', { exact: true })
    .fill('Paciente Fictício')
  await page
    .getByLabel('Data de nascimento', { exact: true })
    .fill('1990-01-01')
  await page.getByLabel('CPF', { exact: true }).fill('52998224725')
  await page.getByLabel('Celular', { exact: true }).fill('(85) 98888-7777')
  await page.getByLabel('E-mail', { exact: true }).fill('paciente@example.test')
  await page.getByLabel('Senha', { exact: true }).fill('Senha-Segura-2026!')
  await page
    .getByLabel('Confirme a senha', { exact: true })
    .fill('Senha-Segura-2026!')
}

test('FE-007/P-52: ausência de termo bloqueia; após publicação, retry permite cadastrar com aceite', async ({
  page,
}) => {
  const control = await mock(page, 'patient')
  await page.goto('/cadastro')
  await expect(
    page.getByRole('heading', { name: 'Nenhum termo vigente publicado' }),
  ).toBeVisible()
  await expect(
    page.getByText('Carregando o termo vigente…', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Concluir cadastro', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Publicar termo em outra aba' }),
  ).toHaveCount(0)
  control.current = document()
  await page
    .getByRole('button', { name: 'Atualizar termo', exact: true })
    .click()
  await expect(
    page.getByLabel('Texto completo do termo de tratamento de dados'),
  ).toHaveValue(document().body)
  await fillRegistration(page)
  await page
    .getByRole('button', { name: 'Concluir cadastro', exact: true })
    .click()
  expect(control.posts).toHaveLength(0)
  await page.getByRole('checkbox', { name: /Li o termo vigente/ }).check()
  await page
    .getByRole('button', { name: 'Concluir cadastro', exact: true })
    .click()
  await expect(
    page.getByText('Cadastro concluído', { exact: true }),
  ).toBeVisible()
  expect(control.posts[0].body.consent).toEqual({
    versionId: ids.term,
    accepted: true,
  })
})

test('FE-007/P-52: admin recebe link para publicar sem abandonar cadastro; erro técnico tem retry', async ({
  page,
}) => {
  const control = await mock(page)
  await page.goto('/cadastro')
  const link = page.getByRole('link', { name: 'Publicar termo em outra aba' })
  await expect(link).toHaveAttribute('href', '/admin/termos')
  await expect(link).toHaveAttribute('target', '_blank')
  control.readError = true
  await page
    .getByRole('button', { name: 'Atualizar termo', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar o termo' }),
  ).toBeVisible()
  await expect(
    page.getByText('Carregando o termo vigente…', { exact: true }),
  ).toHaveCount(0)
  control.readError = false
  control.current = document()
  await page
    .getByRole('button', { name: 'Tentar novamente', exact: true })
    .click()
  await expect(page.getByLabel('Nome completo', { exact: true })).toBeVisible()
})

test('FE-007/P-52: nova versão exige novo aceite, preserva dados e usa ID atualizado', async ({
  page,
}) => {
  const control = await mock(page, 'patient', document())
  control.postMode = 'newVersion'
  await page.goto('/cadastro')
  await fillRegistration(page)
  const accepted = page.getByRole('checkbox', { name: /Li o termo vigente/ })
  await accepted.check()
  await page
    .getByRole('button', { name: 'Concluir cadastro', exact: true })
    .click()
  await expect(
    page.getByText(
      'O termo foi atualizado. Leia a nova versão e confirme seu aceite.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(accepted).not.toBeChecked()
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue(
    'Paciente Fictício',
  )
  await expect(
    page.getByLabel('Texto completo do termo de tratamento de dados'),
  ).toHaveValue(document('v2').body)
  await page
    .getByRole('button', { name: 'Concluir cadastro', exact: true })
    .click()
  expect(control.posts).toHaveLength(1)
  await accepted.check()
  await page
    .getByRole('button', { name: 'Concluir cadastro', exact: true })
    .click()
  await expect(
    page.getByText('Cadastro concluído', { exact: true }),
  ).toBeVisible()
  expect(control.posts[1].body.consent).toEqual({
    versionId: ids.nextTerm,
    accepted: true,
  })
})

test('FE-007/P-52: CPF duplicado preserva formulário e mantém recuperação de acesso', async ({
  page,
}) => {
  const control = await mock(page, 'patient', document())
  control.postMode = 'conflict'
  await page.goto('/cadastro')
  await fillRegistration(page)
  await page.getByRole('checkbox', { name: /Li o termo vigente/ }).check()
  await page
    .getByRole('button', { name: 'Concluir cadastro', exact: true })
    .click()
  await expect(
    page.getByRole('link', { name: 'Recuperar acesso', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue(
    'Paciente Fictício',
  )
  await expect(
    page.getByText('Cadastro concluído', { exact: true }),
  ).toHaveCount(0)
})

async function fillOnsite(page: Page) {
  await page
    .getByLabel('Nome completo', { exact: true })
    .fill('Paciente Fictício')
  await page
    .getByLabel('Data de nascimento', { exact: true })
    .fill('1990-01-01')
  await page.getByLabel('CPF', { exact: true }).fill('52998224725')
  await page
    .getByLabel('Nome de quem assinou', { exact: true })
    .fill('Paciente Fictício')
}
async function signedTerm(page: Page, version = 'v1') {
  await page
    .getByLabel('Arquivo do termo assinado', { exact: true })
    .setInputFiles({
      name: `termo-${version}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(
        `%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% ${version}\n%%EOF`,
      ),
    })
  await expect(
    page.getByText(`Selecionado: termo-${version}.pdf`, { exact: false }),
  ).toBeVisible()
}

test('FE-039/P-52: admin publica em outra aba e retry libera cadastro preservando dados', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const control = await mock(page)
  await page.goto('/recepcao/pacientes/novo')
  await expect(
    page.getByRole('heading', { name: 'Nenhum termo vigente publicado' }),
  ).toBeVisible()
  await fillOnsite(page)
  await expect(
    page.getByRole('button', {
      name: 'Concluir cadastro presencial',
      exact: true,
    }),
  ).toBeDisabled()
  await expect(
    page.getByLabel('Arquivo do termo assinado', { exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('link', { name: 'Publicar termo em outra aba' }),
  ).toHaveAttribute('href', '/admin/termos')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/tmp/vidaplena-consent-missing-mobile.png',
    fullPage: true,
  })
  control.current = document()
  await page
    .getByRole('button', { name: 'Atualizar termo', exact: true })
    .click()
  await expect(
    page.getByLabel('Texto completo do termo', { exact: true }),
  ).toHaveValue(document().body)
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue(
    'Paciente Fictício',
  )
  await signedTerm(page)
  await page.getByRole('checkbox', { name: /Conferi presencialmente/ }).check()
  await page
    .getByRole('button', { name: 'Concluir cadastro presencial', exact: true })
    .click()
  await expect(
    page.getByText('Paciente cadastrado e termo registrado', { exact: true }),
  ).toBeVisible()
  expect(control.posts[0].body.onsiteConsent).toMatchObject({
    versionId: ids.term,
    accepted: true,
  })
})

test('FE-039/P-52: recepção recebe orientação, erro tem retry e não deixa loading infinito', async ({
  page,
}) => {
  const control = await mock(page, 'receptionist')
  await page.goto('/recepcao/pacientes/novo')
  await expect(
    page.getByRole('heading', { name: 'Nenhum termo vigente publicado' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Publicar termo em outra aba' }),
  ).toHaveCount(0)
  await fillOnsite(page)
  control.readError = true
  await page
    .getByRole('button', { name: 'Atualizar termo', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar o termo' }),
  ).toBeVisible()
  await expect(
    page.getByText('Carregando o termo vigente…', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: 'Concluir cadastro presencial',
      exact: true,
    }),
  ).toBeDisabled()
  control.readError = false
  control.current = document()
  await page
    .getByRole('button', { name: 'Tentar novamente', exact: true })
    .click()
  await expect(
    page.getByLabel('Texto completo do termo', { exact: true }),
  ).toHaveValue(document().body)
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue(
    'Paciente Fictício',
  )
})

test('FE-039/P-52: versão nova limpa aceite e arquivo do DOM; exige nova evidência sem perder dados', async ({
  page,
}) => {
  const control = await mock(page, 'receptionist', document())
  control.postMode = 'newVersion'
  await page.goto('/recepcao/pacientes/novo')
  await fillOnsite(page)
  await signedTerm(page)
  const accepted = page.getByRole('checkbox', {
    name: /Conferi presencialmente/,
  })
  await accepted.check()
  await page
    .getByRole('button', { name: 'Concluir cadastro presencial', exact: true })
    .click()
  await expect(
    page.getByLabel('Texto completo do termo', { exact: true }),
  ).toHaveValue(document('v2').body)
  await expect(accepted).not.toBeChecked()
  await expect(
    page.getByLabel('Arquivo do termo assinado', { exact: true }),
  ).toHaveValue('')
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue(
    'Paciente Fictício',
  )
  await expect(
    page.getByLabel('Nome de quem assinou', { exact: true }),
  ).toHaveValue('Paciente Fictício')
  await accepted.check()
  await expect(
    page.getByRole('button', {
      name: 'Concluir cadastro presencial',
      exact: true,
    }),
  ).toBeDisabled()
  await signedTerm(page, 'v2')
  await page
    .getByRole('button', { name: 'Concluir cadastro presencial', exact: true })
    .click()
  await expect(
    page.getByText('Paciente cadastrado e termo registrado', { exact: true }),
  ).toBeVisible()
  expect(control.posts).toHaveLength(2)
  expect(control.posts[1].body.onsiteConsent).toMatchObject({
    versionId: ids.nextTerm,
    accepted: true,
  })
})

test('FE-039/P-52: conflito com mesma versão conserva arquivo e aceite para correção cadastral', async ({
  page,
}) => {
  const control = await mock(page, 'receptionist', document())
  control.postMode = 'conflict'
  await page.goto('/recepcao/pacientes/novo')
  await fillOnsite(page)
  await signedTerm(page)
  await page.getByRole('checkbox', { name: /Conferi presencialmente/ }).check()
  await page
    .getByRole('button', { name: 'Concluir cadastro presencial', exact: true })
    .click()
  await expect(
    page.getByText(/CPF já cadastrado ou termo desatualizado/),
  ).toBeVisible()
  await expect(
    page.getByRole('checkbox', { name: /Conferi presencialmente/ }),
  ).toBeChecked()
  await expect(
    page.getByLabel('Arquivo do termo assinado', { exact: true }),
  ).not.toHaveValue('')
  await expect(
    page.getByText('Paciente cadastrado e termo registrado', { exact: true }),
  ).toHaveCount(0)
})

test('FE-039/P-52: novo termo em paciente existente não recria cadastro e exige arquivo atualizado', async ({
  page,
}) => {
  const control = await mock(page, 'admin', document())
  control.postMode = 'newVersion'
  await page.goto(`/recepcao/pacientes/${ids.patient}/consentimento`)
  await page.getByLabel('CPF do paciente', { exact: true }).fill('52998224725')
  await page.getByRole('button', { name: 'Localizar', exact: true }).click()
  await expect(
    page.getByText('Paciente Fictício', { exact: true }),
  ).toBeVisible()
  await page
    .getByLabel('Nome de quem assinou', { exact: true })
    .fill('Paciente Fictício')
  await signedTerm(page)
  await page.getByRole('checkbox', { name: /Conferi presencialmente/ }).check()
  await page
    .getByRole('button', { name: 'Registrar novo aceite', exact: true })
    .click()
  await expect(
    page.getByLabel('Texto completo do termo', { exact: true }),
  ).toHaveValue(document('v2').body)
  await expect(
    page.getByLabel('Arquivo do termo assinado', { exact: true }),
  ).toHaveValue('')
  await signedTerm(page, 'v2')
  await page.getByRole('checkbox', { name: /Conferi presencialmente/ }).check()
  await page
    .getByRole('button', { name: 'Registrar novo aceite', exact: true })
    .click()
  await expect(
    page.getByText('Novo aceite presencial registrado', { exact: true }),
  ).toBeVisible()
  expect(
    control.posts.every(
      (post) => post.path === `/v1/patients/${ids.patient}/onsite-consents`,
    ),
  ).toBe(true)
})

test('FE-042: limites de versão e texto são recusados no formulário antes de publicar', async ({
  page,
}) => {
  const control = await mock(page)
  await page.goto('/admin/termos')
  await expect(
    page.getByRole('heading', { name: 'Nenhum termo publicado' }),
  ).toBeVisible()
  await page.getByLabel('Versão', { exact: true }).fill('v'.repeat(51))
  await page
    .getByLabel('Texto completo do termo', { exact: true })
    .fill('Texto fictício')
  await page
    .getByRole('button', { name: 'Revisar publicação', exact: true })
    .click()
  await expect(
    page.getByText('Use até 50 caracteres.', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Versão', { exact: true }).fill('v1')
  await page
    .getByLabel('Texto completo do termo', { exact: true })
    .fill('x'.repeat(200001))
  await page
    .getByRole('button', { name: 'Revisar publicação', exact: true })
    .click()
  await expect(
    page.getByText('Use até 200.000 caracteres.', { exact: true }),
  ).toBeVisible()
  expect(control.posts).toHaveLength(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const path of ['/cadastro', '/recepcao/pacientes/novo']) {
  test(`P-52: termo inválido retornado pela API bloqueia conclusão em ${path}`, async ({
    page,
  }) => {
    const control = await mock(page, 'admin', {
      ...document(),
      id: 'identificador-inválido',
    })
    await page.goto(path)
    await expect(
      page.getByRole('heading', { name: 'Não foi possível carregar o termo' }),
    ).toBeVisible()
    await expect(
      page.getByText('Carregando o termo vigente…', { exact: true }),
    ).toHaveCount(0)
    expect(control.posts).toHaveLength(0)
  })
}
