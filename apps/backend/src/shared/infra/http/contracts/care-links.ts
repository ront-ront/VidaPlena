import { z } from 'zod'
export const careLinkQuery = z.object({
  patientId: z.uuid().optional(),
  status: z.enum(['active', 'scheduled', 'expired', 'revoked']).optional(),
  cursor: z.uuid().optional(),
})
export const shareCareLinkBody = z
  .object({
    patientId: z.uuid(),
    targetProfessionalId: z.uuid(),
    reason: z.string().trim().min(1).max(1000),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .strict()
export const substituteCareLinkBody = shareCareLinkBody.extend({
  startsAt: z.iso.datetime({ offset: true }),
})
export const careLinkResponse = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  professionalId: z.uuid(),
  source: z.enum(['appointment', 'shared_case', 'substitution']),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: z.enum(['active', 'scheduled', 'expired', 'revoked']),
})
export const careLinkListResponse = z.object({
  items: z.array(careLinkResponse),
  nextCursor: z.uuid().nullable(),
})
