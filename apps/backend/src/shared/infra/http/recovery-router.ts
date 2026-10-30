import { Router } from 'express'
import type { AccessTokens } from '../../../application/ports/authentication'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { RecoverAccess } from '../../../application/use-cases/recover-access'
import {
  emailContactBody,
  invitationTokenBody,
  phoneContactBody,
  recoveryCompleteBody,
  recoveryRequestBody,
} from './contracts/m0'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createRecoveryRouter(
  tokens: AccessTokens,
  authorize: Authorize,
  service: RecoverAccess,
) {
  const router = Router()
  router.post('/auth/recovery/request', async (req, res) => {
    const { identifier } = parseInput(recoveryRequestBody, req.body)
    res
      .status(202)
      .json(await service.request(identifier, auditContext(req, res)))
  })
  router.post('/auth/recovery/complete', async (req, res) => {
    const { token, newPassword } = parseInput(recoveryCompleteBody, req.body)
    await service.complete(token, newPassword, auditContext(req, res))
    res.status(204).end()
  })
  router.post('/auth/contact-verifications/complete', async (req, res) => {
    const { token } = parseInput(invitationTokenBody, req.body)
    await service.confirmEmail(token, auditContext(req, res))
    res.status(204).end()
  })
  router.patch(
    '/me/contact',
    accessGuard(tokens, authorize, 'session'),
    async (req, res) => {
      const { email } = parseInput(emailContactBody, req.body)
      res
        .status(202)
        .json(
          await service.requestEmailChange(
            principalOf(res),
            email,
            auditContext(req, res),
          ),
        )
    },
  )
  router.post(
    '/onsite-contact/phone',
    accessGuard(tokens, authorize, 'onsite_registration'),
    async (req, res) => {
      const { userId, phone } = parseInput(phoneContactBody, req.body)
      res.json(
        await service.confirmPhoneOnsite(
          principalOf(res),
          userId,
          phone,
          auditContext(req, res),
        ),
      )
    },
  )
  return router
}
