import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { FindAvailability } from '../../../application/use-cases/find-availability'
import { availabilityQuery } from './contracts/availability'
import { accessGuard, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createAvailabilityRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: FindAvailability,
) {
  const router = Router()
  router.get(
    '/availability',
    accessGuard(tokens, authorize, 'session'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.execute(
          principalOf(res),
          parseInput(availabilityQuery, req.query),
        ),
      )
    },
  )
  return router
}
