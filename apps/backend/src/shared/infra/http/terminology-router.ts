import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageTerminologies } from '../../../application/use-cases/manage-terminologies'
import { terminologyQuery } from './contracts/terminologies'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createTerminologyRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageTerminologies,
) {
  const router = Router()
  for (const [path, kind] of [
    ['cid10', 'CID10'],
    ['tuss', 'TUSS'],
  ] as const)
    router.get(
      `/terminologies/${path}`,
      accessGuard(tokens, authorize, 'clinical_actor'),
      async (req, res) => {
        res.setHeader('Cache-Control', 'no-store')
        res.json(
          await service.search(
            principalOf(res),
            kind,
            parseInput(terminologyQuery, req.query),
            auditContext(req, res),
          ),
        )
      },
    )
  return router
}
