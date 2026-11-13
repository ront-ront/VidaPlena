import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageAbsences } from '../../../application/use-cases/manage-absences'
import { absenceBody, absenceCorrectionBody } from './contracts/absence'
import { appointmentParams } from './contracts/appointments'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createAbsenceRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageAbsences,
) {
  const router = Router()
  router.post(
    '/appointments/:id/absence',
    accessGuard(tokens, authorize, 'record_absence'),
    async (req, res) => {
      const { id } = parseInput(appointmentParams, req.params)
      res.json(
        await service.decide(
          principalOf(res),
          id,
          parseInput(absenceBody, req.body),
          auditContext(req, res),
        ),
      )
    },
  )
  router.patch(
    '/appointments/:id/absence',
    accessGuard(tokens, authorize, 'correct_absence'),
    async (req, res) => {
      const { id } = parseInput(appointmentParams, req.params)
      res.json(
        await service.decide(
          principalOf(res),
          id,
          parseInput(absenceCorrectionBody, req.body),
          auditContext(req, res),
          true,
        ),
      )
    },
  )
  return router
}
