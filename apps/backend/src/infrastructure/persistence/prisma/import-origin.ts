import type { ImportIdentity } from '../../../generated/prisma/client'
export function patientImportOrigin(row: ImportIdentity | null) {
  return row
    ? {
        sourceSystem: row.sourceSystem,
        externalId: row.externalId,
        batchId: row.batchId,
        importedAt: row.importedAt.toISOString(),
        importedBy: row.importedBy,
        historicalStatus: 'undated' as const,
      }
    : null
}

export function appointmentImportOrigin(row: ImportIdentity | null) {
  const origin = patientImportOrigin(row)
  return row && origin
    ? {
        ...origin,
        historicalStatus: row.historicalStatus as
          | 'undated'
          | 'before_cutoff'
          | 'on_or_after_cutoff',
      }
    : null
}
