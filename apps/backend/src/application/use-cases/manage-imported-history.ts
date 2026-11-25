import { randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { civilDate } from '../../domain/rules/patient-identity'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  ImportedHistoryAddendum,
  ImportedHistoryCheck,
  ImportedHistoryIntent,
  ImportedHistoryMetadata,
  ImportedHistoryStore,
  ImportedHistoryTransaction,
} from '../ports/imported-history'
import { type AuthorizeClinical, clinicalBasisId } from './authorize-clinical'
import type { ManageCareLinks } from './manage-care-links'
export const historyCheckSummary = (row: ImportedHistoryCheck) => ({
  ...row,
  checkedAt: row.checkedAt.toISOString(),
})
export const historyAddendumSummary = (row: ImportedHistoryAddendum) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
})
export class ManageImportedHistory {
  constructor(
    private readonly store: ImportedHistoryStore,
    private readonly authorization: AuthorizeClinical,
    private readonly links: ManageCareLinks,
    private readonly audit: AuditWriter,
    private readonly timeZone: string,
    private readonly now = () => new Date(),
  ) {}
  private async run<T>(
    actor: Principal,
    id: string,
    context: AuditContext,
    run: (tx: ImportedHistoryTransaction) => Promise<T>,
  ): Promise<T> {
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
          resourceType: 'ImportedHistory',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  private async importer(
    tx: ImportedHistoryTransaction,
    actor: Principal,
    patientId: string,
    input: ImportedHistoryMetadata,
  ) {
    const current = await tx.principal(actor)
    if (!current || !mayAccess(current, 'import_patients'))
      throw new ApplicationError('FORBIDDEN')
    if (
      !input.origin.trim() ||
      input.origin.trim().length > 200 ||
      (input.originalAuthor !== undefined &&
        (!input.originalAuthor.trim() ||
          input.originalAuthor.trim().length > 200)) ||
      (input.originalDate && !civilDate(input.originalDate))
    )
      throw new ApplicationError('VALIDATION_ERROR')
    if (!(await tx.patientExists(patientId)))
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    return current
  }
  prepare(
    actor: Principal,
    patientId: string,
    input: ImportedHistoryMetadata,
    context: AuditContext,
  ) {
    return this.run(actor, patientId, context, async (tx) => {
      await this.importer(tx, actor, patientId, input)
      return {
        id: randomUUID(),
        patientId,
        origin: input.origin.trim(),
        originalDate: input.originalDate,
        originalAuthor: input.originalAuthor?.trim(),
      }
    })
  }
  commit(
    actor: Principal,
    intent: ImportedHistoryIntent,
    fileId: string,
    context: AuditContext,
  ) {
    return this.run(actor, intent.id, context, async (tx) => {
      const current = await this.importer(tx, actor, intent.patientId, intent)
      await tx.lock(intent.patientId)
      if (!(await tx.historyFileMatches(intent, fileId, current.userId)))
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const record = await tx.record(intent.patientId),
        now = this.now()
      await tx.createHistory(intent, record.id, fileId, current.userId, now)
      const occurredAt = intent.originalDate
        ? new Date(
            Number(
              Temporal.PlainDate.from(intent.originalDate).toZonedDateTime(
                this.timeZone,
              ).epochMilliseconds,
            ),
          )
        : now
      await tx.appendTimeline({
        recordId: record.id,
        resourceId: intent.id,
        type: 'imported_history',
        occurredAt,
        professionalId: null,
        specialtyId: null,
        modality: null,
        summary: 'Histórico importado — não equivale a evolução assinada',
        importedOrigin: {
          origin: intent.origin,
          importedAt: now.toISOString(),
          importedBy: current.userId,
        },
      })
      await tx.audit.append({
        ...context,
        actorUserId: current.userId,
        actorRoles: current.roles,
        action: 'imported_history.created',
        resourceType: 'ImportedHistory',
        resourceId: intent.id,
        subjectPatientId: intent.patientId,
        authorizationBasis: 'blind_import',
        metadata: { source: 'manual_import' },
      })
      return {
        id: intent.id,
        patientId: intent.patientId,
        originalDate: intent.originalDate ?? null,
        origin: intent.origin,
        importedBy: current.userId,
        importedAt: now.toISOString(),
        signatureStatus: 'not_signed' as const,
        fileReceived: true as const,
      }
    })
  }
  detail(actor: Principal, id: string, context: AuditContext) {
    return this.run(actor, id, context, async (tx) => {
      const subject = await tx.historySubject(id)
      if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const basis = await this.authorization.basis(tx, actor, subject.patientId)
      if (basis.phase === 'pre')
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const row = await tx.history(id)
      if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'imported_history.read',
        resourceType: 'ImportedHistory',
        resourceId: id,
        subjectPatientId: subject.patientId,
        authorizationBasis: clinicalBasisId(basis),
      })
      return {
        ...row,
        originalDate: row.originalDate?.toISOString().slice(0, 10) ?? null,
        importedAt: row.importedAt.toISOString(),
        signatureStatus: 'not_signed' as const,
        check: row.check ? historyCheckSummary(row.check) : null,
        addenda: row.addenda.map(historyAddendumSummary),
      }
    })
  }
  private async mutationBasis(
    tx: ImportedHistoryTransaction,
    actor: Principal,
    id: string,
  ) {
    const subject = await tx.historySubject(id)
    if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    const basis = await this.links.basis(tx, actor, subject.patientId)
    if (basis.phase === 'pre')
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    await tx.lockHistory(id)
    return basis
  }
  check(actor: Principal, id: string, context: AuditContext) {
    return this.run(actor, id, context, async (tx) => {
      const basis = await this.mutationBasis(tx, actor, id),
        row = await tx.checkHistory(id, basis.professionalId, this.now())
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'imported_history.checked',
        resourceType: 'ImportedHistory',
        resourceId: id,
        subjectPatientId: basis.patientId,
        authorizationBasis: clinicalBasisId(basis),
      })
      return historyCheckSummary(row)
    })
  }
  addendum(
    actor: Principal,
    id: string,
    input: { reason: string; correctionText: string },
    context: AuditContext,
  ) {
    return this.run(actor, id, context, async (tx) => {
      const basis = await this.mutationBasis(tx, actor, id),
        reason = input.reason.trim(),
        correctionText = input.correctionText.trim()
      if (
        !reason ||
        reason.length > 1000 ||
        !correctionText ||
        correctionText.length > 20000
      )
        throw new ApplicationError('VALIDATION_ERROR')
      const row = await tx.addHistoryAddendum(
        id,
        basis.professionalId,
        { reason, correctionText },
        this.now(),
      )
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'imported_history.addendum_created',
        resourceType: 'ImportedHistory',
        resourceId: id,
        subjectPatientId: basis.patientId,
        authorizationBasis: clinicalBasisId(basis),
      })
      return historyAddendumSummary(row)
    })
  }
}
