import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageEmergencyAccess } from '../../../application/use-cases/manage-emergency-access'
import {
  emergencyGrantBody,
  emergencyId,
  emergencyQuery,
  emergencyReviewBody,
} from './contracts/emergency-access'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createEmergencyAccessRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageEmergencyAccess,
) {
  const router = Router()
  router.post(
    '/clinical/emergency-access',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res
        .status(201)
        .json(
          await service.request(
            principalOf(res),
            parseInput(emergencyGrantBody, req.body),
            auditContext(req, res),
          ),
        )
    },
  )
  router.get(
    '/clinical/emergency-access/:id',
    accessGuard(tokens, authorize, 'session'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.detail(
          principalOf(res),
          parseInput(emergencyId, req.params).id,
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/admin/emergency-access',
    accessGuard(tokens, authorize, 'audit'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.list(
          principalOf(res),
          parseInput(emergencyQuery, req.query),
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/admin/emergency-access/:id/review',
    accessGuard(tokens, authorize, 'audit'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.review(
          principalOf(res),
          parseInput(emergencyId, req.params).id,
          parseInput(emergencyReviewBody, req.body),
          auditContext(req, res),
        ),
      )
    },
  )
  return router
}
