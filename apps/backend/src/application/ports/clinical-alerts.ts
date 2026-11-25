import type { ClinicalRecordTransaction } from './clinical-records'
export const clinicalAlertKinds = [
  'allergy',
  'condition',
  'continuous_medication',
  'other',
] as const
export const alertVerificationStates = ['reported', 'confirmed'] as const
export type ClinicalAlertInput = {
  kind: (typeof clinicalAlertKinds)[number]
  term: string
  substanceCode?: string
  verificationState: (typeof alertVerificationStates)[number]
}
export type ClinicalAlertEventView = {
  id: string
  kind: 'created' | 'confirmed' | 'deactivated'
  version: number
  author: { id: string; name: string }
  date: string
  reason: string | null
}
export type ClinicalAlertView = Omit<ClinicalAlertInput, 'substanceCode'> & {
  id: string
  patientId: string
  substanceCode: string | null
  active: boolean
  version: number
  author: { id: string; name: string }
  date: string
  history?: ClinicalAlertEventView[]
}
export type ClinicalAlertQuery = { active?: boolean; cursor?: string }
export interface ClinicalAlertTransaction extends ClinicalRecordTransaction {
  alertSubject(id: string): Promise<{ patientId: string } | null>
  alertById(id: string): Promise<ClinicalAlertView | null>
  alertPage(
    patientId: string,
    query: ClinicalAlertQuery,
  ): Promise<{ items: ClinicalAlertView[]; nextCursor: string | null }>
  lockAlert(id: string): Promise<void>
  createAlert(
    patientId: string,
    authorProfessionalId: string,
    input: ClinicalAlertInput,
    now: Date,
  ): Promise<ClinicalAlertView>
  appendAlertEvent(
    alertId: string,
    authorProfessionalId: string,
    kind: 'confirmed' | 'deactivated',
    version: number,
    reason: string | null,
    now: Date,
  ): Promise<ClinicalAlertView>
}
export interface ClinicalAlertStore {
  transaction<T>(run: (tx: ClinicalAlertTransaction) => Promise<T>): Promise<T>
}
