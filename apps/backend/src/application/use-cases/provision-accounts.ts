import { mayAccess, type Principal, type Role } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext } from '../ports/audit-writer'
import type { OpaqueTokens, Passwords } from '../ports/passwords'
import type {
  ProvisioningStore,
  ProvisioningTransaction,
} from '../ports/provisioning-store'
import type { SecretBox } from '../ports/secret-box'

export class ProvisionAccounts {
  constructor(
    private readonly store: ProvisioningStore,
    private readonly passwords: Passwords,
    private readonly tokens: OpaqueTokens,
    private readonly secrets: SecretBox,
    private readonly inviteHours: number,
    private readonly reviewDays: number,
    private readonly now = () => new Date(),
  ) {}

  async seed(
    input: { email: string; fullName: string; password: string },
    context: AuditContext,
  ) {
    const passwordHash = await this.passwords.hash(input.password)
    return this.store.transaction(async (tx) => {
      const existing = await tx.firstAdmin()
      if (existing) return { userId: existing.id, created: false }
      if (await tx.byEmail(input.email)) throw new ApplicationError('CONFLICT')
      const userId = await tx.create({
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        role: 'admin',
      })
      await tx.audit.append({
        ...context,
        actorUserId: userId,
        actorRoles: ['admin'],
        authorizationBasis: 'installation_seed',
        action: 'account.seeded',
        resourceType: 'User',
        resourceId: userId,
      })
      return { userId, created: true }
    })
  }

  async invite(
    actor: Principal,
    input: { email: string; fullName: string; role: Role },
    context: AuditContext,
  ) {
    return this.store.transaction(async (tx) => {
      await this.requireInviter(tx, actor, [input.role])
      if (await tx.byEmail(input.email)) throw new ApplicationError('CONFLICT')
      const userId = await tx.create({ ...input, actorId: actor.userId })
      return this.issue(tx, actor, userId, context)
    })
  }

  async resend(actor: Principal, userId: string, context: AuditContext) {
    return this.store.transaction(async (tx) => {
      const user = await tx.account(userId)
      if (!user) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      await this.requireInviter(tx, actor, user.roles)
      if (user.status !== 'invited') throw new ApplicationError('CONFLICT')
      await tx.consumeInvitations(userId, this.now())
      return this.issue(tx, actor, userId, context)
    })
  }

  private async patientInvitation(
    tx: ProvisioningTransaction,
    actor: Principal,
    patientId: string,
  ) {
    const current = await tx.principal(actor)
    if (!current || !mayAccess(current, 'onsite_registration'))
      throw new ApplicationError('FORBIDDEN')
    const target = await tx.patientAccount(patientId)
    if (!target) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    const user = target.account
    const unavailableReason = !user
      ? 'Este paciente não tem conta própria. O acesso de dependentes é feito pela conta do responsável.'
      : user.roles.length !== 1 || user.roles[0] !== 'patient'
        ? 'Esta conta não permite convite de paciente. Consulte a administração.'
        : user.status === 'active'
          ? 'A conta já foi ativada. Use a recuperação de senha na tela de login.'
          : user.status !== 'invited'
            ? 'A conta não está aguardando ativação. Consulte a administração.'
            : target.consentState !== 'active'
              ? 'Registre o aceite do termo vigente antes de reenviar o convite.'
              : null
    return {
      current,
      user,
      invitation: { canResend: !unavailableReason, unavailableReason },
    }
  }

  patientInvitationStatus(actor: Principal, patientId: string) {
    return this.store.transaction(
      async (tx) =>
        (await this.patientInvitation(tx, actor, patientId)).invitation,
    )
  }

  resendPatient(actor: Principal, patientId: string, context: AuditContext) {
    return this.store.transaction(async (tx) => {
      const target = await this.patientInvitation(tx, actor, patientId)
      if (!target.invitation.canResend || !target.user)
        throw new ApplicationError('CONFLICT', [
          {
            field: 'invitation',
            reason:
              target.invitation.unavailableReason ??
              'O convite não está disponível para este cadastro.',
          },
        ])
      await tx.consumeInvitations(target.user.id, this.now())
      const issued = await this.issue(
        tx,
        target.current,
        target.user.id,
        context,
        patientId,
      )
      return {
        patientId,
        status: issued.status,
        invitationExpiresAt: issued.invitationExpiresAt,
      }
    })
  }

