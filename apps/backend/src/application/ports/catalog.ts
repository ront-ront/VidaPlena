import type { Principal } from '../../domain/rules/access'
import type { AuditWriter } from './audit-writer'

export type Modality = 'onsite' | 'remote'
export type SpecialtyInput = {
  code: string
  name: string
  active: boolean
  allowedModalities: Modality[]
  defaultMinutesFirst: number
  defaultMinutesReturn: number
}
export type Specialty = SpecialtyInput & { id: string; version: number }
export type ProfessionalInput = {
  userId: string
  councilType: string
  councilNumber: string
  councilRegion: string
  specialtyIds: string[]
  modalities: Modality[]
  active: boolean
}
export type Professional = ProfessionalInput & {
  id: string
  displayName: string
  version: number
}
export type CatalogQuery = { active?: boolean; cursor?: string }
export type Page<T> = { items: T[]; nextCursor: string | null }
export type ResourceAppointmentImpact = {
  id: string
  startsAt: string
  endsAt: string
  modality: Modality
  specialtyId: string
}
export interface CatalogTransaction {
  principal(actor: Principal): Promise<Principal | null>
  professionalAccount(userId: string): Promise<boolean>
  specialty(id: string): Promise<Specialty | null>
  professional(id: string): Promise<Professional | null>
  saveSpecialty(input: SpecialtyInput, id?: string): Promise<Specialty>
  saveProfessional(input: ProfessionalInput, id?: string): Promise<Professional>
  affectedAppointments(
    kind: 'specialty' | 'professional',
    id: string,
  ): Promise<ResourceAppointmentImpact[]>
  audit: AuditWriter
}
export interface CatalogStore {
  transaction<T>(run: (tx: CatalogTransaction) => Promise<T>): Promise<T>
  specialties(query: CatalogQuery): Promise<Page<Specialty>>
  professionals(
    query: CatalogQuery & { specialtyId?: string; modality?: Modality },
    administrative: boolean,
  ): Promise<Page<Professional>>
}
