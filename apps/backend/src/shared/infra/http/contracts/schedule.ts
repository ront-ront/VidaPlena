import { z } from 'zod'
import { modalitySchema } from './catalog'
export const scheduleRuleBody = z
  .object({
    weekday: z.int().min(1).max(7),
    localStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    localEnd: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/),
    effectiveFrom: z.iso.date(),
    effectiveTo: z.iso.date().nullable(),
    modality: modalitySchema,
  })
  .strict()
export const scheduleBlockBody = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    kind: z.enum(['break', 'vacation', 'holiday', 'emergency']),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
export const scheduleBody = z
  .object({
    expectedVersion: z.int().min(0),
    rules: z.array(scheduleRuleBody).max(200),
    blocks: z.array(scheduleBlockBody).max(500),
  })
  .strict()
export const scheduleQuery = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .strict()
export const scheduleParams = z.object({ id: z.uuid() })
export const ownProfessionalResponse = z.object({
  id: z.uuid(),
  displayName: z.string(),
  modalities: z.array(modalitySchema),
})
export const impactResponse = z.object({
  id: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
})
export const scheduleResponse = z.object({
  professionalId: z.uuid(),
  version: z.int(),
  clinicTimeZone: z.string(),
  rules: z.array(scheduleRuleBody),
  blocks: z.array(scheduleBlockBody),
  affectedAppointments: z.array(impactResponse),
})
export const publishedScheduleResponse = z.object({
  version: z.int(),
  affectedAppointments: z.array(impactResponse),
  affectedAppointmentsResolved: z.boolean(),
})
