import type { Principal, Role } from '../../domain/rules/access'
import type { AuditWriter } from './audit-writer'
import type { NotificationEvent } from './notifications'

export interface RecoveryToken {
  id: string
  userId: string
  expiresAt: Date
  consumedAt: Date | null
  encryptedEmail: string | null
}
export interface RecoveryTransaction {
  principal(proof: {
    userId: string
    sessionId: string
  }): Promise<Principal | null>
  user(id: string): Promise<{
    id: string
    email: string
    status: string
    roles: Role[]
  } | null>
  createToken(input: {
    userId: string
    purpose: 'password_reset' | 'email_verification'
    tokenHash: string
    expiresAt: Date
    encryptedEmail?: string
  }): Promise<string>
  token(tokenHash: string, purpose: string): Promise<RecoveryToken | null>
  consume(id: string, at: Date): Promise<void>
  recentHashes(userId: string, limit: number): Promise<string[]>
  replacePassword(
    userId: string,
    hash: string,
    at: Date,
    keep: number,
  ): Promise<void>
  emailInUse(email: string, exceptUserId: string): Promise<boolean>
  setEmail(userId: string, email: string, at: Date): Promise<void>
  setPhone(userId: string, phone: string): Promise<void>
  queue(
    event: NotificationEvent,
    encryptedToken: string,
    encryptedDestination?: string,
  ): Promise<void>
  audit: AuditWriter
}
export interface RecoveryStore {
  transaction<T>(run: (tx: RecoveryTransaction) => Promise<T>): Promise<T>
}
