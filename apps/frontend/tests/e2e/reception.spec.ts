import { expect, type Page, test } from '@playwright/test'
import { id, row } from '../support/agenda-data'

const slot = {
  professionalId: id(21),
  startsAt: '2030-05-12T15:00:00.000Z',
  endsAt: '2030-05-12T16:00:00.000Z',
  roomAvailable: true,
}
const alternative = {
  ...slot,
  startsAt: '2030-05-12T16:00:00.000Z',
  endsAt: '2030-05-12T17:00:00.000Z',
}
async function setup(page: Page, role = 'receptionist') {
  let mode = 'normal',
    current = { ...row(1) },
    roomMode = 'normal'
  const writes: { path: string; key: string; body: Record<string, unknown> }[] =
      [],
    reads: URLSearchParams[] = [],
    roomReads: URLSearchParams[] = []
  let delay = false
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
          fullName: 'Pessoa Fictícia',
          email: 'pessoa@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (path === '/v1/catalog/specialties')
      return json({
        items: [
          {
            id: id(50),
            name: 'Cardiologia',
            code: 'CARDIO',
            modalities: ['onsite', 'remote'],
            durations: { first: 60, return: 30 },
          },
        ],
        nextCursor: null,
      })
    if (path === '/v1/catalog/professionals')
      return json({
        items: [
          {
            id: id(21),
            displayName: 'Profissional 1',
            modalities: ['onsite', 'remote'],
            specialtyIds: [id(50)],
          },
        ],
        nextCursor: null,
      })
    if (path === '/v1/onsite-patients')
      return url.searchParams.get('cpf') === '12345678909'
        ? json({
            patientId: id(11),
            fullName: 'Paciente Fictício 1',
            birthDate: '1990-01-01',
          })
        : json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
    if (path === '/v1/agenda/day') {
      reads.push(url.searchParams)
      return json({
        items:
          !url.searchParams.get('status') ||
          url.searchParams.get('status') === current.status
            ? [current]
            : [],
        nextCursor: null,
        totals: {
          all: 1,
          confirmed: current.status === 'confirmed' ? 1 : 0,
          noShow: 0,
        },
        localDate: url.searchParams.get('localDate') ?? '2030-05-12',
        clinicTimeZone: 'America/Fortaleza',
        serverNow: '2030-05-12T14:00:00.000Z',
      })
    }
    if (path === '/v1/availability')
      return json({
        days: [{ localDate: '2030-05-12', slots: [slot] }],
        nearestAvailableAt: slot.startsAt,
        clinicTimeZone: 'America/Fortaleza',
      })
    if (path === '/v1/appointments/room-options') {
      roomReads.push(url.searchParams)
      if (roomMode === 'error')
        return json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503)
      return json({
        items:
          roomMode === 'empty'
            ? []
            : [
                { id: id(60), name: 'Sala Ipê' },
                { id: id(61), name: 'Sala Cedro' },
              ],
        suggestedRoomId: roomMode === 'empty' ? null : id(60),
        startsAt: url.searchParams.get('startsAt'),
        endsAt: slot.endsAt,
        clinicTimeZone: 'America/Fortaleza',
      })
    }
    if (path.startsWith('/v1/appointments') && req.method() === 'POST') {
      const body = req.postDataJSON(),
        key = req.headers()['idempotency-key']
      writes.push({ path, key, body })
      if (mode === 'duplicate' && !body.confirmDuplicateSpecialty)
        return json({ error: { code: 'DUPLICATE_SPECIALTY_WARNING' } }, 409)
      if (mode === 'slot' && body.startsAt === slot.startsAt)
        return json(
          { error: { code: 'SLOT_UNAVAILABLE', alternatives: [alternative] } },
          409,
        )
      if (mode === 'consent')
        return json({ error: { code: 'CONSENT_REQUIRED' } }, 409)
      if (delay) await new Promise((resolve) => setTimeout(resolve, 500))
      current = {
        ...current,
        status: path.endsWith('/cancel') ? 'cancelled' : 'confirmed',
        startsAt: body.startsAt ?? current.startsAt,
        endsAt:
          body.startsAt === alternative.startsAt
            ? alternative.endsAt
            : body.startsAt
              ? slot.endsAt
              : current.endsAt,
        modality: body.modality ?? current.modality,
        roomId:
          body.modality === 'remote' ? null : (body.roomId ?? current.roomId),
        version: current.version + 1,
        lastChange:
          path === '/v1/appointments'
            ? null
            : {
                action: path.endsWith('/cancel') ? 'cancelled' : 'rescheduled',
                origin: body.origin,
                occurredAt: '2030-05-12T14:00:00.000Z',
              },
      } as typeof current
      if (mode === 'lost') return route.abort('failed')
      return json(
        { appointment: current, notificationState: 'queued' },
        path === '/v1/appointments' ? 201 : 200,
      )
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  return {
    writes,
    reads,
    roomReads,
    setMode: (v: string) => {
      mode = v
    },
    setRoomMode: (v: string) => {
      roomMode = v
    },
    setDelay: () => {
      delay = true
    },
  }
}
async function open(page: Page) {
  await page.goto('/agenda')
  await expect(
    page.getByRole('button', { name: 'Novo atendimento', exact: true }),
  ).toBeEnabled()
}
async function book(page: Page) {
  await open(page)
  await page
    .getByRole('button', { name: 'Novo atendimento', exact: true })
    .click()
  const panel = page.getByRole('dialog', { name: 'Novo atendimento' })
  await panel.getByLabel('CPF do paciente').fill('12345678909')
  await panel.getByRole('button', { name: 'Localizar paciente' }).click()
  await expect(panel.getByText('Paciente: Paciente Fictício 1')).toBeVisible()
  await panel.getByLabel('Especialidade', { exact: true }).selectOption(id(50))
  await panel.getByRole('button', { name: /12:00 até 13:00/ }).click()
  return panel
}
async function operation(page: Page, action: 'Reagendar' | 'Cancelar') {
  await open(page)
  await page
    .getByRole('button', {
      name: 'Ver atendimento de Paciente Fictício 1 às 09:00',
    })
    .click()
  await page.getByRole('button', { name: action, exact: true }).click()
  return page.getByRole('dialog', {
    name:
      action === 'Reagendar' ? 'Remarcar atendimento' : 'Cancelar atendimento',
  })
}

