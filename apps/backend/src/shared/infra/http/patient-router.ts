import { Router } from 'express'
import { z } from 'zod'
import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditWriter } from '../../../application/ports/audit-writer'
import type { AccessTokens } from '../../../application/ports/authentication'
import type { PatientRegistrationStore } from '../../../application/ports/patient-registration'
import type { Authorize } from '../../../application/use-cases/authorize'
import { normalizeCpf } from '../../../domain/rules/patient-identity'
import { idSchema } from './contracts/m0'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createPatientRouter(
  tokens: AccessTokens,
  authorize: Authorize,
  store: PatientRegistrationStore,
  audit: AuditWriter,
) {
  const router = Router()
  router.get(
    '/onsite-guardians',
    accessGuard(tokens, authorize, 'onsite_registration'),
    async (req, res) => {
      const { identifier } = parseInput(
        z.object({ identifier: z.string().trim().min(3).max(255) }),
        req.query,
      )
      const cpf = normalizeCpf(identifier)
      const email = z.email().safeParse(identifier.trim().toLowerCase())
      if (!cpf && !email.success)
        throw new ApplicationError('VALIDATION_ERROR', [
          { field: 'identifier', reason: 'Informe CPF ou e-mail completo.' },
        ])
      const actor = principalOf(res)
      const guardian = await store.findGuardian(
        cpf ? { cpf } : { email: email.data },
      )
      await audit.append({
        ...auditContext(req, res),
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'patient.guardian_lookup',
        resourceType: 'GuardianCandidate',
        resourceId: actor.userId,
        metadata: { found: Boolean(guardian) },
      })
      if (!guardian) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      res.setHeader('Cache-Control', 'no-store')
      res.json(guardian)
    },
  )
  router.get(
    '/onsite-patients',
    accessGuard(tokens, authorize, 'onsite_registration'),
    async (req, res) => {
      const { cpf: input } = parseInput(
        z.object({ cpf: z.string().trim().min(11).max(14) }),
        req.query,
      )
      const cpf = normalizeCpf(input)
      if (!cpf)
        throw new ApplicationError('VALIDATION_ERROR', [
          { field: 'cpf', reason: 'Informe um CPF válido.' },
        ])
      const actor = principalOf(res)
      const patient = await store.findPatient(cpf)
      await audit.append({
        ...auditContext(req, res),
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'patient.onsite_lookup',
        resourceType: 'PatientCandidate',
        resourceId: actor.userId,
        metadata: { found: Boolean(patient) },
      })
      if (!patient) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      res.setHeader('Cache-Control', 'no-store')
      res.json(patient)
    },
  )
  router.get(
    '/patients/:id/onsite-consents',
    accessGuard(tokens, authorize, 'onsite_registration'),
    async (req, res) => {
      const { id } = parseInput(z.object({ id: idSchema }), req.params)
      const actor = principalOf(res)
      const items = await store.onsiteConsents(id)
      await audit.append({
        ...auditContext(req, res),
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'consent.onsite_history_viewed',
        resourceType: 'PatientProfile',
        resourceId: id,
        subjectPatientId: items ? id : undefined,
        metadata: { found: Boolean(items), count: items?.length ?? 0 },
      })
      if (!items) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      res.setHeader('Cache-Control', 'no-store')
      res.json({ items })
    },
  )
  router.get(
    '/me/dependents',
    accessGuard(tokens, authorize, 'session'),
    async (req, res) => {
      const actor = principalOf(res)
      const items = await store.dependents(actor.userId)
      await audit.append({
        ...auditContext(req, res),
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'patient.dependents_viewed',
        resourceType: 'GuardianLinkCollection',
        resourceId: actor.userId,
        metadata: { count: items.length },
      })
      res.json({ items })
    },
  )
  return router
}
