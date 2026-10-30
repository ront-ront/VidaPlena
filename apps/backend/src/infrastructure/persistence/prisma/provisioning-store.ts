import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditContext } from '../../../application/ports/audit-writer'
import type {
  ProvisioningStore,
  ProvisioningTransaction,
} from '../../../application/ports/provisioning-store'
import {
  mayAccess,
  type Principal,
  type Role,
} from '../../../domain/rules/access'
import type { PrismaClient } from '../../../generated/prisma/client'
import { readPrincipal } from './access-store'
import { PrismaAuditWriter } from './audit-writer'
import {
  enqueueNotification,
  lockNotificationRecipient,
} from './notification-store'

export class PrismaProvisioningStore implements ProvisioningStore {
  constructor(private readonly db: PrismaClient) {}
  transaction<T>(run: (tx: ProvisioningTransaction) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        // Same lock as administrative role/status changes, including seed and acceptance.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
        const account = async (where: { id: string } | { email: string }) => {
          const user = await tx.user.findUnique({
            where,
            include: { roles: { where: { revokedAt: null } } },
          })
          return user
            ? {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                status: user.status,
                roles: user.roles.map((item) => item.roleCode as Role),
              }
            : null
        }
        return run({
          principal: (proof) =>
            readPrincipal(tx, proof.userId, proof.sessionId),
          firstAdmin: async () => {
            // Inactive historical admins also prevent silently provisioning a replacement.
            const existing = await tx.userRoleAssignment.findFirst({
              where: { roleCode: 'admin' },
              orderBy: { grantedAt: 'asc' },
              select: { userId: true },
            })
            return existing ? account({ id: existing.userId }) : null
          },
          account: (id) => account({ id }),
          byEmail: (email) => account({ email: email.trim().toLowerCase() }),
          create: async (input) => {
            const user = await tx.user.create({
              data: {
                email: input.email.trim().toLowerCase(),
                fullName: input.fullName,
                status: input.passwordHash ? 'active' : 'invited',
                passwordHash: input.passwordHash,
                emailVerifiedAt: input.passwordHash ? new Date() : null,
                roles: {
                  create: { roleCode: input.role, grantedBy: input.actorId },
                },
                ...(input.passwordHash
                  ? {
                      passwordHistory: {
                        create: { passwordHash: input.passwordHash },
                      },
                    }
                  : {}),
              },
            })
            return user.id
          },
          createInvitation: async (input) =>
            (
              await tx.invitation.create({
                data: {
                  userId: input.userId,
                  invitedBy: input.actorId,
                  tokenHash: input.tokenHash,
                  expiresAt: input.expiresAt,
                },
              })
            ).id,
          invitation: (tokenHash) =>
            tx.invitation.findUnique({
              where: { tokenHash },
              select: { userId: true, expiresAt: true, consumedAt: true },
            }),
          consumeInvitations: async (userId, consumedAt) => {
            await lockNotificationRecipient(tx, userId)
            await tx.invitation.updateMany({
              where: { userId, consumedAt: null },
              data: { consumedAt },
            })
            // A resent/consumed invitation must not remain eligible in the pending outbox.
            await tx.notification.updateMany({
              where: {
                userId,
                templateKey: 'account.invited',
                deliveryStatus: { in: ['queued', 'retry'] },
              },
              data: {
                deliveryStatus: 'suppressed',
                payloadEncrypted: null,
                failureReasonSafe: 'token_invalidated',
              },
            })
          },
          activate: async (id, passwordHash, at) => {
            await tx.user.update({
              where: { id },
              data: {
                passwordHash,
                status: 'active',
                emailVerifiedAt: at,
                credentialVersion: { increment: 1 },
                passwordHistory: { create: { passwordHash } },
              },
            })
            await tx.session.updateMany({
              where: { userId: id, revokedAt: null },
              data: { revokedAt: at },
            })
          },
          queue: async (event, encrypted) => {
            await enqueueNotification(tx, event, encrypted)
          },
          staleAccounts: (cutoff) =>
            tx.user.findMany({
              where: {
                status: 'active',
                reviewRequiredAt: null,
                roles: {
                  some: { roleCode: { not: 'patient' }, revokedAt: null },
                },
                OR: [
                  { lastLoginAt: { lt: cutoff } },
                  { lastLoginAt: null, createdAt: { lt: cutoff } },
                ],
              },
              take: 100,
              orderBy: { id: 'asc' },
              select: { id: true },
            }),
          markForReview: async (id, reviewRequiredAt) => {
            await tx.user.update({ where: { id }, data: { reviewRequiredAt } })
          },
          activeAdmins: () =>
            tx.user.findMany({
              where: {
                status: 'active',
                roles: { some: { roleCode: 'admin', revokedAt: null } },
              },
              select: { id: true },
            }),
          audit: new PrismaAuditWriter(tx),
        })
      },
      { timeout: 10000 },
    )
  }

  async list(
    actor: Principal,
    filters: { role?: Role; status?: string; cursor?: string },
    context: AuditContext,
  ) {
    if (!mayAccess(actor, 'invite_users'))
      throw new ApplicationError('FORBIDDEN')
    const allowed = actor.roles.includes('admin')
      ? ['admin', 'manager', 'professional', 'receptionist']
      : ['professional', 'receptionist']
    if (filters.role && !allowed.includes(filters.role))
      throw new ApplicationError('FORBIDDEN')
    const rows = await this.db.user.findMany({
      where: {
        ...(filters.status
          ? {
              status: filters.status as
                | 'active'
                | 'inactive'
                | 'invited'
                | 'locked',
            }
          : {}),
        roles: {
          some: {
            roleCode: { in: filters.role ? [filters.role] : allowed },
            revokedAt: null,
          },
        },
      },
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      take: 51,
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        lastLoginAt: true,
        reviewRequiredAt: true,
        roles: { where: { revokedAt: null }, select: { roleCode: true } },
        permissions: {
          where: { revokedAt: null },
          select: { permissionCode: true },
        },
      },
    })
    await new PrismaAuditWriter(this.db).append({
      ...context,
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      authorizationBasis: 'role:account_management',
      action: 'account.listed',
      resourceType: 'UserCollection',
      resourceId: actor.userId,
      metadata: { count: Math.min(rows.length, 50) },
    })
    return {
      items: rows.slice(0, 50).map(({ roles, permissions, ...row }) => ({
        ...row,
        roles: roles.map((role) => role.roleCode),
        permissions: permissions.map((permission) => permission.permissionCode),
      })),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    }
  }
}