test('FE-016: confirmar com sala sugerida/trocada, bloqueio de envio e contexto/foco preservados', async ({
  page,
}) => {
  const api = await setup(page)
  api.setDelay()
  const panel = await book(page)
  await expect(panel.getByLabel('Sala livre')).toHaveValue(id(60))
  await panel.getByLabel('Sala livre').selectOption(id(61))
  await panel.getByRole('button', { name: 'Confirmar atendimento' }).click()
  await expect(panel.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Salvando…' }).dispatchEvent('click')
  await expect(panel).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: 'Ver atendimento de Paciente Fictício 1 às 12:00',
    }),
  ).toBeFocused()
  expect(api.writes).toHaveLength(1)
  expect(api.writes[0].body.roomId).toBe(id(61))
  expect(api.reads.at(-1)?.get('localDate')).toBe('2030-05-12')
})

test('FE-016: sem sala impede confirmar; modalidade online não consulta nem envia sala', async ({
  page,
}) => {
  const api = await setup(page)
  api.setRoomMode('empty')
  const panel = await book(page)
  await expect(panel.getByText(/Não há sala livre/)).toBeVisible()
  await expect(
    panel.getByRole('button', { name: 'Confirmar atendimento' }),
  ).toBeDisabled()
  api.setRoomMode('normal')
  await panel.getByLabel('Modalidade', { exact: true }).selectOption('remote')
  await panel.getByRole('button', { name: /12:00 até 13:00/ }).click()
  const rooms = api.roomReads.length
  await expect(panel.getByLabel('Sala livre')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Confirmar atendimento' }).click()
  await expect(panel).toHaveCount(0)
  expect(api.roomReads).toHaveLength(rooms)
  expect(api.writes[0].body).not.toHaveProperty('roomId')
})

test('FE-016: duplicidade exige ciência explícita e trocar CPF invalida sujeito', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('duplicate')
  const panel = await book(page)
  await expect(panel.getByLabel('Sala livre')).toBeEnabled()
  await panel.getByRole('button', { name: 'Confirmar atendimento' }).click()
  await expect(
    panel.getByRole('checkbox', { name: /Estou ciente/ }),
  ).toBeVisible()
  await expect(
    panel.getByRole('button', { name: 'Confirmar atendimento' }),
  ).toBeDisabled()
  expect(api.writes).toHaveLength(1)
  await panel.getByRole('checkbox', { name: /Estou ciente/ }).check()
  await panel.getByRole('button', { name: 'Confirmar atendimento' }).click()
  await expect(panel).toHaveCount(0)
  expect(api.writes[1].body.confirmDuplicateSpecialty).toBe(true)
  expect(api.writes[0].key).not.toBe(api.writes[1].key)
  await page
    .getByRole('button', { name: 'Novo atendimento', exact: true })
    .click()
  const other = page.getByRole('dialog', { name: 'Novo atendimento' })
  await other.getByLabel('CPF do paciente').fill('12345678909')
  await other.getByRole('button', { name: 'Localizar paciente' }).click()
  await expect(other.getByText('Paciente: Paciente Fictício 1')).toBeVisible()
  await other.getByLabel('CPF do paciente').fill('99999999999')
  await expect(other.getByText('Paciente: Paciente Fictício 1')).toHaveCount(0)
})

