import { z } from 'zod'
import { idSchema } from './m0'

export const subjectRequestBody = z.object({
  patientId: idSchema,
  kind: z.enum(['access', 'correction', 'export', 'erasure']),
  description: z.string().trim().min(1).max(2000).optional(),
})
export const subjectRequestParams = z.object({ id: idSchema })
export const subjectRequestListQuery = z.object({ cursor: idSchema.optional() })
export const subjectQueueQuery = subjectRequestListQuery.extend({
  status: z.enum(['open', 'resolved']).optional(),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})
export const consentMetadataQuery = subjectRequestListQuery.extend({
  patientId: idSchema.optional(),
  action: z.enum(['accept', 'refuse', 'revoke']).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
})
export const subjectResolutionBody = z.object({
  decision: z.enum(['approved', 'denied', 'retained', 'referred']),
  explanation: z.string().trim().min(1).max(2000),
})
export const subjectCreatedResponse = z.object({
  requestId: idSchema,
  status: z.literal('open'),
  dueAt: z.iso.datetime(),
})
export const subjectResolvedResponse = z.object({
  requestId: idSchema,
  status: z.literal('resolved'),
  resolution: z.object({
    decision: z.enum(['approved', 'denied', 'retained', 'referred']),
    explanation: z.string(),
    deleted: z.array(z.string()),
    preserved: z.array(z.string()),
  }),
  exportReady: z.boolean(),
})
