import type { Principal } from '../../domain/rules/access'
import { ApplicationError } from '../errors/application-error'
import type { AuditContext } from '../ports/audit-writer'
import type {
  ClinicalDocument,
  ClinicalDocumentTransaction,
  DocumentContentPolicy,
} from '../ports/clinical-documents'
import type { CanonicalDocuments } from '../ports/signature-provider'
import {
  type PrescriptionPayload,
  parsePrescription,
} from '../validation/prescription'
import type { ManageMedications } from './manage-medications'
export class PrescriptionPolicy implements DocumentContentPolicy {
  constructor(
    private readonly medications: ManageMedications,
    private readonly canonical: CanonicalDocuments,
    private readonly now = () => new Date(),
  ) {}
  validate(payload: unknown, templateVersion: string) {
    if (templateVersion !== '1')
      throw new ApplicationError('SERVICE_UNAVAILABLE')
    return parsePrescription(payload)
  }
  summary() {
    return 'Prescrição demonstrativa — sem validade jurídica'
  }
  async prepare(
    tx: ClinicalDocumentTransaction,
    payload: unknown,
    templateVersion: string,
    context: { reusing: boolean },
  ) {
    await tx.lockMedications(true)
    const input = this.validate(payload, templateVersion),
      items: PrescriptionPayload['items'] = [],
      catalog = await tx.activeMedicationCatalog(this.medications.allowDemo)
    for (const i of input.items) {
      if (i.medicationCode) {
        if (!catalog) throw new ApplicationError('SERVICE_UNAVAILABLE')
        const snapshot = await this.medications.snapshot(
          tx,
          catalog,
          i.medicationCode,
          i.medicationVersion as string,
          context.reusing,
        )
        items.push({
          ...i,
          medicationCode: snapshot.code,
          medicationVersion: snapshot.version,
          name: snapshot.name,
          activeSubstance: snapshot.activeSubstances
            .map((s) => s.description)
            .join('; '),
          medicationSnapshot: snapshot,
          mappingStatus: 'catalog',
        })
      } else {
        if (!this.medications.allowDemo)
          throw new ApplicationError('SERVICE_UNAVAILABLE')
        items.push({
          ...i,
          medicationCode: undefined,
          medicationVersion: undefined,
          medicationSnapshot: undefined,
          mappingStatus: 'unverified',
        })
      }
    }
    return { items }
  }
  async review(tx: ClinicalDocumentTransaction, document: ClinicalDocument) {
    const payload = this.validate(
        document.payload,
        document.type.templateVersion,
      ),
      catalog = await tx.activeMedicationCatalog(this.medications.allowDemo)
    if (
      !this.medications.allowDemo &&
      payload.items.some((i) => !i.medicationSnapshot)
    )
      throw new ApplicationError('SERVICE_UNAVAILABLE')
    const known = new Set(
        catalog
          ? (await tx.knownMedicationSubstances(catalog)).map((c) =>
              c.toUpperCase(),
            )
          : [],
      ),
      selected = new Set(
        payload.items.flatMap(
          (i) =>
            i.medicationSnapshot?.activeSubstances.map((s) =>
              s.code.toUpperCase(),
            ) ?? [],
        ),
      ),
      manual = payload.items.some((i) => !i.medicationSnapshot)
    const alerts = (await tx.criticalAlerts(document.patientId)).filter(
      (a) => a.kind === 'allergy',
    )
    const allergies = alerts.map((a) => {
      const code = a.substanceCode?.trim().toUpperCase(),
        match =
          code && selected.has(code)
            ? 'matched_substance'
            : manual
              ? 'unmapped_item'
              : !code || !known.has(code)
                ? 'unmapped_alert'
                : 'no_catalog_match'
      return {
        id: a.id,
        term: a.term,
        verificationState: a.verificationState,
        version: a.version,
        match,
        requiresAcknowledgement: match !== 'no_catalog_match',
      }
    })
    return {
      allergies,
      requiredAlertIds: allergies
        .filter((a) => a.requiresAcknowledgement)
        .map((a) => a.id),
      demo: catalog?.demo ?? true,
    }
  }
  async beforeIssue(
    tx: ClinicalDocumentTransaction,
    document: ClinicalDocument,
    actor: Principal,
    acknowledgedAllergyIds: string[],
    context: AuditContext,
  ) {
    await tx.lockMedications(true)
    const payload = this.validate(
        document.payload,
        document.type.templateVersion,
      ),
      catalog = await tx.activeMedicationCatalog(this.medications.allowDemo)
    for (const item of payload.items) {
      if (item.medicationCode) {
        if (!catalog) throw new ApplicationError('SERVICE_UNAVAILABLE')
        const current = await this.medications.snapshot(
          tx,
          catalog,
          item.medicationCode,
          item.medicationVersion as string,
        )
        if (
          !item.medicationSnapshot ||
          this.canonical.serialize(current) !==
            this.canonical.serialize(item.medicationSnapshot) ||
          item.name !== current.name ||
          item.activeSubstance !==
            current.activeSubstances.map((s) => s.description).join('; ')
        )
          throw new ApplicationError('CONFLICT')
        if (current.controlled)
          throw new ApplicationError('FORBIDDEN', [
            {
              field: 'items',
              reason:
                'Emissão de controlados indisponível até validação das regras específicas.',
            },
          ])
      } else if (!this.medications.allowDemo)
        throw new ApplicationError('SERVICE_UNAVAILABLE')
    }
    const review = await this.review(tx, document),
      activeIds = new Set(review.allergies.map((a) => a.id)),
      provided = new Set(acknowledgedAllergyIds)
    if (
      provided.size !== acknowledgedAllergyIds.length ||
      [...provided].some((id) => !activeIds.has(id))
    )
      throw new ApplicationError('VALIDATION_ERROR')
    if (review.requiredAlertIds.some((id) => !provided.has(id)))
      throw new ApplicationError('CONFLICT', undefined, {
        allergyConflict: {
          documentId: document.id,
          requiredAlertIds: review.requiredAlertIds,
        },
      })
    for (const allergy of review.allergies.filter((a) => provided.has(a.id))) {
      await tx.acknowledgePrescriptionAllergy(
        document.id,
        allergy.id,
        allergy.version,
        document.authorProfessionalId,
        this.now(),
      )
      await tx.audit.append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'prescription.allergy_acknowledged',
        resourceType: 'ClinicalAlert',
        resourceId: allergy.id,
        subjectPatientId: document.patientId,
        metadata: { version: allergy.version },
      })
    }
  }
}
