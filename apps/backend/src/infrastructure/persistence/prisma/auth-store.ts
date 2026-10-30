import type {
  AuthAccount,
  AuthChallenge,
  AuthStore,
  AuthTransaction,
} from '../../../application/ports/authentication'
import type { Role } from '../../../domain/rules/access'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { PrismaAuditWriter } from './audit-writer'
import { userDataConsentState } from './consent-state'
import { enqueueNotification } from './notification-store'

type Database = PrismaClient | Prisma.TransactionClient

async function account(db: Database, id: string): Promise<AuthAccount | null> {
  const user = await db.user.findUnique({
    where: { id },
    include: {
      roles: { where: { revokedAt: null } },
      permissions: { where: { revokedAt: null } },
    },
  })
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    passwordHash: user.passwordHash,
    roles: user.roles.map((role) => role.roleCode as Role),
    permissions: user.permissions.map((grant) => grant.permissionCode),
    failedLoginCount: user.failedLoginCount,
    lockUntil: user.lockUntil,
    credentialVersion: user.credentialVersion,
    mfaSecretEncrypted: user.mfaSecretEncrypted,
    mfaLastUsedStep: user.mfaLastUsedStep,
  }
}

export class PrismaAuthStore implements AuthStore {
  constructor(private readonly db: PrismaClient) {}

  async byIdentifier(identifier: string) {
    const normalized = identifier.trim().toLowerCase()
    const user = /^[0-9]{11}$/.test(normalized)
      ? await this.db.user.findFirst({
          where: { patient: { is: { cpf: normalized } } },
          select: { id: true },
        })
      : await this.db.user.findUnique({
          where: { email: normalized },
          select: { id: true },
        })
    return user ? account(this.db, user.id) : null
  }

  async rateLimit(key: string, now: Date, limit: number, windowMinutes = 1) {
    const expiry = new Date(now.getTime() + windowMinutes * 60_000)
    const rows = await this.db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
      VALUES (${key}, 1, ${expiry})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now}
          THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now}
          THEN ${expiry} ELSE "RateLimitBucket"."expiresAt" END
      RETURNING "count"
    `
    return rows[0].count <= limit
  }

  transaction<T>(run: (tx: AuthTransaction) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        // Serialize account and session transitions with the BE-005/007 account lock.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
        const adapter: AuthTransaction = {
          account: (id) => account(tx, id),
          createChallenge: async (
            userId,
            tokenHash,
            expiresAt,
            credentialVersion,
            secretEncrypted,
          ) => {
            await tx.oneTimeToken.create({
              data: {
                userId,
                purpose: 'mfa_challenge',
                tokenHash,
                expiresAt,
                payload: { credentialVersion, secretEncrypted },
              },
            })
          },
          challenge: async (tokenHash): Promise<AuthChallenge | null> => {
            const row = await tx.oneTimeToken.findFirst({
              where: { tokenHash, purpose: 'mfa_challenge' },
            })
            if (!row) return null
            const payload = row.payload as {
              credentialVersion?: number
              secretEncrypted?: string | null
            } | null
            return {
              id: row.id,
              userId: row.userId,
              expiresAt: row.expiresAt,
              consumedAt: row.consumedAt,
              credentialVersion: payload?.credentialVersion ?? -1,
              secretEncrypted: payload?.secretEncrypted ?? null,
            }
          },
          consumeChallenge: async (id, at) => {
            await tx.oneTimeToken.update({
              where: { id },
              data: { consumedAt: at, payload: { consumed: true } },
            })
          },
          failed: async (userId, count, lockUntil) => {
            await tx.user.update({
              where: { id: userId },
              data: { failedLoginCount: count, lockUntil },
            })
          },
          succeeded: async (userId, at, mfa) => {
            await tx.user.update({
              where: { id: userId },
              data: {
                failedLoginCount: 0,
                lockUntil: null,
                lastLoginAt: at,
                ...(mfa
                  ? {
                      mfaSecretEncrypted: mfa.encrypted,
                      mfaLastUsedStep: mfa.step,
                    }
                  : {}),
              },
            })
          },
          createSession: async (
            userId,
            refreshHash,
            csrfHash,
            at,
            expiresAt,
            mfa,
          ) =>
            tx.session.create({
              data: {
                userId,
                refreshTokenHash: refreshHash,
                csrfTokenHash: csrfHash,
                issuedAt: at,
                lastActivityAt: at,
                expiresAt,
                mfaVerifiedAt: mfa ? at : null,
                refreshTokens: {
                  create: {
                    tokenHash: refreshHash,
                    csrfTokenHash: csrfHash,
                    issuedAt: at,
                    expiresAt,
                  },
                },
              },
            }),
          refresh: async (tokenHash) => {
            const row = await tx.refreshToken.findUnique({
              where: { tokenHash },
              include: { session: true },
            })
            return row
              ? {
                  session: row.session,
                  csrfTokenHash: row.csrfTokenHash,
                  usedAt: row.usedAt,
                  expiresAt: row.expiresAt,
                }
              : null
          },
          rotate: async (
            sessionId,
            previousHash,
            refreshHash,
            csrfHash,
            at,
            expiresAt,
          ) => {
            await tx.refreshToken.update({
              where: { tokenHash: previousHash },
              data: { usedAt: at },
            })
            await tx.refreshToken.create({
              data: {
                sessionId,
                tokenHash: refreshHash,
                csrfTokenHash: csrfHash,
                issuedAt: at,
                expiresAt,
              },
            })
            await tx.session.update({
              where: { id: sessionId },
              data: {
                refreshTokenHash: refreshHash,
                csrfTokenHash: csrfHash,
                lastActivityAt: at,
              },
            })
          },
          revoke: async (sessionId, at) => {
            await tx.session.updateMany({
              where: { id: sessionId, revokedAt: null },
              data: { revokedAt: at },
            })
          },
          portalAllowed: async (user) => {
            if (!user.roles.includes('patient')) return user.roles.length > 0
            return (await userDataConsentState(tx, user.id)) !== 'revoked'
          },
          adminIds: async () => {
            const rows = await tx.user.findMany({
              where: {
                status: 'active',
                roles: { some: { roleCode: 'admin', revokedAt: null } },
              },
              select: { id: true },
            })
            return rows.map((row) => row.id)
          },
          queue: async (event) => {
            await enqueueNotification(tx, event, null)
          },
          audit: new PrismaAuditWriter(tx),
        }
        return run(adapter)
      },
      { timeout: 10000 },
    )
  }

  async current(principal: { userId: string }) {
    const user = await this.db.user.findUnique({
      where: { id: principal.userId },
      include: {
        roles: { where: { revokedAt: null } },
        permissions: { where: { revokedAt: null } },
      },
    })
    if (user?.status !== 'active') return null
    return {
      id: user.id,
      roles: user.roles.map((role) => role.roleCode as Role),
      permissions: user.permissions.map((grant) => grant.permissionCode),
      profile: {
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
      },
      consentState: user.roles.some((role) => role.roleCode === 'patient')
        ? await userDataConsentState(this.db, user.id)
        : 'not_applicable',
    }
  }
}
