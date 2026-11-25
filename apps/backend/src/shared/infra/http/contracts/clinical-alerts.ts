import { z } from 'zod'
import {
  alertVerificationStates,
  clinicalAlertKinds,
} from '../../../../application/ports/clinical-alerts'
export const alertParams = z.object({ id: z.uuid().toLowerCase() })
export const alertPatientParams = z.object({
  patientId: z.uuid().toLowerCase(),
})
export const alertQuery = z
  .object({
    active: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    cursor: z.uuid().toLowerCase().optional(),
  })
  .strict()
export const alertBody = z
  .object({
    kind: z.enum(clinicalAlertKinds),
    term: z.string().trim().min(1).max(500),
    substanceCode: z.string().trim().min(1).max(80).optional(),
    verificationState: z.enum(alertVerificationStates),
  })
  .strict()
export const alertConfirmBody = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict()
export const alertDeactivateBody = alertConfirmBody.extend({
  reason: z.string().trim().min(1).max(1000),
})
const author = z.object({ id: z.uuid(), name: z.string() })
export const alertSummaryResponse = alertBody
  .omit({ substanceCode: true })
  .extend({
    id: z.uuid(),
    patientId: z.uuid(),
    substanceCode: z.string().nullable(),
    active: z.boolean(),
    version: z.number().int().positive(),
    author,
    date: z.iso.datetime(),
  })
export const alertResponse = alertSummaryResponse.extend({
  history: z
    .array(
      z.object({
        id: z.uuid(),
        kind: z.enum(['created', 'confirmed', 'deactivated']),
        version: z.number().int().positive(),
        author,
        date: z.iso.datetime(),
        reason: z.string().nullable(),
      }),
    )
    .optional(),
})
export const alertPageResponse = z.object({
  items: z.array(alertResponse),
  nextCursor: z.uuid().nullable(),
})
