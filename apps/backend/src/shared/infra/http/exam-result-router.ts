import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageExamResults } from '../../../application/use-cases/manage-exam-results'
import type { ManageFiles } from '../../../application/use-cases/manage-files'
import {
  examResultId,
  examResultPatient,
  examResultQuery,
} from './contracts/exam-results'
import { parseExamResultMultipart } from './exam-result-multipart'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createExamResultRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageExamResults,
  files: ManageFiles,
  maxBytes: number,
) {
  const router = Router()
  router.post(
    '/clinical/exam-results',
    accessGuard(tokens, authorize, 'session'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const actor = principalOf(res),
        context = auditContext(req, res)
      const uploaded = await parseExamResultMultipart(
        req,
        actor,
        service,
        files,
        context,
        maxBytes,
      )
      try {
        res
          .status(201)
          .json(
            await service.commit(
              actor,
              uploaded.intent,
              uploaded.fileId,
              context,
            ),
          )
      } catch (error) {
        await files.discardUnlinked(uploaded.fileId)
        throw error
      }
    },
  )
  router.get(
    '/clinical/exam-results/:id',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.detail(
          principalOf(res),
          parseInput(examResultId, req.params).id,
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/clinical/records/:patientId/exam-results',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.list(
          principalOf(res),
          parseInput(examResultPatient, req.params).patientId,
          parseInput(examResultQuery, req.query),
          auditContext(req, res),
        ),
      )
    },
  )
  return router
}
