import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageSchedule } from '../../../application/use-cases/manage-schedule'
import {
  scheduleBody,
  scheduleParams,
  scheduleQuery,
} from './contracts/schedule'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createScheduleRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageSchedule,
) {
  const router = Router(),
    guard = accessGuard(tokens, authorize, 'manage_schedule')
  router.get('/professionals/me/profile', guard, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await service.ownProfile(principalOf(res), auditContext(req, res)))
  })
  router.get('/professionals/:id/schedule/editor', guard, async (req, res) => {
    const { id } = parseInput(scheduleParams, req.params)
    res.setHeader('Cache-Control', 'no-store')
    res.json(await service.editor(principalOf(res), id, auditContext(req, res)))
  })
  router.get('/professionals/:id/schedule', guard, async (req, res) => {
    const { id } = parseInput(scheduleParams, req.params)
    const { from, to } = parseInput(scheduleQuery, req.query)
    res.setHeader('Cache-Control', 'no-store')
    res.json(
      await service.read(
        principalOf(res),
        id,
        from,
        to,
        auditContext(req, res),
      ),
    )
  })
  router.put('/professionals/:id/schedule', guard, async (req, res) => {
    const { id } = parseInput(scheduleParams, req.params)
    const { expectedVersion, ...input } = parseInput(scheduleBody, req.body)
    res.json(
      await service.publish(
        principalOf(res),
        id,
        expectedVersion,
        input,
        auditContext(req, res),
      ),
    )
  })
  return router
}
