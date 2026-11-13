import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'
import type {
  ScheduleBlock,
  ScheduleRule,
  ScheduleSnapshot,
} from '@/services/schedule'
export type RuleDraft = ScheduleRule & { key: string }
export type BlockDraft = {
  key: string
  startLocal: string
  endLocal: string
  kind: ScheduleBlock['kind']
  reason: string
  original?: {
    startLocal: string
    endLocal: string
    startsAt: string
    endsAt: string
  }
}
export const weekdayNames = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
]
const ruleSchema = z.object({
  weekday: z.int().min(1).max(7),
  localStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe o horário de início.'),
  localEnd: z
    .string()
    .regex(
      /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/,
      'Informe o horário de término.',
    ),
  effectiveFrom: z.iso.date('Informe a data de início.'),
  effectiveTo: z.iso.date('Informe uma data válida.').nullable(),
  modality: z.enum(['onsite', 'remote']),
})
const blockSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  kind: z.enum(['break', 'vacation', 'holiday', 'emergency']),
  reason: z
    .string()
    .trim()
    .min(1, 'Informe o motivo do bloqueio.')
    .max(1000, 'Use até 1.000 caracteres.'),
})
const formSchema = z
  .object({
    rules: z
      .array(ruleSchema)
      .max(200, 'O limite de faixas do contrato foi atingido.'),
    blocks: z
      .array(blockSchema)
      .max(500, 'O limite de bloqueios do contrato foi atingido.'),
  })
  .superRefine(({ rules, blocks }, ctx) => {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      if (rule.localStart >= rule.localEnd)
        ctx.addIssue({
          code: 'custom',
          path: ['rules', i, 'localEnd'],
          message: 'O término deve ser posterior ao início.',
        })
      if (rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom)
        ctx.addIssue({
          code: 'custom',
          path: ['rules', i, 'effectiveTo'],
          message: 'A vigência final deve ser igual ou posterior ao início.',
        })
      for (let j = 0; j < i; j++) {
        const other = rules[j]
        if (
          rule.weekday === other.weekday &&
          rule.localStart < other.localEnd &&
          rule.localEnd > other.localStart &&
          rule.effectiveFrom <= (other.effectiveTo ?? '9999-12-31') &&
          other.effectiveFrom <= (rule.effectiveTo ?? '9999-12-31')
        ) {
          for (const index of [i, j])
            ctx.addIssue({
              code: 'custom',
              path: ['rules', index, 'localStart'],
              message:
                'Faixas sobrepostas neste dia. Ajuste os horários ou a vigência.',
            })
        }
      }
    }
    for (let i = 0; i < blocks.length; i++)
      if (blocks[i].startsAt >= blocks[i].endsAt)
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', i, 'endLocal'],
          message: 'O término do bloqueio deve ser posterior ao início.',
        })
  })
const local = (value: string, zone: string) =>
  Temporal.Instant.from(value)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString()
export function editSchedule(snapshot: ScheduleSnapshot): {
  rules: RuleDraft[]
  blocks: BlockDraft[]
} {
  return {
    rules: snapshot.rules.map((r) => ({ ...r, key: crypto.randomUUID() })),
    blocks: snapshot.blocks.map((b) => {
      const startLocal = local(b.startsAt, snapshot.clinicTimeZone),
        endLocal = local(b.endsAt, snapshot.clinicTimeZone)
      return {
        key: crypto.randomUUID(),
        kind: b.kind,
        reason: b.reason,
        startLocal,
        endLocal,
        original: {
          startLocal,
          endLocal,
          startsAt: b.startsAt,
          endsAt: b.endsAt,
        },
      }
    }),
  }
}
export function prepareSchedule(
  rules: RuleDraft[],
  blocks: BlockDraft[],
  timeZone: string,
): {
  data?: { rules: ScheduleRule[]; blocks: ScheduleBlock[] }
  errors: Record<string, string>
} {
  const errors: Record<string, string> = {}
  const converted = blocks.map((b, i) => {
    const instant = (field: 'startLocal' | 'endLocal') => {
      if (b.original && b[field] === b.original[field])
        return b.original[field === 'startLocal' ? 'startsAt' : 'endsAt']
      try {
        return Temporal.PlainDateTime.from(b[field], { overflow: 'reject' })
          .toZonedDateTime(timeZone, { disambiguation: 'reject' })
          .toInstant()
          .toString({ smallestUnit: 'millisecond' })
      } catch {
        errors[`blocks.${i}.${field}`] =
          'Confira a data e a hora no fuso da clínica. Horário ambíguo ou inexistente não é aceito.'
        return '2000-01-01T00:00:00.000Z'
      }
    }
    return {
      startsAt: instant('startLocal'),
      endsAt: instant('endLocal'),
      kind: b.kind,
      reason: b.reason,
    }
  })
  const parsed = formSchema.safeParse({
    rules: rules.map((r) => ({ ...r, effectiveTo: r.effectiveTo || null })),
    blocks: converted,
  })
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      errors[issue.path.join('.')] = issue.message
  return Object.keys(errors).length
    ? { errors }
    : { errors, data: parsed.success ? parsed.data : undefined }
}
export const currentClinicDate = (zone: string) =>
  Temporal.Now.plainDateISO(zone).toString()
