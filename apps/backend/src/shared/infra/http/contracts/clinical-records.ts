import { z } from 'zod'
import { timelineTypes } from '../../../../application/ports/clinical-records'
export const recordParams = z.object({ patientId: z.uuid() })
export const timelineQuery = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    specialtyId: z.uuid().optional(),
    type: z.enum(timelineTypes).optional(),
    cursor: z
      .string()
      .refine((value) => {
        const [type, id, ...extra] = value.split(':')
        return (
          !extra.length &&
          z.enum(timelineTypes).safeParse(type).success &&
          z.uuid().safeParse(id).success
        )
      })
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.from || !value.to || new Date(value.from) < new Date(value.to),
    { path: ['to'], message: 'Intervalo inválido.' },
  )
export const openEncounterBody = z.object({ appointmentId: z.uuid() }).strict()
export const encounterSchema = z.object({
  id: z.uuid(),
  appointmentId: z.uuid(),
  status: z.enum(['in_progress', 'completed']),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
})
export const encounterResponse = z.object({ encounter: encounterSchema })
export const recordHeaderResponse = z.object({
  recordId: z.uuid(),
  recordNumber: z.string(),
  patient: z.object({
    id: z.uuid(),
    name: z.string(),
    birthDate: z.iso.date(),
  }),
  lastEncounterAt: z.iso.datetime().nullable(),
  firstVisit: z.boolean().nullable(),
  alerts: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['allergy', 'condition', 'continuous_medication', 'other']),
      term: z.string(),
      verificationState: z.enum(['reported', 'confirmed']),
      active: z.boolean(),
      author: z.object({ id: z.uuid(), name: z.string() }),
      date: z.iso.datetime(),
    }),
  ),
  currentEncounter: encounterSchema.nullable(),
  linkBasis: z.object({
    id: z.uuid(),
    expiresAt: z.iso.datetime(),
    kind: z.enum(['care_link', 'emergency']),
    scope: z.enum(['pre', 'during', 'post', 'emergency']),
  }),
})
const named = z.object({ id: z.uuid(), name: z.string() })
export const timelineResponse = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      resourceId: z.uuid(),
      type: z.enum(timelineTypes),
      date: z.iso.datetime(),
      specialty: named.nullable(),
      professional: named.nullable(),
      modality: z.enum(['onsite', 'remote']).nullable(),
      summary: z.string(),
      importedOrigin: z
        .object({
          origin: z.string(),
          importedAt: z.iso.datetime(),
          importedBy: z.uuid(),
        })
        .nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
  restricted: z.boolean(),
})
