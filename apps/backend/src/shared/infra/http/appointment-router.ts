import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { BookAppointment } from '../../../application/use-cases/book-appointment'
import type { CancelAppointment } from '../../../application/use-cases/cancel-appointment'
import type { ListMyAppointments } from '../../../application/use-cases/list-my-appointments'
import type { RescheduleAppointment } from '../../../application/use-cases/reschedule-appointment'
import type { RespondAttendance } from '../../../application/use-cases/respond-attendance'
import {
  appointmentBody,
  appointmentParams,
  attendanceBody,
  cancelBody,
  idempotencyHeader,
  myAppointmentsQuery,
  rescheduleBody,
} from './contracts/appointments'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createAppointmentRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: BookAppointment,
  reschedule: RescheduleAppointment,
  list: ListMyAppointments,
  cancel: CancelAppointment,
  attendance: RespondAttendance,
) {
  const router = Router()
  router.post(
    '/appointments/:id/attendance-response',
    accessGuard(tokens, authorize, 'session'),
    async (req, res) => {
      const { id } = parseInput(appointmentParams, req.params)
      const { response } = parseInput(attendanceBody, req.body)
      res.json(
        await attendance.execute(
          principalOf(res),
          id,
          response,
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/appointments/:id/cancel',
    accessGuard(tokens, authorize, 'consent_management'),
    async (req, res) => {
      const { id } = parseInput(appointmentParams, req.params)
      const { 'idempotency-key': key } = parseInput(
        idempotencyHeader,
        req.headers,
      )
      res.json(
        await cancel.execute(
          principalOf(res),
          id,
          parseInput(cancelBody, req.body),
          key,
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/me/appointments',
    accessGuard(tokens, authorize, 'session'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await list.execute(
          principalOf(res),
          parseInput(myAppointmentsQuery, req.query),
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/appointments/:id/reschedule',
    accessGuard(tokens, authorize, 'consent_management'),
    async (req, res) => {
      const { id } = parseInput(appointmentParams, req.params)
      const { 'idempotency-key': key } = parseInput(
        idempotencyHeader,
        req.headers,
      )
      res.json(
        await reschedule.execute(
          principalOf(res),
          id,
          parseInput(rescheduleBody, req.body),
          key,
          auditContext(req, res),
        ),
      )
    },
  )
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