  private async requireInviter(
    tx: ProvisioningTransaction,
    actor: Principal,
    requested: Role[],
  ) {
    const current = await tx.principal(actor)
    const allowed: Role[] = current?.roles.includes('admin')
      ? ['manager', 'receptionist', 'professional']
      : ['receptionist', 'professional']
    if (
      !current ||
      !mayAccess(current, 'invite_users') ||
      !requested.length ||
      requested.some((role) => !allowed.includes(role))
    )
      throw new ApplicationError('FORBIDDEN')
  }

  private async issue(
    tx: ProvisioningTransaction,
    actor: Principal,
    userId: string,
    context: AuditContext,
    patientId?: string,
  ) {
    const token = this.tokens.issue()
    const expiresAt = new Date(
      this.now().getTime() + this.inviteHours * 3600000,
    )
    const id = await tx.createInvitation({
      userId,
      actorId: actor.userId,
      tokenHash: this.tokens.digest(token),
      expiresAt,
    })
    await tx.queue(
      {
        type: 'account.invited',
        aggregateId: id,
        version: 1,
        userId,
        requestId: context.requestId,
      },
      this.secrets.seal(token, `notification:${userId}:account.invited`),
    )
    await tx.audit.append({
      ...context,
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      action: 'account.invited',
      resourceType: 'User',
      resourceId: userId,
      subjectPatientId: patientId,
      authorizationBasis: patientId
        ? 'role:onsite_registration'
        : 'role:inviter',
    })
    return { userId, status: 'invited', invitationExpiresAt: expiresAt }
  }

  async inspect(token: string) {
    return this.store.transaction(async (tx) => {
      const { invitation, account } = await this.validInvitation(tx, token)
      return {
        fullName: account.fullName,
        roles: account.roles,
        expiresAt: invitation.expiresAt,
      }
    })
  }

  private async validInvitation(tx: ProvisioningTransaction, token: string) {
    const invitation = await tx.invitation(this.tokens.digest(token))
    if (
      !invitation ||
      invitation.consumedAt ||
      invitation.expiresAt <= this.now()
    )
      throw new ApplicationError('TOKEN_EXPIRED')
    const account = await tx.account(invitation.userId)
    if (account?.status !== 'invited')
      throw new ApplicationError('TOKEN_EXPIRED')
    return { invitation, account }
  }

  async accept(token: string, password: string, context: AuditContext) {
    // Validate token before password hashing; transaction revalidates after hashing.
    await this.inspect(token)
    const passwordHash = await this.passwords.hash(password)
    return this.store.transaction(async (tx) => {
      const { invitation, account } = await this.validInvitation(tx, token)
      await tx.activate(account.id, passwordHash, this.now())
      await tx.consumeInvitations(invitation.userId, this.now())
      await tx.audit.append({
        ...context,
        actorUserId: account.id,
        actorRoles: account.roles,
        action: 'account.activated',
        resourceType: 'User',
        resourceId: account.id,
        authorizationBasis: 'invitation_token',
      })
      return { status: 'active' }
    })
  }

  async reviewInactive(context: AuditContext) {
    const at = this.now()
    return this.store.transaction(async (tx) => {
      const admins = await tx.activeAdmins()
      const stale = await tx.staleAccounts(
        new Date(at.getTime() - this.reviewDays * 86400000),
      )
      for (const account of stale) {
        await tx.markForReview(account.id, at)
        for (const admin of admins)
          await tx.queue(
            {
              type: 'account.inactivity_review',
              aggregateId: account.id,
              version: at.getTime(),
              userId: admin.id,
              requestId: context.requestId,
            },
            null,
          )
        await tx.audit.append({
          ...context,
          action: 'account.review_required',
          resourceType: 'User',
          resourceId: account.id,
          authorizationBasis: 'inactivity_review',
          metadata: { status: 'review_required' },
        })
      }
      return { marked: stale.length }
    })
  }
}
