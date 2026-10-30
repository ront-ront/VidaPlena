import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { ApplicationError } from '../../../application/errors/application-error'
import type {
  AccessTokens,
  AuthStore,
} from '../../../application/ports/authentication'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageConsent } from '../../../application/use-cases/manage-consent'
import type { ManageFiles } from '../../../application/use-cases/manage-files'
import type { AppConfig } from '../../config/environment'
import {
  consentActionBody,
  currentConsentQuery,
  onsiteConsentData,
  onsiteRegistrationData,
  publishConsentDocumentBody,
  registrationBody,
  revokeConsentBody,
} from './contracts/consent'
import { idSchema } from './contracts/m0'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseOnsiteEvidence } from './onsite-multipart'
import { parseInput } from './parse-input'

export function createConsentRouter(
  config: AppConfig,
  tokens: AccessTokens,
  authorize: Authorize,
  authStore: AuthStore,
  service: ManageConsent,
  files: ManageFiles,
  attachmentMaxBytes: number,
) {
  const router = Router()
  const session = accessGuard(tokens, authorize, 'consent_management')
  const patientSession = accessGuard(
    tokens,
    authorize,
    'consent_patient',
    (req) => parseInput(z.object({ patientId: idSchema }), req.body).patientId,
  )
  router.get('/consent-documents/current', async (req, res) => {
    parseInput(currentConsentQuery, req.query)
    const document = await service.current()
    if (!document) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    res.setHeader('Cache-Control', 'no-store')
    res.json(document)
  })
  router.post(
    '/admin/consent-documents',
    accessGuard(tokens, authorize, 'admin_users'),
    async (req, res) => {
      const input = parseInput(publishConsentDocumentBody, req.body)
      const result = await service.publish(
        principalOf(res).userId,
        {
          version: input.version,
          bodyReference: input.bodyReference,
          effectiveAt: new Date(input.effectiveAt),
        },
        auditContext(req, res),
      )
      res.status(201).json(result)
    },
  )
  router.post('/patient-registrations', async (req, res) => {
    const origin = req.get('origin')
    if (!origin || !config.corsOrigins.includes(origin))
      throw new ApplicationError('FORBIDDEN')
    const rateKey = createHash('sha256')
      .update(`registration:${req.ip ?? 'unknown'}`)
      .digest('hex')
    if (
      !(await authStore.rateLimit(
        rateKey,
        new Date(),
        config.authRequestsPerMinute,
      ))
    )
      throw new ApplicationError('RATE_LIMITED')
    const input = parseInput(registrationBody, req.body)
    let guardianProof: { userId: string; sessionId: string } | undefined
    if (input.mode === 'dependent') {
      const header = req.get('authorization')
      if (!header?.startsWith('Bearer '))
        throw new ApplicationError('UNAUTHENTICATED')
      guardianProof = (await tokens.verify(header.slice(7))) ?? undefined
      if (!guardianProof) throw new ApplicationError('UNAUTHENTICATED')
      await authorize.execute(guardianProof, 'session', auditContext(req, res))
    }
    const result = await service.registerDigital({
      mode: input.mode,
      patient: input.patient,
      password: input.password,
      guardianRelationship: input.guardianRelationship,
      versionId: input.consent.versionId,
      accepted: input.consent.accepted,
      guardianProof,
      context: auditContext(req, res),
    })
    res.status(201).json(result)
  })
  router.post(
    '/patients',
    accessGuard(tokens, authorize, 'onsite_registration'),
    async (req, res) => {
      const actor = principalOf(res)
      const context = auditContext(req, res)
      const eventId = randomUUID()
      const evidence = await parseOnsiteEvidence(
        req,
        actor,
        files,
        context,
        eventId,
        attachmentMaxBytes,
      )
      try {
        const input = parseInput(onsiteRegistrationData, evidence.data)
        const result = await service.registerOnsite({
          actorId: actor.userId,
          patient: input.patient,
          guardianUserId: input.guardianUserId,
          guardianRelationship: input.guardianRelationship,
          versionId: input.onsiteConsent.versionId,
          consentingPersonName: input.onsiteConsent.consentingPersonName,
          consentingRelationship: input.onsiteConsent.consentingRelationship,
          signedFileId: evidence.fileId,
          eventId,
          context,
        })
        res.status(201).json(result)
      } catch (error) {
        await files.discardUnlinked(evidence.fileId)
        throw error
      }
    },
  )
  router.post(
    '/patients/:id/onsite-consents',
    accessGuard(tokens, authorize, 'onsite_registration'),
    async (req, res) => {
      const actor = principalOf(res)
      const context = auditContext(req, res)
      const { id } = parseInput(z.object({ id: idSchema }), req.params)
      const eventId = randomUUID()
      const evidence = await parseOnsiteEvidence(
        req,
        actor,
        files,
        context,
        eventId,
        attachmentMaxBytes,
      )
      try {
        const input = parseInput(onsiteConsentData, evidence.data)
        res.status(201).json(
          await service.recordOnsiteExisting({
            actorId: actor.userId,
            patientId: id,
            guardianUserId: input.guardianUserId,
            versionId: input.versionId,
            consentingPersonName: input.consentingPersonName,
            consentingRelationship: input.consentingRelationship,
            signedFileId: evidence.fileId,
            eventId,
            context,
          }),
        )
      } catch (error) {
        await files.discardUnlinked(evidence.fileId)
        throw error
      }
    },
  )
  router.get('/me/consents', session, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      items: await service.history(principalOf(res), auditContext(req, res)),
    })
  })
  router.post('/me/consents', patientSession, async (req, res) => {
    const input = parseInput(consentActionBody, req.body)
    res
      .status(201)
      .json(
        await service.recordPortal(
          principalOf(res),
          input.patientId,
          input.versionId,
          input.action,
          auditContext(req, res),
        ),
      )
  })
  router.post('/me/consents/revoke', patientSession, async (req, res) => {
    const input = parseInput(revokeConsentBody, req.body)
    res
      .status(201)
      .json(
        await service.recordPortal(
          principalOf(res),
          input.patientId,
          input.versionId,
          'revoke',
          auditContext(req, res),
        ),
      )
  })
  return router
}
