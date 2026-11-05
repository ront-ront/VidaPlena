import { z } from 'zod'
import { modalitySchema } from './catalog'
export const appointmentBody = z
  .object({
    patientId: z.uuid(),
    professionalId: z.uuid(),
    specialtyId: z.uuid(),
    modality: modalitySchema,
    visitType: z.enum(['first', 'return']),
    startsAt: z.iso.datetime(),
    roomId: z.uuid().nullable().optional(),
    confirmDuplicateSpecialty: z.boolean().optional(),
  })
  .strict()
export const idempotencyHeader = z.object({ 'idempotency-key': z.uuid() })
export const appointmentResponse = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  professionalId: z.uuid(),
  specialtyId: z.uuid(),
  roomId: z.uuid().nullable(),
  modality: modalitySchema,
  visitType: z.enum(['first', 'return']),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  durationMinutes: z.int().positive(),
  specialtyVersion: z.int(),
  status: z.enum([
    'confirmed',
    'waiting',
    'in_service',
    'completed',
    'no_show',
    'cancelled',
  ]),
  version: z.int(),
  bookingSource: z.enum(['portal', 'reception', 'fit_in', 'imported']),
  parentAppointmentId: z.uuid().nullable(),
  notificationAttention: z.boolean(),
})
export const bookingResponse = z.object({
  appointment: appointmentResponse,
  notificationState: z.enum(['queued', 'unreachable']),
})
