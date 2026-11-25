import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageClinicalEvolutions } from '../../../application/use-cases/manage-clinical-evolutions'
import {
  addendumBody,
  authoredEvolutionQuery,
  finalizeEvolutionBody,
} from './contracts/clinical-evolutions'
import { evolutionId } from './contracts/evolution-drafts'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createClinicalEvolutionRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageClinicalEvolutions,
) {
  const router = Router()
  router.get(
    '/clinical/evolution-policy',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(await service.policy(principalOf(res), auditContext(req, res)))
    },
  )
  router.get(
    '/clinical/evolutions/mine',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.mine(
          principalOf(res),
          parseInput(authoredEvolutionQuery, req.query),
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
  router.post(
    '/clinical/evolutions/:id/finalize',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.finalize(
          principalOf(res),
          parseInput(evolutionId, req.params).id,
          parseInput(finalizeEvolutionBody, req.body).expectedDraftVersion,
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/clinical/evolutions/:id/addenda',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res
        .status(201)
        .json(
          await service.addendum(
            principalOf(res),
            parseInput(evolutionId, req.params).id,
            parseInput(addendumBody, req.body),
            auditContext(req, res),
          ),
        )
    },
  )
  return router
}
