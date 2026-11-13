import { ApiError, apiClient } from './api-client'
import type { CatalogPage, Modality } from './catalog'
export type PublicSpecialty = {
  id: string
  code: string
  name: string
  modalities: Modality[]
  durations: { first: number; return: number }
}
export type PublicProfessional = {
  id: string
  displayName: string
  modalities: Modality[]
  specialtyIds: string[]
}
export type AvailabilitySlot = {
  startsAt: string
  endsAt: string
  professionalId: string
  roomAvailable: boolean
}
export type AvailabilityResult = {
  days: { localDate: string; slots: AvailabilitySlot[] }[]
  nearestAvailableAt: string | null
  clinicTimeZone: string
}
export type AvailabilitySearch = {
  specialtyId: string
  professionalId?: string
  modality: Modality
  visitType: 'first' | 'return'
  from: string
  to: string
}
export type BookingSelection = {
  specialty: PublicSpecialty
  professional: PublicProfessional
  slot: AvailabilitySlot
  modality: Modality
  visitType: 'first' | 'return'
  clinicTimeZone: string
}
export async function catalogPages<T extends { id: string }>(
  load: (cursor?: string) => Promise<CatalogPage<T>>,
) {
  const items = new Map<string, T>(),
    seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await load(cursor)
    for (const item of page.items) items.set(item.id, item)
    if (!page.nextCursor) break
    if (seen.has(page.nextCursor))
      throw new ApiError(502, 'SERVICE_UNAVAILABLE')
    seen.add(page.nextCursor)
    cursor = page.nextCursor
  } while (cursor)
  return [...items.values()]
}
export const schedulingAvailability = {
  specialties: () =>
    catalogPages((cursor) =>
      apiClient.request<CatalogPage<PublicSpecialty>>(
        `/v1/catalog/specialties?active=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      ),
    ),
  professionals: (specialtyId: string, modality: Modality) =>
    catalogPages((cursor) =>
      apiClient.request<CatalogPage<PublicProfessional>>(
        `/v1/catalog/professionals?specialtyId=${encodeURIComponent(specialtyId)}&modality=${modality}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      ),
    ),
  search: (input: AvailabilitySearch) => {
    const query = new URLSearchParams({
      ...input,
      professionalId: input.professionalId ?? '',
    })
    if (!input.professionalId) query.delete('professionalId')
    return apiClient.request<AvailabilityResult>(`/v1/availability?${query}`)
  },
}
