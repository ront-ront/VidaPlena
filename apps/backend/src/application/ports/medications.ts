import type { CareLinkTransaction } from './care-links'
export type MedicationSubstance = { code: string; description: string }
export type MedicationEntry = {
  code: string
  name: string
  activeSubstances: MedicationSubstance[]
  active: boolean
  controlled: boolean
}
export type MedicationDataset = {
  version: string
  source: string
  license: string
  demo: true
  entries: MedicationEntry[]
}
export type MedicationCatalog = {
  id: string
  version: string
  source: string
  license: string
  demo: boolean
  checksum: string
}
export type MedicationSnapshot = MedicationEntry & {
  version: string
  source: string
  demo: boolean
}
export type MedicationQuery = { q?: string; cursor?: string }
export interface MedicationTransaction
  extends Pick<CareLinkTransaction, 'principal' | 'professional' | 'audit'> {
  lockMedications(shared?: boolean): Promise<void>
  medicationCatalogVersion(version: string): Promise<MedicationCatalog | null>
  activeMedicationCatalog(allowDemo: boolean): Promise<MedicationCatalog | null>
  createMedicationCatalog(
    dataset: MedicationDataset,
    checksum: string,
  ): Promise<MedicationCatalog>
  activateMedicationCatalog(catalog: MedicationCatalog): Promise<void>
  medicationPage(
    catalog: MedicationCatalog,
    query: MedicationQuery,
  ): Promise<{ items: MedicationEntry[]; nextCursor: string | null }>
  medicationEntry(
    catalog: MedicationCatalog,
    code: string,
  ): Promise<MedicationEntry | null>
  knownMedicationSubstances(catalog: MedicationCatalog): Promise<string[]>
}
export interface MedicationStore {
  transaction<T>(run: (tx: MedicationTransaction) => Promise<T>): Promise<T>
}
