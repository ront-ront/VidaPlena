import type { z } from 'zod'
import { ApplicationError } from '../../../application/errors/application-error'

/** The API never returns the raw ZodError: it can include submitted values. */
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const fields = [
    ...new Set(
      result.error.issues.map((issue) => String(issue.path[0] ?? 'body')),
    ),
  ]
  throw new ApplicationError(
    'VALIDATION_ERROR',
    fields.map((field) => ({
      field,
      reason: 'Revise o valor deste campo.',
    })),
  )
}
