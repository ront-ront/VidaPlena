import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ImportAppointments } from '../../../application/use-cases/import-appointments'
import type { ImportPatients } from '../../../application/use-cases/import-patients'
import { idempotencyHeader } from './contracts/appointments'
import {
  importConfirmBody,
  importParams,
  importReadParams,
} from './contracts/imports'
import { parseImportMultipart } from './import-multipart'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'
export function createImportRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ImportPatients,
  appointments: ImportAppointments,
  maxBytes: number,
) {
  const router = Router()
  router.post(
    '/imports/patients/preview',
    accessGuard(tokens, authorize, 'import_patients'),
    async (req, res) => {
      const { file, sourceSystem } = await parseImportMultipart(req, maxBytes)
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.preview(
          principalOf(res),
          sourceSystem,
          file,
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/imports/patients/:batchId/confirm',
    accessGuard(tokens, authorize, 'import_patients'),
    async (req, res) => {
      const { batchId } = parseInput(importParams, req.params),
        { expectedFileHash } = parseInput(importConfirmBody, req.body),
        { 'idempotency-key': key } = parseInput(idempotencyHeader, req.headers)
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await service.confirm(
          principalOf(res),
          batchId,
          expectedFileHash,
          key,
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/imports/appointments/preview',
    accessGuard(tokens, authorize, 'import_patients'),
    async (req, res) => {
      const { file, sourceSystem } = await parseImportMultipart(req, maxBytes)
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await appointments.preview(
          principalOf(res),
          sourceSystem,
          file,
          auditContext(req, res),
        ),
      )
    },
  )
  router.post(
    '/imports/appointments/:batchId/confirm',
    accessGuard(tokens, authorize, 'import_patients'),
    async (req, res) => {
      const { batchId } = parseInput(importParams, req.params),
        { expectedFileHash } = parseInput(importConfirmBody, req.body),
        { 'idempotency-key': key } = parseInput(idempotencyHeader, req.headers)
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        await appointments.confirm(
          principalOf(res),
          batchId,
          expectedFileHash,
          key,
          auditContext(req, res),
        ),
      )
    },
  )
  router.get(
    '/imports/:id',
    accessGuard(tokens, authorize, 'import_patients'),
    async (req, res) => {
      const { id } = parseInput(importReadParams, req.params)
      res.setHeader('Cache-Control', 'no-store')
      const kind = await appointments.kind(
        principalOf(res),
        id,
        auditContext(req, res),
      )
      const reader = kind === 'patients' ? service : appointments
      res.json(await reader.read(principalOf(res), id, auditContext(req, res)))
    },
  )
  return router
}
