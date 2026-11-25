import type { Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  ClinicalEncounter,
  ClinicalRecordStore,
  ClinicalRecordTransaction,
  TimelineQuery,
} from '../ports/clinical-records'
import type { ClinicalAuthorization } from '../ports/emergency-access'
import { type AuthorizeClinical, clinicalBasisId } from './authorize-clinical'
import type { ManageCareLinks } from './manage-care-links'
export const encounterSummary = (row: ClinicalEncounter) => ({
  id: row.id,
  appointmentId: row.appointmentId,
  status: row.status,
  startedAt: row.startedAt.toISOString(),
  endedAt: row.endedAt?.toISOString() ?? null,
})
export class ReadClinicalRecord {
  constructor(
    private readonly store: ClinicalRecordStore,
    private readonly authorization: AuthorizeClinical,
    private readonly links: ManageCareLinks,
    private readonly audit: AuditWriter,
    private readonly now = () => new Date(),
  ) {}
  private async run<T>(
    actor: Principal,
    resourceId: string,
    context: AuditContext,
    run: (tx: ClinicalRecordTransaction) => Promise<T>,
    resourceType = 'PatientProfile',
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
          resourceType,
          resourceId,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  private log(
    tx: ClinicalRecordTransaction,
    actor: Principal,
    context: AuditContext,
    basis: ClinicalAuthorization,
    action: string,
    resourceId: string,
    count?: number,
  ) {
    return tx.audit.append({
      ...context,
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      action,
      resourceType: 'ClinicalRecord',
      resourceId,
      subjectPatientId: basis.patientId,
      authorizationBasis: clinicalBasisId(basis),
      metadata: {
        scope: basis.phase,
        ...(count === undefined ? {} : { count }),
      },
    })
  }
  header(actor: Principal, patientId: string, context: AuditContext) {
    return this.run(actor, patientId, context, async (tx) => {
      const basis = await this.authorization.basis(tx, actor, patientId)
      const patient = await tx.identification(patientId)
      if (!patient) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      await tx.lock(patientId)
      const record = await tx.record(patientId),
        restricted = basis.phase === 'pre'
      const alerts = await tx.criticalAlerts(patientId)
      const last = restricted ? null : await tx.lastEncounterAt(patientId),
        current = restricted
          ? null
          : await tx.currentEncounter(record.id, basis.professionalId)
      await this.log(
        tx,
        actor,
        context,
        basis,
        'clinical.record_read',
        record.id,
      )
      return {
        recordId: record.id,
        recordNumber: record.recordNumber,
        patient,
        alerts,
        lastEncounterAt: last?.toISOString() ?? null,
        firstVisit: restricted ? null : !(await tx.hasHistory(record)),
        currentEncounter: current ? encounterSummary(current) : null,
        linkBasis: {
          id: basis.id,
          expiresAt: basis.expiresAt.toISOString(),
          kind: basis.source === 'emergency' ? 'emergency' : 'care_link',
          scope: basis.phase,
        },
      }
    })
  }
  timeline(
    actor: Principal,
    patientId: string,
    query: TimelineQuery,
    context: AuditContext,
  ) {
    return this.run(actor, patientId, context, async (tx) => {
      const basis = await this.authorization.basis(tx, actor, patientId)
      if (query.from && query.to && new Date(query.from) >= new Date(query.to))
        throw new ApplicationError('VALIDATION_ERROR')
      if (!(await tx.identification(patientId)))
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      await tx.lock(patientId)
      const record = await tx.record(patientId),
        restricted = basis.phase === 'pre'
      const page = restricted
        ? { items: [], nextCursor: null }
        : await tx.timeline(record, query)
      await this.log(
        tx,
        actor,
        context,
        basis,
        'clinical.timeline_read',
        record.id,
        page.items.length,
      )
      return { ...page, restricted }
    })
  }
  openEncounter(
    actor: Principal,
    appointmentId: string,
    context: AuditContext,
  ) {
    return this.run(
      actor,
      appointmentId,
      context,
      async (tx) => {
        await tx.lockAppointment(appointmentId)
        const appointment = await tx.clinicalAppointment(appointmentId)
        if (!appointment) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        // An emergency grant never authorizes creating an arbitrary encounter.
        const basis = await this.links.basis(
            tx,
            actor,
            appointment.patientId,
            appointmentId,
          ),
          now = this.now()
        if (
          appointment.professionalId !== basis.professionalId ||
          basis.phase !== 'during' ||
          !['confirmed', 'waiting', 'in_service'].includes(appointment.status)
        )
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const existing = await tx.encounterByAppointment(appointmentId)
        if (existing) {
          if (existing.status !== 'in_progress')
            throw new ApplicationError('CONFLICT')
          await this.log(
            tx,
            actor,
            context,
            basis,
            'clinical.encounter_reopened',
            existing.recordId,
          )
          return { created: false, encounter: encounterSummary(existing) }
        }
        if (now < appointment.startsAt || now >= appointment.endsAt)
          throw new ApplicationError('CONFLICT')
        await tx.lock(appointment.patientId)
        const record = await tx.record(appointment.patientId),
          row = await tx.startEncounter(
            record,
            appointment,
            actor,
            now,
            context,
          )
        await this.log(
          tx,
          actor,
          context,
          basis,
          'clinical.encounter_started',
          record.id,
        )
        return { created: true, encounter: encounterSummary(row) }
      },
      'Appointment',
    )
  }
}