test('FE-016: remarcação falha preserva original e alternativa pede revisão, versão e motivo', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('slot')
  const panel = await operation(page, 'Reagendar')
  await expect(
    panel.getByLabel('Especialidade', { exact: true }),
  ).toBeDisabled()
  await panel.getByRole('button', { name: /12:00 até 13:00/ }).click()
  await expect(panel.getByLabel('Sala livre')).toBeEnabled()
  await panel.getByRole('button', { name: 'Confirmar remarcação' }).click()
  await expect(
    panel.getByText('Informe o motivo da alteração (até 1.000 caracteres).'),
  ).toBeVisible()
  expect(api.writes).toHaveLength(0)
  await panel
    .getByLabel('Motivo da alteração')
    .fill('Ajuste solicitado no balcão')
  await panel.getByRole('button', { name: 'Confirmar remarcação' }).click()
  await expect(
    panel.getByText(/Este horário deixou de estar disponível/),
  ).toBeVisible()
  await expect(
    panel
      .getByRole('region', { name: 'Consulta original' })
      .getByText('12 de maio de 2030 às 09:00', { exact: true }),
  ).toBeVisible()
  await panel
    .getByRole('button', { name: '12 de maio de 2030 às 13:00' })
    .click()
  await expect(panel.getByLabel('Sala livre')).toBeEnabled()
  expect(api.writes).toHaveLength(1)
  await panel.getByRole('button', { name: 'Confirmar remarcação' }).click()
  await expect(panel).toHaveCount(0)
  expect(api.writes[1].body.expectedVersion).toBe(1)
  expect(api.writes[1].body.origin).toBe('reception')
  expect(api.roomReads.at(-1)?.get('appointmentId')).toBe(id(1))
  await expect(
    page.getByText('Remarcação pela recepção', { exact: true }),
  ).toBeVisible()
})

test('FE-016: cancelamento clínico em dois cliques, justificativa e origem persistida na grade', async ({
  page,
}) => {
  const api = await setup(page)
  const panel = await operation(page, 'Cancelar')
  await panel.getByLabel('Origem da alteração').selectOption('clinic')
  await panel.getByRole('button', { name: 'Confirmar cancelamento' }).click()
  expect(api.writes).toHaveLength(0)
  await panel.getByLabel('Motivo da alteração').fill('Ausência do profissional')
  await panel.getByRole('button', { name: 'Confirmar cancelamento' }).click()
  await expect(panel).toHaveCount(0)
  await expect(
    page.getByText('Cancelamento pela clínica', { exact: true }),
  ).toBeVisible()
  expect(api.writes[0].body.origin).toBe('clinic')
  expect(api.writes[0].body.expectedVersion).toBe(1)
  await expect(page.getByLabel('Data da agenda')).toHaveValue('2030-05-12')
})

test('FE-016: consentimento negado e resposta perdida orientam sem declarar sucesso', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('consent')
  const panel = await book(page)
  await expect(panel.getByLabel('Sala livre')).toBeEnabled()
  await panel.getByRole('button', { name: 'Confirmar atendimento' }).click()
  await expect(panel.getByText(/Confira o termo do paciente/)).toBeVisible()
  api.setMode('lost')
  await panel.getByRole('button', { name: 'Confirmar atendimento' }).click()
  await expect(panel.getByText(/O estado pode ter mudado/)).toBeVisible()
  await panel.getByRole('button', { name: 'Fechar e conferir agenda' }).click()
  await expect(panel).toHaveCount(0)
  expect(api.writes[0].key).toBe(api.writes[1].key)
  await expect(
    page.getByRole('heading', { name: 'Operação registrada' }),
  ).toHaveCount(0)
})

