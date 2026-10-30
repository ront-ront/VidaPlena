import { Router } from 'express'
import type { AccessStore } from '../../../application/ports/access-store'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type {
  AccessChange,
  AdministerAccess,
} from '../../../application/use-cases/administer-access'
import type { Authorize } from '../../../application/use-cases/authorize'
import { dpoBody, rolesBody, statusBody, userIdParams } from './contracts/m0'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createAccessRouter(
  verifier: SessionVerifier,
  authorize: Authorize,
  administer: AdministerAccess,
  store: AccessStore,
) {
  const router = Router()
  const guard = accessGuard(verifier, authorize, 'admin_users')
  for (const kind of ['roles', 'status', 'dpo'] as const) {
    const path = `/admin/users/:id/${kind === 'dpo' ? 'permissions/privacy.dpo' : kind}`
    router[kind === 'status' ? 'patch' : 'put'](
      path,
      guard,
      async (req, res) => {
        const { id: userId } = parseInput(userIdParams, req.params)
        let change: AccessChange
        if (kind === 'roles') {
          change = { kind, ...parseInput(rolesBody, req.body) }
        } else if (kind === 'status') {
          change = { kind, ...parseInput(statusBody, req.body) }
        } else {
          change = { kind, ...parseInput(dpoBody, req.body) }
        }
        const result = await administer.execute(
          principalOf(res),
          userId,
          change,
          auditContext(req, res),
        )
        res.json({ ...result, dpoDesignated: await store.hasDpo() })
      },
    )
  }
  return router
}
