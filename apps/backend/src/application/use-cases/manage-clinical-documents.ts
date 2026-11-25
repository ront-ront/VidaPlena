import { mayAccess, type Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import { ClinicalIntegrityError } from '../errors/clinical-integrity-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  ClinicalDocument,
  ClinicalDocumentStore,
  ClinicalDocumentTransaction,
  DocumentPolicies,
  DocumentTypeCode,
} from '../ports/clinical-documents'
import type { DocumentArtifactWriter } from '../ports/document-artifacts'
import type { FileRecord } from '../ports/files'
import type { OpaqueTokens } from '../ports/passwords'
import type {
  CanonicalDocuments,
  DocumentSigner,
  SignatureProvider,
} from '../ports/signature-provider'
import { type AuthorizeClinical, clinicalBasisId } from './authorize-clinical'
import type { ManageCareLinks } from './manage-care-links'
export class ManageClinicalDocuments {
  constructor(
    private readonly store: ClinicalDocumentStore,
    private readonly links: ManageCareLinks,
    private readonly authorization: AuthorizeClinical,
    private readonly audit: AuditWriter,
    private readonly provider: SignatureProvider,
    private readonly canonical: CanonicalDocuments,
    private readonly tokens: OpaqueTokens,
    private readonly policies: DocumentPolicies,
    private readonly artifacts: DocumentArtifactWriter | null = null,
    private readonly now = () => new Date(),
  ) {}
  private async run<T>(
    actor: Principal | null,
    id: string,
    context: AuditContext,
    run: (tx: ClinicalDocumentTransaction) => Promise<T>,
  ) {
    try {
      return await this.store.transaction(run)
    } catch (error) {
      if (error instanceof ClinicalIntegrityError) {
        await this.audit.append({
          ...context,
          actorUserId: actor?.userId,
          actorRoles: actor?.roles ?? [],
          action: 'clinical.integrity_failed',
          resourceType: 'ClinicalDocument',
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
          actorUserId: actor?.userId,
          actorRoles: actor?.roles ?? [],
          action: actor
            ? 'authorization.denied'
            : 'document.verification_not_found',
          resourceType: 'ClinicalDocument',
          resourceId: id,
          authorizationBasis: actor ? 'denied' : 'public_verification',
        })
      throw error
    }
  }
  private policy(code: DocumentTypeCode) {
    const policy = this.policies.get(code)
    if (!policy) throw new ApplicationError('SERVICE_UNAVAILABLE')
    return policy
  }
  private async writer(
    tx: ClinicalDocumentTransaction,
    actor: Principal,
    encounterId: string,
  ) {
    const initial = await tx.documentEncounter(encounterId)
    if (!initial) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    await tx.lockAppointment(initial.appointmentId)
    await tx.lock(initial.patientId)
    const encounter = await tx.documentEncounter(encounterId)
    if (!encounter) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    const basis = await this.links.basis(
      tx,
      actor,
      encounter.patientId,
      encounter.appointmentId,
    )
    if (basis.professionalId !== encounter.professionalId)
      throw new ApplicationError('FORBIDDEN')
    if (
      basis.phase !== 'during' ||
      encounter.status !== 'in_progress' ||
      encounter.appointmentStatus !== 'in_service'
    )
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    return { basis, encounter }
  }
  private async written(
    tx: ClinicalDocumentTransaction,
    actor: Principal,
    id: string,
  ) {
    const subject = await tx.documentSubject(id)
    if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    const access = await this.writer(tx, actor, subject.encounterId)
    await tx.lockDocument(id)
    const row = await tx.document(id)
    if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    if (row.authorProfessionalId !== access.basis.professionalId)
      throw new ApplicationError('FORBIDDEN')
    return { ...access, row }
  }
  private log(
    tx: ClinicalDocumentTransaction,
    actor: Principal,
    context: AuditContext,
    action: string,
    row: ClinicalDocument,
    basis: string,
  ) {
    return tx.audit.append({
      ...context,
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      action,
      resourceType: 'ClinicalDocument',
      resourceId: row.id,
      subjectPatientId: row.patientId,
      authorizationBasis: basis,
      metadata: { version: row.version, status: row.status },
    })
  }
  private envelope(
    row: ClinicalDocument,
    signer: DocumentSigner,
    issuedAt: Date,
    version: 1 | 2,
  ) {
    return {
      integrityVersion: version,
      documentId: row.id,
      recordId: row.recordId,
      patientId: row.patientId,
      encounterId: row.encounterId,
      authorProfessionalId: row.authorProfessionalId,
      type: {
        code: row.type.code,
        label: row.type.label,
        version: row.type.version,
        templateVersion: row.type.templateVersion,
        requiredSignatureLevel: row.type.requiredSignatureLevel,
      },
      payloadVersion: row.payloadVersion,
      payload: row.payload,
      signer,
      issuedAt: issuedAt.toISOString(),
      ...(version === 2
        ? {
            copiedFromDocumentId: row.copiedFromDocumentId,
            allergyAcknowledgements: [...row.allergyAcknowledgements].sort(
              (a, b) => a.alertId.localeCompare(b.alertId),
            ),
            files: row.files
              .map((f) => ({
                id: f.id,
                sha256: f.sha256,
                contentType: f.contentType,
                size: f.size,
              }))
              .sort((a, b) => a.id.localeCompare(b.id)),
          }
        : {}),
    }
  }
  private checked(row: ClinicalDocument) {
    if (row.status === 'draft') return row
    const fail = () => {
      throw new ClinicalIntegrityError(row.id)
    }
    if (
      !row.canonical ||
      !row.signature ||
      !row.sha256 ||
      !row.issuedAt ||
      !row.verificationCode ||
      this.tokens.digest(row.verificationCode) !== row.verificationCodeHash
    )
      return fail()
    try {
      const envelope = JSON.parse(row.canonical)
      if (
        ![1, 2].includes(envelope.integrityVersion) ||
        (envelope.integrityVersion === 1 && row.copiedFromDocumentId)
      )
        return fail()
      const expected = this.envelope(
        row,
        row.signature.signer,
        row.issuedAt,
        envelope.integrityVersion,
      )
      if (
        this.canonical.serialize(envelope) !== row.canonical ||
        this.canonical.serialize(expected) !== row.canonical ||
        this.canonical.sha256(row.canonical) !== row.sha256 ||
        row.signature.sha256 !== row.sha256 ||
        row.signature.signer.id !== row.authorProfessionalId ||
        row.signature.signedAt !== row.issuedAt.toISOString() ||
        row.signature.level !== row.type.requiredSignatureLevel ||
        (row.status === 'issued_dev' &&
          (row.signature.legalValidity ||
            row.signature.provider !== 'dev' ||
            row.signature.version !== 'dev-v1' ||
            row.signature.seal !== 'sem validade jurídica')) ||
        (row.status === 'issued_valid' && !row.signature.legalValidity)
      )
        return fail()
      return row
    } catch {
      return fail()
    }
  }
  private view(row: ClinicalDocument) {
    return {
      documentId: row.id,
      patientId: row.patientId,
      encounterId: row.encounterId,
      typeCode: row.type.code,
      typeLabel: row.type.label,
      typeVersion: row.type.version,
      templateVersion: row.type.templateVersion,
      requiredSignatureLevel: row.type.requiredSignatureLevel,
      examOrder: row.examOrder,
      copiedFromDocumentId: row.copiedFromDocumentId,
      files: row.files,
      allergyAcknowledgements: row.allergyAcknowledgements,
      payloadVersion: row.payloadVersion,
      payload: row.payload,
      version: row.version,
      status: row.voidEvent ? 'voided' : row.status,
      savedAt: row.savedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      issuedAt: row.issuedAt?.toISOString() ?? null,
      signature: row.signature,
      verificationCode: row.verificationCode,
      sha256: row.sha256,
      voidEvent: row.voidEvent
        ? { ...row.voidEvent, createdAt: row.voidEvent.createdAt.toISOString() }
        : null,
    }
  }
  createDraft(
    actor: Principal,
    encounterId: string,
    typeCode: DocumentTypeCode,
    payload: unknown,
    context: AuditContext,
  ) {
    return this.run(actor, encounterId, context, async (tx) => {
      const { basis, encounter } = await this.writer(tx, actor, encounterId),
        type = await tx.documentType(typeCode)
      if (!type?.active) throw new ApplicationError('VALIDATION_ERROR')
      const policy = this.policy(typeCode),
        validated = policy.validate(payload, type.templateVersion)
      const value = policy.prepare
        ? await policy.prepare(tx, validated, type.templateVersion, {
            actor,
            patientId: encounter.patientId,
            encounterId: encounter.id,
            reusing: false,
          })
        : validated
      const row = await tx.createDocument(
        encounter,
        type,
        JSON.parse(this.canonical.serialize(value)),
        this.now(),
      )
      await this.log(
        tx,
        actor,
        context,
        'document.draft_created',
        row,
        clinicalBasisId(basis),
      )
      return this.view(row)
    })
  }
  reuse(
    actor: Principal,
    encounterId: string,
    sourceDocumentId: string,
    context: AuditContext,
  ) {
    return this.run(actor, sourceDocumentId, context, async (tx) => {
      const { basis, encounter } = await this.writer(tx, actor, encounterId),
        subject = await tx.documentSubject(sourceDocumentId)
      if (
        !subject ||
        subject.patientId !== encounter.patientId ||
        subject.status === 'draft'
      )
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const source = await tx.document(subject.id)
      if (!source || source.voidEvent)
        throw new ApplicationError('VALIDATION_ERROR')
      this.checked(source)
      const type = await tx.documentType(source.type.typeId)
      if (!type?.active) throw new ApplicationError('VALIDATION_ERROR')
      const policy = this.policy(type.code),
        validated = policy.validate(source.payload, type.templateVersion)
      const value = policy.prepare
        ? await policy.prepare(tx, validated, type.templateVersion, {
            actor,
            patientId: encounter.patientId,
            encounterId: encounter.id,
            reusing: true,
          })
        : validated
      const row = await tx.createDocument(
        encounter,
        type,
        JSON.parse(this.canonical.serialize(value)),
        this.now(),
        source.id,
      )
      await this.log(
        tx,
        actor,
        context,
        'document.draft_reused',
        row,
        clinicalBasisId(basis),
      )
      return this.view(row)
    })
  }
  patchDraft(
    actor: Principal,
    id: string,
    payload: unknown,
    expectedVersion: number,
    context: AuditContext,
  ) {
    return this.run(actor, id, context, async (tx) => {
      const { row, basis } = await this.written(tx, actor, id)
      if (row.status !== 'draft' || row.version !== expectedVersion)
        throw new ApplicationError('CONFLICT')
      const type = await tx.documentType(row.type.typeId)
      if (!type?.active) throw new ApplicationError('VALIDATION_ERROR')
      const policy = this.policy(type.code),
        validated = policy.validate(payload, type.templateVersion)
      const value = policy.prepare
        ? await policy.prepare(tx, validated, type.templateVersion, {
            actor,
            patientId: row.patientId,
            encounterId: row.encounterId,
            reusing: false,
          })
        : validated
      const next = await tx.updateDocument(
        id,
        type.id,
        JSON.parse(this.canonical.serialize(value)),
        expectedVersion,
        this.now(),
      )
      await this.log(
        tx,
        actor,
        context,
        'document.draft_updated',
        next,
        clinicalBasisId(basis),
      )
      return this.view(next)
    })
  }
  issue(
    actor: Principal,
    id: string,
    input: { expectedVersion: number; acknowledgedAllergyIds?: string[] },
    context: AuditContext,
  ) {
    const staged: { discard(): Promise<void> }[] = []
    return this.run(actor, id, context, async (tx) => {
      const { row, basis, encounter } = await this.written(tx, actor, id)
      if (row.status !== 'draft' || row.version !== input.expectedVersion)
        throw new ApplicationError('CONFLICT')
      await tx.lockDocumentType(row.type.typeId)
      const type = await tx.documentType(row.type.typeId)
      if (!type?.active || type.id !== row.type.id)
        throw new ApplicationError('CONFLICT')
      if (!this.provider.available(type.requiredSignatureLevel))
        throw new ApplicationError('SERVICE_UNAVAILABLE')
      const policy = this.policy(type.code)
      policy.validate(row.payload, type.templateVersion)
      await policy.beforeIssue(
        tx,
        row,
        actor,
        input.acknowledgedAllergyIds ?? [],
        { ...context, authorizationBasis: clinicalBasisId(basis) },
      )
      const signer = await tx.documentSigner(row.authorProfessionalId)
      if (!signer) throw new ApplicationError('FORBIDDEN')
      const now = this.now(),
        code = this.tokens.issue()
      const artifact = await this.artifacts?.stage(tx, row, {
        signer,
        issuedAt: now,
        verificationCode: code,
        developmentOnly: this.provider.developmentOnly,
        context: {
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          authorizationBasis: clinicalBasisId(basis),
        },
      })
      if (artifact) staged.push(artifact)
      const prepared = await tx.document(row.id)
      if (!prepared) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const canonical = this.canonical.serialize(
        this.envelope(prepared, signer, now, 2),
      )
      const signature = await this.provider.sign({
        bytes: this.canonical.bytes(canonical),
        signer,
        level: type.requiredSignatureLevel,
        signedAt: now,
        payloadVersion: row.payloadVersion,
      })
      if (
        signature.sha256 !== this.canonical.sha256(canonical) ||
        signature.level !== type.requiredSignatureLevel ||
        signature.signedAt !== now.toISOString() ||
        this.canonical.serialize(signature.signer) !==
          this.canonical.serialize(signer) ||
        signature.provider !== this.provider.kind ||
        (this.provider.developmentOnly &&
          (signature.legalValidity ||
            signature.seal !== 'sem validade jurídica')) ||
        (!this.provider.developmentOnly && !signature.legalValidity)
      )
        throw new ApplicationError('SERVICE_UNAVAILABLE')
      const next = this.checked(
        await tx.issueDocument(id, {
          canonical,
          signature,
          verificationCode: code,
          verificationCodeHash: this.tokens.digest(code),
          issuedAt: now,
          status: signature.legalValidity ? 'issued_valid' : 'issued_dev',
        }),
      )
      await tx.appendTimeline({
        recordId: row.recordId,
        resourceId: row.id,
        type:
          type.code === 'prescription'
            ? 'prescription'
            : type.code === 'exam_order'
              ? 'exam_order'
              : 'document',
        occurredAt: now,
        professionalId: row.authorProfessionalId,
        specialtyId: encounter.specialtyId,
        modality: encounter.modality,
        summary: policy.summary(row.payload),
      })
      await this.log(
        tx,
        actor,
        context,
        'document.issued',
        next,
        clinicalBasisId(basis),
      )
      return this.view(next)
    }).catch(async (error) => {
      await Promise.allSettled(staged.map((file) => file.discard()))
      throw error
    })
  }
  get(actor: Principal, id: string, context: AuditContext) {
    return this.run(actor, id, context, async (tx) => {
      const subject = await tx.documentSubject(id)
      if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const current = await tx.principal(actor)
      if (!current || !mayAccess(current, 'clinical_actor'))
        throw new ApplicationError('FORBIDDEN')
      const professional = await tx.professional(current)
      if (!professional) throw new ApplicationError('FORBIDDEN')
      const basis =
        subject.status === 'draft'
          ? await this.links.basis(tx, current, subject.patientId)
          : await this.authorization.basis(tx, current, subject.patientId)
      if (
        basis.phase === 'pre' ||
        (subject.status === 'draft' &&
          subject.authorProfessionalId !== professional.id)
      )
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const row = await tx.document(id)
      if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      this.checked(row)
      await this.log(
        tx,
        actor,
        context,
        'document.read',
        row,
        clinicalBasisId(basis),
      )
      return this.view(row)
    })
  }
  reviewForIssue(actor: Principal, id: string, context: AuditContext) {
    return this.run(actor, id, context, async (tx) => {
      const { row, basis } = await this.written(tx, actor, id)
      if (row.status !== 'draft') throw new ApplicationError('CONFLICT')
      const policy = this.policy(row.type.code)
      if (!policy.review) throw new ApplicationError('SERVICE_UNAVAILABLE')
      const review = await policy.review(tx, row)
      await this.log(
        tx,
        actor,
        context,
        'document.reviewed',
        row,
        clinicalBasisId(basis),
      )
      return { ...review, documentId: row.id, version: row.version }
    })
  }
  fileBasis(actor: Principal, file: FileRecord, context: AuditContext) {
    return this.run(actor, file.linkedResourceId, context, async (tx) => {
      const subject = await tx.documentSubject(file.linkedResourceId)
      if (
        !subject ||
        subject.patientId !== file.ownerPatientId ||
        file.category !== 'attachment'
      )
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const current = await tx.principal(actor)
      if (
        !current ||
        !mayAccess(current, 'clinical_actor') ||
        !(await tx.professional(current))
      )
        throw new ApplicationError('FORBIDDEN')
      const basis = await this.authorization.basis(
        tx,
        current,
        subject.patientId,
      )
      if (basis.phase === 'pre' || subject.status === 'draft')
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const row = await tx.document(subject.id)
      if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      this.checked(row)
      if (!row.files.some((f) => f.id === file.id && f.sha256 === file.sha256))
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      return { authorizationBasis: clinicalBasisId(basis) }
    })
  }
  void(
    actor: Principal,
    id: string,
    input: { reason: string; replacementDocumentId?: string },
    context: AuditContext,
  ) {
    return this.run(actor, id, context, async (tx) => {
      const { row, basis } = await this.written(tx, actor, id)
      this.checked(row)
      if (row.status === 'draft' || row.voidEvent)
        throw new ApplicationError('CONFLICT')
      const reason = input.reason.trim()
      if (!reason || reason.length > 1000)
        throw new ApplicationError('VALIDATION_ERROR')
      if (input.replacementDocumentId) {
        const subject = await tx.documentSubject(input.replacementDocumentId)
        if (
          !subject ||
          subject.id === row.id ||
          subject.patientId !== row.patientId ||
          subject.authorProfessionalId !== row.authorProfessionalId ||
          subject.status === 'draft'
        )
          throw new ApplicationError('VALIDATION_ERROR')
        const replacement = await tx.document(subject.id)
        if (
          !replacement ||
          replacement.id === row.id ||
          replacement.patientId !== row.patientId ||
          replacement.authorProfessionalId !== row.authorProfessionalId ||
          replacement.type.typeId !== row.type.typeId ||
          replacement.status === 'draft' ||
          replacement.voidEvent
        )
          throw new ApplicationError('VALIDATION_ERROR')
        this.checked(replacement)
      }
      const next = await tx.voidDocument(
        id,
        row.authorProfessionalId,
        reason,
        input.replacementDocumentId ?? null,
        this.now(),
      )
      await this.log(
        tx,
        actor,
        context,
        'document.voided',
        next,
        clinicalBasisId(basis),
      )
      return this.view(next)
    })
  }
  verify(code: string, context: AuditContext) {
    const hash = this.tokens.digest(code)
    return this.run(null, hash, context, async (tx) => {
      const id = await tx.documentByVerificationHash(hash)
      if (!id) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const row = await tx.document(id)
      if (!row || row.status === 'draft')
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      this.checked(row)
      await tx.audit.append({
        ...context,
        actorUserId: undefined,
        actorRoles: [],
        action: 'document.verified',
        resourceType: 'ClinicalDocument',
        resourceId: id,
        authorizationBasis: 'public_verification',
        metadata: { status: row.voidEvent ? 'voided' : row.status },
      })
      return {
        documentId: row.id,
        type: { code: row.type.code, label: row.type.label },
        issuedAt: row.issuedAt?.toISOString(),
        issuer: row.signature?.signer,
        sha256: row.sha256,
        status: row.voidEvent ? 'voided' : row.status,
        signatureLevel: row.signature?.level,
        legalValidity: row.signature?.legalValidity,
        seal: row.signature?.seal,
      }
    })
  }
}
