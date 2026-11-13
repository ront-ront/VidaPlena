import { z } from 'zod'
import { importSystem } from '../../../../application/use-cases/import-patients'
export const patientImportOriginSchema = z.object({
  sourceSystem: z.string(),
  externalId: z.string(),
  batchId: z.uuid(),
  importedAt: z.iso.datetime(),
  importedBy: z.uuid(),
  historicalStatus: z.literal('undated'),
})
export const appointmentImportOriginSchema = patientImportOriginSchema.extend({
  historicalStatus: z.enum(['undated', 'before_cutoff', 'on_or_after_cutoff']),
})
export const importParams = z.object({ batchId: z.uuid() })
export const importReadParams = z.object({ id: z.uuid() })
export const importConfirmBody = z
  .object({
    expectedFileHash: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/)
      .transform((value) => value.toLowerCase()),
  })
  .strict()
export const importPreviewFields = z.object({
  sourceSystem: importSystem,
  file: z.string().meta({ format: 'binary' }),
})
export const importRowResponse = z.object({
  line: z.int().positive(),
  status: z.enum(['accepted', 'rejected', 'imported', 'existing']),
  errors: z.array(z.string()),
  duplicateOf: z.string().optional(),
  targetId: z.uuid().optional(),
  externalId: z.string().optional(),
  fullName: z.string().optional(),
  cpfMasked: z.string().optional(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  modality: z.enum(['onsite', 'remote']).optional(),
  appointmentStatus: z.enum(['confirmed', 'cancelled', 'completed']).optional(),
})
export const importReport = z.object({
  batchId: z.uuid(),
  kind: z.enum(['patients', 'appointments']),
  sourceSystem: z.string(),
  fileHash: z.string(),
  status: z.enum(['preview', 'invalid', 'processing', 'confirmed']),
  createdAt: z.iso.datetime(),
  createdBy: z.uuid(),
  expiresAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  cutoffDate: z.iso.date().nullable(),
  fileErrors: z.array(z.string()),
  accepted: z.int(),
  rejected: z.int(),
  imported: z.int(),
  existing: z.int(),
  replayed: z.boolean(),
  rows: z.array(importRowResponse),
})
