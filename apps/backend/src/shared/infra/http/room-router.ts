import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageRooms } from '../../../application/use-cases/manage-rooms'
import { catalogId, catalogQuery } from './contracts/catalog'
import { roomBody, roomPatch } from './contracts/rooms'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createRoomRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageRooms,
) {
  const router = Router()
  router.get(
    '/rooms',
    accessGuard(tokens, authorize, 'operational_catalog'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.list(
          principalOf(res),
          parseInput(catalogQuery, req.query),
        ),
      )
    },
  )
  const guard = accessGuard(tokens, authorize, 'manage_catalog')
  router.post('/admin/rooms', guard, async (req, res) => {
    res
      .status(201)
      .json(
        await service.save(
          principalOf(res),
          parseInput(roomBody, req.body),
          auditContext(req, res),
        ),
      )
  })
  router.patch('/admin/rooms/:id', guard, async (req, res) => {
    const { id } = parseInput(catalogId, req.params)
    const { expectedVersion, ...body } = parseInput(roomPatch, req.body)
    res.json(
      await service.save(
        principalOf(res),
        body,
        auditContext(req, res),
        id,
        expectedVersion,
      ),
    )
  })
  return router
}
