import { z } from 'zod'
import { ApplicationError } from '../../../../application/errors/application-error'
import { documentTypeCodes } from '../../../../application/ports/clinical-documents'
import { examOrderInputSchema } from '../../../../application/validation/exam-order'
import { prescriptionInputSchema } from '../../../../application/validation/prescription'
import {
  textDocumentCodes,
  textDocumentSchema,
} from '../../../../application/validation/text-document'
import { parseInput } from '../parse-input'
export const documentDraftBody = z
  .object({ typeCode: z.enum(documentTypeCodes), payload: z.unknown() })
  .strict()
export const documentDraftPatch = z
  .object({
    expectedVersion: z.number().int().positive(),
    payload: z.unknown(),
  })
  .strict()
export const documentReuseBody = z
  .object({ sourceDocumentId: z.uuid().toLowerCase() })
  .strict()
export function parsePublicDocumentPayload(typeCode: string, payload: unknown) {
  if (typeCode === 'prescription')
    return parseInput(prescriptionInputSchema, payload)
  if (typeCode === 'exam_order')
    return parseInput(examOrderInputSchema, payload)
  if (textDocumentCodes.some((c) => c === typeCode))
    return parseInput(textDocumentSchema, payload)
  throw new ApplicationError('SERVICE_UNAVAILABLE')
}
export const medicationListResponse = z.object({
  items: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      activeSubstances: z.array(
        z.object({ code: z.string(), description: z.string() }),
      ),
      active: z.boolean(),
      controlled: z.boolean(),
      version: z.string(),
      source: z.string(),
      demo: z.boolean(),
    }),
  ),
  nextCursor: z.uuid().nullable(),
  catalogVersion: z.string().nullable(),
  demo: z.boolean(),
})
export const allergyCheckResponse = z.object({
  documentId: z.uuid(),
  version: z.number().int().positive(),
  allergies: z.array(
    z.object({
      id: z.uuid(),
      term: z.string(),
      verificationState: z.enum(['reported', 'confirmed']),
      version: z.number().int().positive(),
      match: z.enum([
        'matched_substance',
        'unmapped_alert',
        'unmapped_item',
        'no_catalog_match',
      ]),
      requiresAcknowledgement: z.boolean(),
    }),
  ),
  requiredAlertIds: z.array(z.uuid()),
  demo: z.boolean(),
})
