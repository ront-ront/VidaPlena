import { ApplicationError } from '../../../application/errors/application-error'
import type { MaintenanceStore } from '../../../application/ports/maintenance'
import type { PrismaClient } from '../../../generated/prisma/client'
import { PrismaAuditWriter } from './audit-writer'

function overlapMs(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return Math.max(
    0,
    Math.min(aEnd.getTime(), bEnd.getTime()) -
      Math.max(aStart.getTime(), bStart.getTime()),
  )
}

export class PrismaMaintenanceStore implements MaintenanceStore {
  constructor(private readonly db: PrismaClient) {}
  async register(input: Parameters<MaintenanceStore['register']>[0]) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(775014)`
      const now = new Date()
      if (
        input.startsAt.getTime() - now.getTime() <
        input.noticeHours * 3_600_000
      )
        throw new ApplicationError('CONFLICT')
      const firstMonth = new Date(
        Date.UTC(
          input.startsAt.getUTCFullYear(),
          input.startsAt.getUTCMonth(),
          1,
        ),
      )
      const lastMonthEnd = new Date(
        Date.UTC(
          input.endsAt.getUTCFullYear(),
          input.endsAt.getUTCMonth() + 1,
          1,
        ),
      )
      const existing = await tx.maintenanceWindow.findMany({
        where: { startsAt: { lt: lastMonthEnd }, endsAt: { gt: firstMonth } },
        select: { startsAt: true, endsAt: true },
      })
      if (
        existing.some(
          (window) =>
            overlapMs(
              window.startsAt,
              window.endsAt,
              input.startsAt,
              input.endsAt,
            ) > 0,
        )
      )
        throw new ApplicationError('CONFLICT')
      for (
        let month = firstMonth;
        month < lastMonthEnd;
        month = new Date(
          Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
        )
      ) {
        const next = new Date(
          Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
        )
        const minutes = existing.reduce(
          (sum, window) =>
            sum + overlapMs(window.startsAt, window.endsAt, month, next),
          overlapMs(input.startsAt, input.endsAt, month, next),
        )
        if (minutes > input.maxHoursPerMonth * 3_600_000)
          throw new ApplicationError('CONFLICT')
      }
      const window = await tx.maintenanceWindow.create({
        data: {
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          noticeReference: input.noticeReference,
          registeredAt: now,
          createdBy: input.actor.userId,
        },
      })
      await new PrismaAuditWriter(tx).append({
        ...input.context,
        actorUserId: input.actor.userId,
        actorRoles: input.actor.roles,
        authorizationBasis: 'role:admin',
        action: 'ops.maintenance_registered',
        resourceType: 'MaintenanceWindow',
        resourceId: window.id,
      })
      return {
        id: window.id,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        registeredAt: window.registeredAt,
        noticeReference: window.noticeReference,
      }
    })
  }
  async list() {
    return {
      items: await this.db.maintenanceWindow.findMany({
        orderBy: { startsAt: 'desc' },
        take: 100,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          registeredAt: true,
          noticeReference: true,
          createdBy: true,
        },
      }),
    }
  }
}
