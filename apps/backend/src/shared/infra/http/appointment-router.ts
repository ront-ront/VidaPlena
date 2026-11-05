import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { BookAppointment } from '../../../application/use-cases/book-appointment'
import { appointmentBody, idempotencyHeader } from './contracts/appointments'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createAppointmentRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: BookAppointment,
) {
  const router = Router()
  router.post(
    '/appointments',
    accessGuard(tokens, authorize, 'consent_management'),
    async (req, res) => {
      const input = parseInput(appointmentBody, req.body)
      const { 'idempotency-key': key } = parseInput(
        idempotencyHeader,
        req.headers,
      )
      res
        .status(201)
        .json(
          await service.execute(
            principalOf(res),
            input,
            key,
            auditContext(req, res),
          ),
        )
    },
  )
  return router
}
