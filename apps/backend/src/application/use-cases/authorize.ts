import {
  type Capability,
  mayAccess,
  type Principal,
} from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AccessStore } from '../ports/access-store'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'

export class Authorize {
  constructor(
    private readonly store: AccessStore,
    private readonly audit: AuditWriter,
  ) {}

  async execute(
    proof: { userId: string; sessionId: string },
    capability: Capability,
    context: AuditContext,
    patientId?: string,
  ): Promise<Principal> {
    const actor = await this.store.principal(proof.userId, proof.sessionId)
    if (!actor) throw new ApplicationError('UNAUTHENTICATED')
    const own = patientId
      ? await this.store.ownsPatient(actor.userId, patientId)
      : false
    if (!mayAccess(actor, capability, own, await this.store.hasDpo())) {
      await this.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'authorization.denied',
        resourceType: capability,
        resourceId: patientId ?? actor.userId,
        authorizationBasis: 'denied',
      })
      throw new ApplicationError(
        patientId ? 'NOT_FOUND_OR_FORBIDDEN' : 'FORBIDDEN',
      )
    }
    return actor
  }
}
