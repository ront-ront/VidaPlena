import { suspensionFromOccurrences } from '../../../domain/rules/absence'
import type { Prisma } from '../../../generated/prisma/client'
export async function readBookingRestriction(
  tx: Prisma.TransactionClient,
  patientId: string,
  now: Date,
) {
  const rows = await tx.absence.findMany({
    where: {
      patientId,
      kind: 'unjustified',
      occurredAt: { lte: now },
      penaltyExpiresAt: { gt: now },
    },
    select: { penaltyExpiresAt: true },
  })
  return suspensionFromOccurrences(
    rows.map((row) => row.penaltyExpiresAt),
    now,
  )
}
