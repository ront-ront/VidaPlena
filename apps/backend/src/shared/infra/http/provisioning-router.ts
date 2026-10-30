import { Router } from 'express'
import type { AccessStore } from '../../../application/ports/access-store'
import type { ProvisioningStore } from '../../../application/ports/provisioning-store'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ProvisionAccounts } from '../../../application/use-cases/provision-accounts'
import {
  acceptInvitationBody,
  invitationTokenBody,
  inviteUserBody,
  userIdParams,
  userListQuery,
} from './contracts/m0'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createProvisioningRouter(
  verifier: SessionVerifier,
  authorize: Authorize,
  service: ProvisionAccounts,
  store: ProvisioningStore,
  access: AccessStore,
) {
  const router = Router()
  const guard = accessGuard(verifier, authorize, 'invite_users')
  router.post('/admin/users', guard, async (req, res) => {
    const body = parseInput(inviteUserBody, req.body)
    res
      .status(201)
      .json(
        await service.invite(
          principalOf(res),
          { ...body, email: body.email.toLowerCase() },
          auditContext(req, res),
        ),
      )
  })
  router.get('/admin/users', guard, async (req, res) => {
    const filters = parseInput(userListQuery, req.query)
    res.json({
      ...(await store.list(principalOf(res), filters, auditContext(req, res))),
      dpoDesignated: await access.hasDpo(),
    })
  })
  router.post('/admin/users/:id/invitation', guard, async (req, res) => {
    res
      .status(201)
      .json(
        await service.resend(
          principalOf(res),
          parseInput(userIdParams, req.params).id,
          auditContext(req, res),
        ),
      )
  })
  router.post('/auth/invitations/inspect', async (req, res) => {
    res.json(
      await service.inspect(parseInput(invitationTokenBody, req.body).token),
    )
  })
  router.post('/auth/invitations/accept', async (req, res) => {
    const body = parseInput(acceptInvitationBody, req.body)
    res.json(
      await service.accept(body.token, body.password, auditContext(req, res)),
    )
  })
  return router
}
