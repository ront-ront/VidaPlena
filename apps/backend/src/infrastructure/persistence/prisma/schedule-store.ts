import type {
  ScheduleSnapshot,
  ScheduleStore,
  ScheduleTransaction,
} from '../../../application/ports/schedule'
import type { PrismaClient } from '../../../generated/prisma/client'
import { readPrincipal } from './access-store'
import { PrismaAuditWriter } from './audit-writer'

export class PrismaScheduleStore implements ScheduleStore {
  constructor(private readonly db: PrismaClient) {}
  transaction<T>(run: (tx: ScheduleTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
      return run({
        principal: (actor) => readPrincipal(tx, actor.userId, actor.sessionId),
        professional: async (id) => {
          const row = await tx.professionalProfile.findUnique({
            where: { id },
            include: {
              user: {
                include: {
                  roles: {
                    where: { roleCode: 'professional', revokedAt: null },
                  },
                },
              },
            },
          })
          return row
            ? {
                id: row.id,
                userId: row.userId,
                active:
                  row.active &&
                  row.user.status === 'active' &&
                  row.user.roles.length > 0,
                modalities: row.modalities,
              }
            : null
        },
        current: async (id) => {
          const row = await tx.scheduleVersion.findFirst({
            where: { professionalId: id },
            orderBy: { version: 'desc' },
            include: { rules: true, blocks: true },
          })
          if (!row) return null
          return {
            professionalId: id,
            version: row.version,
            clinicTimeZone: row.clinicTimeZone,
            rules: row.rules.map((r) => ({
              weekday: r.weekday,
              localStart: r.localStart,
              localEnd: r.localEnd,
              effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
              effectiveTo: r.effectiveTo?.toISOString().slice(0, 10) ?? null,
              modality: r.modality,
            })),
            blocks: row.blocks.map((b) => ({
              startsAt: b.startsAt.toISOString(),
              endsAt: b.endsAt.toISOString(),
              kind: b.kind as ScheduleSnapshot['blocks'][number]['kind'],
              reason: b.reason,
            })),
          }
        },
        impacts: async () => [],
        publish: async (
          professionalId,
          version,
          input,
          clinicTimeZone,
          publishedBy,
        ) => {
          await tx.scheduleVersion.create({
            data: {
              professionalId,
              version,
              clinicTimeZone,
              publishedBy,
              rules: {
                create: input.rules.map((r) => ({
                  ...r,
                  effectiveFrom: new Date(`${r.effectiveFrom}T00:00:00.000Z`),
                  effectiveTo: r.effectiveTo
                    ? new Date(`${r.effectiveTo}T00:00:00.000Z`)
                    : null,
                })),
              },
              blocks: {
                create: input.blocks.map((b) => ({
                  ...b,
                  startsAt: new Date(b.startsAt),
                  endsAt: new Date(b.endsAt),
                })),
              },
            },
          })
        },
        audit: new PrismaAuditWriter(tx),
      })
    })
  }
}
