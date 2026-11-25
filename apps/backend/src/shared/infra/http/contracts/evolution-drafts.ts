import { z } from 'zod'
import { terminologySelection, terminologySnapshot } from './terminologies'
export const evolutionId = z.object({ id: z.uuid().toLowerCase() })
const diagnosisSelections = z
  .array(terminologySelection)
  .max(50)
  .refine((items) => new Set(items.map((i) => i.code)).size === items.length)
export const evolutionCreateBody = z
  .object({
    complaint: z.string().max(20000).optional(),
    history: z.string().max(20000).optional(),
    physicalExam: z.string().max(20000).optional(),
    diagnosticHypotheses: z.string().max(20000).optional(),
    conduct: z.string().max(20000).optional(),
    diagnosisCodes: diagnosisSelections.optional(),
  })
  .strict()
export const evolutionPatchBody = evolutionCreateBody
  .extend({ expectedDraftVersion: z.number().int().positive() })
  .refine((value) => Object.keys(value).length > 1, {
    message: 'Informe ao menos um campo clínico.',
  })
export const evolutionCommandHeader = z.object({
  'idempotency-key': z.uuid().toLowerCase(),
})
export const evolutionSavedResponse = z.object({
  evolutionId: z.uuid().toLowerCase(),
  draftVersion: z.number().int().positive(),
  savedAt: z.iso.datetime(),
  status: z.literal('draft'),
})
export const evolutionDraftResponse = evolutionSavedResponse.extend({
  encounterId: z.uuid().toLowerCase(),
  patientId: z.uuid().toLowerCase(),
  authorProfessionalId: z.uuid().toLowerCase(),
  complaint: z.string(),
  history: z.string(),
  physicalExam: z.string(),
  diagnosticHypotheses: z.string(),
  conduct: z.string(),
  diagnosisCodes: z.array(terminologySnapshot),
})
export const evolutionLookupResponse = z.object({
  evolution: evolutionDraftResponse.nullable(),
})
