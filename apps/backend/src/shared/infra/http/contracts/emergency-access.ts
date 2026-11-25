import { z } from 'zod'
export const emergencyGrantBody = z
  .object({
    patientId: z.uuid(),
    justification: z.string().trim().min(1).max(1000),
  })
  .strict()
export const emergencyId = z.object({ id: z.uuid() })
export const emergencyQuery = z
  .object({
    status: z.enum(['pending', 'reviewed']).optional(),
    cursor: z.uuid().optional(),
  })
  .strict()
export const emergencyReviewBody = z
  .object({
    outcome: z.enum(['approved', 'requires_follow_up', 'rejected']),
    notes: z.string().trim().min(1).max(1000),
  })
  .strict()
export const emergencyCreated = z.object({
  grantId: z.uuid(),
  expiresAt: z.iso.datetime(),
})
export const emergencySummarySchema = emergencyCreated.extend({
  patientId: z.uuid(),
  professionalId: z.uuid(),
  grantedAt: z.iso.datetime(),
  status: z.enum(['active', 'expired', 'revoked']),
  reviewed: z.boolean(),
})
export const emergencyReviewSchema = emergencyReviewBody.extend({
  id: z.uuid(),
  reviewerUserId: z.uuid(),
  reviewedAt: z.iso.datetime(),
})
export const emergencyDetailSchema = emergencySummarySchema.extend({
  justification: z.string(),
  review: emergencyReviewSchema.nullable(),
})
export const emergencyQueueSchema = z.object({
  items: z.array(emergencySummarySchema),
  nextCursor: z.uuid().nullable(),
})
