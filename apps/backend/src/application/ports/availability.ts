import type { Modality } from './catalog'
import type { ScheduleSnapshot } from './schedule'
export type AvailabilityQuery = {
  specialtyId: string
  professionalId?: string
  modality: Modality
  visitType: 'first' | 'return'
  from: string
  to: string
}
export type OccupiedInterval = {
  professionalId: string
  roomId: string | null
  startsAt: Date
  endsAt: Date
}
export type AvailabilityData = {
  specialty: { modalities: Modality[]; first: number; return: number } | null
  professionals: {
    id: string
    modalities: Modality[]
    schedule: ScheduleSnapshot | null
  }[]
  roomIds: string[]
  occupied: OccupiedInterval[]
}
export interface AvailabilityStore {
  load(
    query: AvailabilityQuery,
    startsAt: Date,
    endsAt: Date,
    now: Date,
  ): Promise<AvailabilityData>
}
