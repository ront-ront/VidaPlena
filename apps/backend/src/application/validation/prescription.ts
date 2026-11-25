import { z } from 'zod'
import { ApplicationError } from '../errors/application-error'

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => v.isWellFormed(), { message: 'Texto inválido.' })
export const medicationSubstanceSchema = z.object({
  code: z.string(),
  description: z.string(),
})
export const medicationSnapshotSchema = z.object({
  code: z.string(),
  name: z.string(),
  activeSubstances: z.array(medicationSubstanceSchema),
  active: z.boolean(),
  controlled: z.boolean(),
  version: z.string(),
  source: z.string(),
  demo: z.boolean(),
})
const item = z.object({
  medicationCode: text(80).min(1).optional(),
  medicationVersion: text(100).min(1).optional(),
  name: text(300).min(1).optional(),
  activeSubstance: text(300).optional(),
  dose: text(200).min(1),
  route: text(100).min(1),
  frequency: text(200).min(1),
  quantity: text(100).min(1),
  instructions: text(2000).default(''),
})
export const prescriptionInputSchema = z
  .object({
    items: z
      .array(
        item
          .strict()
          .refine((i) => !!i.medicationCode || !!i.name, {
            path: ['name'],
            message: 'Informe medicamento ou nome.',
          })
          .refine((i) => !i.medicationCode || !!i.medicationVersion, {
            path: ['medicationVersion'],
            message: 'Informe a versão do catálogo.',
          }),
      )
      .min(1)
      .max(30),
  })
  .strict()
export const prescriptionStoredSchema = z
  .object({
    items: z
      .array(
        item
          .extend({
            activeSubstance: text(6100).optional(),
            medicationSnapshot: medicationSnapshotSchema.optional(),
            mappingStatus: z.enum(['catalog', 'unverified']).optional(),
          })
          .strict()
          .refine((i) => !!i.medicationCode || !!i.name)
          .refine((i) => !i.medicationCode || !!i.medicationVersion),
      )
      .min(1)
      .max(30),
  })
  .strict()
export type PrescriptionPayload = z.infer<typeof prescriptionStoredSchema>
export function parsePrescription(value: unknown): PrescriptionPayload {
  const parsed = prescriptionStoredSchema.safeParse(value)
  if (!parsed.success)
    throw new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'items',
        reason:
          'Revise medicamento, dose, via, frequência, quantidade e orientações.',
      },
    ])
  return parsed.data
}
