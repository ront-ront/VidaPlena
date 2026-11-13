import { type AffectedAppointment, apiClient } from './api-client'
import type { CatalogPage, Modality } from './catalog'
export type ScheduleRule = {
  weekday: number
  localStart: string
  localEnd: string
  effectiveFrom: string
  effectiveTo: string | null
  modality: Modality
}
export type ScheduleBlock = {
  startsAt: string
  endsAt: string
  kind: 'break' | 'vacation' | 'holiday' | 'emergency'
  reason: string
}
export type ScheduleSnapshot = {
  professionalId: string
  version: number
  clinicTimeZone: string
  rules: ScheduleRule[]
  blocks: ScheduleBlock[]
  affectedAppointments: AffectedAppointment[]
}
export type ScheduleProfessional = {
  id: string
  displayName: string
  modalities: Modality[]
}
export const professionalSchedule = {
  ownProfile: () =>
    apiClient.request<ScheduleProfessional>('/v1/professionals/me/profile'),
  professionals: (cursor?: string) =>
    apiClient.request<CatalogPage<ScheduleProfessional>>(
      `/v1/catalog/professionals${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  read: (id: string) =>
    apiClient.request<ScheduleSnapshot>(
      `/v1/professionals/${id}/schedule/editor`,
    ),
  publish: (
    id: string,
    input: {
      expectedVersion: number
      rules: ScheduleRule[]
      blocks: ScheduleBlock[]
    },
  ) =>
    apiClient.request<{
      version: number
      affectedAppointments: AffectedAppointment[]
      affectedAppointmentsResolved: boolean
    }>(`/v1/professionals/${id}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
}
