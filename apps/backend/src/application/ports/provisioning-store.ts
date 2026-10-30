import type { Principal, Role } from '../../domain/rules/access'
import type { AuditContext, AuditWriter } from './audit-writer'
import type { NotificationEvent } from './notifications'
import type { SessionProof } from './session-verifier'

export interface ProvisionedAccount {
  id: string
  email: string
  fullName: string
  status: string
  roles: Role[]
}
export interface ProvisioningTransaction {
  principal(proof: SessionProof): Promise<Principal | null>
  firstAdmin(): Promise<ProvisionedAccount | null>
  account(id: string): Promise<ProvisionedAccount | null>
  byEmail(email: string): Promise<ProvisionedAccount | null>
  create(input: {
    email: string
    fullName: string
    role: Role
    passwordHash?: string
    actorId?: string
  }): Promise<string>
  createInvitation(input: {
    userId: string
    actorId: string
    tokenHash: string
    expiresAt: Date
  }): Promise<string>
  invitation(tokenHash: string): Promise<{
    userId: string
    expiresAt: Date
    consumedAt: Date | null
  } | null>
  consumeInvitations(userId: string, at: Date): Promise<void>
  activate(userId: string, passwordHash: string, at: Date): Promise<void>
  queue(event: NotificationEvent, encrypted: string | null): Promise<void>
  staleAccounts(cutoff: Date): Promise<{ id: string }[]>
  markForReview(id: string, at: Date): Promise<void>
  activeAdmins(): Promise<{ id: string }[]>
  audit: AuditWriter
}
export interface ProvisioningStore {
  transaction<T>(run: (tx: ProvisioningTransaction) => Promise<T>): Promise<T>
  list(
    actor: Principal,
    filters: { role?: Role; status?: string; cursor?: string },
    context: AuditContext,
  ): Promise<{ items: object[]; nextCursor: string | null }>
}
