import type { Principal } from '../../domain/rules/access'
import type { AuditWriter } from './audit-writer'
import type { CatalogQuery, Page } from './catalog'

export type RoomInput = { name: string; active: boolean }
export type Room = RoomInput & { id: string; capacity: number; version: number }
export interface RoomTransaction {
  principal(actor: Principal): Promise<Principal | null>
  get(id: string): Promise<Room | null>
  futureAppointments(id: string): Promise<string[]>
  save(input: RoomInput, id?: string): Promise<Room>
  audit: AuditWriter
}
export interface RoomStore {
  list(query: CatalogQuery): Promise<Page<Room>>
  transaction<T>(run: (tx: RoomTransaction) => Promise<T>): Promise<T>
}
