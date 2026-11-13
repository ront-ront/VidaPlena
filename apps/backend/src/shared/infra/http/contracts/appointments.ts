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
  attendanceResponse: z
    .object({
      response: z.enum(['confirm', 'cannot_attend']),
      respondedAt: z.iso.datetime(),
    })
    .nullable(),
})
export const bookingResponse = z.object({
  appointment: appointmentResponse,
  notificationState: z.enum(['queued', 'unreachable']),
})
export const appointmentParams = z.object({ id: z.uuid() })
export const rescheduleBody = z
  .object({
    startsAt: z.iso.datetime(),
    professionalId: z.uuid().optional(),
    modality: modalitySchema.optional(),
    roomId: z.uuid().nullable().optional(),
    reason: z.string().trim().min(1).max(1000).optional(),
    origin: z.enum(['patient', 'reception', 'clinic']).optional(),
    expectedVersion: z.int().positive(),
  })
  .strict()
export const myAppointmentsQuery = z
  .object({
    patientId: z.uuid().optional(),
    status: appointmentResponse.shape.status.optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    cursor: z.uuid().optional(),
  })
  .strict()
export const myAppointmentsResponse = z.object({
  items: z.array(appointmentResponse),
  nextCursor: z.uuid().nullable(),
})
export const rescheduleResponse = bookingResponse.extend({
  previousSlotReleased: z.literal(true),
  origin: z.enum(['patient', 'reception', 'clinic']),
  alternatives: z.array(
    z.object({
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
      professionalId: z.uuid(),
      roomAvailable: z.boolean(),
    }),
  ),
})
export const cancelBody = z
  .object({
    reason: z.string().trim().min(1).max(1000).optional(),
    origin: z.enum(['patient', 'reception', 'clinic']),
    expectedVersion: z.int().positive(),
  })
  .strict()
export const cancelResponse = bookingResponse.extend({
  status: z.literal('cancelled'),
  waitlistTriggered: z.literal(true),
  origin: cancelBody.shape.origin,
  alternatives: rescheduleResponse.shape.alternatives,
})
export const attendanceBody = z
  .object({ response: z.enum(['confirm', 'cannot_attend']) })
  .strict()
export const attendanceResponse = z.object({
  appointmentId: z.uuid(),
  appointmentVersion: z.int().positive(),
  response: attendanceBody.shape.response,
  respondedAt: z.iso.datetime(),
  requiresCancellation: z.boolean(),
  cancellationPath: z.string().nullable(),
  receptionContactRequired: z.boolean(),
  waitlistTriggered: z.literal(false),
})
