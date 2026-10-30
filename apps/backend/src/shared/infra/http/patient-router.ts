import { Router } from 'express'
import type { AuditWriter } from '../../../application/ports/audit-writer'
import type { AccessTokens } from '../../../application/ports/authentication'
import type { PatientRegistrationStore } from '../../../application/ports/patient-registration'
import type { Authorize } from '../../../application/use-cases/authorize'
import { accessGuard, auditContext, principalOf } from './middleware/access'

export function createPatientRouter(
  tokens: AccessTokens,
  authorize: Authorize,
  store: PatientRegistrationStore,
  audit: AuditWriter,
) {
  const router = Router()
  router.get(
    '/me/dependents',
    accessGuard(tokens, authorize, 'session'),
    async (req, res) => {
      const actor = principalOf(res)
      const items = await store.dependents(actor.userId)
      await audit.append({
        ...auditContext(req, res),
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'patient.dependents_viewed',
        resourceType: 'GuardianLinkCollection',
        resourceId: actor.userId,
        metadata: { count: items.length },
      })
      res.json({ items })
    },
  )
  return router
}
