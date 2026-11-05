import { ApplicationError } from '../../../application/errors/application-error'
import type { CatalogQuery } from '../../../application/ports/catalog'
import type {
  RoomStore,
  RoomTransaction,
} from '../../../application/ports/rooms'
import type { PrismaClient } from '../../../generated/prisma/client'
import { readPrincipal } from './access-store'
import { futureAppointmentImpacts } from './appointment-impact'
import { PrismaAuditWriter } from './audit-writer'

export class PrismaRoomStore implements RoomStore {
  constructor(private readonly db: PrismaClient) {}
  async list(query: CatalogQuery) {
    const rows = await this.db.room.findMany({
      where: {
        active: query.active,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 31,
    })
    return {
      items: rows.slice(0, 30),
      nextCursor: rows.length > 30 ? rows[29].id : null,
    }
  }
  async transaction<T>(run: (tx: RoomTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
        return run({
          principal: (actor) =>
            readPrincipal(tx, actor.userId, actor.sessionId),
          get: (id) => tx.room.findUnique({ where: { id } }),
          futureAppointments: (id) =>
            futureAppointmentImpacts(tx, { roomId: id }),
          save: (input, id) =>
            id
              ? tx.room.update({
                  where: { id },
                  data: {
                    name: input.name,
                    active: input.active,
                    version: { increment: 1 },
                  },
                })
              : tx.room.create({
                  data: { name: input.name, active: input.active },
                }),
          audit: new PrismaAuditWriter(tx),
        })
      })
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ApplicationError('CONFLICT')
      throw error
    }
  }
}
