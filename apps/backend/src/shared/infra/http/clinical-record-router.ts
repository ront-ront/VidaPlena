import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ReadClinicalRecord } from '../../../application/use-cases/read-clinical-record'
import {
  openEncounterBody,
  recordParams,
  timelineQuery,
} from './contracts/clinical-records'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createClinicalRecordRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ReadClinicalRecord,
) {
  const router = Router()
  router.get(
    '/clinical/records/:patientId',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.header(
          principalOf(res),
          parseInput(recordParams, req.params).patientId,
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/clinical/records/:patientId/timeline',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.timeline(
          principalOf(res),
          parseInput(recordParams, req.params).patientId,
          parseInput(timelineQuery, req.query),
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/clinical/encounters',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const { created, encounter } = await service.openEncounter(
        principalOf(res),
        parseInput(openEncounterBody, req.body).appointmentId,
        auditContext(req, res),
      )
      res.status(created ? 201 : 200).json({ encounter })
    },
  )
  return router
}
