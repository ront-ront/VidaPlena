import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import { ClinicalIntegrityError } from '../errors/clinical-integrity-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type { FileRecord } from '../ports/files'
import type {
  PatientPublication,
  PatientPublicationStore,
  PatientPublicationTransaction,
  PublicationInput,
  PublicationQuery,
  PublishedProjection,
} from '../ports/patient-publications'
import { parsePublicationInput } from '../validation/patient-publication'
import { clinicalBasisId } from './authorize-clinical'
import { finalizedEvolutionHash } from './evolution-integrity'
import type { ManageCareLinks } from './manage-care-links'
import type { ManageClinicalDocuments } from './manage-clinical-documents'

const receipt = (p: PatientPublication) => ({
  publicationId: p.id,
  patientId: p.patientId,
  resourceType: p.resourceType,
  resourceId: p.resourceId,
  visibilityKind: p.visibilityKind,
  publishedByProfessionalId: p.publishedByProfessionalId,
  publishedAt: p.publishedAt.toISOString(),
  revokedAt: p.revokedAt?.toISOString() ?? null,
})
export class ManagePatientPublications {
  constructor(
    private readonly store: PatientPublicationStore,
    private readonly links: ManageCareLinks,
    private readonly documents: ManageClinicalDocuments,
    private readonly audit: AuditWriter,
    private readonly now = () => new Date(),
  ) {}
  private async run<T>(
    actor: Principal,
    id: string,
    context: AuditContext,
    run: (tx: PatientPublicationTransaction) => Promise<T>,
  ) {
    try {
      return await this.store.transaction(run)
    } catch (error) {
      if (error instanceof ClinicalIntegrityError) {
        await this.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: 'clinical.integrity_failed',
          resourceType: 'PatientPublication',
          resourceId: id,
          authorizationBasis: 'integrity_check',
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
          resourceType: 'PatientPublication',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  private async writer(
    tx: PatientPublicationTransaction,
    actor: Principal,
    patientId: string,
  ) {
    const basis = await this.links.basis(tx, actor, patientId)
    if (basis.phase === 'pre')
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    return basis
  }
  private async reader(
    tx: PatientPublicationTransaction,
    actor: Principal,
    patientId: string,
  ) {
    const current = await tx.principal(actor)
    if (
      !current ||
      !mayAccess(current, 'session') ||
      !current.roles.includes('patient')
    )
      throw new ApplicationError('FORBIDDEN')
    const subject = await tx.uploadSubject(current.userId, patientId)
    if (!subject.exists || !subject.owns)
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    if (subject.consentState !== 'active')
      throw new ApplicationError('FORBIDDEN')
    return `patient_publication:own_or_guardian:${patientId}`
  }
  private log(
    tx: PatientPublicationTransaction,
    actor: Principal,
    context: AuditContext,
    action: string,
    p: PatientPublication,
    basis: string,
  ) {
    return tx.audit.append({
      ...context,
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      action,
      resourceType: 'PatientPublication',
      resourceId: p.id,
      subjectPatientId: p.patientId,
      authorizationBasis: basis,
    })
  }
  publish(actor: Principal, input: PublicationInput, context: AuditContext) {
    input = parsePublicationInput(input)
    return this.run(actor, input.resourceId, context, async (tx) => {
      await tx.lock(input.patientId)
      const basis = await this.writer(tx, actor, input.patientId),
        subject = await tx.uploadSubject(actor.userId, input.patientId)
      if (subject.consentState !== 'active')
        throw new ApplicationError('CONSENT_REQUIRED')
      const source = await tx.publicationSource(
        input.resourceType,
        input.resourceId,
      )
      if (!source || source.patientId !== input.patientId)
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (!source.eligible || !source.occurredAt)
        throw new ApplicationError('VALIDATION_ERROR')
      if (
        source.authorProfessionalId &&
        source.authorProfessionalId !== basis.professionalId
      )
        throw new ApplicationError('FORBIDDEN')
      let projection: PublishedProjection | null = null
      if (input.resourceType === 'ClinicalDocument') {
        if (input.visibilityKind !== 'document' || input.projection)
          throw new ApplicationError('VALIDATION_ERROR')
        const d = await tx.document(input.resourceId)
        if (!d?.files.length) throw new ApplicationError('VALIDATION_ERROR')
        this.documents.assertIntegrity(d)
      } else if (input.resourceType === 'ExamResult') {
        if (
          input.visibilityKind !== 'result' ||
          input.projection ||
          !(await tx.result(input.resourceId))
        )
          throw new ApplicationError('VALIDATION_ERROR')
      } else {
        if (
          !['orientation', 'confirmed_summary'].includes(
            input.visibilityKind,
          ) ||
          !input.projection?.text.trim()
        )
          throw new ApplicationError('VALIDATION_ERROR')
        const row = await tx.evolution(input.resourceId),
          attachments = await tx.evolutionAttachments(input.resourceId)
        if (
          !row?.finalizedAt ||
          row.integrityVersion !== 1 ||
          finalizedEvolutionHash(row, attachments, row.finalizedAt) !==
            row.contentHash
        )
          throw new ClinicalIntegrityError(input.resourceId)
        projection = { text: input.projection.text }
        if (input.visibilityKind === 'confirmed_summary') {
          const codes = input.projection.diagnosisCodes
          if (
            input.projection.diagnosisConfirmed !== true ||
            !codes?.length ||
            new Set(codes.map((c) => `${c.code}:${c.version}`)).size !==
              codes.length
          )
            throw new ApplicationError('VALIDATION_ERROR')
          const diagnoses = codes.map((c) =>
            row.payload.diagnosisCodes.find(
              (s) => s.code === c.code && s.version === c.version,
            ),
          )
          if (diagnoses.some((c) => !c))
            throw new ApplicationError('VALIDATION_ERROR')
          projection = {
            ...projection,
            diagnosisConfirmed: true,
            diagnoses: diagnoses as NonNullable<
              PublishedProjection['diagnoses']
            >,
          }
        } else if (
          input.projection.diagnosisCodes ||
          input.projection.diagnosisConfirmed
        )
          throw new ApplicationError('VALIDATION_ERROR')
      }
      if (!input.reviewedForPatient)
        throw new ApplicationError('VALIDATION_ERROR')
      if (
        await tx.activePublication(
          input.resourceType,
          input.resourceId,
          input.visibilityKind,
        )
      )
        throw new ApplicationError('CONFLICT')
      const p = await tx.createPublication(
        input,
        source,
        projection,
        basis.professionalId,
        this.now(),
      )
      await this.log(
        tx,
        actor,
        context,
        'publication.created',
        p,
        clinicalBasisId(basis),
      )
      return receipt(p)
    })
  }
  revoke(actor: Principal, id: string, reason: string, context: AuditContext) {
    return this.run(actor, id, context, async (tx) => {
      const initial = await tx.publication(id)
      if (!initial) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      await tx.lock(initial.patientId)
      const basis = await this.writer(tx, actor, initial.patientId),
        p = await tx.publication(id)
      if (!p || p.publishedByProfessionalId !== basis.professionalId)
        throw new ApplicationError('FORBIDDEN')
      if (p.revokedAt) throw new ApplicationError('CONFLICT')
      if (!reason.trim() || reason.length > 1000)
        throw new ApplicationError('VALIDATION_ERROR')
      const revoked = await tx.revokePublication(
        id,
        basis.professionalId,
        reason,
        this.now(),
      )
      await this.log(
        tx,
        actor,
        context,
        'publication.revoked',
        revoked,
        clinicalBasisId(basis),
      )
      return receipt(revoked)
    })
  }
  clinicalList(
    actor: Principal,
    patientId: string,
    query: PublicationQuery,
    context: AuditContext,
  ) {
    return this.run(actor, patientId, context, async (tx) => {
      const basis = await this.writer(tx, actor, patientId),
        page = await tx.publicationPage(patientId, query)
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'publication.listed',
        resourceType: 'PatientProfile',
        resourceId: patientId,
        subjectPatientId: patientId,
        authorizationBasis: clinicalBasisId(basis),
        metadata: { count: page.items.length },
      })
      return {
        items: page.items.map((p) => ({
          ...receipt(p),
          projection: p.projection,
        })),
        nextCursor: page.nextCursor,
      }
    })
  }
  private async publicDocument(
    tx: PatientPublicationTransaction,
    p: PatientPublication,
  ) {
    const base = {
      publicationId: p.id,
      patientId: p.patientId,
      resourceType: p.resourceType,
      resourceId: p.resourceId,
      publishedAt: p.publishedAt.toISOString(),
      date: p.occurredAt.toISOString(),
    }
    if (p.resourceType === 'ClinicalDocument') {
      const d = await tx.document(p.resourceId)
      if (!d || d.patientId !== p.patientId || d.status === 'draft')
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      this.documents.assertIntegrity(d)
      return {
        ...base,
        type: d.type.code,
        label: d.type.label,
        signatureStatus: d.voidEvent ? 'voided' : d.status,
        legalValidity: !d.voidEvent && !!d.signature?.legalValidity,
        seal: d.signature?.seal ?? null,
        files: d.files,
        verificationCode: d.verificationCode,
        voidedAt: d.voidEvent?.createdAt.toISOString() ?? null,
      }
    }
    if (p.resourceType !== 'ExamResult')
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    const r = await tx.result(p.resourceId)
    if (!r || r.patientId !== p.patientId)
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    return {
      ...base,
      type: 'exam_result',
      label: 'Resultado de exame',
      signatureStatus: 'not_signed',
      legalValidity: false,
      seal: null,
      files: [
        {
          id: r.file.id,
          contentType: r.file.contentType,
          size: r.file.size,
          sha256: r.file.sha256,
        },
      ],
      origin: r.origin,
    }
  }
  history(
    actor: Principal,
    patientId: string,
    query: PublicationQuery,
    context: AuditContext,
  ) {
    return this.run(actor, patientId, context, async (tx) => {
      const basis = await this.reader(tx, actor, patientId),
        page = await tx.publicationPage(patientId, {
          ...query,
          state: 'active',
        }),
        items = []
      for (const p of page.items) {
        const fileItem =
          p.resourceType !== 'ClinicalEvolution'
            ? await this.publicDocument(tx, p)
            : null
        items.push({
          id: p.id,
          type: p.timelineType,
          date: p.occurredAt.toISOString(),
          publishedAt: p.publishedAt.toISOString(),
          professional: p.professional,
          specialty: p.specialty,
          modality: p.modality,
          summary:
            fileItem?.label ??
            (p.visibilityKind === 'orientation'
              ? 'Orientações publicadas'
              : 'Resumo confirmado'),
          ...(fileItem ? { publishedDocument: fileItem } : {}),
          ...(p.visibilityKind === 'orientation'
            ? { orientation: p.projection?.text }
            : {}),
          ...(p.visibilityKind === 'confirmed_summary'
            ? { confirmedSummary: p.projection }
            : {}),
          ...(p.importedOrigin ? { importedOrigin: p.importedOrigin } : {}),
        })
      }
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'publication.history_read',
        resourceType: 'PatientProfile',
        resourceId: patientId,
        subjectPatientId: patientId,
        authorizationBasis: basis,
        metadata: { count: items.length },
      })
      return { items, nextCursor: page.nextCursor }
    })
  }
  detail(actor: Principal, id: string, context: AuditContext) {
    return this.run(actor, id, context, async (tx) => {
      const p = await tx.publication(id)
      if (!p || p.revokedAt)
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const basis = await this.reader(tx, actor, p.patientId),
        data = await this.publicDocument(tx, p)
      await this.log(tx, actor, context, 'publication.document_read', p, basis)
      return data
    })
  }
  fileBasis(actor: Principal, file: FileRecord, context: AuditContext) {
    return this.run(actor, file.id, context, async (tx) => {
      if (
        !['ClinicalDocument', 'ExamResult'].includes(file.linkedResourceType) ||
        !file.ownerPatientId ||
        file.category !==
          (file.linkedResourceType === 'ClinicalDocument'
            ? 'attachment'
            : 'result')
      )
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      await this.reader(tx, actor, file.ownerPatientId)
      const p = await tx.activePublication(
        file.linkedResourceType as 'ClinicalDocument' | 'ExamResult',
        file.linkedResourceId,
        file.linkedResourceType === 'ClinicalDocument' ? 'document' : 'result',
      )
      if (!p || p.patientId !== file.ownerPatientId)
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const document = await this.publicDocument(tx, p)
      if (
        !document.files.some(
          (f) =>
            f.id === file.id &&
            f.sha256 === file.sha256 &&
            f.size === file.size,
        )
      )
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      return { authorizationBasis: `patient_publication:${p.id}` }
    })
  }
}
