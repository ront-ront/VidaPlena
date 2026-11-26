import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManagePatientPublications } from '../../../application/use-cases/manage-patient-publications'
import {
  patientHistoryQuery,
  publicationId,
  publicationInputSchema,
  publicationListQuery,
  publicationPatient,
  publicationRevoke,
} from './contracts/patient-publications'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createPatientPublicationRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManagePatientPublications,
) {
  const router = Router(),
    clinical = accessGuard(tokens, authorize, 'clinical_actor'),
    session = accessGuard(tokens, authorize, 'session')
  router.post('/clinical/publications', clinical, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res
      .status(201)
      .json(
        await service.publish(
          principalOf(res),
          parseInput(publicationInputSchema, req.body),
          auditContext(req, res),
        ),
      )
  })
  router.post(
    '/clinical/publications/:id/revoke',
    clinical,
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.revoke(
          principalOf(res),
          parseInput(publicationId, req.params).id,
          parseInput(publicationRevoke, req.body).reason,
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/clinical/records/:patientId/publications',
    clinical,
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.clinicalList(
          principalOf(res),
          parseInput(publicationPatient, req.params).patientId,
          parseInput(publicationListQuery, req.query),
          auditContext(req, res),
        ),
      )
    },
  )
  router.get('/me/clinical-history', session, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const { patientId, ...query } = parseInput(patientHistoryQuery, req.query)
    res.json(
      await service.history(
        principalOf(res),
        patientId,
        query,
        auditContext(req, res),
      ),
    )
  })
  router.get('/me/clinical-documents/:id', session, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(
      await service.detail(
        principalOf(res),
        parseInput(publicationId, req.params).id,
        auditContext(req, res),
      ),
    )
  })
  return router
}
