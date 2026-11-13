import { z } from 'zod'
import { appointmentBody, bookingResponse } from './appointments'
import { modalitySchema } from './catalog'

export const timePreferenceBody = z
  .object({
    weekdays: z
      .array(z.int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length),
    localStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    localEnd: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/),
  })
  .strict()
  .refine((p) => p.localStart < p.localEnd, {
    path: ['localEnd'],
    message: 'O fim deve ser posterior ao início na mesma data.',
  })
export const waitlistBody = z
  .object({
    patientId: z.uuid(),
    specialtyId: z.uuid(),
    modality: modalitySchema,
    visitType: z.enum(['first', 'return']),
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
    timePreferences: z.array(timePreferenceBody).min(1).max(14),
  })
  .strict()
export const waitlistQuery = z
  .object({
    patientId: z.uuid().optional(),
    specialtyId: z.uuid().optional(),
    status: z.enum(['waiting', 'offered', 'fulfilled', 'cancelled']).optional(),
    cursor: z.uuid().optional(),
  })
  .strict()
export const waitlistParams = z.object({ id: z.uuid() })
export const acceptOfferBody = z
  .object({
    patientId: z.uuid(),
    confirmDuplicateSpecialty: z.boolean().optional(),
  })
  .strict()
export const fitInBody = appointmentBody.extend({
  reason: z.string().trim().min(1).max(1000),
})
export const waitlistCreatedResponse = z.object({
  entryId: z.uuid(),
  queuedAt: z.iso.datetime(),
  status: z.enum(['waiting', 'offered', 'fulfilled', 'cancelled']),
})
export const waitlistOfferResponse = z.object({
  id: z.uuid(),
  status: z.enum(['active', 'accepted', 'expired', 'cancelled']),
  offeredAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  professionalId: z.uuid(),
  professionalName: z.string(),
  modality: modalitySchema,
  manualContactRequired: z.boolean(),
})
export const waitlistResponse = z.object({
  items: z.array(
    waitlistBody.extend({
      id: z.uuid(),
      queuedAt: z.iso.datetime(),
      status: waitlistCreatedResponse.shape.status,
      position: z.int().nonnegative(),
      patientName: z.string().optional(),
      offer: waitlistOfferResponse.nullable(),
    }),
  ),
  nextCursor: z.uuid().nullable(),
})
export const acceptOfferResponse = bookingResponse

export const fitInPatientQuery = z
  .object({ cpf: z.string().trim().min(11).max(14) })
  .strict()
export const fitInPatientResponse = z.object({
  patientId: z.uuid(),
  fullName: z.string(),
})
