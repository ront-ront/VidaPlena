import { z } from 'zod'
import { ApiError, apiClient } from './api-client'
import { appointmentSchema } from './appointments'

const originSchema = z.object({
  sourceSystem: z.string(),
  externalId: z.string(),
  batchId: z.uuid(),
  importedAt: z.iso.datetime(),
  importedBy: z.uuid(),
  historicalStatus: z.enum(['undated', 'before_cutoff', 'on_or_after_cutoff']),
})
export const operationalAppointmentSchema = appointmentSchema.extend({
  notificationAttention: z.boolean(),
  patientChangeDeadline: z.iso.datetime(),
  lastChange: z
    .object({
      action: z.enum(['rescheduled', 'cancelled']),
      origin: z.enum(['patient', 'reception', 'clinic']).nullable(),
      occurredAt: z.iso.datetime(),
    })
    .nullable(),
  patient: z.object({
    id: z.uuid(),
    name: z.string(),
    birthDate: z.iso.date().nullable(),
    cpfMasked: z.string().nullable(),
    importOrigin: originSchema.nullable().optional(),
  }),
  professional: z.object({ id: z.uuid(), name: z.string() }),
  specialty: z.object({ id: z.uuid(), name: z.string() }),
  room: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  importOrigin: originSchema.nullable(),
  checkIn: z
    .object({
      arrivedAt: z.iso.datetime(),
      recordedAt: z.iso.datetime(),
      lateFlag: z.boolean(),
    })
    .nullable(),
  administrativeFlags: z.array(
    z.enum([
      'contact_missing',
      'email_unverified',
      'consent_pending',
      'consent_revoked',
    ]),
  ),
  noShowEligible: z.boolean(),
  absence: z
    .object({
      kind: z.enum(['unjustified', 'justified', 'clinic_fault']),
      version: z.number().int(),
      recordedAt: z.iso.datetime(),
      decidedAt: z.iso.datetime(),
    })
    .nullable(),
})
const pageSchema = z.object({
  items: z.array(operationalAppointmentSchema),
  nextCursor: z.uuid().nullable(),
  totals: z.object({
    all: z.number().int(),
    confirmed: z.number().int(),
    noShow: z.number().int(),
  }),
  localDate: z.iso.date(),
  clinicTimeZone: z.string(),
  serverNow: z.iso.datetime(),
})
export type OperationalAppointment = z.infer<
  typeof operationalAppointmentSchema
>
export type AgendaPage = z.infer<typeof pageSchema>
export type AgendaFilters = {
  localDate?: string
  patientQuery?: string
  professionalId?: string
  specialtyId?: string
  status?: z.infer<typeof appointmentSchema>['status']
}
export const operationalAgenda = {
  async day(filters: AgendaFilters = {}, cursor?: string) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(filters))
      if (value) query.set(key, value)
    if (cursor) query.set('cursor', cursor)
    const raw = await apiClient.request<unknown>(
      `/v1/agenda/day${query.size ? `?${query}` : ''}`,
    )
    const result = pageSchema.safeParse(raw)
    if (!result.success) throw new ApiError(502, 'SERVICE_UNAVAILABLE')
    return result.data
  },
}

const roomOptionsSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), name: z.string() })),
  suggestedRoomId: z.uuid().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  clinicTimeZone: z.string(),
})
export type RoomOptions = z.infer<typeof roomOptionsSchema>
export async function roomOptions(
  query: {
    professionalId: string
    specialtyId: string
    visitType: 'first' | 'return'
    startsAt: string
    appointmentId?: string
    expectedVersion?: number
  },
  fitIn = false,
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value))
  const raw = await apiClient.request<unknown>(
    `/v1/appointments/${fitIn ? 'fit-ins/' : ''}room-options?${params}`,
  )
  const parsed = roomOptionsSchema.safeParse(raw)
  if (!parsed.success) throw new ApiError(502, 'SERVICE_UNAVAILABLE')
  return parsed.data
}
