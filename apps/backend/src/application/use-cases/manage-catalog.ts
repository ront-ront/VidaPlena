import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  CatalogQuery,
  CatalogStore,
  ProfessionalInput,
  SpecialtyInput,
} from '../ports/catalog'

export class ManageCatalog {
  constructor(
    private readonly store: CatalogStore,
    private readonly audit: AuditWriter,
  ) {}

  async list(
    actor: Principal,
    kind: 'specialty' | 'professional',
    query: CatalogQuery & {
      specialtyId?: string
      modality?: 'onsite' | 'remote'
    },
    administrative = false,
  ) {
    if (!mayAccess(actor, administrative ? 'manage_catalog' : 'session'))
      throw new ApplicationError('FORBIDDEN')
    if (actor.roles.includes('patient') && query.active === false)
      throw new ApplicationError('FORBIDDEN')
    const filters = administrative ? query : { ...query, active: true }
    const page =
      kind === 'specialty'
        ? await this.store.specialties(filters)
        : await this.store.professionals(filters, administrative)
    return page
  }

  async auditRead(actor: Principal, kind: string, context: AuditContext) {
    await this.audit.append({
      ...context,
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      action: 'catalog.viewed',
      resourceType: kind,
      resourceId: actor.userId,
      metadata: { scope: 'administrative' },
    })
  }

  async specialty(
    actor: Principal,
    input: Partial<SpecialtyInput>,
    context: AuditContext,
    id?: string,
    expectedVersion?: number,
  ) {
    return this.store.transaction(async (tx) => {
      const currentActor = await tx.principal(actor)
      if (!currentActor || !mayAccess(currentActor, 'manage_catalog'))
        throw new ApplicationError('FORBIDDEN')
      const current = id ? await tx.specialty(id) : null
      if (id && !current) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (current && current.version !== expectedVersion)
        throw new ApplicationError('CONFLICT')
      const data = { ...current, ...input } as SpecialtyInput
      if (
        current &&
        (!data.active ||
          current.allowedModalities.some(
            (m) => !data.allowedModalities.includes(m),
          )) &&
        (await tx.affectedAppointments('specialty', current.id)).length
      )
        throw new ApplicationError('CONFLICT')
      const result = await tx.saveSpecialty(data, id)
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: currentActor.roles,
        action: id ? 'catalog.specialty_updated' : 'catalog.specialty_created',
        resourceType: 'Specialty',
        resourceId: result.id,
        metadata: {
          version: result.version,
          status: result.active ? 'active' : 'inactive',
        },
      })
      return result
    })
  }

  async professional(
    actor: Principal,
    input: Partial<ProfessionalInput>,
    context: AuditContext,
    id?: string,
    expectedVersion?: number,
  ) {
    return this.store.transaction(async (tx) => {
      const currentActor = await tx.principal(actor)
      if (!currentActor || !mayAccess(currentActor, 'manage_catalog'))
        throw new ApplicationError('FORBIDDEN')
      const current = id ? await tx.professional(id) : null
      if (id && !current) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (current && current.version !== expectedVersion)
        throw new ApplicationError('CONFLICT')
      const data = { ...current, ...input } as ProfessionalInput
      if (current && current.userId !== data.userId)
        throw new ApplicationError('VALIDATION_ERROR')
      if (!(await tx.professionalAccount(data.userId)))
        throw new ApplicationError('VALIDATION_ERROR', [
          {
            field: 'userId',
            reason: 'Vincule uma conta interna com papel profissional.',
          },
        ])
      const specialties = await Promise.all(
        data.specialtyIds.map((s) => tx.specialty(s)),
      )
      if (
        specialties.some(
          (s) =>
            !s ||
            (data.active && !s.active) ||
            !s.allowedModalities.some((m) => data.modalities.includes(m)),
        ) ||
        data.modalities.some(
          (m) => !specialties.some((s) => s?.allowedModalities.includes(m)),
        )
      )
        throw new ApplicationError('VALIDATION_ERROR', [
          {
            field: 'specialtyIds',
            reason:
              'Confira as especialidades ativas e modalidades compativeis.',
          },
        ])
      if (
        current &&
        (!data.active ||
          current.specialtyIds.some((s) => !data.specialtyIds.includes(s)) ||
          current.modalities.some((m) => !data.modalities.includes(m))) &&
        (await tx.affectedAppointments('professional', current.id)).length
      )
        throw new ApplicationError('CONFLICT')
      const result = await tx.saveProfessional(data, id)
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: currentActor.roles,
        action: id
          ? 'catalog.professional_updated'
          : 'catalog.professional_created',
        resourceType: 'ProfessionalProfile',
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
