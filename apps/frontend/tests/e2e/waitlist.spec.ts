import { expect, type Page, test } from '@playwright/test'

const id = (n: number) =>
  `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pref = { weekdays: [7], localStart: '08:00', localEnd: '18:00' }
const offer = {
  id: id(8),
  status: 'active',
  offeredAt: '2030-05-12T12:00:00.000Z',
  expiresAt: '2030-05-12T13:00:00.000Z',
  startsAt: '2030-05-12T15:00:00.000Z',
  endsAt: '2030-05-12T16:00:00.000Z',
  professionalId: id(5),
  professionalName: 'Profissional Fictício',
  modality: 'onsite',
  manualContactRequired: false,
}
const entry = {
  id: id(7),
  patientId: id(2),
  specialtyId: id(4),
  modality: 'onsite',
  visitType: 'first',
  dateFrom: '2030-05-12',
  dateTo: '2030-05-13',
  timePreferences: [pref],
  queuedAt: '2030-05-12T11:00:00.000Z',
  status: 'waiting',
  position: 1,
  patientName: 'Paciente Fictício',
  offer: null as typeof offer | null,
}
async function setup(page: Page, role = 'patient') {
  let entries: (typeof entry)[] = [],
    mode = 'normal',
    zone = 'America/Fortaleza'
  const writes: {
      path: string
      body: Record<string, unknown> | null
      key?: string
    }[] = [],
    lists: URLSearchParams[] = [],
    rooms: URLSearchParams[] = [],
    lookups: string[] = []
  await page
    .context()
    .addCookies([
      { name: 'vp_csrf', value: 'test-only', url: 'http://127.0.0.1:3400' },
    ])
  const receipt = (body: Record<string, unknown>, fit = false) => ({
    appointment: {
      id: id(10),
      patientId: body.patientId ?? id(2),
      professionalId: id(5),
      specialtyId: id(4),
      roomId: body.modality === 'remote' ? null : id(6),
      roomName: body.modality === 'remote' ? null : 'Sala Ipê',
      specialtyName: 'Cardiologia',
      professionalName: 'Profissional Fictício',
      modality: body.modality ?? 'onsite',
      visitType: 'first',
      startsAt: body.startsAt ?? offer.startsAt,
      endsAt: offer.endsAt,
      durationMinutes: 60,
      version: 1,
      status: 'confirmed',
      bookingSource: fit ? 'fit_in' : 'portal',
      attendanceResponse: null,
    },
    notificationState: 'queued',
  })
  await page.route('http://127.0.0.1:3434/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3400',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers':
        'authorization,content-type,x-request-id,x-csrf-token,idempotency-key',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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
        id: id(1),
        patientId: role === 'patient' ? id(2) : null,
        roles: [role],
        permissions: [],
        profile: {
          fullName: 'Paciente Fictício',
          email: 'pessoa@example.test',
          phone: null,
        },
        consentState: 'active',
      })
    if (path === '/v1/scheduling/context')
      return json({
        clinicTimeZone: zone,
        serverNow: '2030-05-12T12:00:00.000Z',
        localDate: '2030-05-12',
      })
    if (path === '/v1/me/dependents')
      return json({
        items: [
          {
            patientId: id(3),
            fullName: 'Dependente Fictício',
            relationship: 'mãe',
            status: 'active',
          },
        ],
      })
    if (path === '/v1/catalog/specialties')
      return json({
        items: [
          {
            id: id(4),
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
            id: id(5),
            displayName: 'Profissional Fictício',
            modalities: ['onsite', 'remote'],
            specialtyIds: [id(4)],
          },
        ],
        nextCursor: null,
      })
    if (
      path === '/v1/patients/fit-in-candidate' ||
      path === '/v1/onsite-patients'
    ) {
      lookups.push(path)
      return json({ patientId: id(2), fullName: 'Paciente Fictício' })
    }
    if (path === '/v1/appointments/fit-ins/room-options') {
      rooms.push(url.searchParams)
      if (mode === 'blocked')
        return json({ error: { code: 'SLOT_UNAVAILABLE' } }, 409)
      return json({
        items: mode === 'no-room' ? [] : [{ id: id(6), name: 'Sala Ipê' }],
        suggestedRoomId: mode === 'no-room' ? null : id(6),
        startsAt: url.searchParams.get('startsAt'),
        endsAt: new Date(
          Date.parse(url.searchParams.get('startsAt') ?? '') + 3600000,
        ).toISOString(),
        clinicTimeZone: zone,
      })
    }
    if (path === '/v1/waitlist' && req.method() === 'GET') {
      lists.push(url.searchParams)
      if (mode === 'foreign')
        return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
      if (mode === 'error')
        return json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503)
      return json({
        items:
          mode === 'paged'
            ? url.searchParams.has('cursor')
              ? entries.slice(1)
              : entries.slice(0, 1)
            : entries,
        nextCursor:
          mode === 'paged' && !url.searchParams.has('cursor') ? entry.id : null,
      })
    }
    if (path === '/v1/availability')
      return json({ days: [], nearestAvailableAt: null, clinicTimeZone: zone })
    const body = req.method() === 'DELETE' ? null : req.postDataJSON()
    if (req.method() !== 'GET')
      writes.push({ path, body, key: req.headers()['idempotency-key'] })
    if (path === '/v1/waitlist') {
      if (mode === 'available')
        return json({ error: { code: 'WAITLIST_NOT_NEEDED' } }, 409)
      entries = [{ ...entry, ...body }]
      return json(
        { entryId: entry.id, queuedAt: entry.queuedAt, status: 'waiting' },
        201,
      )
    }
    if (path === `/v1/waitlist/${entry.id}` && req.method() === 'DELETE') {
      entries = entries.map((v) => ({ ...v, status: 'cancelled' }))
      return route.fulfill({ status: 204, headers })
    }
    if (path === `/v1/waitlist/offers/${offer.id}/accept`) {
      if (mode === 'expired')
        return json({ error: { code: 'OFFER_EXPIRED' } }, 409)
      if (mode === 'duplicate' && !body.confirmDuplicateSpecialty)
        return json({ error: { code: 'DUPLICATE_SPECIALTY_WARNING' } }, 409)
      entries = entries.map((v) => ({
        ...v,
        status: 'fulfilled',
        offer: { ...offer, status: 'accepted' },
      }))
      if (mode === 'slow')
        await new Promise((resolve) => setTimeout(resolve, 500))
      return json(receipt(body), 201)
    }
    if (path === '/v1/appointments/fit-ins') {
      if (mode === 'slot')
        return json({ error: { code: 'SLOT_UNAVAILABLE' } }, 409)
      return json(receipt(body, true), 201)
    }
    return json({ error: { code: 'NOT_FOUND_OR_FORBIDDEN' } }, 404)
  })
  return {
    writes,
    lists,
    rooms,
    lookups,
    setMode: (v: string) => {
      mode = v
    },
    setZone: (v: string) => {
      zone = v
    },
    setEntries: (v: (typeof entry)[]) => {
      entries = v
    },
  }
}
async function open(page: Page) {
  await page.goto('/agenda/espera')
  await expect(
    page.getByRole('heading', {
      name: /Minha lista de espera|Espera e encaixe/,
      exact: true,
    }),
  ).toBeVisible()
}
async function fillEntry(page: Page) {
  const form = page.getByRole('form', { name: 'Inscrição na lista de espera' })
  await form.getByLabel('Paciente', { exact: true }).selectOption(id(3))
  await form.getByLabel('Especialidade', { exact: true }).selectOption(id(4))
  await form.getByRole('checkbox', { name: 'Domingo', exact: true }).check()
  await form.getByLabel('Horário inicial').fill('08:00')
  await form.getByLabel('Horário final').fill('18:00')
  return form
}
async function fillFit(page: Page) {
  const form = page.getByRole('form', { name: 'Encaixe fora da grade' })
  await form.getByLabel('CPF do paciente').fill('12345678909')
  await form.getByRole('button', { name: 'Localizar paciente' }).click()
  await expect(form.getByText('Paciente: Paciente Fictício')).toBeVisible()
  await form.getByLabel('Especialidade do encaixe').selectOption(id(4))
  await expect(
    form
      .getByLabel('Profissional do encaixe')
      .getByRole('option', { name: 'Profissional Fictício' }),
  ).toHaveCount(1)
  await form.getByLabel('Profissional do encaixe').selectOption(id(5))
  await form.getByLabel('Data e hora do encaixe').fill('2030-05-12T12:30')
  return form
}

test('FE-017: inscrição por faixa/dependente, validação e saída preservam histórico', async ({
  page,
}) => {
  const api = await setup(page)
  await open(page)
  await page.getByRole('button', { name: 'Confirmar inscrição' }).click()
  await expect(
    page.getByText(/Selecione paciente\/especialidade/),
  ).toBeVisible()
  expect(api.writes).toHaveLength(0)
  const form = await fillEntry(page)
  await form.getByRole('button', { name: 'Confirmar inscrição' }).click()
  await expect(page.getByRole('article')).toContainText('Dependente Fictício')
  expect(api.writes[0].body?.patientId).toBe(id(3))
  await expect(page.getByRole('article')).toContainText('Domingo')
  await page.getByRole('button', { name: 'Sair da espera' }).click()
  expect(api.writes).toHaveLength(1)
  await page.getByRole('button', { name: 'Confirmar saída' }).click()
  await expect(page.getByText('Saiu da espera', { exact: true })).toBeVisible()
  expect(api.writes[1].path).toBe(`/v1/waitlist/${entry.id}`)
})

test('FE-017: oferta usa prazo retornado e duplicidade exige ciência antes de aceite201', async ({
  page,
}) => {
  const api = await setup(page)
  api.setEntries([{ ...entry, status: 'offered', offer }])
  api.setMode('duplicate')
  await open(page)
  await expect(
    page.getByText(/Tempo restante aproximado: 60 min/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Aceitar horário' }).click()
  await expect(
    page.getByRole('button', { name: 'Aceitar horário' }),
  ).toBeDisabled()
  expect(api.writes).toHaveLength(1)
  await page.getByRole('checkbox', { name: /Estou ciente/ }).check()
  expect(api.writes).toHaveLength(1)
  await page.getByRole('button', { name: 'Aceitar horário' }).click()
  await expect(
    page.getByRole('region', { name: 'Atendimento registrado' }),
  ).toContainText('Confirmada')
  expect(api.writes[0].key).not.toBe(api.writes[1].key)
})

test('FE-017: oferta vencida localmente ou negada409 nunca produz recibo', async ({
  page,
}) => {
  const api = await setup(page)
  api.setEntries([
    {
      ...entry,
      status: 'offered',
      offer: { ...offer, expiresAt: '2030-05-12T11:00:00.000Z' },
    },
  ])
  await open(page)
  await expect(
    page.getByRole('button', { name: 'Aceitar horário' }),
  ).toBeDisabled()
  expect(api.writes).toHaveLength(0)
  api.setEntries([{ ...entry, status: 'offered', offer }])
  await page.getByRole('button', { name: 'Atualizar lista' }).click()
  api.setMode('expired')
  await page.getByRole('button', { name: 'Aceitar horário' }).click()
  await expect(page.getByText(/Esta oferta expirou/)).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Atendimento registrado' }),
  ).toHaveCount(0)
})

test('FE-017: nova oferta após expiração não herda bloqueio da anterior', async ({
  page,
}) => {
  const api = await setup(page)
  api.setEntries([{ ...entry, status: 'offered', offer }])
  api.setMode('expired')
  await open(page)
  await page.getByRole('button', { name: 'Aceitar horário' }).click()
  await expect(
    page.getByRole('button', { name: 'Aceitar horário' }),
  ).toBeDisabled()
  api.setMode('normal')
  api.setEntries([
    { ...entry, status: 'offered', offer: { ...offer, id: id(9) } },
  ])
  await page.getByRole('button', { name: 'Atualizar lista' }).click()
  await expect(
    page.getByRole('button', { name: 'Aceitar horário' }),
  ).toBeEnabled()
})

test('FE-017: erro/vazio e preferência com vaga orientam nova busca', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('error')
  await open(page)
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar a espera' }),
  ).toBeVisible()
  api.setMode('normal')
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(
    page.getByRole('heading', { name: 'Nenhuma inscrição nesta seleção' }),
  ).toBeVisible()
  const form = await fillEntry(page)
  api.setMode('available')
  await form.getByRole('button', { name: 'Confirmar inscrição' }).click()
  await expect(
    form.getByRole('link', { name: 'Voltar à busca de horários' }),
  ).toHaveAttribute('href', '/agendar')
})

test('FE-017: recepção vê contato manual e gestor só cria encaixe com identificação mínima', async ({
  page,
}) => {
  const api = await setup(page, 'manager')
  await open(page)
  await expect(
    page.getByRole('form', { name: 'Inscrição na lista de espera' }),
  ).toHaveCount(0)
  expect(api.lists).toHaveLength(0)
  const form = await fillFit(page)
  await expect(form.getByText(/Sala sugerida: Sala Ipê/)).toBeVisible()
  await expect(form.getByLabel('Sala livre do encaixe')).toHaveCount(0)
  await form.getByRole('button', { name: 'Confirmar encaixe' }).click()
  expect(api.writes).toHaveLength(0)
  await form
    .getByLabel('Justificativa do encaixe')
    .fill('Encaixe justificado pela clínica')
  await form.getByRole('button', { name: 'Confirmar encaixe' }).click()
  await expect(
    page.getByRole('region', { name: 'Atendimento registrado' }),
  ).toContainText('Encaixe')
  expect(api.writes[0].body).not.toHaveProperty('roomId')
  expect(api.lookups).toEqual(['/v1/patients/fit-in-candidate'])
})

test('FE-017: encaixe ocupado ou sem sala impede sucesso; online não consulta sala', async ({
  page,
}) => {
  const api = await setup(page, 'receptionist')
  api.setMode('no-room')
  await open(page)
  const form = await fillFit(page)
  await expect(form.getByText(/Não há sala livre/)).toBeVisible()
  await expect(
    form.getByRole('button', { name: 'Confirmar encaixe' }),
  ).toBeDisabled()
  await form.getByLabel('Modalidade do encaixe').selectOption('remote')
  await expect(
    form
      .getByLabel('Profissional do encaixe')
      .getByRole('option', { name: 'Profissional Fictício' }),
  ).toHaveCount(1)
  await form.getByLabel('Profissional do encaixe').selectOption(id(5))
  await form
    .getByLabel('Justificativa do encaixe')
    .fill('Encaixe online justificado')
  const reads = api.rooms.length
  api.setMode('slot')
  await form.getByRole('button', { name: 'Confirmar encaixe' }).click()
  await expect(
    form.getByText(/Este horário deixou de estar disponível/),
  ).toBeVisible()
  expect(api.rooms).toHaveLength(reads)
  await expect(
    page.getByRole('region', { name: 'Atendimento registrado' }),
  ).toHaveCount(0)
})

test('FE-017: identificação alheia na URL não amplia consulta e perfil profissional não acessa', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('foreign')
  await page.goto(`/agenda/espera?patientId=${id(99)}`)
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar a espera' }),
  ).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  expect(api.lists.some((q) => q.has('patientId'))).toBe(false)
})

test('FE-017: 360px e teclado sem overflow; busca vazia oferece entrada na espera', async ({
  page,
}) => {
  await setup(page)
  await page.setViewportSize({ width: 360, height: 800 })
  await open(page)
  await expect(
    page.getByRole('heading', { name: 'Nenhuma inscrição nesta seleção' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page
    .getByRole('form', { name: 'Inscrição na lista de espera' })
    .getByLabel('Paciente', { exact: true })
    .focus()
  await page.keyboard.press('Tab')
  await expect(
    page
      .getByRole('form', { name: 'Inscrição na lista de espera' })
      .getByLabel('Especialidade', { exact: true }),
  ).toBeFocused()
  await page.screenshot({
    path: '/tmp/vidaplena-fe017-mobile.png',
    fullPage: true,
  })
  await page.goto('/agendar')
  await page.getByLabel('Especialidade', { exact: true }).selectOption(id(4))
  await page.getByLabel('Data do atendimento').fill('2030-05-12')
  await expect(
    page.getByRole('link', { name: 'Entrar na lista de espera' }),
  ).toHaveAttribute('href', '/agenda/espera')
})

test('FE-017: expiração com página aberta desabilita aceite sem enviar', async ({
  page,
}) => {
  const api = await setup(page)
  api.setEntries([
    {
      ...entry,
      status: 'offered',
      offer: { ...offer, expiresAt: '2030-05-12T12:00:02.500Z' },
    },
  ])
  await open(page)
  await expect(
    page.getByRole('button', { name: 'Aceitar horário' }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: 'Aceitar horário' }),
  ).toBeDisabled({ timeout: 5000 })
  expect(api.writes).toHaveLength(0)
})

test('FE-017: recepção vê aviso manual e confirma encaixe com sala explícita', async ({
  page,
}) => {
  const api = await setup(page, 'receptionist')
  api.setEntries([
    {
      ...entry,
      status: 'offered',
      offer: { ...offer, manualContactRequired: true },
    },
  ])
  await open(page)
  await expect(page.getByText(/Contato manual necessário/)).toBeVisible()
  const form = await fillFit(page)
  await expect(form.getByLabel('Sala livre do encaixe')).toBeEnabled()
  await form
    .getByLabel('Justificativa do encaixe')
    .fill('Intervalo adicional livre confirmado')
  await form.getByRole('button', { name: 'Confirmar encaixe' }).click()
  await expect(
    page.getByRole('region', { name: 'Atendimento registrado' }),
  ).toContainText('Encaixe')
  expect(api.writes[0].body?.roomId).toBe(id(6))
  expect(api.writes[0].body?.startsAt).toBe('2030-05-12T15:30:00Z')
})

test('FE-017: horário local ambíguo é recusado antes da consulta de sala', async ({
  page,
}) => {
  const api = await setup(page, 'manager')
  api.setZone('America/New_York')
  await open(page)
  const form = await fillFit(page)
  await form.getByLabel('Data e hora do encaixe').fill('2030-11-03T01:30')
  await expect(
    form.getByText(/Horário local inexistente ou ambíguo/),
  ).toBeVisible()
  await expect(
    form.getByRole('button', { name: 'Confirmar encaixe' }),
  ).toBeDisabled()
  expect(api.writes).toHaveLength(0)
})

test('FE-017: perfil profissional não abre a espera nem consulta a fila', async ({
  page,
}) => {
  const api = await setup(page, 'professional')
  await page.goto('/agenda/espera')
  await expect(
    page.getByRole('heading', { name: 'Acesso não disponível' }),
  ).toBeVisible()
  expect(api.lists).toHaveLength(0)
})

test('FE-017: fila pagina sem duplicar e filtros são enviados ao servidor', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('paged')
  api.setEntries([entry, { ...entry, id: id(12), position: 2 }])
  await open(page)
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.getByRole('button', { name: 'Carregar mais inscrições' }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  expect(api.lists.at(-1)?.get('cursor')).toBe(entry.id)
  await page.getByLabel('Filtrar especialidade').selectOption(id(4))
  await page.getByLabel('Filtrar situação').selectOption('waiting')
  await expect.poll(() => api.lists.at(-1)?.get('status')).toBe('waiting')
  expect(api.lists.at(-1)?.get('specialtyId')).toBe(id(4))
})

test('FE-017: duplo evento de aceite produz somente um comando', async ({
  page,
}) => {
  const api = await setup(page)
  api.setMode('slow')
  api.setEntries([{ ...entry, status: 'offered', offer }])
  await open(page)
  await page.getByRole('button', { name: 'Aceitar horário' }).click()
  await expect(
    page.getByRole('button', { name: 'Processando…' }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Processando…' })
    .dispatchEvent('click')
  await expect(
    page.getByRole('region', { name: 'Atendimento registrado' }),
  ).toContainText('Confirmada')
  expect(api.writes).toHaveLength(1)
})
