import { z } from 'zod'
import { ApplicationError } from '../errors/application-error'

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => v.isWellFormed())
const exam = z.object({
  tussCode: text(50).optional(),
  tussVersion: text(100).optional(),
  description: text(500).optional(),
  indication: text(2000),
})
const snapshot = z
  .object({
    code: z.string(),
    description: z.string(),
    version: z.string(),
    source: z.string(),
    demo: z.boolean(),
  })
  .strict()
const valid = (value: {
  privateVisit: boolean
  exams: { tussCode?: string; tussVersion?: string; description?: string }[]
}) =>
  value.exams.every((e) =>
    e.tussCode ? !!e.tussVersion : value.privateVisit && !!e.description,
  )
export const examOrderInputSchema = z
  .object({
    privateVisit: z.boolean(),
    exams: z.array(exam.strict()).min(1).max(30),
  })
  .strict()
  .refine(valid, {
    path: ['exams'],
    message:
      'Informe TUSS/versão; pedido particular sem código exige descrição.',
  })
export const examOrderStoredSchema = z
  .object({
    privateVisit: z.boolean(),
    exams: z
      .array(
        exam
          .extend({ procedureSnapshot: snapshot.nullable().optional() })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .refine(valid)
export function parseExamOrder(value: unknown) {
  const parsed = examOrderStoredSchema.safeParse(value)
  if (!parsed.success)
    throw new ApplicationError('VALIDATION_ERROR', [
      {
        field: 'exams',
        reason: 'Revise indicação, descrição e seleção TUSS do pedido.',
      },
    ])
  return parsed.data
}
