import { Router } from 'express'
import type { NotificationStore } from '../../../application/ports/notifications'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import { cursorQuery, notificationPreferencesBody } from './contracts/m0'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createNotificationRouter(
  verifier: SessionVerifier,
  authorize: Authorize,
  store: NotificationStore,
) {
  const router = Router()
  const authenticated = accessGuard(verifier, authorize, 'session')
  router.get('/me/notifications', authenticated, async (req, res) => {
    res.json(
      await store.list(
        principalOf(res).userId,
        parseInput(cursorQuery, req.query).cursor,
      ),
    )
  })
  router.get(
    '/me/notification-preferences',
    authenticated,
    async (_req, res) => {
      res.json(await store.preferences(principalOf(res).userId))
    },
  )
  router.put(
    '/me/notification-preferences',
    authenticated,
    async (req, res) => {
      const body = parseInput(notificationPreferencesBody, req.body)
      const preferences = {
        channels: [...new Set(body.channels)],
        nonEssentialOptOut: body.nonEssentialOptOut,
      }
      const actor = principalOf(res)
      await store.updatePreferences(actor.userId, preferences, {
        ...auditContext(req, res),
        actorRoles: actor.roles,
      })
      res.json(preferences)
    },
  )
  router.get(
    '/notifications/attention',
    accessGuard(verifier, authorize, 'notification_attention'),
    async (req, res) => {
      res.json(await store.attention(parseInput(cursorQuery, req.query).cursor))
    },
  )
  return router
}
