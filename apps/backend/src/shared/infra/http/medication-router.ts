import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageMedications } from '../../../application/use-cases/manage-medications'
import { terminologyQuery } from './contracts/terminologies'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createMedicationRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageMedications,
) {
  const router = Router()
  router.get(
    '/terminologies/medications',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.search(
          principalOf(res),
          parseInput(terminologyQuery, req.query),
          auditContext(req, res),
        ),
      )
    },
  )
  return router
}
