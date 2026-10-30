import { Router } from 'express'
import type { AccessTokens } from '../../../application/ports/authentication'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageSubjectRequests } from '../../../application/use-cases/manage-subject-requests'
import {
  consentMetadataQuery,
  subjectQueueQuery,
  subjectRequestBody,
  subjectRequestListQuery,
  subjectRequestParams,
  subjectResolutionBody,
} from './contracts/subject-requests'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createSubjectRequestRouter(
  tokens: AccessTokens,
  authorize: Authorize,
  service: ManageSubjectRequests,
) {
  const router = Router()
  const session = accessGuard(tokens, authorize, 'session')
  const own = accessGuard(
    tokens,
    authorize,
    'own_patient',
    (req) => parseInput(subjectRequestBody, req.body).patientId,
  )
  const queue = accessGuard(tokens, authorize, 'privacy_queue')
  const consents = accessGuard(tokens, authorize, 'privacy_consents')

  router.post('/me/subject-requests', own, async (req, res) => {
    const input = parseInput(subjectRequestBody, req.body)
    res
      .status(201)
      .json(
        await service.create(
          principalOf(res),
          input.patientId,
          input.kind,
          input.description,
          auditContext(req, res),
        ),
      )
  })
  router.get('/me/subject-requests', session, async (req, res) => {
    const input = parseInput(subjectRequestListQuery, req.query)
    res.setHeader('Cache-Control', 'no-store')
    res.json(
      await service.own(principalOf(res), auditContext(req, res), input.cursor),
    )
  })
  router.get('/me/subject-requests/:id/export', session, async (req, res) => {
    const { id } = parseInput(subjectRequestParams, req.params)
    const payload = await service.exportFor(
      principalOf(res),
      id,
      auditContext(req, res),
    )
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="subject-export-${id}.json"`,
    )
    res.type('application/json').send(payload)
  })
  router.get('/privacy/subject-requests', queue, async (req, res) => {
    const input = parseInput(subjectQueueQuery, req.query)
    res.setHeader('Cache-Control', 'no-store')
    res.json(
      await service.queue(principalOf(res), input, auditContext(req, res)),
    )
  })
  router.get('/privacy/consents', consents, async (req, res) => {
    const input = parseInput(consentMetadataQuery, req.query)
    res.setHeader('Cache-Control', 'no-store')
    res.json(
      await service.consentMetadata(
        principalOf(res),
        {
          ...input,
          from: input.from ? new Date(input.from) : undefined,
          to: input.to ? new Date(input.to) : undefined,
        },
        auditContext(req, res),
      ),
    )
  })
  router.post(
    '/privacy/subject-requests/:id/resolve',
    queue,
    async (req, res) => {
      const { id } = parseInput(subjectRequestParams, req.params)
      const input = parseInput(subjectResolutionBody, req.body)
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.resolve(
          principalOf(res),
          id,
          input.decision,
          input.explanation,
          auditContext(req, res),
        ),
      )
    },
  )
  return router
}
