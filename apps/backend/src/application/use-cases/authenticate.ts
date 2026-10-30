import { ApplicationError, type ErrorCode } from '../errors/application-error'
import type { AuditContext } from '../ports/audit-writer'
import type {
  AccessTokens,
  AuthAccount,
  AuthPolicy,
  AuthSession,
  AuthStore,
  AuthTransaction,
  TotpProvider,
} from '../ports/authentication'
import type { OpaqueTokens, Passwords } from '../ports/passwords'
import type { SecretBox } from '../ports/secret-box'

export class Authenticate {
  constructor(
    private readonly store: AuthStore,
    private readonly passwords: Passwords,
    private readonly opaque: OpaqueTokens,
    private readonly access: AccessTokens,
    private readonly totp: TotpProvider,
    private readonly secrets: SecretBox,
    private readonly policy: AuthPolicy,
    private readonly dummyHash: string,
    private readonly now = () => new Date(),
  ) {}

  async login(identifier: string, password: string, context: AuditContext) {
    const found = await this.store.byIdentifier(identifier)
    const valid = await this.passwords.verify(
      password,
      found?.passwordHash ?? this.dummyHash,
    )
    const result = await this.store.transaction(async (tx) => {
      const user = found ? await tx.account(found.id) : null
      if (!user?.passwordHash || ['invited', 'inactive'].includes(user.status))
        return this.denied(tx, 'auth.login_failed', context, user)
      if (user.lockUntil && user.lockUntil > this.now())
        return this.denied(
          tx,
          'auth.login_locked',
          context,
          user,
          'ACCOUNT_LOCKED',
        )
      if (!valid || user.passwordHash !== found?.passwordHash)
        return this.failure(tx, user, context, 'auth.login_failed')
      if (!(await tx.portalAllowed(user)))
        return this.denied(
          tx,
          'auth.consent_denied',
          context,
          user,
          'CONSENT_REQUIRED',
        )
      if (user.roles.some((role) => role !== 'patient')) {
        const challengeId = this.opaque.issue()
        const expiresAt = new Date(
          this.now().getTime() + this.policy.challengeMinutes * 60000,
        )
        const encrypted = user.mfaSecretEncrypted
          ? null
          : this.secrets.seal(this.totp.createSecret(), `mfa:${user.id}`)
        await tx.createChallenge(
          user.id,
          this.opaque.digest(challengeId),
          expiresAt,
          user.credentialVersion,
          encrypted,
        )
        await this.audit(tx, 'auth.mfa_challenged', context, user)
        return {
          status: 'mfa_required' as const,
          challengeId,
          expiresAt,
          enrollmentRequired: !user.mfaSecretEncrypted,
        }
      }
      await tx.succeeded(user.id, this.now())
      await this.audit(tx, 'auth.login_succeeded', context, user)
      return this.newSession(tx, user, false)
    })
    return this.unwrap(result)
  }

  async enroll(challengeId: string, context: AuditContext) {
    const result = await this.store.transaction(async (tx) => {
      const valid = await this.challenge(tx, challengeId)
      if (
        !valid ||
        valid.user.mfaSecretEncrypted ||
        !valid.challenge.secretEncrypted
      )
        return this.denied(
          tx,
          'auth.mfa_enrollment_denied',
          context,
          valid?.user,
        )
      const secret = this.secrets.open(
        valid.challenge.secretEncrypted,
        `mfa:${valid.user.id}`,
      )
      await this.audit(tx, 'auth.mfa_enrollment_viewed', context, valid.user)
      return { secret, otpauthUri: this.totp.uri(secret, valid.user.email) }
    })
    return this.unwrap(result)
  }

  async verifyMfa(challengeId: string, code: string, context: AuditContext) {
    const result = await this.store.transaction(async (tx) => {
      const valid = await this.challenge(tx, challengeId)
      if (!valid) return this.denied(tx, 'auth.mfa_failed', context)
      const { user, challenge } = valid
      const encrypted = user.mfaSecretEncrypted ?? challenge.secretEncrypted
      if (!encrypted) return this.denied(tx, 'auth.mfa_failed', context, user)
      const step = this.totp.verify(
        this.secrets.open(encrypted, `mfa:${user.id}`),
        code,
        this.now(),
      )
      if (
        step === null ||
        (user.mfaLastUsedStep !== null && step <= user.mfaLastUsedStep)
      )
        return this.failure(tx, user, context, 'auth.mfa_failed')
      if (!(await tx.portalAllowed(user)))
        return this.denied(
          tx,
          'auth.consent_denied',
          context,
          user,
          'CONSENT_REQUIRED',
        )
      await tx.succeeded(user.id, this.now(), { encrypted, step })
      await tx.consumeChallenge(challenge.id, this.now())
      await this.audit(tx, 'auth.mfa_succeeded', context, user)
      await this.audit(tx, 'auth.login_succeeded', context, user)
      return this.newSession(tx, user, true)
    })
    return this.unwrap(result)
  }

