import { z } from 'zod'
export const absenceKind = z.enum(['unjustified', 'justified', 'clinic_fault'])
export const absenceBody = z
  .object({
    kind: absenceKind,
    explanation: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
export const absenceCorrectionBody = absenceBody.extend({
  explanation: z.string().trim().min(1).max(1000),
  expectedVersion: z.int().positive(),
})
export const absenceResponse = z.object({
  appointmentId: z.uuid(),
  status: z.literal('no_show'),
  kind: absenceKind,
  absenceVersion: z.int().positive(),
  recordedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime(),
  autoBookingSuspended: z.boolean(),
  suspendedUntil: z.iso.datetime().nullable(),
  unjustifiedCount: z.int().nonnegative(),
})
export const absenceProjection = z.object({
  kind: absenceKind,
  version: z.int().positive(),
  recordedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime(),
})
