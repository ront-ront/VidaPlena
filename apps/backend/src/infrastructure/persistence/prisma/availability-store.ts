import type {
  AvailabilityData,
  AvailabilityQuery,
  AvailabilityStore,
} from '../../../application/ports/availability'
import type { ScheduleSnapshot } from '../../../application/ports/schedule'
import type { PrismaClient } from '../../../generated/prisma/client'

export class PrismaAvailabilityStore implements AvailabilityStore {
  constructor(private readonly db: PrismaClient) {}
  load(
    query: AvailabilityQuery,
    startsAt: Date,
    endsAt: Date,
    now: Date,
  ): Promise<AvailabilityData> {
    return this.db.$transaction(
      async (tx) => {
        const specialty = await tx.specialty.findFirst({
          where: { id: query.specialtyId, active: true },
        })
        const profiles = await tx.professionalProfile.findMany({
          where: {
            id: query.professionalId,
            active: true,
            modalities: { has: query.modality },
            specialties: {
              some: { specialtyId: query.specialtyId, active: true },
            },
            user: {
              status: 'active',
              roles: { some: { roleCode: 'professional', revokedAt: null } },
            },
          },
          include: {
            schedules: {
              orderBy: { version: 'desc' },
              take: 1,
              include: {
                rules: true,
                blocks: {
                  where: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
                },
              },
            },
          },
          orderBy: { id: 'asc' },
        })
        const rooms =
          query.modality === 'onsite'
            ? await tx.room.findMany({
                where: { active: true },
                select: { id: true },
                orderBy: { id: 'asc' },
              })
            : []
        return {
          specialty: specialty
            ? {
                modalities: specialty.allowedModalities,
                first: specialty.defaultMinutesFirst,
                return: specialty.defaultMinutesReturn,
              }
            : null,
          roomIds: rooms.map((r) => r.id),
          occupied: await tx.slotReservation.findMany({
            where: {
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
              AND: [
                {
                  OR: [
                    { professionalId: { in: profiles.map((p) => p.id) } },
                    { roomId: { in: rooms.map((r) => r.id) } },
                  ],
                },
                {
                  OR: [
                    { state: 'confirmed' },
                    { state: 'held', expiresAt: { gt: now } },
                  ],
                },
              ],
            },
            select: {
              professionalId: true,
              roomId: true,
              startsAt: true,
              endsAt: true,
            },
          }),
          professionals: profiles.map((p) => {
            const row = p.schedules[0]
            const schedule: ScheduleSnapshot | null = row
              ? {
                  professionalId: p.id,
                  version: row.version,
                  clinicTimeZone: row.clinicTimeZone,
                  rules: row.rules.map((r) => ({
                    weekday: r.weekday,
                    localStart: r.localStart,
                    localEnd: r.localEnd,
                    effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
                    effectiveTo:
                      r.effectiveTo?.toISOString().slice(0, 10) ?? null,
                    modality: r.modality,
                  })),
                  blocks: row.blocks.map((b) => ({
                    startsAt: b.startsAt.toISOString(),
                    endsAt: b.endsAt.toISOString(),
                    kind: b.kind as ScheduleSnapshot['blocks'][number]['kind'],
                    reason: b.reason,
                  })),
                }
              : null
            return { id: p.id, modalities: p.modalities, schedule }
          }),
        }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }
}
