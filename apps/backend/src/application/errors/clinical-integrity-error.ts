export class ClinicalIntegrityError extends Error {
  constructor(readonly resourceId: string) {
    super('clinical_integrity_failed')
  }
}
