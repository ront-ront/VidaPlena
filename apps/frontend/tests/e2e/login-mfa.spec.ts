import { expect, type Locator, type Page, test } from '@playwright/test'
import jsQR from 'jsqr'

// Somente dados fictícios; nunca usar segredos de contas reais em fixtures.
const secret = 'JBSWY3DPEHPK3PXP'
const otpauthUri = `otpauth://totp/VidaPlena:admin%40example.test?issuer=VidaPlena&secret=${secret}&algorithm=SHA1&digits=6&period=30`

async function mockMfa(page: Page, enrollmentRequired = true) {
  const requests: string[] = []
  let enrollments = 0
  page.on('request', (request) => requests.push(request.url()))
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const headers = {
      'Access-Control-Allow-Origin':
        route.request().headers().origin ?? new URL(page.url()).origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers':
        'authorization,content-type,x-request-id,x-csrf-token',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    }
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers })
    if (path === '/v1/auth/login')
      return route.fulfill({
        status: 202,
        headers,
        json: {
          status: 'mfa_required',
          challengeId: '10000000-0000-4000-8000-000000000001',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          enrollmentRequired,
        },
      })
    if (path === '/v1/auth/mfa/enroll') {
      enrollments++
      return route.fulfill({ headers, json: { secret, otpauthUri } })
    }
    return route.fulfill({
      status: 401,
      headers,
      json: { error: { code: 'UNAUTHENTICATED', requestId: 'test-only' } },
    })
  })
  return { requests, enrollments: () => enrollments }
}

async function enter(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mail ou CPF').fill('admin@example.test')
  await page
    .getByLabel('Senha', { exact: true })
    .fill('senha-ficticia-de-teste')
  await expect(
    page.getByRole('button', { name: 'Entrar', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Confirme seu acesso' }),
  ).toBeVisible()
}

async function decodeQr(qr: Locator) {
  const image = await qr.evaluate(async (svg) => {
    const size = Math.round(svg.getBoundingClientRect().width)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas indisponível no navegador de teste')
    const source = new Image()
    source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
    await source.decode()
    context.drawImage(source, 0, 0, size, size)
    return {
      pixels: Array.from(context.getImageData(0, 0, size, size).data),
      size,
    }
  })
  return jsQR(new Uint8ClampedArray(image.pixels), image.size, image.size)?.data
}

const qrName = 'QR code para configurar o autenticador'

test('FE-005: QR decodifica a URI da API, preserva chave e sai da tela sem persistir segredo', async ({
  page,
}) => {
  const mock = await mockMfa(page)
  await enter(page)
  const qr = page.getByRole('img', { name: qrName })
  await expect(qr).toBeVisible()
  await expect(page.locator('code')).toHaveText(secret)
  expect(await decodeQr(qr)).toBe(otpauthUri)
  expect(mock.enrollments()).toBe(1)

  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  )
  expect(storage).not.toContain(secret)
  expect(storage).not.toContain('otpauth:')
  expect(mock.requests.some((url) => url.includes(secret))).toBe(false)
  expect(
    mock.requests.every((url) =>
      ['127.0.0.1', 'localhost'].includes(new URL(url).hostname),
    ),
  ).toBe(true)

  await page.getByLabel('Código do autenticador').fill('123456')
  await page.getByRole('button', { name: 'Confirmar código' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'Sua sessão terminou.' }),
  ).toBeVisible()
  await expect(qr).toBeVisible()
  await expect(page.locator('code')).toHaveText(secret)

  await page.getByRole('button', { name: 'Voltar ao login' }).click()
  await expect(qr).toHaveCount(0)
  await expect(page.locator('code')).toHaveCount(0)
  await page.reload()
  await expect(qr).toHaveCount(0)
  await expect(page.getByLabel('E-mail ou CPF')).toBeVisible()
})

test('FE-005: MFA já cadastrado solicita só código, sem QR nem chave de cadastro', async ({
  page,
}) => {
  const mock = await mockMfa(page, false)
  await enter(page)
  await expect(page.getByLabel('Código do autenticador')).toBeVisible()
  await expect(page.getByRole('img', { name: qrName })).toHaveCount(0)
  await expect(page.locator('code')).toHaveCount(0)
  expect(mock.enrollments()).toBe(0)
})

for (const theme of ['light', 'dark']) {
  test(`FE-005: QR legível e chave acessível em 360px no tema ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.addInitScript(
      (value) => localStorage.setItem('vp-theme', value),
      theme,
    )
    await mockMfa(page)
    await enter(page)
    const qr = page.getByRole('img', { name: qrName })
    await expect(qr).toBeVisible()
    expect(await decodeQr(qr)).toBe(otpauthUri)
    await expect(page.locator('code')).toHaveText(secret)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.getByLabel('Código do autenticador').focus()
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('button', { name: 'Confirmar código' }),
    ).toBeFocused()
    await page.screenshot({
      path: `/tmp/vidaplena-mfa-qr-${theme}.png`,
      fullPage: true,
    })
  })
}
