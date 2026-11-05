import type { ScheduleSnapshot } from '../../../application/ports/schedule'
import type { Prisma } from '../../../generated/prisma/client'
export async function readCurrentSchedule(
  tx: Pick<Prisma.TransactionClient, 'scheduleVersion'>,
  professionalId: string,
): Promise<ScheduleSnapshot | null> {
  const row = await tx.scheduleVersion.findFirst({
    where: { professionalId },
    orderBy: { version: 'desc' },
    include: { rules: true, blocks: true },
  })
  if (!row) return null
  return {
    professionalId,
    version: row.version,
    clinicTimeZone: row.clinicTimeZone,
    rules: row.rules.map((r) => ({
      weekday: r.weekday,
      localStart: r.localStart,
      localEnd: r.localEnd,
      effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: r.effectiveTo?.toISOString().slice(0, 10) ?? null,
      modality: r.modality,
    })),
    blocks: row.blocks.map((b) => ({
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      kind: b.kind as ScheduleSnapshot['blocks'][number]['kind'],
      reason: b.reason,
    })),
  }
}
