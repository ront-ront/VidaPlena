import { createHash } from 'node:crypto'
import type { Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type { AuthStore } from '../ports/authentication'
import type { OpaqueTokens, Passwords } from '../ports/passwords'
import type { RecoveryStore, RecoveryTransaction } from '../ports/recovery'
import type { SecretBox } from '../ports/secret-box'

export class RecoverAccess {
  constructor(
    private readonly store: RecoveryStore,
    private readonly auth: AuthStore,
    private readonly audit: AuditWriter,
    private readonly passwords: Passwords,
    private readonly tokens: OpaqueTokens,
    private readonly secrets: SecretBox,
    private readonly policy: {
      resetMinutes: number
      verifyHours: number
      requestsPerHour: number
      historyCount: number
    },
    private readonly now = () => new Date(),
  ) {}

  async request(identifier: string, context: AuditContext) {
    const normalized = identifier.trim().toLowerCase()
    const key = createHash('sha256')
      .update(`password-reset:${normalized}`)
      .digest('hex')
    if (
      !(await this.auth.rateLimit(
        key,
        this.now(),
        this.policy.requestsPerHour,
        60,
      ))
    ) {
      await this.audit.append({
        ...context,
        action: 'auth.password_reset_rate_limited',
        resourceType: 'Authentication',
        resourceId: context.requestId,
      })
      throw new ApplicationError('RATE_LIMITED')
    }
    const account = await this.auth.byIdentifier(normalized)
    if (account?.status === 'active' && account.passwordHash) {
      await this.store.transaction(async (tx) => {
        const token = this.tokens.issue()
        const tokenId = await tx.createToken({
          userId: account.id,
          purpose: 'password_reset',
          tokenHash: this.tokens.digest(token),
          expiresAt: new Date(
            this.now().getTime() + this.policy.resetMinutes * 60_000,
          ),
        })
        await tx.queue(
          {
            type: 'auth.password_reset',
            aggregateId: tokenId,
            version: 1,
            userId: account.id,
            requestId: context.requestId,
          },
          this.secrets.seal(
            token,
            `notification:${account.id}:auth.password_reset`,
          ),
        )
        await this.event(
          tx,
          account.id,
          account.roles,
          'auth.password_reset_requested',
          context,
        )
      })
    } else {
      await this.audit.append({
        ...context,
        action: 'auth.password_reset_requested',
        resourceType: 'Authentication',
        resourceId: context.requestId,
      })
    }
    return { status: 'accepted' as const }
  }

  async complete(token: string, password: string, context: AuditContext) {
    return this.store.transaction(async (tx) => {
      const row = await tx.token(this.tokens.digest(token), 'password_reset')
      if (!row || row.consumedAt || row.expiresAt <= this.now())
        throw new ApplicationError('TOKEN_EXPIRED')
      const account = await tx.user(row.userId)
      if (account?.status !== 'active')
        throw new ApplicationError('TOKEN_EXPIRED')
      const history = await tx.recentHashes(
        account.id,
        this.policy.historyCount,
      )
      for (const hash of history)
        if (await this.passwords.verify(password, hash))
          throw new ApplicationError('VALIDATION_ERROR', [
            {
              field: 'newPassword',
              reason: 'Escolha uma senha que não foi usada recentemente.',
            },
          ])
      const hash = await this.passwords.hash(password)
      await tx.replacePassword(
        account.id,
        hash,
        this.now(),
        this.policy.historyCount,
      )
      await tx.consume(row.id, this.now())
      await this.event(
        tx,
        account.id,
        account.roles,
        'auth.password_reset_completed',
        context,
      )
      return { status: 'completed' as const }
    })
  }

  async requestEmailChange(
    actor: Principal,
    newEmail: string,
    context: AuditContext,
  ) {
    const normalized = newEmail.trim().toLowerCase()
    return this.store.transaction(async (tx) => {
      const current = await tx.principal(actor)
      if (!current) throw new ApplicationError('UNAUTHENTICATED')
      const account = await tx.user(current.userId)
      if (!account) throw new ApplicationError('UNAUTHENTICATED')
      if (
        account.email === normalized ||
        (await tx.emailInUse(normalized, account.id))
      )
        throw new ApplicationError('CONFLICT')
      const token = this.tokens.issue()
      const encryptedEmail = this.secrets.seal(
        normalized,
        `pending-email:${account.id}`,
      )
      const id = await tx.createToken({
        userId: account.id,
        purpose: 'email_verification',
        tokenHash: this.tokens.digest(token),
        expiresAt: new Date(
          this.now().getTime() + this.policy.verifyHours * 3_600_000,
        ),
        encryptedEmail,
      })
      await tx.queue(
        {
          type: 'contact.verification_requested',
          aggregateId: id,
          version: 1,
          userId: account.id,
          requestId: context.requestId,
        },
        this.secrets.seal(
          token,
          `notification:${account.id}:contact.verification_requested`,
        ),
        this.secrets.seal(normalized, `notification-destination:${account.id}`),
      )
      await this.event(
        tx,
        account.id,
        account.roles,
        'contact.email_change_requested',
        context,
      )
      return { status: 'pending' as const }
    })
  }

  async confirmEmail(token: string, context: AuditContext) {
    return this.store.transaction(async (tx) => {
      const row = await tx.token(
        this.tokens.digest(token),
        'email_verification',
      )
      if (
        !row ||
        row.consumedAt ||
        row.expiresAt <= this.now() ||
        !row.encryptedEmail
      )
        throw new ApplicationError('TOKEN_EXPIRED')
      const account = await tx.user(row.userId)
      if (account?.status !== 'active')
        throw new ApplicationError('TOKEN_EXPIRED')
      const email = this.secrets.open(
        row.encryptedEmail,
        `pending-email:${account.id}`,
      )
      if (await tx.emailInUse(email, account.id))
        throw new ApplicationError('CONFLICT')
      await tx.setEmail(account.id, email, this.now())
      await tx.consume(row.id, this.now())
      await this.event(
        tx,
        account.id,
        account.roles,
        'contact.email_confirmed',
        context,
      )
      return { status: 'confirmed' as const }
    })
  }

  async confirmPhoneOnsite(
    actor: Principal,
    userId: string,
    phone: string,
    context: AuditContext,
  ) {
    return this.store.transaction(async (tx) => {
      const current = await tx.principal(actor)
      if (
        !current?.mfaVerified ||
        !current.roles.some(
          (role) => role === 'receptionist' || role === 'admin',
        )
      )
        throw new ApplicationError('FORBIDDEN')
      const account = await tx.user(userId)
      if (!account?.roles.includes('patient'))
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      await tx.setPhone(userId, phone)
      await tx.audit.append({
        ...context,
        actorUserId: current.userId,
        actorRoles: current.roles,
        action: 'contact.phone_confirmed_onsite',
        resourceType: 'User',
        resourceId: userId,
        authorizationBasis: 'onsite_confirmation',
      })
      return { status: 'confirmed' as const }
    })
  }

  private event(
    tx: RecoveryTransaction,
    userId: string,
    roles: Principal['roles'],
    action: string,
    context: AuditContext,
  ) {
    return tx.audit.append({
      ...context,
      actorUserId: userId,
      actorRoles: roles,
      action,
      resourceType: 'User',
      resourceId: userId,
      authorizationBasis: 'identity',
    })
  }
}
