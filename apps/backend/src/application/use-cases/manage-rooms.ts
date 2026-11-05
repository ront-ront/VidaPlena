import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext } from '../ports/audit-writer'
import type { CatalogQuery } from '../ports/catalog'
import type { RoomInput, RoomStore } from '../ports/rooms'

export class ManageRooms {
  constructor(private readonly store: RoomStore) {}

  list(actor: Principal, query: CatalogQuery) {
    if (!mayAccess(actor, 'operational_catalog'))
      throw new ApplicationError('FORBIDDEN')
    return this.store.list(query)
  }

  save(
    actor: Principal,
    input: Partial<RoomInput>,
    context: AuditContext,
    id?: string,
    expectedVersion?: number,
  ) {
    return this.store.transaction(async (tx) => {
      const currentActor = await tx.principal(actor)
      if (!currentActor || !mayAccess(currentActor, 'manage_catalog'))
        throw new ApplicationError('FORBIDDEN')
      const current = id ? await tx.get(id) : null
      if (id && !current) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (current && current.version !== expectedVersion)
        throw new ApplicationError('CONFLICT')
      const data = { ...current, ...input } as RoomInput
      if (
        current &&
        !data.active &&
        (await tx.futureAppointments(current.id)).length
      )
        throw new ApplicationError('CONFLICT')
      const result = await tx.save(data, id)
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: currentActor.roles,
        action: id ? 'room.updated' : 'room.created',
        resourceType: 'Room',
        resourceId: result.id,
        metadata: {
          version: result.version,
          status: result.active ? 'active' : 'inactive',
        },
      })
      return result
    })
  }
}
