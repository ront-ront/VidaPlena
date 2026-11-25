import { createHash } from 'node:crypto'
import type {
  ClinicalAddendum,
  EvolutionAttachment,
} from '../ports/clinical-evolutions'
import {
  type EvolutionRecord,
  evolutionTextFields,
} from '../ports/evolution-drafts'

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function finalizedEvolutionHash(
  row: EvolutionRecord,
  attachments: EvolutionAttachment[],
  finalizedAt: Date,
) {
  return hash({
    format: 'vida-plena.evolution.v1',
    evolutionId: row.id,
    encounterId: row.encounterId,
    authorProfessionalId: row.authorProfessionalId,
    draftVersion: row.draftVersion,
    savedAt: row.savedAt.toISOString(),
    finalizedAt: finalizedAt.toISOString(),
    payload: {
      ...Object.fromEntries(
        evolutionTextFields.map((field) => [field, row.payload[field]]),
      ),
      diagnosisCodes: row.payload.diagnosisCodes.map((code) => ({
        code: code.code,
        description: code.description,
        version: code.version,
        source: code.source,
        demo: code.demo,
      })),
    },
    attachments: [...attachments]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((file) => ({ id: file.id, sha256: file.sha256 })),
  })
}
export function evolutionAddendumHash(
  row: Omit<ClinicalAddendum, 'id' | 'author' | 'contentHash'>,
  originalHash: string,
) {
  return hash({
    format: 'vida-plena.evolution-addendum.v1',
    originalEvolutionId: row.originalEvolutionId,
    originalContentHash: originalHash,
    authorProfessionalId: row.authorProfessionalId,
    reason: row.reason,
    correctionText: row.correctionText,
    createdAt: row.createdAt.toISOString(),
  })
}
