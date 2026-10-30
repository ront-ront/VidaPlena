import type { Principal, Role } from '../../domain/rules/access'
import type { AuditWriter } from './audit-writer'
import type { NotificationEvent } from './notifications'
import type { SessionProof, SessionVerifier } from './session-verifier'

export interface AuthPolicy {
  accessMinutes: number
  refreshDays: number
  internalIdleMinutes: number
  patientIdleMinutes: number
  failedLimit: number
  lockMinutes: number
  challengeMinutes: number
}
export interface AuthAccount {
  id: string
  email: string
  fullName: string
  status: string
  passwordHash: string | null
  roles: Role[]
  permissions: string[]
  failedLoginCount: number
  lockUntil: Date | null
  credentialVersion: number
  mfaSecretEncrypted: string | null
  mfaLastUsedStep: number | null
}
export interface AuthChallenge {
  id: string
  userId: string
  expiresAt: Date
  consumedAt: Date | null
  credentialVersion: number
  secretEncrypted: string | null
}
export interface AuthSession {
  id: string
  userId: string
  expiresAt: Date
  lastActivityAt: Date
  revokedAt: Date | null
  csrfTokenHash: string | null
  mfaVerifiedAt: Date | null
}
export interface AuthTransaction {
  account(id: string): Promise<AuthAccount | null>
  createChallenge(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    credentialVersion: number,
    secretEncrypted: string | null,
  ): Promise<void>
  challenge(tokenHash: string): Promise<AuthChallenge | null>
  consumeChallenge(id: string, at: Date): Promise<void>
  failed(
    userId: string,
    count: number,
    lockUntil: Date | null,
    at: Date,
  ): Promise<void>
  succeeded(
    userId: string,
    at: Date,
    mfa?: { encrypted: string; step: number },
  ): Promise<void>
  createSession(
    userId: string,
    refreshHash: string,
    csrfHash: string,
    at: Date,
    expiresAt: Date,
    mfa: boolean,
  ): Promise<AuthSession>
  refresh(tokenHash: string): Promise<{
    session: AuthSession
    csrfTokenHash: string
    usedAt: Date | null
    expiresAt: Date
  } | null>
  rotate(
    sessionId: string,
    previousHash: string,
    refreshHash: string,
    csrfHash: string,
    at: Date,
    expiresAt: Date,
  ): Promise<void>
  revoke(sessionId: string, at: Date): Promise<void>
  portalAllowed(account: AuthAccount): Promise<boolean>
  adminIds(): Promise<string[]>
  queue(event: NotificationEvent): Promise<void>
  audit: AuditWriter
}
export interface AuthStore {
  byIdentifier(identifier: string): Promise<AuthAccount | null>
  rateLimit(
    key: string,
    now: Date,
    limit: number,
    windowMinutes?: number,
  ): Promise<boolean>
  transaction<T>(run: (tx: AuthTransaction) => Promise<T>): Promise<T>
  current(principal: Principal): Promise<{
    id: string
    roles: Role[]
    permissions: string[]
    profile: { fullName: string; email: string; phone: string | null }
    consentState: string
  } | null>
}
export interface AccessTokens extends SessionVerifier {
  issue(proof: SessionProof, expiresAt: Date): Promise<string>
}
export interface TotpProvider {
  createSecret(): string
  uri(secret: string, label: string): string
  verify(secret: string, code: string, at: Date): number | null
}
