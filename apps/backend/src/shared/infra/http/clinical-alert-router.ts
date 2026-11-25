import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageClinicalAlerts } from '../../../application/use-cases/manage-clinical-alerts'
import {
  alertBody,
  alertConfirmBody,
  alertDeactivateBody,
  alertParams,
  alertPatientParams,
  alertQuery,
} from './contracts/clinical-alerts'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createClinicalAlertRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageClinicalAlerts,
) {
  const router = Router()
  router.get(
    '/clinical/records/:patientId/alerts',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.list(
          principalOf(res),
          parseInput(alertPatientParams, req.params).patientId,
          parseInput(alertQuery, req.query),
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/clinical/records/:patientId/alerts',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res
        .status(201)
        .json(
          await service.create(
            principalOf(res),
            parseInput(alertPatientParams, req.params).patientId,
            parseInput(alertBody, req.body),
            auditContext(req, res),
          ),
        )
    },
  )
  router.post(
    '/clinical/alerts/:id/confirm',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.transition(
          principalOf(res),
          parseInput(alertParams, req.params).id,
          'confirmed',
          parseInput(alertConfirmBody, req.body),
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/clinical/alerts/:id/deactivate',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.transition(
          principalOf(res),
          parseInput(alertParams, req.params).id,
          'deactivated',
          parseInput(alertDeactivateBody, req.body),
          auditContext(req, res),
        ),
      )
    },
  )
  return router
}
