import type { Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  ClinicalAlertInput,
  ClinicalAlertQuery,
  ClinicalAlertStore,
  ClinicalAlertTransaction,
} from '../ports/clinical-alerts'
import type { ClinicalAuthorization } from '../ports/emergency-access'
import { type AuthorizeClinical, clinicalBasisId } from './authorize-clinical'
import type { ManageCareLinks } from './manage-care-links'
export class ManageClinicalAlerts {
  constructor(
    private readonly store: ClinicalAlertStore,
    private readonly authorization: AuthorizeClinical,
    private readonly links: ManageCareLinks,
    private readonly audit: AuditWriter,
    private readonly now = () => new Date(),
  ) {}
  private async run<T>(
    actor: Principal,
    id: string,
    context: AuditContext,
    run: (tx: ClinicalAlertTransaction) => Promise<T>,
  ) {
    try {
      return await this.store.transaction(run)
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
          resourceType: 'ClinicalAlert',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  private log(
    tx: ClinicalAlertTransaction,
    actor: Principal,
    basis: ClinicalAuthorization,
    context: AuditContext,
    action: string,
    resourceId: string,
    version?: number,
  ) {
    return tx.audit.append({
      ...context,
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      action,
      resourceType: 'ClinicalAlert',
      resourceId,
      subjectPatientId: basis.patientId,
      authorizationBasis: clinicalBasisId(basis),
      ...(version === undefined ? {} : { metadata: { version } }),
    })
  }
  list(
    actor: Principal,
    patientId: string,
    query: ClinicalAlertQuery,
    context: AuditContext,
  ) {
    return this.run(actor, patientId, context, async (tx) => {
      const basis = await this.authorization.basis(tx, actor, patientId)
      if (basis.phase === 'pre' && query.active === false)
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const page = await tx.alertPage(patientId, {
        ...query,
        active: basis.phase === 'pre' ? true : query.active,
      })
      await this.log(
        tx,
        actor,
        basis,
        context,
        'clinical.alerts_read',
        patientId,
      )
      return {
        ...page,
        items: page.items.map((item) =>
          basis.phase === 'pre' ? { ...item, history: undefined } : item,
        ),
      }
    })
  }
  create(
    actor: Principal,
    patientId: string,
    input: ClinicalAlertInput,
    context: AuditContext,
  ) {
    return this.run(actor, patientId, context, async (tx) => {
      const basis = await this.links.basis(tx, actor, patientId)
      if (basis.phase !== 'during') throw new ApplicationError('FORBIDDEN')
      await tx.lock(patientId)
      const row = await tx.createAlert(
        patientId,
        basis.professionalId,
        input,
        this.now(),
      )
      await this.log(
        tx,
        actor,
        basis,
        context,
        'clinical.alert_created',
        row.id,
        row.version,
      )
      return row
    })
  }
  transition(
    actor: Principal,
    id: string,
    kind: 'confirmed' | 'deactivated',
    input: { expectedVersion: number; reason?: string },
    context: AuditContext,
  ) {
    return this.run(actor, id, context, async (tx) => {
      const subject = await tx.alertSubject(id)
      if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const basis = await this.links.basis(tx, actor, subject.patientId)
      if (basis.phase !== 'during') throw new ApplicationError('FORBIDDEN')
      await tx.lock(subject.patientId)
      await tx.lockAlert(id)
      const current = await tx.alertById(id)
      if (!current) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (
        !current.active ||
        current.version !== input.expectedVersion ||
        (kind === 'confirmed' && current.verificationState === 'confirmed')
      )
        throw new ApplicationError('CONFLICT')
      const reason = kind === 'deactivated' ? input.reason?.trim() : null
      if (kind === 'deactivated' && (!reason || reason.length > 1000))
        throw new ApplicationError('VALIDATION_ERROR')
      const row = await tx.appendAlertEvent(
        id,
        basis.professionalId,
        kind,
        current.version + 1,
        reason ?? null,
        this.now(),
      )
      await this.log(
        tx,
        actor,
        basis,
        context,
        `clinical.alert_${kind}`,
        row.id,
        row.version,
      )
      return row
    })
  }
}
