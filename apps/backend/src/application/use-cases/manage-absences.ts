import { randomUUID } from 'node:crypto'
import { absencePenaltyExpiry, isNoShowDue } from '../../domain/rules/absence'
import type { Principal } from '../../domain/rules/access'
import { mayAccess } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type {
  AbsenceInput,
  AbsenceRecord,
  AbsenceStore,
} from '../ports/absence'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'

export class ManageAbsences {
  constructor(
    private readonly store: AbsenceStore,
    private readonly audit: AuditWriter,
    private readonly policy: { timeZone: string; afterMinutes: number },
    private readonly now = () => new Date(),
  ) {}
  async decide(
    actor: Principal,
    id: string,
    input: AbsenceInput,
    context: AuditContext,
    correction = false,
  ) {
    try {
      return await this.store.transaction(async (tx) => {
        const initial = await tx.appointment(id)
        if (!initial) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        await tx.lock(`absence:${id}`, initial.patientId)
        const current = await tx.principal(actor)
        if (
          !current ||
          !mayAccess(current, correction ? 'correct_absence' : 'record_absence')
        )
          throw new ApplicationError('FORBIDDEN')
        const row = await tx.appointment(id)
        if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const now = this.now(),
          patient = await tx.patient(current, row.patientId, now)
        if (!patient?.active) throw new ApplicationError('CONFLICT')
        if (patient.consentState === 'revoked')
          throw new ApplicationError('CONSENT_REQUIRED')
        const explanation = input.explanation?.trim() || null
        if ((correction || input.kind !== 'unjustified') && !explanation)
          throw new ApplicationError('VALIDATION_ERROR', [
            {
              field: 'explanation',
              reason: 'Informe o motivo administrativo, sem conteúdo clínico.',
            },
          ])
        const previous = await tx.absence(id)
        if (previous && !correction) {
          if (
            previous.kind !== input.kind ||
            previous.explanation !== explanation
          )
            throw new ApplicationError('CONFLICT')
          const restriction = await tx.recalculate(
            row.patientId,
            now,
            context.requestId,
          )
          return {
            appointmentId: id,
            status: 'no_show' as const,
            kind: previous.kind,
            absenceVersion: previous.version,
            recordedAt: previous.recordedAt.toISOString(),
            decidedAt: previous.decidedAt.toISOString(),
            autoBookingSuspended: !!restriction.suspendedUntil,
            suspendedUntil: restriction.suspendedUntil?.toISOString() ?? null,
            unjustifiedCount: restriction.unjustifiedCount,
          }
        }
        if (correction && (!previous || row.status !== 'no_show'))
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (correction && previous?.version !== input.expectedVersion)
          throw new ApplicationError('CONFLICT')
        let version = row.version
        if (!correction) {
          if (
            !isNoShowDue(
              row.status,
              row.startsAt,
              !!(await tx.checkIn(id, row.version)),
              now,
              this.policy.afterMinutes,
            )
          )
            throw new ApplicationError('CONFLICT')
          const reservation = await tx.confirmedReservation(id)
          if (!reservation) throw new ApplicationError('CONFLICT')
          await tx.reservations.release(reservation.id)
          const changed = await tx.update(id, row.version, {
            status: 'no_show',
          })
          version = changed.version
          await tx.invalidateNotifications(id)
          await tx.history(
            changed,
            current,
            'no_show',
            row,
            undefined,
            'reception',
          )
        } else await tx.history(row, current, 'absence_corrected', row)
        const absence: AbsenceRecord = {
          id: previous?.id ?? randomUUID(),
          appointmentId: id,
          appointmentVersion: version,
          patientId: row.patientId,
          occurredAt: previous?.occurredAt ?? row.startsAt,
          penaltyExpiresAt:
            previous?.penaltyExpiresAt ??
            absencePenaltyExpiry(row.startsAt, this.policy.timeZone),
          clinicTimeZone: previous?.clinicTimeZone ?? this.policy.timeZone,
          kind: input.kind,
          explanation,
          recordedBy: previous?.recordedBy ?? current.userId,
          recordedAt: previous?.recordedAt ?? now,
          decidedBy: current.userId,
          decidedAt: now,
          version: (previous?.version ?? 0) + 1,
        }
        await tx.saveAbsence(absence, previous)
        const restriction = await tx.recalculate(
          row.patientId,
          now,
          context.requestId,
        )
        await tx.audit.append({
          ...context,
          actorUserId: current.userId,
          actorRoles: current.roles,
          action: correction ? 'absence.corrected' : 'absence.recorded',
          resourceType: 'Absence',
          resourceId: absence.id,
          subjectPatientId: row.patientId,
          metadata: {
            status: input.kind,
            version: absence.version,
            count: restriction.unjustifiedCount,
          },
        })
        return {
          appointmentId: id,
          status: 'no_show' as const,
          kind: absence.kind,
          absenceVersion: absence.version,
          recordedAt: absence.recordedAt.toISOString(),
          decidedAt: now.toISOString(),
          autoBookingSuspended: !!restriction.suspendedUntil,
          suspendedUntil: restriction.suspendedUntil?.toISOString() ?? null,
          unjustifiedCount: restriction.unjustifiedCount,
        }
      })
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN', 'CONSENT_REQUIRED'].includes(
          error.code,
        )
      )
        await this.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: 'authorization.denied',
          resourceType: 'Appointment',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
}
