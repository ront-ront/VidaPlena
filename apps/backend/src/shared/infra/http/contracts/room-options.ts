import { z } from 'zod'
export const fitInRoomOptionsQuery = z
  .object({
    professionalId: z.uuid(),
    specialtyId: z.uuid(),
    visitType: z.enum(['first', 'return']),
    startsAt: z.iso.datetime(),
  })
  .strict()
export const roomOptionsQuery = fitInRoomOptionsQuery
  .extend({
    appointmentId: z.uuid().optional(),
    expectedVersion: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (v) =>
      (v.appointmentId === undefined) === (v.expectedVersion === undefined),
    { message: 'Informe atendimento e versão juntos.' },
  )
export const roomOptionsResponse = z.object({
  items: z.array(z.object({ id: z.uuid(), name: z.string() })),
  suggestedRoomId: z.uuid().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  clinicTimeZone: z.string(),
})