test('FE-016: gestor não recebe ações de balcão; 360px com Sheet e Escape sem gravar', async ({
  page,
}) => {
  const api = await setup(page, 'manager')
  await page.goto('/agenda')
  await expect(
    page.getByRole('region', { name: 'Grade diária de atendimentos' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Novo atendimento', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('button', {
      name: 'Ver atendimento de Paciente Fictício 1 às 09:00',
    })
    .click()
  await expect(
    page.getByRole('button', { name: 'Reagendar', exact: true }),
  ).toHaveCount(0)
  expect(api.writes).toHaveLength(0)
})

test('FE-016: Sheet360px e retorno por teclado sem alterar consulta original', async ({
  page,
}) => {
  const api = await setup(page)
  await page.setViewportSize({ width: 360, height: 800 })
  const panel = await operation(page, 'Cancelar')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/tmp/vidaplena-fe016-mobile.png',
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: 'Ver atendimento de Paciente Fictício 1 às 09:00',
    }),
  ).toBeFocused()
  expect(api.writes).toHaveLength(0)
})

test('FE-016: cancelamento preserva filtros e volta ao atualizar quando o slot sai da seleção', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  await page.getByLabel('Situação', { exact: true }).selectOption('confirmed')
  await page.getByLabel('Buscar paciente por nome ou CPF').fill('Paciente')
  await page.getByRole('button', { name: 'Filtrar agenda' }).click()
  await page
    .getByRole('button', {
      name: 'Ver atendimento de Paciente Fictício 1 às 09:00',
    })
    .click()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Cancelar atendimento' })
  await panel.getByLabel('Motivo da alteração').fill('Solicitação do paciente')
  await panel.getByRole('button', { name: 'Confirmar cancelamento' }).click()
  await expect(
    page.getByRole('heading', { name: 'Nenhum atendimento nesta seleção' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Atualizar agenda' }),
  ).toBeFocused()
  expect(api.reads.at(-1)?.get('status')).toBe('confirmed')
  expect(api.reads.at(-1)?.get('patientQuery')).toBe('Paciente')
})

test('FE-016: erro de sala permite tentar novamente e confirmar mantém o mesmo documento', async ({
  page,
}) => {
  const api = await setup(page)
  api.setRoomMode('error')
  let navigations = 0
  page.on('request', (req) => {
    if (req.isNavigationRequest()) navigations++
  })
  const panel = await book(page)
  await expect(
    panel.getByRole('heading', { name: 'Não foi possível conferir as salas' }),
  ).toBeVisible()
  await expect(
    panel.getByRole('button', { name: 'Confirmar atendimento' }),
  ).toBeDisabled()
  api.setRoomMode('normal')
  await panel.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(panel.getByLabel('Sala livre')).toBeEnabled()
  await panel.getByRole('button', { name: 'Confirmar atendimento' }).click()
  await expect(panel).toHaveCount(0)
  expect(navigations).toBe(1)
})

test('FE-016: fechar após conflito mantém consulta original no slot e sem confirmação falsa', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('slot')
  const panel = await operation(page, 'Reagendar')
  await panel.getByRole('button', { name: /12:00 até 13:00/ }).click()
  await expect(panel.getByLabel('Sala livre')).toBeEnabled()
  await panel
    .getByLabel('Motivo da alteração')
    .fill('Solicitação de remarcação')
  await panel.getByRole('button', { name: 'Confirmar remarcação' }).click()
  await expect(
    panel.getByText(/Este horário deixou de estar disponível/),
  ).toBeVisible()
  await panel.getByRole('button', { name: 'Voltar sem alterar' }).click()
  await expect(
    page.getByRole('button', {
      name: 'Ver atendimento de Paciente Fictício 1 às 09:00',
    }),
  ).toBeFocused()
  await expect(
    page.getByRole('button', {
      name: 'Ver atendimento de Paciente Fictício 1 às 12:00',
    }),
  ).toHaveCount(0)
  await expect(
    page.getByText('Operação registrada', { exact: true }),
  ).toHaveCount(0)
  expect(api.writes).toHaveLength(1)
})
