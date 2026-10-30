import { pipeline } from 'node:stream/promises'
import { Router } from 'express'
import { z } from 'zod'
import type { AccessTokens } from '../../../application/ports/authentication'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageFiles } from '../../../application/use-cases/manage-files'
import { idSchema } from './contracts/m0'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createFileRouter(
  tokens: AccessTokens,
  authorize: Authorize,
  service: ManageFiles,
) {
  const router = Router()
  const authenticated = accessGuard(tokens, authorize, 'session')
  router.post('/files/:id/download-link', authenticated, async (req, res) => {
    const { id } = parseInput(z.object({ id: idSchema }), req.params)
    res.setHeader('Cache-Control', 'no-store')
    res.json(
      await service.downloadLink(principalOf(res), id, auditContext(req, res)),
    )
  })
  router.get('/file-download/:token', authenticated, async (req, res) => {
    const { token } = parseInput(
      z.object({ token: z.string().min(40).max(1024) }),
      req.params,
    )
    const file = await service.download(
      principalOf(res),
      token,
      auditContext(req, res),
    )
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Length', String(file.size))
    res.setHeader('Content-Disposition', 'attachment; filename="arquivo"')
    await pipeline(file.stream, res)
  })
  return router
}
