import { expect, type Page, test } from '@playwright/test'

const patientId = '81000000-0000-4000-8000-000000000001'
const expiresAt = '2099-01-01T12:00:00.000Z'
async function mock(page: Page, role = 'receptionist') {
  const state = {
    canResend: true,
    reason: null as string | null,
    mode: 'ok',
    posts: 0,
    lookupDelay: 0,
    invitationRoles: ['patient'],
  }
  const origin = new URL(test.info().project.use.baseURL as string).origin
  await page
    .context()
    .addCookies([{ name: 'vp_csrf', value: 'test-only', url: origin }])
  await page.route('**/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname
    const headers = {
      'Access-Control-Allow-Origin': req.headers().origin ?? origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers':
        'authorization,content-type,x-request-id,x-csrf-token',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    }
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers, json: body })
    const error = (
      status: number,
      code: string,
      details?: { field: string; reason: string }[],
    ) => json({ error: { code, details, requestId: patientId } }, status)
    if (req.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers })
    if (path === '/v1/auth/refresh')
      return json({ accessToken: 'test-only', expiresAt })
    if (path === '/v1/me')
      return json({
        id: patientId,
        patientId: role === 'patient' ? patientId : null,
        roles: [role],
        permissions: [],
        profile: {
          fullName: 'Pessoa fictícia',
          email: 'ficticio@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (path === '/v1/consent-documents/current')
      return error(404, 'NOT_FOUND_OR_FORBIDDEN')
    if (path === '/v1/onsite-patients') {
      const delay = state.lookupDelay
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      return json({
        patientId,
        fullName: 'Paciente fictício',
        birthDate: '1990-01-01T00:00:00.000Z',
        invitation: {
          canResend: state.canResend,
          unavailableReason: state.reason,
        },
      })
    }
    if (path === `/v1/patients/${patientId}/invitation`) {
      state.posts++
      expect(req.method()).toBe('POST')
      expect(req.postData()).toBe(null)
      await new Promise((resolve) => setTimeout(resolve, 300))
      if (state.mode === 'conflict')
        return error(409, 'CONFLICT', [
          {
            field: 'invitation',
            reason:
              'A conta já foi ativada. Use a recuperação de senha na tela de login.',
          },
        ])
      if (state.mode === 'error') return error(503, 'SERVICE_UNAVAILABLE')
      if (state.mode === 'invalid') return json({ patientId: 'invalid' }, 201)
      return json(
        { patientId, status: 'invited', invitationExpiresAt: expiresAt },
        201,
      )
    }
    if (path === '/v1/auth/invitations/inspect')
      if (state.mode === 'expired') return error(410, 'TOKEN_EXPIRED')
      else
        return json({
          fullName: 'Pessoa convidada',
          roles: state.invitationRoles,
          expiresAt,
        })
    if (path === '/v1/auth/invitations/accept')
      return json({ status: 'active' })
    if (path === '/v1/auth/recovery/inspect') return json({ status: 'valid' })
    if (path === '/v1/auth/recovery/complete')
      return json({ status: 'completed' })
    return error(404, 'NOT_FOUND_OR_FORBIDDEN')
  })
  return state
}
async function findPatient(page: Page) {
  await page.goto('/recepcao/pacientes/novo')
  await page.getByLabel('CPF do paciente', { exact: true }).fill('12345678909')
  await page.getByRole('button', { name: 'Localizar', exact: true }).click()
  await expect(
    page.getByText('Paciente fictício', { exact: true }),
  ).toBeVisible()
}

test('Reenvio: recepção localiza por CPF, envia uma vez e preserva formulário sem novo termo', async ({
  page,
}) => {
  const state = await mock(page)
  await findPatient(page)
  await page
    .getByLabel('Nome completo', { exact: true })
    .fill('Dados do formulário preservados')
  const button = page.getByRole('button', {
    name: 'Reenviar convite',
    exact: true,
  })
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Reenviando convite…' }),
  ).toBeDisabled()
  await expect(
    page.getByText('Novo convite solicitado', { exact: true }),
  ).toBeVisible()
  expect(state.posts).toBe(1)
  await expect(page.getByText(/convite anterior foi invalidado/)).toBeVisible()
  await expect(
    page.getByText(
      'Em desenvolvimento, o novo link fica na caixa local de e-mail.',
    ),
  ).toBeVisible()
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue(
    'Dados do formulário preservados',
  )
  await page.getByLabel('CPF do paciente', { exact: true }).fill('52998224725')
  await expect(
    page.getByText('Novo convite solicitado', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Reenviar convite', exact: true }),
  ).toHaveCount(0)
})

