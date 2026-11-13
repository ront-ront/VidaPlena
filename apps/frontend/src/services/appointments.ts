import { z } from 'zod'
import { ApiError, apiClient } from './api-client'
import type { BookingSelection } from './availability'

// Projeção do contrato compartilhado M1/AppointmentSummary; sem campos clínicos.
export const appointmentSchema = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  professionalId: z.uuid(),
  specialtyId: z.uuid(),
  roomId: z.uuid().nullable(),
  professionalName: z.string().nullable(),
  specialtyName: z.string().nullable(),
  roomName: z.string().nullable(),
  modality: z.enum(['onsite', 'remote']),
  visitType: z.enum(['first', 'return']),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  durationMinutes: z.number().int().positive(),
  version: z.number().int().positive(),
  status: z.enum([
    'confirmed',
    'waiting',
    'in_service',
    'completed',
    'no_show',
    'cancelled',
  ]),
  bookingSource: z.enum(['portal', 'reception', 'fit_in', 'imported']),
  attendanceResponse: z
    .object({
      response: z.enum(['confirm', 'cannot_attend']),
      respondedAt: z.iso.datetime(),
    })
    .nullable(),
})
export const receiptSchema = z.object({
  appointment: appointmentSchema,
  notificationState: z.enum(['queued', 'unreachable']),
})
export type Appointment = z.infer<typeof appointmentSchema>
export type BookingReceipt = z.infer<typeof receiptSchema>
export const appointmentStatus: Record<Appointment['status'], string> = {
  confirmed: 'Confirmada',
  waiting: 'Aguardando atendimento',
  in_service: 'Em atendimento',
  completed: 'Concluída',
  no_show: 'Falta registrada',
  cancelled: 'Cancelada',
}
export function bookingInput(
  selection: BookingSelection,
  patientId: string,
  duplicate = false,
) {
  return {
    patientId,
    professionalId: selection.professional.id,
    specialtyId: selection.specialty.id,
    modality: selection.modality,
    visitType: selection.visitType,
    startsAt: selection.slot.startsAt,
    confirmDuplicateSpecialty: duplicate,
  }
}
export const ownAppointmentSchema = appointmentSchema.extend({
  selfService: z.object({
    deadline: z.iso.datetime(),
    rescheduleAllowed: z.boolean(),
    cancelAllowed: z.boolean(),
  }),
  lastChange: z
    .object({
      action: z.enum(['rescheduled', 'cancelled']),
      origin: z.enum(['patient', 'reception', 'clinic']).nullable(),
      occurredAt: z.iso.datetime(),
    })
    .nullable(),
})
const ownPageSchema = z.object({
  items: z.array(ownAppointmentSchema),
  nextCursor: z.uuid().nullable(),
  clinicTimeZone: z.string(),
  serverNow: z.iso.datetime(),
})
export type OwnAppointment = z.infer<typeof ownAppointmentSchema>
export type OwnAppointmentPage = z.infer<typeof ownPageSchema>
export type AppointmentChangeInput = {
  expectedVersion: number
  origin: 'patient' | 'reception' | 'clinic'
  reason?: string
  roomId?: string | null
  startsAt?: string
  professionalId?: string
  modality?: 'onsite' | 'remote'
}
export const appointments = {
  async own(query: {
    view: 'upcoming' | 'history'
    patientId?: string
    cursor?: string
  }) {
    const params = new URLSearchParams({ view: query.view })
    if (query.patientId) params.set('patientId', query.patientId)
    if (query.cursor) params.set('cursor', query.cursor)
    const raw = await apiClient.request<unknown>(
      `/v1/me/appointments?${params}`,
    )
    const parsed = ownPageSchema.safeParse(raw)
    if (!parsed.success) throw new ApiError(502, 'SERVICE_UNAVAILABLE')
    return parsed.data
  },
  async change(
    id: string,
    action: 'reschedule' | 'cancel',
    input: AppointmentChangeInput,
    key: string,
  ) {
    const raw = await apiClient.request<unknown>(
      `/v1/appointments/${id}/${action}`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(input),
      },
      { expectedStatus: 200 },
    )
    const parsed = receiptSchema.safeParse(raw)
    if (!parsed.success) throw new ApiError(502, 'SERVICE_UNAVAILABLE')
    return parsed.data
  },
  async book(
    input: ReturnType<typeof bookingInput> & { roomId?: string },
    key: string,
  ) {
    const raw = await apiClient.request<unknown>(
      '/v1/appointments',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(input),
      },
      { expectedStatus: 201 },
    )
    const parsed = receiptSchema.safeParse(raw)
    if (!parsed.success) throw new ApiError(502, 'SERVICE_UNAVAILABLE')
    return parsed.data
  },
}
