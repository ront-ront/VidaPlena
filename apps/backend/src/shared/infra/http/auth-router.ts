import { createHash, timingSafeEqual } from 'node:crypto'
import { type Request, type Response, Router } from 'express'
import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditWriter } from '../../../application/ports/audit-writer'
import type {
  AccessTokens,
  AuthStore,
} from '../../../application/ports/authentication'
import type { Authenticate } from '../../../application/use-cases/authenticate'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { AppConfig } from '../../config/environment'
import { loginBody, mfaEnrollBody, mfaVerifyBody } from './contracts/m0'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

function cookie(req: Request, name: string): string | null {
  for (const part of (req.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name && value.length) return value.join('=')
  }
  return null
}

function matches(left: string | null, right: string | undefined) {
  if (!left || !right) return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function setSessionCookies(
  res: Response,
  config: AppConfig,
  tokens: { refreshToken: string; csrfToken: string; refreshExpiresAt: Date },
) {
  res.cookie('vp_refresh', tokens.refreshToken, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/v1/auth',
    expires: tokens.refreshExpiresAt,
  })
  res.cookie('vp_csrf', tokens.csrfToken, {
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    expires: tokens.refreshExpiresAt,
  })
}

function clearSessionCookies(res: Response, config: AppConfig) {
  res.clearCookie('vp_refresh', {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/v1/auth',
  })
  res.clearCookie('vp_csrf', {
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
  })
}

export function createAuthRouter(
  config: AppConfig,
  service: Authenticate,
  store: AuthStore,
  tokens: AccessTokens,
  authorize: Authorize,
  audit: AuditWriter,
) {
  const router = Router()
  router.use('/auth', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    const origin = req.get('origin')
    if (
      req.method !== 'GET' &&
      (!origin || !config.corsOrigins.includes(origin))
    )
      throw new ApplicationError('FORBIDDEN')
    next()
  })
  const limit = async (req: Request) => {
    const key = createHash('sha256')
      .update(`auth:${req.path}:${req.ip ?? 'unknown'}`)
      .digest('hex')
    if (!(await store.rateLimit(key, new Date(), config.authRequestsPerMinute)))
      throw new ApplicationError('RATE_LIMITED')
  }
  const authenticated = (
    res: Response,
    result: Awaited<ReturnType<Authenticate['login']>>,
  ) => {
    if (result.status === 'mfa_required') {
      res.status(202).json(result)
      return
    }
    setSessionCookies(res, config, result)
    const {
      refreshToken: _refresh,
      csrfToken: _csrf,
      refreshExpiresAt: _until,
      ...body
    } = result
    res.json(body)
  }
  router.post('/auth/login', async (req, res) => {
    await limit(req)
    const body = parseInput(loginBody, req.body)
    authenticated(
      res,
      await service.login(
        body.identifier,
        body.password,
        auditContext(req, res),
      ),
    )
  })
  router.post('/auth/mfa/enroll', async (req, res) => {
    await limit(req)
    const body = parseInput(mfaEnrollBody, req.body)
    res.json(await service.enroll(body.challengeId, auditContext(req, res)))
  })
  router.post('/auth/mfa/verify', async (req, res) => {
    await limit(req)
    const body = parseInput(mfaVerifyBody, req.body)
    authenticated(
      res,
      await service.verifyMfa(
        body.challengeId,
        body.code,
        auditContext(req, res),
      ),
    )
  })
  const sessionCookies = (req: Request) => {
    const refresh = cookie(req, 'vp_refresh')
    const csrf = cookie(req, 'vp_csrf')
    if (!refresh || !csrf || !matches(csrf, req.get('x-csrf-token')))
      throw new ApplicationError('FORBIDDEN')
    return { refresh, csrf }
  }
  router.post('/auth/refresh', async (req, res) => {
    await limit(req)
    const { refresh, csrf } = sessionCookies(req)
    const result = await service.refresh(refresh, csrf, auditContext(req, res))
    setSessionCookies(res, config, result)
    res.json({ accessToken: result.accessToken, expiresAt: result.expiresAt })
  })
  router.post('/auth/logout', async (req, res) => {
    await limit(req)
    const { refresh, csrf } = sessionCookies(req)
    await service.logout(refresh, csrf, auditContext(req, res))
    clearSessionCookies(res, config)
    res.status(204).end()
  })
  router.get(
    '/me',
    accessGuard(tokens, authorize, 'consent_management'),
    async (req, res) => {
      const principal = principalOf(res)
      const current = await store.current(principal)
      if (!current) throw new ApplicationError('UNAUTHENTICATED')
      await audit.append({
        ...auditContext(req, res),
        actorUserId: principal.userId,
        actorRoles: principal.roles,
        action: 'account.profile_viewed',
        resourceType: 'User',
        resourceId: principal.userId,
      })
      res.setHeader('Cache-Control', 'no-store')
      res.json(current)
    },
  )
  return router
}
