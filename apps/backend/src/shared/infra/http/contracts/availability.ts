import { z } from 'zod'
import { modalitySchema } from './catalog'
export const availabilityQuery = z
  .object({
    specialtyId: z.uuid(),
    professionalId: z.uuid().optional(),
    modality: modalitySchema,
    visitType: z.enum(['first', 'return']),
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .strict()
export const availabilityResponse = z.object({
  days: z.array(
    z.object({
      localDate: z.iso.date(),
      slots: z.array(
        z.object({
          startsAt: z.iso.datetime(),
          endsAt: z.iso.datetime(),
          professionalId: z.uuid(),
          roomAvailable: z.boolean(),
        }),
      ),
    }),
  ),
  nearestAvailableAt: z.iso.datetime().nullable(),
  clinicTimeZone: z.string(),
})

export const schedulingContextResponse = z.object({
  clinicTimeZone: z.string(),
  serverNow: z.iso.datetime(),
  localDate: z.iso.date(),
})
