import type { Principal } from '../../domain/rules/access'
import type { ScheduleBlock, ScheduleRule } from '../../domain/rules/schedule'
import type { AuditWriter } from './audit-writer'
import type { Modality } from './catalog'
export type ScheduleInput = { rules: ScheduleRule[]; blocks: ScheduleBlock[] }
export type ScheduleSnapshot = ScheduleInput & {
  professionalId: string
  version: number
  clinicTimeZone: string
}
export type ScheduleTarget = {
  id: string
  userId: string
  active: boolean
  modalities: Modality[]
}
export type ScheduleImpact = {
  id: string
  startsAt: string
  endsAt: string
  emergencyOnly: boolean
}
export interface ScheduleTransaction {
  principal(actor: Principal): Promise<Principal | null>
  ownProfessional(
    userId: string,
  ): Promise<{ id: string; displayName: string; modalities: Modality[] } | null>
  professional(id: string): Promise<ScheduleTarget | null>
  current(id: string): Promise<ScheduleSnapshot | null>
  impacts(
    id: string,
    input: ScheduleInput,
    timeZone: string,
  ): Promise<ScheduleImpact[]>
  publish(
    id: string,
    version: number,
    input: ScheduleInput,
    timeZone: string,
    actorId: string,
  ): Promise<void>
  notifyImpacts(
    ids: string[],
    publicationVersion: number,
    requestId: string,
  ): Promise<void>
  audit: AuditWriter
}
export interface ScheduleStore {
  transaction<T>(run: (tx: ScheduleTransaction) => Promise<T>): Promise<T>
}
