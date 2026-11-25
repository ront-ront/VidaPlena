import { z } from 'zod'
import { evolutionTextFields } from '../../../../application/ports/evolution-drafts'
import { evolutionDraftResponse } from './evolution-drafts'
export const finalizeEvolutionBody = z
  .object({ expectedDraftVersion: z.number().int().positive() })
  .strict()
export const evolutionPolicyResponse = z.object({
  requiredFields: z.array(z.enum(evolutionTextFields)),
})
export const finalizeEvolutionResponse = z.object({
  evolutionId: z.uuid(),
  status: z.literal('finalized'),
  finalizedAt: z.iso.datetime(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  integrityVersion: z.literal(1),
  legalSignatureStatus: z.literal('not_provided'),
})
export const addendumBody = z
  .object({
    reason: z.string().trim().min(1).max(1000),
    correctionText: z
      .string()
      .max(20000)
      .refine((value) => value.trim().length > 0),
  })
  .strict()
const author = z.object({ id: z.uuid(), name: z.string() })
export const addendumResponse = addendumBody.extend({
  addendumId: z.uuid(),
  originalEvolutionId: z.uuid(),
  authorProfessionalId: z.uuid(),
  author,
  createdAt: z.iso.datetime(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
})
export const finalizedEvolutionResponse = evolutionDraftResponse
  .omit({ status: true })
  .extend({
    status: z.literal('finalized'),
    author,
    finalizedAt: z.iso.datetime(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    integrityVersion: z.literal(1),
    attachments: z.array(
      z.object({
        id: z.uuid(),
        contentType: z.string(),
        size: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        scanStatus: z.string(),
      }),
    ),
    addenda: z.array(addendumResponse),
    legalSignatureStatus: z.literal('not_provided'),
  })
export const evolutionReadResponse = z.union([
  evolutionDraftResponse,
  finalizedEvolutionResponse,
])
export const authoredEvolutionQuery = z
  .object({
    patientId: z.uuid().toLowerCase(),
    cursor: z.uuid().toLowerCase().optional(),
  })
  .strict()
export const authoredEvolutionResponse = z.object({
  items: z.array(
    z.object({
      evolutionId: z.uuid(),
      encounterId: z.uuid(),
      patientId: z.uuid(),
      finalizedAt: z.iso.datetime(),
      summary: z.string(),
    }),
  ),
  nextCursor: z.uuid().nullable(),
})
