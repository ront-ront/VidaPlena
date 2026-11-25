import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageEvolutionDrafts } from '../../../application/use-cases/manage-evolution-drafts'
import {
  evolutionCommandHeader,
  evolutionCreateBody,
  evolutionId,
  evolutionPatchBody,
} from './contracts/evolution-drafts'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createEvolutionDraftRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageEvolutionDrafts,
) {
  const router = Router()
  router.post(
    '/clinical/encounters/:id/evolutions/draft',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res
        .status(201)
        .json(
          await service.create(
            principalOf(res),
            parseInput(evolutionId, req.params).id,
            parseInput(evolutionCreateBody, req.body),
            auditContext(req, res),
          ),
        )
    },
  )
  router.get(
    '/clinical/encounters/:id/evolutions/draft',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.getByEncounter(
          principalOf(res),
          parseInput(evolutionId, req.params).id,
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/clinical/evolutions/:id',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.get(
          principalOf(res),
          parseInput(evolutionId, req.params).id,
          auditContext(req, res),
        ),
      )
    },
  )
  router.patch(
    '/clinical/evolutions/:id/draft',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.patch(
          principalOf(res),
          parseInput(evolutionId, req.params).id,
          parseInput(evolutionPatchBody, req.body),
          parseInput(evolutionCommandHeader, req.headers)['idempotency-key'],
          auditContext(req, res),
        ),
      )
    },
  )
  return router
}
