import { z } from 'zod'
import {
  textDocumentCodes,
  textDocumentSchema,
} from '../../../../application/validation/text-document'
export const documentContextQuery = z
  .object({ typeCode: z.enum(textDocumentCodes) })
  .strict()
export const documentContextResponse = z.object({
  patient: z.object({
    id: z.uuid(),
    name: z.string(),
    birthDate: z.iso.date(),
  }),
  recordNumber: z.string(),
  encounter: z.object({
    id: z.uuid(),
    status: z.enum(['in_progress', 'completed']),
    appointmentId: z.uuid(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    appointmentStartsAt: z.iso.datetime(),
    appointmentEndsAt: z.iso.datetime(),
    specialtyId: z.uuid(),
    modality: z.enum(['onsite', 'remote']),
  }),
  signer: z.object({
    id: z.uuid(),
    name: z.string(),
    council: z.object({
      type: z.string(),
      number: z.string(),
      region: z.string(),
    }),
  }),
  type: z.object({
    code: z.enum(textDocumentCodes),
    label: z.string(),
    version: z.number().int().positive(),
    templateVersion: z.string(),
    requiredSignatureLevel: z.enum(['simple', 'qualified']),
  }),
  initialPayload: textDocumentSchema,
})
