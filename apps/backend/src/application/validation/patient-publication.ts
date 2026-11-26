import { z } from 'zod'
import { ApplicationError } from '../errors/application-error'

const common = {
  patientId: z.uuid().toLowerCase(),
  resourceId: z.uuid().toLowerCase(),
  reviewedForPatient: z.literal(true),
}
const text = z
  .string()
  .min(1)
  .max(20000)
  .refine((s) => s.trim().length > 0 && s.isWellFormed())
export const publicationInputSchema = z.discriminatedUnion('visibilityKind', [
  z
    .object({
      ...common,
      visibilityKind: z.literal('document'),
      resourceType: z.literal('ClinicalDocument'),
    })
    .strict(),
  z
    .object({
      ...common,
      visibilityKind: z.literal('result'),
      resourceType: z.literal('ExamResult'),
    })
    .strict(),
  z
    .object({
      ...common,
      visibilityKind: z.literal('orientation'),
      resourceType: z.literal('ClinicalEvolution'),
      projection: z.object({ text }).strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      visibilityKind: z.literal('confirmed_summary'),
      resourceType: z.literal('ClinicalEvolution'),
      projection: z
        .object({
          text,
          diagnosisConfirmed: z.literal(true),
          diagnosisCodes: z
            .array(
              z
                .object({
                  code: z.string().min(1).max(50),
                  version: z.string().min(1).max(100),
                })
                .strict(),
            )
            .min(1)
            .max(50),
        })
        .strict(),
    })
    .strict(),
])
export function parsePublicationInput(input: unknown) {
  const parsed = publicationInputSchema.safeParse(input)
  if (!parsed.success)
    throw new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'publication',
        reason: 'Revise o recurso, a confirmação e os campos da publicação.',
      },
    ])
  return parsed.data
}