  private async challenge(tx: AuthTransaction, token: string) {
    const challenge = await tx.challenge(this.opaque.digest(token))
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= this.now())
      return null
    const user = await tx.account(challenge.userId)
    if (
      !user ||
      !['active', 'locked'].includes(user.status) ||
      (user.lockUntil && user.lockUntil > this.now()) ||
      user.credentialVersion !== challenge.credentialVersion
    )
      return null
    return { user, challenge }
  }

  private async newSession(
    tx: AuthTransaction,
    user: AuthAccount,
    mfa: boolean,
  ) {
    const refreshToken = this.opaque.issue()
    const csrfToken = this.opaque.issue()
    const refreshExpiresAt = new Date(
      this.now().getTime() + this.policy.refreshDays * 86400000,
    )
    const session = await tx.createSession(
      user.id,
      this.opaque.digest(refreshToken),
      this.opaque.digest(csrfToken),
      this.now(),
      refreshExpiresAt,
      mfa,
    )
    return this.tokens(user, session, refreshToken, csrfToken)
  }

  private async tokens(
    user: AuthAccount,
    session: AuthSession,
    refreshToken: string,
    csrfToken: string,
  ) {
    const expiresAt = new Date(
      Math.min(
        session.expiresAt.getTime(),
        this.now().getTime() + this.policy.accessMinutes * 60000,
      ),
    )
    return {
      status: 'authenticated' as const,
      accessToken: await this.access.issue(
        { userId: user.id, sessionId: session.id },
        expiresAt,
      ),
      expiresAt,
      refreshToken,
      csrfToken,
      refreshExpiresAt: session.expiresAt,
      user: { id: user.id, roles: user.roles, permissions: user.permissions },
    }
  }

  async refresh(
    refreshToken: string,
    csrfToken: string,
    context: AuditContext,
  ) {
    const result = await this.store.transaction(async (tx) => {
      const oldHash = this.opaque.digest(refreshToken)
      const found = await tx.refresh(oldHash)
      if (!found) return this.denied(tx, 'auth.refresh_failed', context)
      const user = await tx.account(found.session.userId)
      if (!user) return this.denied(tx, 'auth.refresh_failed', context)
      // Validate CSRF before treating a replay as compromise; no unauthenticated logout attack.
      if (found.csrfTokenHash !== this.opaque.digest(csrfToken))
        return this.denied(tx, 'auth.csrf_failed', context, user, 'FORBIDDEN')
      if (found.usedAt) {
        await tx.revoke(found.session.id, this.now())
        return this.denied(tx, 'auth.refresh_reused', context, user)
      }
      if (
        !this.sessionValid(found.session, user) ||
        found.expiresAt <= this.now() ||
        !(await tx.portalAllowed(user))
      ) {
        await tx.revoke(found.session.id, this.now())
        return this.denied(tx, 'auth.refresh_expired', context, user)
      }
      const refresh = this.opaque.issue()
      const csrf = this.opaque.issue()
      await tx.rotate(
        found.session.id,
        oldHash,
        this.opaque.digest(refresh),
        this.opaque.digest(csrf),
        this.now(),
        found.session.expiresAt,
      )
      await this.audit(tx, 'auth.refreshed', context, user)
      return this.tokens(user, found.session, refresh, csrf)
    })
    return this.unwrap(result)
  }

  async logout(refreshToken: string, csrfToken: string, context: AuditContext) {
    const result = await this.store.transaction(async (tx) => {
      const found = await tx.refresh(this.opaque.digest(refreshToken))
      if (!found) return this.denied(tx, 'auth.logout_failed', context)
      const user = await tx.account(found.session.userId)
      if (found.csrfTokenHash !== this.opaque.digest(csrfToken))
        return this.denied(tx, 'auth.csrf_failed', context, user, 'FORBIDDEN')
      await tx.revoke(found.session.id, this.now())
      await this.audit(tx, 'auth.logged_out', context, user)
      return { loggedOut: true }
    })
    return this.unwrap(result)
  }

  private sessionValid(session: AuthSession, user: AuthAccount) {
    const internal = user.roles.some((role) => role !== 'patient')
    const idle = internal
      ? this.policy.internalIdleMinutes
      : this.policy.patientIdleMinutes
    return (
      !session.revokedAt &&
      session.expiresAt > this.now() &&
      this.now().getTime() - session.lastActivityAt.getTime() < idle * 60000 &&
      user.status === 'active' &&
      (!internal || !!session.mfaVerifiedAt)
    )
  }

  private async failure(
    tx: AuthTransaction,
    user: AuthAccount,
    context: AuditContext,
    action: string,
  ) {
    const count =
      (user.lockUntil && user.lockUntil <= this.now()
        ? 0
        : user.failedLoginCount) + 1
    const locked = count >= this.policy.failedLimit
    const lockUntil = locked
      ? new Date(this.now().getTime() + this.policy.lockMinutes * 60000)
      : null
    await tx.failed(user.id, count, lockUntil, this.now())
    if (locked) {
      const recipients = new Set([user.id, ...(await tx.adminIds())])
      for (const userId of recipients)
        await tx.queue({
          type: 'auth.account_locked',
          aggregateId: user.id,
          version: this.now().getTime(),
          userId,
          requestId: context.requestId,
        })
      await this.audit(tx, 'auth.account_locked', context, user)
    }
    return this.denied(
      tx,
      action,
      context,
      user,
      locked ? 'ACCOUNT_LOCKED' : 'UNAUTHENTICATED',
    )
  }

  private audit(
    tx: AuthTransaction,
    action: string,
    context: AuditContext,
    user?: AuthAccount | null,
  ) {
    return tx.audit.append({
      ...context,
      actorUserId: user?.id,
      actorRoles: user?.roles ?? [],
      action,
      authorizationBasis: 'authentication',
      resourceType: 'Authentication',
      resourceId: user?.id ?? context.requestId,
    })
  }
  private async denied(
    tx: AuthTransaction,
    action: string,
    context: AuditContext,
    user?: AuthAccount | null,
    error: ErrorCode = 'UNAUTHENTICATED',
  ) {
    await this.audit(tx, action, context, user)
    return { error }
  }
  private unwrap<T>(value: T | { error: ErrorCode }): T {
    if (value && typeof value === 'object' && 'error' in value)
      throw new ApplicationError(value.error as ErrorCode)
    return value as T
  }
}
