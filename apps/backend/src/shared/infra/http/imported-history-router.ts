import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageFiles } from '../../../application/use-cases/manage-files'
import type { ManageImportedHistory } from '../../../application/use-cases/manage-imported-history'
import {
  importedHistoryAddendumBody,
  importedHistoryCheckBody,
  importedHistoryId,
  importedHistoryPatient,
} from './contracts/imported-history'
import { parseImportedHistoryMultipart } from './imported-history-multipart'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createImportedHistoryRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageImportedHistory,
  files: ManageFiles,
  maxBytes: number,
) {
  const router = Router()
  router.post(
    '/clinical/records/:patientId/imported-history',
    accessGuard(tokens, authorize, 'import_patients'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const actor = principalOf(res),
        context = auditContext(req, res),
        patientId = parseInput(importedHistoryPatient, req.params).patientId
      const uploaded = await parseImportedHistoryMultipart(
        req,
        actor,
        patientId,
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
    '/clinical/imported-history/:id',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.detail(
          principalOf(res),
          parseInput(importedHistoryId, req.params).id,
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/clinical/imported-history/:id/check',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      parseInput(importedHistoryCheckBody, req.body)
      res.json(
        await service.check(
          principalOf(res),
          parseInput(importedHistoryId, req.params).id,
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/clinical/imported-history/:id/addenda',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res
        .status(201)
        .json(
          await service.addendum(
            principalOf(res),
            parseInput(importedHistoryId, req.params).id,
            parseInput(importedHistoryAddendumBody, req.body),
            auditContext(req, res),
          ),
        )
    },
  )
  return router
}
