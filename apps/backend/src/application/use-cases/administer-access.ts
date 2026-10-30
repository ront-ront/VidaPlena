import { mayAccess, type Principal, type Role } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AccessStore } from '../ports/access-store'
import type { AuditContext } from '../ports/audit-writer'

export type AccessChange =
  | { kind: 'roles'; roles: Role[] }
  | { kind: 'status'; status: 'active' | 'inactive' }
  | { kind: 'dpo'; enabled: boolean }

export class AdministerAccess {
  constructor(private readonly store: AccessStore) {}

  async execute(
    actor: Principal,
    userId: string,
    change: AccessChange,
    context: AuditContext,
  ) {
    if (!mayAccess(actor, 'admin_users'))
      throw new ApplicationError('FORBIDDEN')
    return this.store.withLock(async (tx) => {
      const currentActor = await tx.principal(actor.userId, actor.sessionId)
      if (!currentActor || !mayAccess(currentActor, 'admin_users'))
        throw new ApplicationError('FORBIDDEN')
      const account = await tx.account(userId)
      if (!account) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const removingAdmin =
        (change.kind === 'status' && change.status === 'inactive') ||
        (change.kind === 'roles' && !change.roles.includes('admin'))
      if (
        account.status === 'active' &&
        account.roles.includes('admin') &&
        removingAdmin &&
        (await tx.activeAdminCount()) <= 1
      )
        throw new ApplicationError('CONFLICT')
      if (change.kind === 'dpo') {
        if (
          change.enabled &&
          !account.roles.some((role) => role === 'admin' || role === 'manager')
        )
          throw new ApplicationError('VALIDATION_ERROR')
        await tx.setDpo(userId, change.enabled, actor.userId)
      } else if (change.kind === 'roles') {
        if (!change.roles.length) throw new ApplicationError('VALIDATION_ERROR')
        await tx.replaceRoles(userId, change.roles, actor.userId)
        if (
          !change.roles.some((role) => role === 'admin' || role === 'manager')
        )
          await tx.setDpo(userId, false, actor.userId)
      } else {
        if (change.status === 'active' && !account.hasPassword)
          throw new ApplicationError('CONFLICT')
        await tx.setStatus(userId, change.status)
      }
      await tx.revokeSessions(userId)
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: currentActor.roles,
        action: `access.${change.kind}_changed`,
        resourceType: 'User',
        resourceId: userId,
        authorizationBasis: 'role:admin',
        metadata: {
          permission: change.kind === 'dpo' ? 'privacy.dpo' : undefined,
          status:
            change.kind === 'status'
              ? change.status
              : change.kind === 'dpo'
                ? change.enabled
                  ? 'granted'
                  : 'revoked'
                : undefined,
          role: change.kind === 'roles' ? change.roles.join('/') : undefined,
        },
      })
      const updated = await tx.account(userId)
      return { userId, status: updated?.status, roles: updated?.roles }
    })
  }
}
