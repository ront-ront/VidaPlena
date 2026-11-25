import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageCareLinks } from '../../../application/use-cases/manage-care-links'
import {
  careLinkQuery,
  shareCareLinkBody,
  substituteCareLinkBody,
} from './contracts/care-links'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createCareLinkRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageCareLinks,
) {
  const router = Router()
  router.get(
    '/clinical/care-links/me',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.list(
          principalOf(res),
          parseInput(careLinkQuery, req.query),
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/clinical/care-links/share',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res
        .status(201)
        .json(
          await service.grant(
            principalOf(res),
            parseInput(shareCareLinkBody, req.body),
            auditContext(req, res),
          ),
        )
    },
  )
  router.post(
    '/admin/care-links/substitution',
    accessGuard(tokens, authorize, 'grant_substitution'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res
        .status(201)
        .json(
          await service.grant(
            principalOf(res),
            parseInput(substituteCareLinkBody, req.body),
            auditContext(req, res),
            true,
          ),
        )
    },
  )
  return router
}
