import { z } from 'zod'
import { terminologyKinds } from '../../domain/rules/terminology'
import { ApplicationError } from '../errors/application-error'
export const terminologyCatalogSchema = z
  .object({
    terminology: z.enum(terminologyKinds),
    version: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9._-]+$/),
    source: z.string().trim().min(1).max(500),
    license: z.string().trim().min(1).max(500),
    demo: z.literal(true),
    entries: z
      .array(
        z
          .object({
            code: z
              .string()
              .trim()
              .min(1)
              .max(50)
              .regex(/^[A-Z0-9][A-Z0-9._-]*$/),
            description: z
              .string()
              .trim()
              .min(1)
              .max(500)
              .transform((v) => v.normalize('NFC')),
            active: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.entries.map((e) => e.code)).size === value.entries.length,
    { path: ['entries'], message: 'Códigos repetidos.' },
  )
export function parseTerminologyCatalog(value: unknown) {
  const result = terminologyCatalogSchema.safeParse(value)
  if (!result.success)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      [
        ...new Set(
          result.error.issues.map((issue) =>
            String(issue.path[0] ?? 'catalog'),
          ),
        ),
      ].map((field) => ({
        field,
        reason: 'Revise este campo do catálogo demonstrativo.',
      })),
    )
  return result.data
}
