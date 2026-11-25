import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  ClinicalAuthorization,
  EmergencyAccessStore,
  EmergencyAccessTransaction,
} from '../ports/emergency-access'
import type { ManageCareLinks } from './manage-care-links'

export const clinicalBasisId = (basis: ClinicalAuthorization) =>
  `${basis.source === 'emergency' ? 'emergency_access' : 'care_link'}:${basis.id}`
export class AuthorizeClinical {
  constructor(
    private readonly store: EmergencyAccessStore,
    private readonly links: ManageCareLinks,
    private readonly audit: AuditWriter,
    private readonly now = () => new Date(),
  ) {}
  async basis(
    tx: EmergencyAccessTransaction,
    actor: Principal,
    patientId: string,
  ): Promise<ClinicalAuthorization> {
    const current = await tx.principal(actor)
    if (!current || !mayAccess(current, 'clinical_actor'))
      throw new ApplicationError('FORBIDDEN')
    const professional = await tx.professional(current)
    if (!professional) throw new ApplicationError('FORBIDDEN')
    const now = this.now(),
      grant = await tx.activeEmergency(professional.id, patientId, now)
    if (
      grant &&
      grant.grantedAt <= now &&
      now < grant.expiresAt &&
      grant.review?.outcome !== 'rejected'
    )
      return {
        id: grant.id,
        professionalId: professional.id,
        patientId,
        expiresAt: grant.expiresAt,
        phase: 'emergency',
        source: 'emergency',
      }
    return this.links.basis(tx, current, patientId)
  }
  async authorize(actor: Principal, patientId: string, context: AuditContext) {
    try {
      return await this.store.transaction(async (tx) => {
        const basis = await this.basis(tx, actor, patientId)
        await tx.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: 'clinical.access_checked',
          resourceType: 'PatientProfile',
          resourceId: patientId,
          subjectPatientId: patientId,
          authorizationBasis: clinicalBasisId(basis),
          metadata: { scope: basis.phase },
        })
        return basis
      })
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN'].includes(error.code)
      )
        await this.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: 'authorization.denied',
          resourceType: 'PatientProfile',
          resourceId: patientId,
          subjectPatientId: patientId,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
}
