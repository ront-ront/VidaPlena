import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type {
  EmergencyAccessStore,
  EmergencyAccessTransaction,
  EmergencyGrant,
  EmergencyReview,
  EmergencyReviewOutcome,
} from '../../../application/ports/emergency-access'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PrismaCareLinkStore } from './care-link-store'
import { enqueueNotification } from './notification-store'

type StoredReview = {
  id: string
  reviewerUserId: string
  outcome: string
  notesEncrypted: string
  reviewedAt: Date
}
type StoredGrant = {
  id: string
  patientId: string
  professionalId: string
  justificationEncrypted: string
  grantedAt: Date
  expiresAt: Date
  review: StoredReview | null
}
export class PrismaEmergencyAccessStore implements EmergencyAccessStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly links: PrismaCareLinkStore,
    private readonly secrets: SecretBox,
  ) {}
  private review(row: StoredReview): EmergencyReview {
    return {
      id: row.id,
      reviewerUserId: row.reviewerUserId,
      outcome: row.outcome as EmergencyReviewOutcome,
      notes: this.secrets.open(
        row.notesEncrypted,
        `emergency_review:${row.id}`,
      ),
      reviewedAt: row.reviewedAt,
    }
  }
  private grant(row: StoredGrant): EmergencyGrant {
    return {
      id: row.id,
      patientId: row.patientId,
      professionalId: row.professionalId,
      justification: this.secrets.open(
        row.justificationEncrypted,
        `emergency_access:${row.id}`,
      ),
      grantedAt: row.grantedAt,
      expiresAt: row.expiresAt,
      review: row.review ? this.review(row.review) : null,
    }
  }
  transaction<T>(
    run: (tx: EmergencyAccessTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction((tx) => run(this.scope(tx)))
  }
  scope(tx: Prisma.TransactionClient): EmergencyAccessTransaction {
    return {
      ...this.links.scope(tx),
      emergencyGrant: async (input) => {
        const { justification, ...data } = input,
          id = randomUUID()
        return this.grant(
          await tx.emergencyAccessGrant.create({
            data: {
              ...data,
              id,
              justificationEncrypted: this.secrets.seal(
                justification,
                `emergency_access:${id}`,
              ),
            },
            include: { review: true },
          }),
        )
      },
      emergencyById: async (id) => {
        const row = await tx.emergencyAccessGrant.findUnique({
          where: { id },
          include: { review: true },
        })
        return row ? this.grant(row) : null
      },
      activeEmergency: async (professionalId, patientId, now) => {
        const row = await tx.emergencyAccessGrant.findFirst({
          where: {
            professionalId,
            patientId,
            grantedAt: { lte: now },
            expiresAt: { gt: now },
            OR: [
              { review: null },
              { review: { is: { outcome: { not: 'rejected' } } } },
            ],
          },
          orderBy: [{ expiresAt: 'desc' }, { id: 'desc' }],
          include: { review: true },
        })
        return row ? this.grant(row) : null
      },
      lockEmergency: async (id) => {
        await tx.$queryRaw`SELECT "id" FROM "EmergencyAccessGrant" WHERE "id"=${id}::uuid FOR UPDATE`
      },
      reviewEmergency: async (grantId, input) => {
        const { notes, ...data } = input,
          id = randomUUID()
        return this.review(
          await tx.emergencyAccessReview.create({
            data: {
              ...data,
              id,
              grantId,
              notesEncrypted: this.secrets.seal(
                notes,
                `emergency_review:${id}`,
              ),
            },
          }),
        )
      },
      emergencyPage: async (query) => {
        const where: Prisma.EmergencyAccessGrantWhereInput =
          query.status === 'pending'
            ? { review: null }
            : query.status === 'reviewed'
              ? { review: { isNot: null } }
              : {}
        const cursor = query.cursor
          ? await tx.emergencyAccessGrant.findFirst({
              where: { AND: [where, { id: query.cursor }] },
              select: { id: true, grantedAt: true },
            })
          : null
        if (query.cursor && !cursor)
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const rows = await tx.emergencyAccessGrant.findMany({
          where: {
            AND: [
              where,
              ...(cursor
                ? [
                    {
                      OR: [
                        { grantedAt: { lt: cursor.grantedAt } },
                        { grantedAt: cursor.grantedAt, id: { lt: cursor.id } },
                      ],
                    },
                  ]
                : []),
            ],
          },
          orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
          take: 31,
          include: { review: true },
        })
        return {
          items: rows.slice(0, 30).map((row) => this.grant(row)),
          nextCursor: rows.length > 30 ? rows[29].id : null,
        }
      },
      notifyEmergency: async (grant, requestId) => {
        const recipients = await tx.user.findMany({
          where: {
            status: 'active',
            OR: [
              { roles: { some: { roleCode: 'admin', revokedAt: null } } },
              {
                AND: [
                  {
                    roles: {
                      some: {
                        roleCode: { in: ['admin', 'manager'] },
                        revokedAt: null,
                      },
                    },
                  },
                  {
                    permissions: {
                      some: { permissionCode: 'privacy.dpo', revokedAt: null },
                    },
                  },
                ],
              },
            ],
          },
          select: {
            id: true,
            roles: { where: { revokedAt: null }, select: { roleCode: true } },
            permissions: {
              where: { permissionCode: 'privacy.dpo', revokedAt: null },
              select: { id: true },
            },
          },
        })
        const dpoMissing = !recipients.some((r) => r.permissions.length)
        if (!recipients.length)
          throw new ApplicationError('SERVICE_UNAVAILABLE')
        for (const r of recipients) {
          await enqueueNotification(
            tx,
            {
              type: 'privacy.emergency_requested',
              aggregateId: grant.id,
              version: 1,
              userId: r.id,
              requestId,
            },
            null,
          )
          if (dpoMissing && r.roles.some((role) => role.roleCode === 'admin'))
            await enqueueNotification(
              tx,
              {
                type: 'privacy.dpo_missing',
                aggregateId: grant.id,
                version: 1,
                userId: r.id,
                requestId,
              },
              null,
            )
        }
        return { dpoMissing, count: recipients.length }
      },
    }
  }
}
