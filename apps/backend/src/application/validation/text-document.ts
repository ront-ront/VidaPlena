import { z } from 'zod'
import { ApplicationError } from '../errors/application-error'
export const textDocumentCodes = [
  'certificate',
  'declaration',
  'report',
  'referral',
] as const
export const textDocumentSchema = z
  .object({
    templateVersion: z.literal('1'),
    body: z
      .string()
      .max(20000)
      .refine((v) => v.isWellFormed()),
    period: z
      .object({ startsAt: z.iso.datetime(), endsAt: z.iso.datetime() })
      .strict()
      .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
        message: 'Fim do período deve ser posterior ao início.',
      })
      .optional(),
  })
  .strict()
export function parseTextDocument(value: unknown) {
  const result = textDocumentSchema.safeParse(value)
  if (!result.success)
    throw new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'payload',
        reason: 'Revise o texto, a versão do modelo e o período informado.',
      },
    ])
  return result.data
}
