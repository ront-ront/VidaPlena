import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { AcceptWaitlistOffer } from '../../../application/use-cases/accept-waitlist-offer'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { BookAppointment } from '../../../application/use-cases/book-appointment'
import type { ManageWaitlist } from '../../../application/use-cases/manage-waitlist'
import { idempotencyHeader } from './contracts/appointments'
import {
  acceptOfferBody,
  fitInBody,
  waitlistBody,
  waitlistParams,
  waitlistQuery,
} from './contracts/waitlist'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createWaitlistRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageWaitlist,
  accept: AcceptWaitlistOffer,
  booking: BookAppointment,
) {
  const router = Router(),
    guard = accessGuard(tokens, authorize, 'consent_management')
  router.post('/waitlist', guard, async (req, res) =>
    res
      .status(201)
      .json(
        await service.enter(
          principalOf(res),
          parseInput(waitlistBody, req.body),
          auditContext(req, res),
        ),
      ),
  )
  router.get('/waitlist', guard, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(
      await service.list(
        principalOf(res),
        parseInput(waitlistQuery, req.query),
        auditContext(req, res),
      ),
    )
  })
  router.delete('/waitlist/:id', guard, async (req, res) => {
    await service.leave(
      principalOf(res),
      parseInput(waitlistParams, req.params).id,
      auditContext(req, res),
    )
    res.status(204).end()
  })
  router.post('/waitlist/offers/:id/accept', guard, async (req, res) => {
    const { 'idempotency-key': key } = parseInput(
      idempotencyHeader,
      req.headers,
    )
    res
      .status(201)
      .json(
        await accept.execute(
          principalOf(res),
          parseInput(waitlistParams, req.params).id,
          parseInput(acceptOfferBody, req.body),
          key,
          auditContext(req, res),
        ),
      )
  })
  router.post('/appointments/fit-ins', guard, async (req, res) => {
    const { 'idempotency-key': key } = parseInput(
      idempotencyHeader,
      req.headers,
    )
    res
      .status(201)
      .json(
        await booking.fitIn(
          principalOf(res),
          parseInput(fitInBody, req.body),
          key,
          auditContext(req, res),
        ),
      )
  })
  return router
}
