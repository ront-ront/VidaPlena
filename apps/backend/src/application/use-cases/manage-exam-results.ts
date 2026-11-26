import { randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  ExamResultInput,
  ExamResultIntent,
  ExamResultQuery,
  ExamResultRecord,
  ExamResultStore,
  ExamResultTransaction,
} from '../ports/exam-results'
import type { FileRecord } from '../ports/files'
import { type AuthorizeClinical, clinicalBasisId } from './authorize-clinical'

const resultView = (row: ExamResultRecord) => ({
  ...row,
  receivedAt: row.receivedAt.toISOString(),
})
export class ManageExamResults {
  constructor(
    private readonly store: ExamResultStore,
    private readonly authorization: AuthorizeClinical,
    private readonly audit: AuditWriter,
    private readonly retentionYears: number,
    private readonly now = () => new Date(),
  ) {}
  private async run<T>(
    actor: Principal,
    id: string,
    context: AuditContext,
    run: (tx: ExamResultTransaction) => Promise<T>,
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
          resourceType: 'ExamResult',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  private async uploader(
    tx: ExamResultTransaction,
    actor: Principal,
    patientId: string,
  ) {
    const current = await tx.principal(actor)
    if (
      !current ||
      !mayAccess(current, 'session') ||
      !current.roles.some((r) => r === 'patient' || r === 'receptionist')
    )
      throw new ApplicationError('FORBIDDEN')
    const subject = await tx.uploadSubject(current.userId, patientId)
    if (
      !subject.exists ||
      (!current.roles.includes('receptionist') && !subject.owns)
    )
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    if (subject.consentState !== 'active')
      throw new ApplicationError('CONSENT_REQUIRED')
    return current
  }
  private async order(tx: ExamResultTransaction, input: ExamResultInput) {
    if ((input.origin === 'ordered') !== !!input.orderId)
      throw new ApplicationError('VALIDATION_ERROR')
    if (!input.orderId) return null
    const order = await tx.resultOrder(input.orderId)
    if (
      !order ||
      order.patientId !== input.patientId ||
      !order.issued ||
      order.voided
    )
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    return order
  }
  prepare(actor: Principal, input: ExamResultInput, context: AuditContext) {
    return this.run(actor, input.patientId, context, async (tx) => {
      await this.uploader(tx, actor, input.patientId)
      await this.order(tx, input)
      return { ...input, id: randomUUID() }
    })
  }
  async canUpload(actor: Principal, patientId: string) {
    try {
      return await this.store.transaction(async (tx) => {
        await this.uploader(tx, actor, patientId)
        return true
      })
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN', 'CONSENT_REQUIRED'].includes(
          error.code,
        )
      )
        return false
      throw error
    }
  }
  commit(
    actor: Principal,
    intent: ExamResultIntent,
    fileId: string,
    context: AuditContext,
  ) {
    return this.run(actor, intent.id, context, async (tx) => {
      const current = await this.uploader(tx, actor, intent.patientId)
      await tx.lock(intent.patientId)
      if (intent.orderId) await tx.lockResultOrder(intent.orderId)
      const order = await this.order(tx, intent)
      if (!(await tx.resultFileMatches(intent, fileId, current.userId)))
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const record = await tx.record(intent.patientId),
        now = this.now()
      await tx.createResult(intent, record.id, fileId, current.userId, now)
      if (order) await tx.markOrderReceived(order.id, now)
      const retainUntil = new Date(
        Number(
          Temporal.Instant.from(now.toISOString())
            .toZonedDateTimeISO('UTC')
            .add({ years: this.retentionYears }).epochMilliseconds,
        ),
      )
      await tx.retainResult(
        intent.id,
        record.id,
        now,
        this.retentionYears,
        retainUntil,
      )
      await tx.appendTimeline({
        recordId: record.id,
        resourceId: intent.id,
        type: 'exam_result',
        occurredAt: now,
        professionalId: order?.requesterId ?? null,
        specialtyId: order?.specialtyId ?? null,
        modality: order?.modality ?? null,
        summary: order
          ? 'Resultado de exame recebido'
          : 'Resultado de exame — origem externa',
      })
      if (order) await tx.queueResultNotice(order, intent.id, context)
      await tx.audit.append({
        ...context,
        actorUserId: current.userId,
        actorRoles: current.roles,
        action: 'exam_result.received',
        resourceType: 'ExamResult',
        resourceId: intent.id,
        subjectPatientId: intent.patientId,
        authorizationBasis: current.roles.includes('receptionist')
          ? 'blind_reception_upload'
          : 'patient_or_guardian',
        metadata: { source: intent.origin },
      })
      return {
        resultId: intent.id,
        patientId: intent.patientId,
        fileId,
        orderId: intent.orderId ?? null,
        origin: intent.origin,
        receivedAt: now.toISOString(),
      }
    })
  }
  private async reader(
    tx: ExamResultTransaction,
    actor: Principal,
    patientId: string,
  ) {
    const basis = await this.authorization.basis(tx, actor, patientId)
    if (basis.phase === 'pre')
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    return basis
  }
  detail(actor: Principal, id: string, context: AuditContext) {
    return this.run(actor, id, context, async (tx) => {
      const subject = await tx.resultSubject(id)
      if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const basis = await this.reader(tx, actor, subject.patientId),
        row = await tx.result(id)
      if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'exam_result.read',
        resourceType: 'ExamResult',
        resourceId: id,
        subjectPatientId: subject.patientId,
        authorizationBasis: clinicalBasisId(basis),
      })
      return resultView(row)
    })
  }
  list(
    actor: Principal,
    patientId: string,
    query: ExamResultQuery,
    context: AuditContext,
  ) {
    return this.run(actor, patientId, context, async (tx) => {
      const basis = await this.reader(tx, actor, patientId),
        record = await tx.record(patientId),
        page = await tx.results(record.id, query)
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'exam_result.listed',
        resourceType: 'ClinicalRecord',
        resourceId: record.id,
        subjectPatientId: patientId,
        authorizationBasis: clinicalBasisId(basis),
        metadata: { count: page.items.length },
      })
      return { items: page.items.map(resultView), nextCursor: page.nextCursor }
    })
  }
  fileBasis(actor: Principal, file: FileRecord, context: AuditContext) {
    return this.run(actor, file.linkedResourceId, context, async (tx) => {
      const subject = await tx.resultSubject(file.linkedResourceId)
      if (
        !subject ||
        subject.patientId !== file.ownerPatientId ||
        file.category !== 'result'
      )
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const basis = await this.reader(tx, actor, subject.patientId),
        row = await tx.result(file.linkedResourceId)
      if (!row || row.file.id !== file.id || row.file.sha256 !== file.sha256)
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      return { authorizationBasis: clinicalBasisId(basis) }
    })
  }
}
