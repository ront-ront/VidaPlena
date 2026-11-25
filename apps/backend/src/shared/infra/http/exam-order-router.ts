import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ReadPendingExamOrders } from '../../../application/use-cases/read-pending-exam-orders'
import { pendingExamOrderQuery } from './contracts/exam-orders'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createExamOrderRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ReadPendingExamOrders,
) {
  const router = Router()
  router.get(
    '/clinical/exam-orders/pending',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.list(
          principalOf(res),
          parseInput(pendingExamOrderQuery, req.query),
          auditContext(req, res),
        ),
      )
    },
  )
  return router
}
