import type {
  AccessStore,
  AccessTransaction,
} from '../../../application/ports/access-store'
import type { Role } from '../../../domain/rules/access'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { PrismaAuditWriter } from './audit-writer'
import { userDataConsentState } from './consent-state'

export class PrismaAccessStore implements AccessStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly idlePolicy = { internalMinutes: 30, patientMinutes: 60 },
    private readonly now = () => new Date(),
  ) {}

  async principal(userId: string, sessionId: string) {
    return readPrincipal(
      this.db,
      userId,
      sessionId,
      this.idlePolicy,
      this.now(),
    )
  }

  async ownsPatient(userId: string, patientId: string) {
    return !!(await this.db.patientProfile.findFirst({
      where: {
        id: patientId,
        OR: [
          { userId },
          {
            guardians: {
              some: { guardianUserId: userId, status: 'active', endedAt: null },
            },
          },
        ],
      },
      select: { id: true },
    }))
  }

  async hasDpo() {
    return (
      (await this.db.userPermissionGrant.count({
        where: {
          permissionCode: 'privacy.dpo',
          revokedAt: null,
          user: {
            status: 'active',
            roles: {
              some: { roleCode: { in: ['admin', 'manager'] }, revokedAt: null },
            },
          },
        },
      })) > 0
    )
  }

  withLock<T>(run: (transaction: AccessTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
      return run({
        principal: (userId, sessionId) => readPrincipal(tx, userId, sessionId),
        account: async (id) => {
          const user = await tx.user.findUnique({
            where: { id },
            include: { roles: { where: { revokedAt: null } } },
          })
          return user
            ? {
                id,
                status: user.status,
                hasPassword: !!user.passwordHash,
                roles: user.roles.map((r) => r.roleCode as Role),
              }
            : null
        },
        activeAdminCount: () =>
          tx.user.count({
            where: {
              status: 'active',
              roles: { some: { roleCode: 'admin', revokedAt: null } },
            },
          }),
        replaceRoles: async (userId, roles, grantedBy) => {
          await tx.userRoleAssignment.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          })
          await tx.userRoleAssignment.createMany({
            data: [...new Set(roles)].map((roleCode) => ({
              userId,
              roleCode,
              grantedBy,
            })),
          })
        },
        setStatus: async (id, status) => {
          await tx.user.update({ where: { id }, data: { status } })
        },
        setDpo: async (userId, enabled, grantedBy) => {
          await tx.userPermissionGrant.updateMany({
            where: { userId, permissionCode: 'privacy.dpo', revokedAt: null },
            data: { revokedAt: new Date() },
          })
          if (enabled)
            await tx.userPermissionGrant.create({
              data: { userId, permissionCode: 'privacy.dpo', grantedBy },
            })
        },
        revokeSessions: async (userId) => {
          await tx.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        },
        audit: new PrismaAuditWriter(tx),
      })
    })
  }
}

export async function readPrincipal(
  db: Prisma.TransactionClient,
  userId: string,
  sessionId: string,
  idlePolicy = { internalMinutes: 30, patientMinutes: 60 },
  now = new Date(),
) {
  const session = await db.session.findFirst({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: { gt: now },
      user: { status: 'active' },
    },
    include: {
      user: {
        include: {
          roles: { where: { revokedAt: null } },
          permissions: { where: { revokedAt: null } },
        },
      },
    },
  })
  if (!session) return null
  const consentState = session.user.roles.some(
    (role) => role.roleCode === 'patient',
  )
    ? await userDataConsentState(db, userId, now)
    : undefined
  if (consentState === 'revoked') return null
  const internal = session.user.roles.some(
    (role) => role.roleCode !== 'patient',
  )
  const idleMinutes = internal
    ? idlePolicy.internalMinutes
    : idlePolicy.patientMinutes
  const cutoff = new Date(now.getTime() - idleMinutes * 60_000)
  if (session.lastActivityAt <= cutoff || (internal && !session.mfaVerifiedAt))
    return null
  const touched = await db.session.updateMany({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
      lastActivityAt: { gt: cutoff },
    },
    data: { lastActivityAt: now },
  })
  if (touched.count !== 1) return null
  return {
    userId,
    sessionId,
    roles: session.user.roles.map((r) => r.roleCode as Role),
    permissions: session.user.permissions.map((p) => p.permissionCode),
    mfaVerified: session.mfaVerifiedAt !== null,
    consentState,
  }
}
