import { z } from 'zod'
import { ApplicationError } from '../errors/application-error'

const substance = z
  .object({
    code: z.string().regex(/^DEV-SUB-[A-Z0-9_-]{1,60}$/),
    description: z.string().trim().min(1).max(300),
  })
  .strict()
export const medicationDatasetSchema = z
  .object({
    version: z.string().trim().min(1).max(100),
    source: z.string().trim().min(1).max(500),
    license: z.string().trim().min(1).max(500),
    demo: z.literal(true),
    entries: z
      .array(
        z
          .object({
            code: z.string().regex(/^DEV-MED-[A-Z0-9_-]{1,60}$/),
            name: z.string().trim().min(1).max(300),
            activeSubstances: z
              .array(substance)
              .min(1)
              .max(20)
              .refine(
                (items) =>
                  new Set(items.map((i) => i.code)).size === items.length,
              ),
            active: z.boolean(),
            controlled: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(1000)
      .refine(
        (items) => new Set(items.map((i) => i.code)).size === items.length,
      ),
  })
  .strict()
export function parseMedicationDataset(value: unknown) {
  const parsed = medicationDatasetSchema.safeParse(value)
  if (!parsed.success)
    throw new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'catalog',
        reason:
          'Informe um catálogo demonstrativo versionado com códigos e substâncias únicos.',
      },
    ])
  return parsed.data
}
