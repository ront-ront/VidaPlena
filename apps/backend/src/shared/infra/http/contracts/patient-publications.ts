import { z } from 'zod'

export { publicationInputSchema } from '../../../../application/validation/patient-publication'
export const publicationId = z.object({ id: z.uuid().toLowerCase() })
export const publicationPatient = z.object({
  patientId: z.uuid().toLowerCase(),
})
export const publicationRevoke = z
  .object({ reason: z.string().trim().min(1).max(1000) })
  .strict()
export const publicationListQuery = z
  .object({
    cursor: z.uuid().toLowerCase().optional(),
    state: z.enum(['active', 'revoked', 'all']).default('active'),
  })
  .strict()
export const patientHistoryQuery = z
  .object({
    patientId: z.uuid().toLowerCase(),
    cursor: z.uuid().toLowerCase().optional(),
    specialtyId: z.uuid().toLowerCase().optional(),
    type: z
      .enum([
        'prescription',
        'exam_order',
        'document',
        'exam_result',
        'orientation',
        'confirmed_summary',
      ])
      .optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || Date.parse(v.to) > Date.parse(v.from), {
    path: ['to'],
    message: 'O fim deve ser posterior ao início.',
  })
export const publicationReceipt = z.object({
  publishedByProfessionalId: z.uuid(),
  publicationId: z.uuid(),
  patientId: z.uuid(),
  resourceType: z.enum(['ClinicalDocument', 'ExamResult', 'ClinicalEvolution']),
  resourceId: z.uuid(),
  visibilityKind: z.enum([
    'document',
    'result',
    'orientation',
    'confirmed_summary',
  ]),
  publishedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
})
const projection = z.object({
  text: z.string(),
  diagnosisConfirmed: z.literal(true).optional(),
  diagnoses: z
    .array(
      z.object({
        code: z.string(),
        description: z.string(),
        version: z.string(),
        source: z.string(),
        demo: z.boolean(),
      }),
    )
    .optional(),
})
export const publicationListResponse = z.object({
  items: z.array(
    publicationReceipt.extend({ projection: projection.nullable() }),
  ),
  nextCursor: z.uuid().nullable(),
})
export const publishedDocumentResponse = z.object({
  publicationId: z.uuid(),
  patientId: z.uuid(),
  resourceType: z.enum(['ClinicalDocument', 'ExamResult']),
  resourceId: z.uuid(),
  type: z.string(),
  label: z.string(),
  publishedAt: z.iso.datetime(),
  date: z.iso.datetime(),
  signatureStatus: z.enum([
    'issued_dev',
    'issued_valid',
    'voided',
    'not_signed',
  ]),
  legalValidity: z.boolean(),
  seal: z.string().nullable(),
  files: z.array(
    z.object({
      id: z.uuid(),
      contentType: z.string(),
      size: z.number(),
      sha256: z.string(),
    }),
  ),
  verificationCode: z.string().nullable().optional(),
  origin: z.enum(['ordered', 'external']).optional(),
  voidedAt: z.iso.datetime().nullable().optional(),
})
const named = z.object({ id: z.uuid(), name: z.string() })
export const patientHistoryResponse = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      type: z.string(),
      date: z.iso.datetime(),
      publishedAt: z.iso.datetime(),
      professional: named,
      specialty: named.nullable(),
      modality: z.enum(['onsite', 'remote']).nullable(),
      summary: z.string(),
      orientation: z.string().optional(),
      confirmedSummary: projection.nullable().optional(),
      publishedDocument: publishedDocumentResponse.optional(),
      importedOrigin: z
        .object({
          origin: z.string(),
          importedAt: z.iso.datetime(),
          importedBy: z.uuid(),
        })
        .optional(),
    }),
  ),
  nextCursor: z.uuid().nullable(),
})
