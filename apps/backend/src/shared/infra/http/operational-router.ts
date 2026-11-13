import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageArrivals } from '../../../application/use-cases/manage-arrivals'
import { appointmentParams } from './contracts/appointments'
import {
  agendaQuery,
  checkInBody,
  queueQuery,
} from './contracts/operational-agenda'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createOperationalRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageArrivals,
) {
  const router = Router()
  router.post(
    '/appointments/:id/check-in',
    accessGuard(tokens, authorize, 'check_in'),
    async (req, res) => {
      const { id } = parseInput(appointmentParams, req.params),
        { arrivedAt } = parseInput(checkInBody, req.body)
      res.json(
        await service.checkIn(
          principalOf(res),
          id,
          arrivedAt,
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/agenda/day',
    accessGuard(tokens, authorize, 'operational_agenda'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.list(
          principalOf(res),
          parseInput(agendaQuery, req.query),
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/professionals/me/queue',
    accessGuard(tokens, authorize, 'own_queue'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.list(
          principalOf(res),
          parseInput(queueQuery, req.query),
          auditContext(req, res),
          true,
        ),
      )
    },
  )
  return router
}
