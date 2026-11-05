import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type {
  ReservationStore,
  ReservationTransaction,
} from '../../../application/ports/reservations'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { PrismaAuditWriter } from './audit-writer'

function hasDatabaseCode(error: unknown, codes: string[]): boolean {
  const seen = new Set<unknown>()
  function visit(value: unknown, depth: number): boolean {
    if (typeof value === 'string' && codes.includes(value)) return true
    if (!value || typeof value !== 'object' || depth > 8 || seen.has(value))
      return false
    seen.add(value)
    return [
      'code',
      'sqlState',
      'originalCode',
      'cause',
      'meta',
      'driverAdapterError',
    ].some(
      (key) =>
        key in value &&
        visit((value as Record<string, unknown>)[key], depth + 1),
    )
  }
  return visit(error, 0)
}
export const isExclusionConflict = (error: unknown) =>
  hasDatabaseCode(error, ['23P01'])
export const isReservationRetryConflict = (error: unknown) =>
  hasDatabaseCode(error, ['40P01', '40001', 'P2034'])
export function reservationTransaction(
  tx: Prisma.TransactionClient,
): ReservationTransaction {
  return {
    lockRequest: async (key) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reservation:${key}`}, 662020))`
    },
    lockResources: async (professionalIds, roomIds) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(775001)`
      const keys = [
        ...new Set([
          ...professionalIds.map((id) => `p:${id}`),
          ...roomIds.map((id) => `r:${id}`),
        ]),
      ].sort()
      for (const key of keys)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 662020))`
    },
    get: (id) => tx.slotReservation.findUnique({ where: { id } }),
    byRequest: (requestKey) =>
      tx.slotReservation.findUnique({ where: { requestKey } }),
    professionalActive: async (id) =>
      !!(await tx.professionalProfile.findFirst({
        where: {
          id,
          active: true,
          user: {
            status: 'active',
            roles: { some: { roleCode: 'professional', revokedAt: null } },
          },
        },
        select: { id: true },
      })),
    activeRooms: async () =>
      (
        await tx.room.findMany({
          where: { active: true },
          orderBy: { id: 'asc' },
          select: { id: true },
        })
      ).map((r) => r.id),
    roomActive: async (id) =>
      !!(await tx.room.findFirst({
        where: { id, active: true, capacity: 1 },
        select: { id: true },
      })),
    expire: async (now, professionalIds, roomIds) => {
      const where: Prisma.SlotReservationWhereInput = {
        state: 'held',
        expiresAt: { lte: now },
        OR: [
          { professionalId: { in: professionalIds } },
          { roomId: { in: roomIds } },
        ],
      }
      const offers = await tx.waitlistOffer.findMany({
        where: { status: 'active', reservation: where },
        select: { id: true, entryId: true, releaseEventId: true },
      })
      if (offers.length) {
        await tx.waitlistOffer.updateMany({
          where: { id: { in: offers.map((o) => o.id) }, status: 'active' },
          data: { status: 'expired' },
        })
        await tx.waitlistEntry.updateMany({
          where: {
            id: { in: offers.map((o) => o.entryId) },
            status: 'offered',
          },
          data: { status: 'waiting' },
        })
        await tx.slotReleaseEvent.updateMany({
          where: {
            id: { in: offers.map((o) => o.releaseEventId) },
            processedAt: null,
          },
          data: { nextAttemptAt: now },
        })
        await tx.notification.updateMany({
          where: {
            aggregateId: { in: offers.map((o) => o.id) },
            templateKey: 'waitlist.offered',
            deliveryStatus: { in: ['queued', 'retry'] },
          },
          data: {
            deliveryStatus: 'suppressed',
            failureReasonSafe: 'offer_expired',
          },
        })
        for (const offer of offers)
          await new PrismaAuditWriter(tx).append({
            actorRoles: [],
            requestId: randomUUID(),
            authorizationBasis: 'system',
            action: 'waitlist.offer_expired',
            resourceType: 'WaitlistOffer',
            resourceId: offer.id,
            metadata: { reasonCode: 'ttl' },
          })
      }
      return (
        await tx.slotReservation.updateMany({
          where,
          data: { state: 'released' },
        })
      ).count
    },
    occupied: async (professionalId, roomId, startsAt, endsAt, ignoreId) =>
      !!(await tx.slotReservation.findFirst({
        where: {
          state: { in: ['held', 'confirmed'] },
          id: ignoreId ? { not: ignoreId } : undefined,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          OR: [{ professionalId }, ...(roomId ? [{ roomId }] : [])],
        },
        select: { id: true },
      })),
    create: (input, roomId, requestHash) =>
      tx.slotReservation.create({
        data: {
          professionalId: input.professionalId,
          roomId,
          modality: input.modality,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          state: input.state,
          appointmentId: input.appointmentId ?? null,
          offerId: input.offerId ?? null,
          expiresAt: input.expiresAt ?? null,
          requestKey: input.requestKey,
          requestHash,
        },
      }),
    confirm: (id, appointmentId) =>
      tx.slotReservation.update({
        where: { id },
        data: { state: 'confirmed', appointmentId, expiresAt: null },
      }),
    release: (id) =>
      tx.slotReservation.update({ where: { id }, data: { state: 'released' } }),
    audit: new PrismaAuditWriter(tx),
  }
}
export class PrismaReservationStore implements ReservationStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly policy: {
      maxWaitMs: number
      timeoutMs: number
      retryAttempts: number
    },
  ) {}
  async transaction<T>(
    run: (tx: ReservationTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(
          (tx) => run(reservationTransaction(tx)),
          { maxWait: this.policy.maxWaitMs, timeout: this.policy.timeoutMs },
        )
      } catch (error) {
        if (isExclusionConflict(error))
          throw new ApplicationError('SLOT_UNAVAILABLE')
        if (!isReservationRetryConflict(error)) throw error
        if (attempt + 1 >= this.policy.retryAttempts)
          throw new ApplicationError('SLOT_UNAVAILABLE')
      }
    }
  }
}
