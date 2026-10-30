import type {
  RecoveryStore,
  RecoveryToken,
  RecoveryTransaction,
} from '../../../application/ports/recovery'
import type { Role } from '../../../domain/rules/access'
import type { PrismaClient } from '../../../generated/prisma/client'
import { readPrincipal } from './access-store'
import { PrismaAuditWriter } from './audit-writer'
import { enqueueNotification } from './notification-store'

export class PrismaRecoveryStore implements RecoveryStore {
  constructor(private readonly db: PrismaClient) {}

  transaction<T>(run: (tx: RecoveryTransaction) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
        const adapter: RecoveryTransaction = {
          principal: (proof) =>
            readPrincipal(tx, proof.userId, proof.sessionId),
          user: async (id) => {
            const row = await tx.user.findUnique({
              where: { id },
              include: { roles: { where: { revokedAt: null } } },
            })
            return row
              ? {
                  id: row.id,
                  email: row.email,
                  status: row.status,
                  roles: row.roles.map((role) => role.roleCode as Role),
                }
              : null
          },
          createToken: async (input) => {
            const row = await tx.oneTimeToken.create({
              data: {
                userId: input.userId,
                purpose: input.purpose,
                tokenHash: input.tokenHash,
                expiresAt: input.expiresAt,
                payload: input.encryptedEmail
                  ? { encryptedEmail: input.encryptedEmail }
                  : undefined,
              },
            })
            return row.id
          },
          token: async (tokenHash, purpose): Promise<RecoveryToken | null> => {
            const row = await tx.oneTimeToken.findFirst({
              where: { tokenHash, purpose },
            })
            if (!row) return null
            const payload = row.payload as { encryptedEmail?: string } | null
            return {
              id: row.id,
              userId: row.userId,
              expiresAt: row.expiresAt,
              consumedAt: row.consumedAt,
              encryptedEmail: payload?.encryptedEmail ?? null,
            }
          },
          consume: async (id, at) => {
            await tx.oneTimeToken.update({
              where: { id },
              data: { consumedAt: at, payload: { consumed: true } },
            })
          },
          recentHashes: async (userId, limit) => {
            const rows = await tx.passwordHistory.findMany({
              where: { userId },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: limit,
              select: { passwordHash: true },
            })
            return rows.map((row) => row.passwordHash)
          },
          replacePassword: async (userId, hash, at, keep) => {
            await tx.user.update({
              where: { id: userId },
              data: {
                passwordHash: hash,
                failedLoginCount: 0,
                lockUntil: null,
                credentialVersion: { increment: 1 },
              },
            })
            await tx.passwordHistory.create({
              data: { userId, passwordHash: hash, createdAt: at },
            })
            const history = await tx.passwordHistory.findMany({
              where: { userId },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip: keep,
              select: { id: true },
            })
            if (history.length)
              await tx.passwordHistory.deleteMany({
                where: { id: { in: history.map((row) => row.id) } },
              })
            await tx.session.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: at },
            })
          },
          emailInUse: async (email, exceptUserId) =>
            !!(await tx.user.findFirst({
              where: { email, id: { not: exceptUserId } },
              select: { id: true },
            })),
          setEmail: async (userId, email, at) => {
            await tx.user.update({
              where: { id: userId },
              data: {
                email,
                emailVerifiedAt: at,
                credentialVersion: { increment: 1 },
              },
            })
            await tx.patientProfile.updateMany({
              where: { userId },
              data: { email },
            })
            await tx.session.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: at },
            })
          },
          setPhone: async (userId, phone) => {
            await tx.user.update({ where: { id: userId }, data: { phone } })
            await tx.patientProfile.updateMany({
              where: { userId },
              data: { phone },
            })
          },
          queue: async (event, encryptedToken, encryptedDestination) => {
            await enqueueNotification(
              tx,
              event,
              encryptedToken,
              encryptedDestination ?? null,
            )
          },
          audit: new PrismaAuditWriter(tx),
        }
        return run(adapter)
      },
      { timeout: 15000 },
    )
  }
}
