import type { Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext, AuditWriter } from '../ports/audit-writer'
import type {
  CommandFingerprint,
  EvolutionDraftStore,
  EvolutionDraftTransaction,
  EvolutionInput,
  EvolutionPatch,
  EvolutionPayload,
  EvolutionSubject,
} from '../ports/evolution-drafts'
import { evolutionTextFields } from '../ports/evolution-drafts'
import type { ManageCareLinks } from './manage-care-links'
import type { ManageTerminologies } from './manage-terminologies'
export const evolutionSaved = (row: EvolutionSubject) => ({
  evolutionId: row.id,
  draftVersion: row.draftVersion,
  savedAt: row.savedAt.toISOString(),
  status: row.status,
})
export function evolutionConflict(row: EvolutionSubject): never {
  throw new ApplicationError('CONFLICT', undefined, {
    draftConflict: {
      evolutionId: row.id,
      currentDraftVersion: row.draftVersion,
      savedAt: row.savedAt.toISOString(),
      status: row.status,
    },
  })
}
export class ManageEvolutionDrafts {
  constructor(
    private readonly store: EvolutionDraftStore,
    private readonly links: ManageCareLinks,
    private readonly terms: ManageTerminologies,
    private readonly fingerprints: CommandFingerprint,
    private readonly audit: AuditWriter,
    private readonly now = () => new Date(),
  ) {}
  private async run<T>(
    actor: Principal,
    id: string,
    context: AuditContext,
    run: (tx: EvolutionDraftTransaction) => Promise<T>,
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
          resourceType: 'ClinicalEvolution',
          resourceId: id,
          authorizationBasis: 'denied',
        })
      throw error
    }
  }
  private async encounter(
    tx: EvolutionDraftTransaction,
    actor: Principal,
    id: string,
    write: boolean,
  ) {
    const encounter = await tx.evolutionEncounter(id)
    if (!encounter) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    const basis = await this.links.basis(
      tx,
      actor,
      encounter.patientId,
      write ? encounter.appointment.id : undefined,
    )
    if (
      basis.professionalId !== encounter.professionalId ||
      basis.phase === 'pre'
    )
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    if (
      write &&
      (basis.phase !== 'during' ||
        encounter.status !== 'in_progress' ||
        encounter.appointment.status !== 'in_service')
    )
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    return { encounter, basis }
  }
  private async payload(
    tx: EvolutionDraftTransaction,
    input: EvolutionInput,
    prior?: EvolutionPayload,
  ): Promise<EvolutionPayload> {
    const payload: EvolutionPayload = {
      complaint: '',
      history: '',
      physicalExam: '',
      diagnosticHypotheses: '',
      conduct: '',
      diagnosisCodes: [],
      ...prior,
    }
    for (const field of evolutionTextFields)
      if (input[field] !== undefined) payload[field] = input[field]
    if (input.diagnosisCodes) {
      if (
        new Set(input.diagnosisCodes.map((c) => c.code)).size !==
        input.diagnosisCodes.length
      )
        throw new ApplicationError('VALIDATION_ERROR')
      payload.diagnosisCodes = []
      for (const code of input.diagnosisCodes)
        payload.diagnosisCodes.push(
          await this.terms.snapshot(tx, 'CID10', code),
        )
    }
    return payload
  }
  create(
    actor: Principal,
    encounterId: string,
    input: EvolutionInput,
    context: AuditContext,
  ) {
    return this.run(actor, encounterId, context, async (tx) => {
      await tx.lockEncounter(encounterId)
      const { encounter, basis } = await this.encounter(
          tx,
          actor,
          encounterId,
          true,
        ),
        existing = await tx.evolutionForEncounter(encounterId)
      if (existing) evolutionConflict(existing)
      const row = await tx.createEvolution(
        encounterId,
        basis.professionalId,
        await this.payload(tx, input),
        this.now(),
      )
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'evolution.draft_created',
        resourceType: 'ClinicalEvolution',
        resourceId: row.id,
        subjectPatientId: encounter.patientId,
        authorizationBasis: `care_link:${basis.id}`,
        metadata: { version: row.draftVersion },
      })
      return evolutionSaved(row)
    })
  }
  private async read(
    tx: EvolutionDraftTransaction,
    actor: Principal,
    id: string,
    context: AuditContext,
  ) {
    const subject = await tx.evolutionSubject(id)
    if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    const { encounter, basis } = await this.encounter(
      tx,
      actor,
      subject.encounterId,
      false,
    )
    if (subject.authorProfessionalId !== basis.professionalId)
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    if (subject.status !== 'draft') evolutionConflict(subject)
    const row = await tx.evolution(id)
    if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    await tx.audit.append({
      ...context,
      actorUserId: actor.userId,
      actorRoles: actor.roles,
      action: 'evolution.draft_read',
      resourceType: 'ClinicalEvolution',
      resourceId: id,
      subjectPatientId: encounter.patientId,
      authorizationBasis: `care_link:${basis.id}`,
    })
    return {
      ...evolutionSaved(row),
      encounterId: row.encounterId,
      patientId: encounter.patientId,
      authorProfessionalId: row.authorProfessionalId,
      ...row.payload,
    }
  }
  get(actor: Principal, id: string, context: AuditContext) {
    return this.run(actor, id, context, (tx) =>
      this.read(tx, actor, id, context),
    )
  }
  getByEncounter(actor: Principal, encounterId: string, context: AuditContext) {
    return this.run(actor, encounterId, context, async (tx) => {
      const { encounter, basis } = await this.encounter(
          tx,
          actor,
          encounterId,
          false,
        ),
        subject = await tx.evolutionForEncounter(encounterId)
      if (subject)
        return { evolution: await this.read(tx, actor, subject.id, context) }
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'evolution.draft_lookup',
        resourceType: 'ClinicalEncounter',
        resourceId: encounterId,
        subjectPatientId: encounter.patientId,
        authorizationBasis: `care_link:${basis.id}`,
      })
      return { evolution: null }
    })
  }
  patch(
    actor: Principal,
    id: string,
    input: EvolutionPatch,
    key: string,
    context: AuditContext,
  ) {
    return this.run(actor, id, context, async (tx) => {
      await tx.lockDraftCommand(key)
      await tx.lockEvolution(id)
      const subject = await tx.evolutionSubject(id)
      if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const { encounter, basis } = await this.encounter(
        tx,
        actor,
        subject.encounterId,
        subject.status === 'draft',
      )
      if (subject.authorProfessionalId !== basis.professionalId)
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (subject.status !== 'draft') evolutionConflict(subject)
      const canonical = {
        evolutionId: id,
        actorId: actor.userId,
        expectedDraftVersion: input.expectedDraftVersion,
        ...Object.fromEntries(
          evolutionTextFields.map((field) => [field, input[field] ?? null]),
        ),
        diagnosisCodes: input.diagnosisCodes ?? null,
      }
      const fingerprint = this.fingerprints.of(JSON.stringify(canonical)),
        command = await tx.draftCommand(key)
      if (command) {
        if (
          command.actorId !== actor.userId ||
          command.evolutionId !== id ||
          command.inputFingerprint !== fingerprint
        )
          evolutionConflict(subject)
        await tx.audit.append({
          ...context,
          actorUserId: actor.userId,
          actorRoles: actor.roles,
          action: 'evolution.draft_replayed',
          resourceType: 'ClinicalEvolution',
          resourceId: id,
          subjectPatientId: encounter.patientId,
          authorizationBasis: `care_link:${basis.id}`,
          metadata: { version: command.resultVersion },
        })
        return {
          evolutionId: id,
          draftVersion: command.resultVersion,
          savedAt: command.resultSavedAt.toISOString(),
          status: 'draft' as const,
        }
      }
      if (subject.draftVersion !== input.expectedDraftVersion)
        evolutionConflict(subject)
      const prior = await tx.evolution(id)
      if (!prior) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const now = this.now(),
        row = await tx.updateEvolution(
          id,
          input.expectedDraftVersion,
          await this.payload(tx, input, prior.payload),
          now,
        )
      await tx.saveDraftCommand({
        requestKey: key,
        actorId: actor.userId,
        evolutionId: id,
        inputFingerprint: fingerprint,
        resultVersion: row.draftVersion,
        resultSavedAt: row.savedAt,
        createdAt: now,
      })
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'evolution.draft_saved',
        resourceType: 'ClinicalEvolution',
        resourceId: id,
        subjectPatientId: encounter.patientId,
        authorizationBasis: `care_link:${basis.id}`,
        metadata: { version: row.draftVersion },
      })
      return evolutionSaved(row)
    })
  }
}
