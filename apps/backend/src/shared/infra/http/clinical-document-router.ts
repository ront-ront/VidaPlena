import { createHash } from 'node:crypto'
import { Router } from 'express'
import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditWriter } from '../../../application/ports/audit-writer'
import type { AuthStore } from '../../../application/ports/authentication'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageClinicalDocuments } from '../../../application/use-cases/manage-clinical-documents'
import type { ManageDocumentTypes } from '../../../application/use-cases/manage-document-types'
import {
  documentIssueBody,
  documentParams,
  documentTypeChange,
  documentTypeQuery,
  documentVerificationParams,
  documentVoidBody,
} from './contracts/clinical-documents'
import {
  documentDraftBody,
  documentDraftPatch,
  documentReuseBody,
  parsePublicDocumentPayload,
} from './contracts/prescriptions'
import { documentContextQuery } from './contracts/text-documents'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createClinicalDocumentRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  types: ManageDocumentTypes,
  documents: ManageClinicalDocuments,
  authStore: AuthStore,
  audit: AuditWriter,
  verifyLimit: number,
) {
  const router = Router()
  router.get(
    '/clinical/encounters/:id/document-context',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await documents.context(
          principalOf(res),
          parseInput(documentParams, req.params).id,
          parseInput(documentContextQuery, req.query).typeCode,
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/clinical/encounters/:id/documents/drafts',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const body = parseInput(documentDraftBody, req.body)
      res
        .status(201)
        .json(
          await documents.createDraft(
            principalOf(res),
            parseInput(documentParams, req.params).id,
            body.typeCode,
            parsePublicDocumentPayload(body.typeCode, body.payload),
            auditContext(req, res),
          ),
        )
    },
  )
  router.post(
    '/clinical/encounters/:id/documents/reuse',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res
        .status(201)
        .json(
          await documents.reuse(
            principalOf(res),
            parseInput(documentParams, req.params).id,
            parseInput(documentReuseBody, req.body).sourceDocumentId,
            auditContext(req, res),
          ),
        )
    },
  )
  router.patch(
    '/clinical/documents/:id/draft',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const id = parseInput(documentParams, req.params).id,
        body = parseInput(documentDraftPatch, req.body),
        current = await documents.get(
          principalOf(res),
          id,
          auditContext(req, res),
        )
      res.json(
        await documents.patchDraft(
          principalOf(res),
          id,
          parsePublicDocumentPayload(current.typeCode, body.payload),
          body.expectedVersion,
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/clinical/documents/:id/allergy-check',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await documents.reviewForIssue(
          principalOf(res),
          parseInput(documentParams, req.params).id,
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/document-types',
    accessGuard(tokens, authorize, 'document_types'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await types.list(
          principalOf(res),
          parseInput(documentTypeQuery, req.query).active,
          auditContext(req, res),
        ),
      )
    },
  )
  router.put(
    '/admin/document-types/:id',
    accessGuard(tokens, authorize, 'admin_users'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await types.change(
          principalOf(res),
          parseInput(documentParams, req.params).id,
          parseInput(documentTypeChange, req.body),
          auditContext(req, res),
        ),
      )
    },
  )
  router.get('/documents/verify/:code', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const key = createHash('sha256')
      .update(`document_verify:${req.ip ?? 'unknown'}`)
      .digest('hex')
    if (!(await authStore.rateLimit(key, new Date(), verifyLimit))) {
      await audit.append({
        ...auditContext(req, res),
        action: 'document.verification_limited',
        resourceType: 'ClinicalDocument',
        resourceId: key,
        authorizationBasis: 'public_rate_limit',
      })
      throw new ApplicationError('RATE_LIMITED')
    }
    res.json(
      await documents.verify(
        parseInput(documentVerificationParams, req.params).code,
        auditContext(req, res),
      ),
    )
  })
  router.get(
    '/clinical/documents/:id',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await documents.get(
          principalOf(res),
          parseInput(documentParams, req.params).id,
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/clinical/documents/:id/issue',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await documents.issue(
          principalOf(res),
          parseInput(documentParams, req.params).id,
          parseInput(documentIssueBody, req.body),
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/clinical/documents/:id/void',
    accessGuard(tokens, authorize, 'clinical_actor'),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await documents.void(
          principalOf(res),
          parseInput(documentParams, req.params).id,
          parseInput(documentVoidBody, req.body),
          auditContext(req, res),
        ),
      )
    },
  )
  return router
}
