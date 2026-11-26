import { z } from 'zod'
import { ApiError, apiClient } from './api-client'

export const clinicalTimelineTypes = [
  'encounter',
  'evolution',
  'prescription',
  'exam_order',
  'exam_result',
  'document',
  'imported_history',
] as const
const named = z.object({ id: z.uuid(), name: z.string() })
const encounter = z.object({
  id: z.uuid(),
  appointmentId: z.uuid(),
  status: z.enum(['in_progress', 'completed']),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
})
const alert = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  kind: z.enum(['allergy', 'condition', 'continuous_medication', 'other']),
  term: z.string(),
  substanceCode: z.string().nullable(),
  verificationState: z.enum(['reported', 'confirmed']),
  active: z.literal(true),
  version: z.number().int().positive(),
  author: named,
  date: z.iso.datetime(),
})
const header = z.object({
  recordId: z.uuid(),
  recordNumber: z.string(),
  patient: z.object({
    id: z.uuid(),
    name: z.string(),
    birthDate: z.iso.date(),
  }),
  lastEncounterAt: z.iso.datetime().nullable(),
  firstVisit: z.boolean().nullable(),
  alerts: z.array(alert),
  currentEncounter: encounter.nullable(),
  linkBasis: z.object({
    id: z.uuid(),
    expiresAt: z.iso.datetime(),
    kind: z.enum(['care_link', 'emergency']),
    scope: z.enum(['pre', 'during', 'post', 'emergency']),
  }),
})
const timeline = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      resourceId: z.uuid(),
      type: z.enum(clinicalTimelineTypes),
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
const appointment = z.object({
  id: z.uuid(),
  patient: named,
  professional: named,
  specialty: named,
  modality: z.enum(['onsite', 'remote']),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: z.enum([
    'confirmed',
    'waiting',
    'in_service',
    'completed',
    'cancelled',
    'no_show',
  ]),
  room: named.nullable(),
  checkIn: z
    .object({
      arrivedAt: z.iso.datetime(),
      recordedAt: z.iso.datetime(),
      lateFlag: z.boolean(),
    })
    .nullable(),
})
const queuePage = z.object({
  items: z.array(appointment),
  nextCursor: z.uuid().nullable(),
})
const agendaPage = queuePage.extend({
  localDate: z.iso.date(),
  clinicTimeZone: z.string(),
  serverNow: z.iso.datetime(),
  totals: z.object({
    all: z.number(),
    confirmed: z.number(),
    noShow: z.number(),
  }),
})
const context = z.object({
  localDate: z.iso.date(),
  clinicTimeZone: z.string(),
  serverNow: z.iso.datetime(),
})
async function read<T>(
  path: `/v1/${string}`,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(
    await apiClient.request<unknown>(path, { signal }),
  )
  if (!result.success) throw new ApiError(502, 'SERVICE_UNAVAILABLE')
  return result.data
}
export type ClinicalHeader = z.infer<typeof header>
export type ClinicalTimeline = z.infer<typeof timeline>
export type ClinicalAppointment = z.infer<typeof appointment>
export type ClinicalAgenda = z.infer<typeof agendaPage>
export type ClinicalFilters = {
  from?: string
  to?: string
  specialtyId?: string
  type?: (typeof clinicalTimelineTypes)[number]
}
export const clinicalRecords = {
  async header(patientId: string, signal?: AbortSignal) {
    const result = await read(
      `/v1/clinical/records/${encodeURIComponent(patientId)}`,
      header,
      signal,
    )
    if (
      result.patient.id.toLowerCase() !== patientId.toLowerCase() ||
      result.alerts.some(
        (a) => a.patientId.toLowerCase() !== patientId.toLowerCase(),
      )
    )
      throw new ApiError(502, 'SERVICE_UNAVAILABLE')
    return result
  },
  timeline(
    patientId: string,
    filters: ClinicalFilters = {},
    cursor?: string,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(filters))
      if (value) query.set(key, value)
    if (cursor) query.set('cursor', cursor)
    return read(
      `/v1/clinical/records/${encodeURIComponent(patientId)}/timeline${query.size ? `?${query}` : ''}`,
      timeline,
      signal,
    )
  },
  context: (signal?: AbortSignal) =>
    read('/v1/scheduling/context', context, signal),
  day(localDate?: string, cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams()
    if (localDate) query.set('localDate', localDate)
    if (cursor) query.set('cursor', cursor)
    return read(
      `/v1/agenda/day${query.size ? `?${query}` : ''}`,
      agendaPage,
      signal,
    )
  },
  queue(localDate: string, cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ localDate })
    if (cursor) query.set('cursor', cursor)
    return read(`/v1/professionals/me/queue?${query}`, queuePage, signal)
  },
}
