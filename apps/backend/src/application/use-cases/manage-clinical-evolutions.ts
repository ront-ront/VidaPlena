import { Temporal } from '@js-temporal/polyfill'
import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import { ClinicalIntegrityError } from '../errors/clinical-integrity-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  AuthoredEvolutionQuery,
  ClinicalEvolutionStore,
  ClinicalEvolutionTransaction,
} from '../ports/clinical-evolutions'
import type { EvolutionTextField } from '../ports/evolution-drafts'
import type { FileRecord } from '../ports/files'
import { type AuthorizeClinical, clinicalBasisId } from './authorize-clinical'
import {
  evolutionAddendumHash,
  finalizedEvolutionHash,
} from './evolution-integrity'
import type { ManageCareLinks } from './manage-care-links'
import {
  evolutionConflict,
  evolutionSaved,
  type ManageEvolutionDrafts,
} from './manage-evolution-drafts'
export class ManageClinicalEvolutions {
  constructor(
    private readonly store: ClinicalEvolutionStore,
    private readonly drafts: ManageEvolutionDrafts,
    private readonly links: ManageCareLinks,
    private readonly authorization: AuthorizeClinical,
    private readonly audit: AuditWriter,
    private readonly requiredFields: EvolutionTextField[],
    private readonly retentionYears: number,
    private readonly now = () => new Date(),
  ) {}
  private async run<T>(
    actor: Principal,
    id: string,
    context: AuditContext,
    action: (tx: ClinicalEvolutionTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.store.transaction(action)
    } catch (error) {
      if (error instanceof ClinicalIntegrityError) {
        await this.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: 'clinical.integrity_failed',
          resourceType: 'ClinicalEvolution',
          resourceId: error.resourceId,
          authorizationBasis: 'integrity_check',
          metadata: { reasonCode: 'hash_mismatch' },
        })
        throw new ApplicationError('SERVICE_UNAVAILABLE')
      }
      if (
        error instanceof ApplicationError &&
        ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN'].includes(error.code)
      )
        await this.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: 'authorization.denied',
          resourceType: 'ClinicalEvolution',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  private async professional(
    tx: ClinicalEvolutionTransaction,
    actor: Principal,
  ) {
    const current = await tx.principal(actor)
    if (!current || !mayAccess(current, 'clinical_actor'))
      throw new ApplicationError('FORBIDDEN')
    const professional = await tx.professional(current)
    if (!professional) throw new ApplicationError('FORBIDDEN')
    return professional
  }
  private async readBasis(
    tx: ClinicalEvolutionTransaction,
    actor: Principal,
    id: string,
  ) {
    const professional = await this.professional(tx, actor),
      subject = await tx.evolutionSubject(id)
    if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    const encounter = await tx.evolutionEncounter(subject.encounterId)
    if (!encounter) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    if (
      subject.status === 'finalized' &&
      subject.authorProfessionalId === professional.id
    )
      return {
        authorizationBasis: `evolution_author:${id}`,
        patientId: encounter.patientId,
      }
    if (subject.status === 'draft') {
      if (subject.authorProfessionalId !== professional.id)
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const basis = await this.links.basis(tx, actor, encounter.patientId)
      if (basis.phase === 'pre')
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      return {
        authorizationBasis: clinicalBasisId(basis),
        patientId: encounter.patientId,
      }
    }
    const basis = await this.authorization.basis(tx, actor, encounter.patientId)
    if (basis.phase === 'pre')
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    return {
      authorizationBasis: clinicalBasisId(basis),
      patientId: encounter.patientId,
    }
  }
  private async verified(tx: ClinicalEvolutionTransaction, id: string) {
    const row = await tx.evolution(id)
    if (
      row?.status !== 'finalized' ||
      !row.finalizedAt ||
      !row.contentHash ||
      row.integrityVersion !== 1
    )
      throw new ClinicalIntegrityError(id)
    const attachments = await tx.evolutionAttachments(id),
      addenda = await tx.evolutionAddenda(id)
    if (
      finalizedEvolutionHash(row, attachments, row.finalizedAt) !==
        row.contentHash ||
      addenda.some(
        (a) =>
          evolutionAddendumHash(a, row.contentHash as string) !== a.contentHash,
      )
    )
      throw new ClinicalIntegrityError(id)
    return { row, attachments, addenda }
  }
  policy(actor: Principal, context: AuditContext) {
    return this.run(actor, actor.userId, context, async (tx) => {
      await this.professional(tx, actor)
      return { requiredFields: [...this.requiredFields] }
    })
  }
  finalize(
    actor: Principal,
    id: string,
    expectedVersion: number,
    context: AuditContext,
  ) {
    return this.run(actor, id, context, async (tx) => {
      await tx.lockEvolution(id)
      const subject = await tx.evolutionSubject(id)
      if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const professional = await this.professional(tx, actor)
      if (subject.authorProfessionalId !== professional.id)
        throw new ApplicationError('FORBIDDEN')
      if (
        subject.status !== 'draft' ||
        subject.draftVersion !== expectedVersion
      )
        evolutionConflict(subject)
      const encounter = await tx.evolutionEncounter(subject.encounterId)
      if (!encounter) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const basis = await this.links.basis(
        tx,
        actor,
        encounter.patientId,
        encounter.appointment.id,
      )
      if (
        basis.phase !== 'during' ||
        encounter.status !== 'in_progress' ||
        encounter.appointment.status !== 'in_service'
      )
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const row = await tx.evolution(id)
      if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const missing = this.requiredFields.filter(
        (field) => !row.payload[field].trim(),
      )
      if (missing.length)
        throw new ApplicationError(
          'VALIDATION_ERROR',
          missing.map((field) => ({
            field,
            reason: 'Preencha este campo antes de finalizar.',
          })),
        )
      if (row.integrityVersion !== 1) throw new ClinicalIntegrityError(id)
      const now = this.now(),
        attachments = await tx.evolutionAttachments(id),
        hash = finalizedEvolutionHash(row, attachments, now)
      await tx.finalizeEvolution(id, expectedVersion, hash, now)
      const retainUntil = new Date(
        Number(
          Temporal.Instant.from(now.toISOString())
            .toZonedDateTimeISO('UTC')
            .add({ years: this.retentionYears }).epochMilliseconds,
        ),
      )
      const details = await tx.completeClinicalEncounter(
        encounter,
        actor,
        context,
        now,
        this.retentionYears,
        retainUntil,
      )
      await tx.appendTimeline({
        recordId: encounter.recordId,
        resourceId: id,
        type: 'evolution',
        occurredAt: now,
        professionalId: professional.id,
        specialtyId: details.specialtyId,
        modality: details.modality,
        summary: row.payload.complaint.slice(0, 240),
      })
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'evolution.finalized',
        resourceType: 'ClinicalEvolution',
        resourceId: id,
        subjectPatientId: encounter.patientId,
        authorizationBasis: clinicalBasisId(basis),
        metadata: { version: row.draftVersion },
      })
      return {
        evolutionId: id,
        status: 'finalized' as const,
        finalizedAt: now.toISOString(),
        contentHash: hash,
        integrityVersion: 1,
        legalSignatureStatus: 'not_provided' as const,
      }
    })
  }
  get(actor: Principal, id: string, context: AuditContext) {
    return this.run(actor, id, context, async (tx) => {
      const basis = await this.readBasis(tx, actor, id),
        subject = await tx.evolutionSubject(id)
      if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (subject.status === 'draft')
        return this.drafts.readInTransaction(tx, actor, id, context)
      const { row, attachments, addenda } = await this.verified(tx, id)
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'evolution.finalized_read',
        resourceType: 'ClinicalEvolution',
        resourceId: id,
        subjectPatientId: basis.patientId,
        authorizationBasis: basis.authorizationBasis,
      })
      return {
        ...evolutionSaved(row),
        encounterId: row.encounterId,
        patientId: basis.patientId,
        authorProfessionalId: row.authorProfessionalId,
        author: await tx.authorProfessional(row.authorProfessionalId),
        finalizedAt: row.finalizedAt?.toISOString(),
        contentHash: row.contentHash,
        integrityVersion: row.integrityVersion,
        ...row.payload,
        attachments,
        addenda: addenda.map((a) => ({
          addendumId: a.id,
          originalEvolutionId: a.originalEvolutionId,
          authorProfessionalId: a.authorProfessionalId,
          author: a.author,
          reason: a.reason,
          correctionText: a.correctionText,
          createdAt: a.createdAt.toISOString(),
          contentHash: a.contentHash,
        })),
        legalSignatureStatus: 'not_provided' as const,
      }
    })
  }
  mine(actor: Principal, query: AuthoredEvolutionQuery, context: AuditContext) {
    return this.run(actor, actor.userId, context, async (tx) => {
      const professional = await this.professional(tx, actor),
        page = await tx.authoredEvolutions(professional.id, query)
      for (const { row, attachments } of page.items) {
        if (
          !row.finalizedAt ||
          row.integrityVersion !== 1 ||
          finalizedEvolutionHash(row, attachments, row.finalizedAt) !==
            row.contentHash
        )
          throw new ClinicalIntegrityError(row.id)
      }
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'evolution.mine_read',
        resourceType: 'ClinicalEvolution',
        resourceId: professional.id,
        authorizationBasis: 'professional_self',
        metadata: { count: page.items.length },
      })
      return {
        items: page.items.map(({ row, patientId }) => ({
          evolutionId: row.id,
          encounterId: row.encounterId,
          patientId,
          finalizedAt: row.finalizedAt?.toISOString(),
          summary: row.payload.complaint.slice(0, 240),
        })),
        nextCursor: page.nextCursor,
      }
    })
  }
  addendum(
    actor: Principal,
    id: string,
    input: { reason: string; correctionText: string },
    context: AuditContext,
  ) {
    return this.run(actor, id, context, async (tx) => {
      await tx.lockEvolution(id)
      const professional = await this.professional(tx, actor),
        subject = await tx.evolutionSubject(id)
      if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (subject.authorProfessionalId !== professional.id)
        throw new ApplicationError('FORBIDDEN')
      if (subject.status !== 'finalized') evolutionConflict(subject)
      const { row } = await this.verified(tx, id),
        encounter = await tx.evolutionEncounter(subject.encounterId)
      if (!encounter) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const reason = input.reason.trim()
      if (
        !reason ||
        reason.length > 1000 ||
        !input.correctionText.trim() ||
        input.correctionText.length > 20000
      )
        throw new ApplicationError('VALIDATION_ERROR')
      const content = {
          originalEvolutionId: row.id,
          authorProfessionalId: professional.id,
          reason,
          correctionText: input.correctionText,
          createdAt: this.now(),
        },
        contentHash = evolutionAddendumHash(content, row.contentHash as string)
      const result = await tx.createEvolutionAddendum({
        ...content,
        contentHash,
      })
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'evolution.addendum_created',
        resourceType: 'EvolutionAddendum',
        resourceId: result.id,
        subjectPatientId: encounter.patientId,
        authorizationBasis: `evolution_author:${id}`,
      })
      return {
        addendumId: result.id,
        ...content,
        createdAt: result.createdAt.toISOString(),
        contentHash,
        author: result.author,
      }
    })
  }
  fileBasis(actor: Principal, file: FileRecord, context: AuditContext) {
    return this.run(actor, file.linkedResourceId, context, async (tx) => {
      const basis = await this.readBasis(tx, actor, file.linkedResourceId)
      if (
        basis.patientId !== file.ownerPatientId ||
        file.category !== 'attachment'
      )
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const subject = await tx.evolutionSubject(file.linkedResourceId)
      const files =
        subject?.status === 'finalized'
          ? (await this.verified(tx, file.linkedResourceId)).attachments
          : await tx.evolutionAttachments(file.linkedResourceId)
      if (!files.some((f) => f.id === file.id && f.sha256 === file.sha256))
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      return { authorizationBasis: basis.authorizationBasis }
    })
  }
}
