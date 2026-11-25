import type { CareAppointment } from '../../domain/rules/care-link'
import type { ClinicalRecordTransaction } from './clinical-records'
import type {
  TerminologySnapshot,
  TerminologyTransaction,
} from './terminologies'
export const evolutionTextFields = [
  'complaint',
  'history',
  'physicalExam',
  'diagnosticHypotheses',
  'conduct',
] as const
export type EvolutionTextField = (typeof evolutionTextFields)[number]
export type EvolutionSelection = { code: string; version: string }
export type EvolutionPayload = Record<EvolutionTextField, string> & {
  diagnosisCodes: TerminologySnapshot[]
}
export type EvolutionInput = Partial<Record<EvolutionTextField, string>> & {
  diagnosisCodes?: EvolutionSelection[]
}
export type EvolutionPatch = EvolutionInput & { expectedDraftVersion: number }
export type EvolutionEncounter = {
  id: string
  recordId: string
  patientId: string
  professionalId: string
  status: string
  appointment: CareAppointment
}
export type EvolutionSubject = {
  id: string
  encounterId: string
  authorProfessionalId: string
  status: 'draft' | 'finalized'
  draftVersion: number
  savedAt: Date
}
export type EvolutionRecord = EvolutionSubject & {
  payload: EvolutionPayload
  createdAt: Date
  finalizedAt: Date | null
  contentHash: string | null
}
export type DraftCommand = {
  requestKey: string
  actorId: string
  evolutionId: string
  inputFingerprint: string
  resultVersion: number
  resultSavedAt: Date
  createdAt: Date
}
export interface CommandFingerprint {
  of(value: string): string
}
export interface EvolutionDraftTransaction
  extends ClinicalRecordTransaction,
    TerminologyTransaction {
  lockDraftCommand(key: string): Promise<void>
  lockEncounter(id: string): Promise<void>
  lockEvolution(id: string): Promise<void>
  evolutionEncounter(id: string): Promise<EvolutionEncounter | null>
  evolutionSubject(id: string): Promise<EvolutionSubject | null>
  evolution(id: string): Promise<EvolutionRecord | null>
  evolutionForEncounter(id: string): Promise<EvolutionSubject | null>
  createEvolution(
    encounterId: string,
    professionalId: string,
    payload: EvolutionPayload,
    now: Date,
  ): Promise<EvolutionRecord>
  updateEvolution(
    id: string,
    expected: number,
    payload: EvolutionPayload,
    now: Date,
  ): Promise<EvolutionRecord>
  draftCommand(key: string): Promise<DraftCommand | null>
  saveDraftCommand(command: DraftCommand): Promise<void>
}
export interface EvolutionDraftStore {
  transaction<T>(run: (tx: EvolutionDraftTransaction) => Promise<T>): Promise<T>
}
