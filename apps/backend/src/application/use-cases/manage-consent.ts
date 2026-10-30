import type { Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext } from '../ports/audit-writer'
import type { ConsentAction, ConsentStore } from '../ports/consent'
import type { OpaqueTokens, Passwords } from '../ports/passwords'
import type { PatientRegistrationStore } from '../ports/patient-registration'
import type { PreparePatientRegistration } from './prepare-patient-registration'

export class ManageConsent {
  constructor(
    private readonly consents: ConsentStore,
    private readonly patients: PatientRegistrationStore,
    private readonly prepare: PreparePatientRegistration,
    private readonly passwords: Passwords,
    private readonly opaqueTokens: OpaqueTokens,
    private readonly inviteHours: number,
  ) {}

  current() {
    return this.consents.current()
  }

  publish(
    actorId: string,
    input: { version: string; bodyReference: string; effectiveAt: Date },
    context: AuditContext,
  ) {
    return this.consents.publish({
      ...input,
      actorId,
      requestId: context.requestId,
    })
  }

  history(actor: Principal, context: AuditContext) {
    if (!actor.roles.includes('patient'))
      throw new ApplicationError('FORBIDDEN')
    return this.consents.history(actor, context)
  }

  async registerDigital(input: {
    mode: 'self' | 'dependent'
    patient: unknown
    password?: string
    guardianRelationship?: string
    versionId: string
    accepted: boolean
    guardianProof?: { userId: string; sessionId: string }
    context: AuditContext
  }) {
    if (!input.accepted)
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'consent.accepted',
          reason: 'O aceite é necessário para o cadastro digital.',
        },
      ])
    const patient = this.prepare.prepare(input.patient, input.mode)
    const passwordHash =
      input.mode === 'self' && input.password
        ? await this.passwords.hash(input.password)
        : null
    if (input.mode === 'self' && !passwordHash)
      throw new ApplicationError('VALIDATION_ERROR', [
        { field: 'password', reason: 'Informe uma senha.' },
      ])
    return this.patients.transaction(async (tx) => {
      if (input.mode === 'dependent') {
        const proof = input.guardianProof
        if (!proof) throw new ApplicationError('UNAUTHENTICATED')
        const guardian = await tx.principal(proof)
        if (
          !guardian?.roles.includes('patient') ||
          !(await tx.guardianConsentActive(guardian.userId)) ||
          !input.guardianRelationship?.trim()
        )
          throw new ApplicationError('FORBIDDEN')
        const created = await tx.createDependent(
          patient,
          guardian.userId,
          input.guardianRelationship.trim(),
        )
        const event = await tx.recordConsent({
          patientId: created.patientId,
          documentVersionId: input.versionId,
          action: 'accept',
          actorUserId: guardian.userId,
          source: 'portal',
          guardianLinkId: created.guardianLinkId,
          consentingPersonName: (await tx.guardianName(guardian.userId)) ?? '',
          consentingRelationship: input.guardianRelationship.trim(),
        })
        await tx.audit.append({
          ...input.context,
          actorUserId: guardian.userId,
          actorRoles: guardian.roles,
          authorizationBasis: 'guardian:active',
          action: 'patient.registered',
          resourceType: 'PatientProfile',
          resourceId: created.patientId,
          subjectPatientId: created.patientId,
        })
        return {
          patientId: created.patientId,
          accountState: 'represented',
          consentEventId: event.id,
        }
      }
      const created = await tx.createSelf(patient, passwordHash ?? '')
      const event = await tx.recordConsent({
        patientId: created.patientId,
        documentVersionId: input.versionId,
        action: 'accept',
        actorUserId: created.accountId,
        source: 'portal',
        consentingPersonName: patient.fullName,
      })
      await tx.audit.append({
        ...input.context,
        actorUserId: created.accountId,
        actorRoles: ['patient'],
        authorizationBasis: 'registration:self',
        action: 'patient.registered',
        resourceType: 'PatientProfile',
        resourceId: created.patientId,
        subjectPatientId: created.patientId,
      })
      return {
        patientId: created.patientId,
        accountState: 'active',
        consentEventId: event.id,
      }
    })
  }

  async recordPortal(
    actor: Principal,
    patientId: string,
    versionId: string,
    action: ConsentAction,
    context: AuditContext,
  ) {
    if (!actor.roles.includes('patient'))
      throw new ApplicationError('FORBIDDEN')
    const actorId = actor.userId
    return this.consents.transaction(async (tx) => {
      if (!(await tx.ownsPatient(actorId, patientId)))
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const patient = await tx.patient(patientId)
      if (!patient) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const link = await tx.guardianLink(actorId, patientId)
      const event = await tx.record({
        patientId,
        documentVersionId: versionId,
        action,
        actorUserId: actorId,
        source: 'portal',
        guardianLinkId: link?.id,
        consentingPersonName: link
          ? ((await tx.actorName(actorId)) ?? '')
          : patient.fullName,
        consentingRelationship: link?.relationship,
      })
      if (action === 'revoke') await tx.revokeSessionsForPatient(patientId)
      await tx.audit.append({
        ...context,
        actorUserId: actorId,
        actorRoles: actor.roles,
        authorizationBasis: link ? 'guardian:active' : 'patient:self',
        action: `consent.${action}`,
        resourceType: 'ConsentEvent',
        resourceId: event.id,
        subjectPatientId: patientId,
      })
      return {
        consentEventId: event.id,
        state: event.state,
        ...(action === 'revoke' ? { portalState: 'restricted' } : {}),
      }
    })
  }

  async registerOnsite(input: {
    actorId: string
    patient: unknown
    guardianUserId?: string
    guardianRelationship?: string
    versionId: string
    consentingPersonName: string
    consentingRelationship?: string
    signedFileId: string
    eventId: string
    context: AuditContext
  }) {
    const patient = this.prepare.prepare(input.patient, 'onsite')
    if (
      patient.minor &&
      (!input.guardianUserId ||
        !input.guardianRelationship?.trim() ||
        input.consentingRelationship?.trim() !==
          input.guardianRelationship.trim())
    )
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'guardianRelationship',
          reason: 'Confirme o vínculo do responsável legal.',
        },
      ])
    const token =
      patient.email && !input.guardianUserId ? this.opaqueTokens.issue() : null
    return this.patients.transaction(async (tx) => {
      const created = await tx.createOnsite(
        patient,
        input.actorId,
        input.guardianUserId,
        input.guardianRelationship,
        token
          ? {
              token,
              tokenHash: this.opaqueTokens.digest(token),
              expiresAt: new Date(Date.now() + this.inviteHours * 3_600_000),
              requestId: input.context.requestId,
            }
          : undefined,
      )
      const event = await tx.recordConsent({
        eventId: input.eventId,
        patientId: created.patientId,
        documentVersionId: input.versionId,
        action: 'accept',
        actorUserId: input.actorId,
        source: 'onsite',
        guardianLinkId: created.guardianLinkId,
        consentingPersonName: input.consentingPersonName,
        consentingRelationship: input.consentingRelationship,
        signedFileId: input.signedFileId,
      })
      await tx.audit.append({
        ...input.context,
        actorUserId: input.actorId,
        actorRoles: ['receptionist'],
        authorizationBasis: 'onsite:registration',
        action: 'patient.registered_onsite',
        resourceType: 'PatientProfile',
        resourceId: created.patientId,
        subjectPatientId: created.patientId,
      })
      return {
        patientId: created.patientId,
        accountState: created.accountId ? 'invited' : 'assisted',
        consentEventId: event.id,
        signedFileId: input.signedFileId,
      }
    })
  }

  async recordOnsiteExisting(input: {
    actorId: string
    patientId: string
    guardianUserId?: string
    versionId: string
    consentingPersonName: string
    consentingRelationship?: string
    signedFileId: string
    eventId: string
    context: AuditContext
  }) {
    return this.consents.transaction(async (tx) => {
      const patient = await tx.patient(input.patientId)
      if (!patient) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const guardian = input.guardianUserId
        ? await tx.guardianLink(input.guardianUserId, input.patientId)
        : null
      if (this.prepare.isMinor(patient.birthDate) && !guardian)
        throw new ApplicationError('VALIDATION_ERROR', [
          {
            field: 'guardianUserId',
            reason: 'Informe o responsável legal ativo.',
          },
        ])
      if (input.guardianUserId && !guardian)
        throw new ApplicationError('FORBIDDEN')
      if (
        guardian &&
        input.consentingRelationship?.trim() !== guardian.relationship
      )
        throw new ApplicationError('VALIDATION_ERROR', [
          { field: 'consentingRelationship', reason: 'Confirme o parentesco.' },
        ])
      const event = await tx.record({
        eventId: input.eventId,
        patientId: input.patientId,
        documentVersionId: input.versionId,
        action: 'accept',
        actorUserId: input.actorId,
        source: 'onsite',
        guardianLinkId: guardian?.id,
        consentingPersonName: input.consentingPersonName,
        consentingRelationship: input.consentingRelationship,
        signedFileId: input.signedFileId,
      })
      await tx.audit.append({
        ...input.context,
        actorUserId: input.actorId,
        actorRoles: ['receptionist'],
        authorizationBasis: 'onsite:consent',
        action: 'consent.accept',
        resourceType: 'ConsentEvent',
        resourceId: event.id,
        subjectPatientId: input.patientId,
      })
      return {
        consentEventId: event.id,
        signedFileId: input.signedFileId,
        state: event.state,
      }
    })
  }
}
