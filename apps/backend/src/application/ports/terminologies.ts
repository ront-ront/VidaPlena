import type { TerminologyKind } from '../../domain/rules/terminology'
import type { CareLinkTransaction } from './care-links'
export type CatalogDataset = {
  terminology: TerminologyKind
  version: string
  source: string
  license: string
  demo: true
  entries: { code: string; description: string; active: boolean }[]
}
export type TerminologyCatalog = {
  id: string
  terminology: TerminologyKind
  version: string
  source: string
  license: string
  demo: boolean
  checksum: string
}
export type TerminologySnapshot = {
  code: string
  description: string
  version: string
  source: string
  demo: boolean
}
export type TerminologyQuery = { q?: string; cursor?: string }
export interface TerminologyTransaction
  extends Pick<CareLinkTransaction, 'principal' | 'professional' | 'audit'> {
  lockTerminology(kind: TerminologyKind): Promise<void>
  catalogVersion(
    kind: TerminologyKind,
    version: string,
  ): Promise<TerminologyCatalog | null>
  activeCatalog(
    kind: TerminologyKind,
    allowDemo: boolean,
  ): Promise<TerminologyCatalog | null>
  createCatalog(
    dataset: CatalogDataset,
    checksum: string,
  ): Promise<TerminologyCatalog>
  activateCatalog(catalog: TerminologyCatalog): Promise<void>
  terminologyPage(
    catalog: TerminologyCatalog,
    query: TerminologyQuery,
  ): Promise<{
    items: { code: string; description: string }[]
    nextCursor: string | null
  }>
  terminologyCode(
    catalog: TerminologyCatalog,
    code: string,
  ): Promise<{ code: string; description: string } | null>
}
export interface TerminologyStore {
  transaction<T>(run: (tx: TerminologyTransaction) => Promise<T>): Promise<T>
}
