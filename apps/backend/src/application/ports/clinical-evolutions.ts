import type { Principal } from '../../domain/rules/access'
import type { AuditContext } from './audit-writer'
import type {
  EvolutionDraftTransaction,
  EvolutionEncounter,
  EvolutionRecord,
} from './evolution-drafts'
export type EvolutionAttachment = {
  id: string
  contentType: string
  size: number
  sha256: string
  scanStatus: string
}
export type EvolutionAuthor = { id: string; name: string }
export type ClinicalAddendum = {
  id: string
  originalEvolutionId: string
  authorProfessionalId: string
  reason: string
  correctionText: string
  createdAt: Date
  contentHash: string
  author: EvolutionAuthor
}
export type AuthoredEvolutionQuery = { patientId: string; cursor?: string }
export interface ClinicalEvolutionTransaction
  extends EvolutionDraftTransaction {
  authorProfessional(id: string): Promise<EvolutionAuthor>
  evolutionAttachments(id: string): Promise<EvolutionAttachment[]>
  evolutionAddenda(id: string): Promise<ClinicalAddendum[]>
  finalizeEvolution(
    id: string,
    expectedVersion: number,
    hash: string,
    now: Date,
  ): Promise<EvolutionRecord>
  completeClinicalEncounter(
    encounter: EvolutionEncounter,
    actor: Principal,
    context: AuditContext,
    now: Date,
    retentionYears: number,
    retainUntil: Date,
  ): Promise<{ specialtyId: string; modality: 'onsite' | 'remote' }>
  createEvolutionAddendum(
    input: Omit<ClinicalAddendum, 'id' | 'author'>,
  ): Promise<ClinicalAddendum>
  authoredEvolutions(
    professionalId: string,
    query: AuthoredEvolutionQuery,
  ): Promise<{
    items: {
      row: EvolutionRecord
      patientId: string
      attachments: EvolutionAttachment[]
    }[]
    nextCursor: string | null
  }>
}
export interface ClinicalEvolutionStore {
  transaction<T>(
    run: (tx: ClinicalEvolutionTransaction) => Promise<T>,
  ): Promise<T>
}
