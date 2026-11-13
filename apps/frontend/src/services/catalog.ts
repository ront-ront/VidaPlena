import { apiClient } from './api-client'
export type Modality = 'onsite' | 'remote'
export type Specialty = {
  id: string
  code: string
  name: string
  active: boolean
  allowedModalities: Modality[]
  defaultMinutesFirst: number
  defaultMinutesReturn: number
  version: number
}
export type Professional = {
  id: string
  userId: string
  displayName: string
  councilType: string
  councilRegion: string
  councilNumber: string
  specialtyIds: string[]
  modalities: Modality[]
  active: boolean
  version: number
}
export type Room = {
  id: string
  name: string
  active: boolean
  capacity: 1
  version: number
}
export type CatalogTypes = {
  specialties: Specialty
  professionals: Professional
  rooms: Room
}
export type CatalogKind = keyof CatalogTypes
export type CatalogRecord = CatalogTypes[CatalogKind]
export type CatalogPage<T> = { items: T[]; nextCursor: string | null }
export type SpecialtyInput = Omit<Specialty, 'id' | 'version'>
export type ProfessionalInput = Omit<
  Professional,
  'id' | 'version' | 'displayName'
>
export type RoomInput = Pick<Room, 'name' | 'active'>
export type CatalogInput = SpecialtyInput | ProfessionalInput | RoomInput
export const catalog = {
  list: <K extends CatalogKind>(
    kind: K,
    filters: { active?: boolean; cursor?: string } = {},
  ) => {
    const params = new URLSearchParams()
    if (filters.active !== undefined)
      params.set('active', String(filters.active))
    if (filters.cursor) params.set('cursor', filters.cursor)
    return apiClient.request<CatalogPage<CatalogTypes[K]>>(
      `/v1/${kind === 'rooms' ? 'rooms' : `admin/${kind}`}${params.size ? `?${params}` : ''}`,
    )
  },
  save: (kind: CatalogKind, input: CatalogInput, initial?: CatalogRecord) =>
    apiClient.request<CatalogRecord>(
      `/v1/admin/${kind}${initial ? `/${initial.id}` : ''}`,
      {
        method: initial ? 'PATCH' : 'POST',
        body: JSON.stringify(
          initial ? { ...input, expectedVersion: initial.version } : input,
        ),
      },
    ),
}
