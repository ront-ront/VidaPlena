import type { Principal, Role } from '../../domain/rules/access'
import type { AuditWriter } from './audit-writer'

export interface AccessAccount {
  id: string
  status: string
  hasPassword: boolean
  roles: Role[]
}

export interface AccessTransaction {
  principal(userId: string, sessionId: string): Promise<Principal | null>
  account(id: string): Promise<AccessAccount | null>
  activeAdminCount(): Promise<number>
  replaceRoles(userId: string, roles: Role[], actorId: string): Promise<void>
  setStatus(userId: string, status: 'active' | 'inactive'): Promise<void>
  setDpo(userId: string, enabled: boolean, actorId: string): Promise<void>
  revokeSessions(userId: string): Promise<void>
  audit: AuditWriter
}

export interface AccessStore {
  principal(userId: string, sessionId: string): Promise<Principal | null>
  ownsPatient(userId: string, patientId: string): Promise<boolean>
  hasDpo(): Promise<boolean>
  withLock<T>(run: (transaction: AccessTransaction) => Promise<T>): Promise<T>
}