test('Reenvio: admin recebe erro acionável, pode tentar novamente e resposta inválida não vira sucesso', async ({
  page,
}) => {
  const state = await mock(page, 'admin')
  state.mode = 'error'
  await findPatient(page)
  await page
    .getByRole('button', { name: 'Reenviar convite', exact: true })
    .click()
  await expect(
    page.getByText(/serviço está temporariamente indisponível/),
  ).toBeVisible()
  state.mode = 'invalid'
  await page
    .getByRole('button', { name: 'Reenviar convite', exact: true })
    .click()
  await expect(
    page.getByText('Não foi possível reenviar o convite. Tente novamente.'),
  ).toBeVisible()
  await expect(
    page.getByText('Novo convite solicitado', { exact: true }),
  ).toHaveCount(0)
  state.mode = 'ok'
  await page
    .getByRole('button', { name: 'Reenviar convite', exact: true })
    .click()
  await expect(
    page.getByText('Novo convite solicitado', { exact: true }),
  ).toBeVisible()
  expect(state.posts).toBe(3)
})

test('Reenvio: conta indisponível mostra motivo e mudança concorrente não mantém botão habilitado', async ({
  page,
}) => {
  const state = await mock(page)
  state.canResend = false
  state.reason =
    'Este paciente não tem conta própria. O acesso de dependentes é feito pela conta do responsável.'
  await findPatient(page)
  await expect(page.getByText(state.reason, { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Reenviar convite', exact: true }),
  ).toHaveCount(0)
  state.canResend = true
  state.reason = null
  state.mode = 'conflict'
  await page.getByRole('button', { name: 'Localizar', exact: true }).click()
  await page
    .getByRole('button', { name: 'Reenviar convite', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Reenviar convite', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('alert').filter({ hasText: 'A conta já foi ativada.' }),
  ).toBeVisible()
  expect(state.posts).toBe(1)
})

test('Reenvio: resposta antiga da busca é descartada ao trocar CPF e mobile não transborda', async ({
  page,
}) => {
  const state = await mock(page)
  state.lookupDelay = 400
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/recepcao/pacientes/novo')
  await page.getByLabel('CPF do paciente', { exact: true }).fill('12345678909')
  const response = page.waitForResponse((r) =>
    r.url().includes('/v1/onsite-patients?'),
  )
  await page.getByRole('button', { name: 'Localizar', exact: true }).click()
  await page.getByLabel('CPF do paciente', { exact: true }).fill('52998224725')
  await response
  await expect(
    page.getByText('Paciente fictício', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Reenviar convite', exact: true }),
  ).toHaveCount(0)
  state.lookupDelay = 0
  await page.getByRole('button', { name: 'Localizar', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Reenviar convite', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('Reenvio: gestor não recebe formulário de operação presencial', async ({
  page,
}) => {
  const state = await mock(page, 'manager')
  await page.goto('/recepcao/pacientes/novo')
  await expect(
    page.getByRole('button', { name: 'Reenviar convite', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByLabel('CPF do paciente', { exact: true })).toHaveCount(
    0,
  )
  expect(state.posts).toBe(0)
})

for (const role of ['patient', 'professional'])
  test(`Convite: ativação ${role} mostra instrução de acesso correspondente`, async ({
    page,
  }) => {
    const state = await mock(page)
    state.invitationRoles = [role]
    await page.goto('/convite?token=test-only', { waitUntil: 'commit' })
    await expect(
      page.getByText(
        role === 'patient'
          ? 'Perfil: Paciente'
          : 'Perfil: Profissional de saúde',
        { exact: true },
      ),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/convite$/)
    await page
      .getByLabel('Nova senha', { exact: true })
      .fill('Senha-ficticia-2026!')
    await page
      .getByLabel('Confirme a nova senha', { exact: true })
      .fill('Senha-ficticia-2026!')
    await page
      .getByRole('button', { name: 'Ativar conta', exact: true })
      .click()
    await expect(page.getByText('Conta ativada', { exact: true })).toBeVisible()
    if (role === 'patient') {
      await expect(
        page.getByText(
          'Entre com seu e-mail ou CPF e a senha que você acabou de definir.',
        ),
      ).toBeVisible()
      await expect(page.getByText(/aplicativo autenticador/)).toHaveCount(0)
    } else await expect(page.getByText(/aplicativo autenticador/)).toBeVisible()
  })

test('Links: convite realmente expirado continua bloqueado e remove token da URL', async ({
  page,
}) => {
  const state = await mock(page)
  state.mode = 'expired'
  await page.goto('/convite?token=test-only', { waitUntil: 'commit' })
  await expect(
    page.getByText(/Este convite expirou ou já foi usado/),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/convite$/)
  await expect(
    page.getByRole('button', { name: 'Ativar conta', exact: true }),
  ).toHaveCount(0)
})

test('Links: captura idempotente também preserva recuperação de senha em dev', async ({
  page,
}) => {
  await mock(page)
  await page.goto('/redefinir-senha?token=test-only', { waitUntil: 'commit' })
  await page
    .getByLabel('Nova senha', { exact: true })
    .fill('Senha-ficticia-2026!')
  await page
    .getByLabel('Confirme a nova senha', { exact: true })
    .fill('Senha-ficticia-2026!')
  await expect(page).toHaveURL(/\/redefinir-senha$/)
  await page
    .getByRole('button', { name: 'Atualizar senha', exact: true })
    .click()
  await expect(
    page.getByText('Senha atualizada', { exact: true }),
  ).toBeVisible()
})
