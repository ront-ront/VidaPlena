import type { Prisma } from '../../../generated/prisma/client'

export async function futureAppointmentImpacts(
  tx: Prisma.TransactionClient,
  filter: Prisma.AppointmentWhereInput,
) {
  const rows = await tx.appointment.findMany({
    where: {
      AND: [
        filter,
        {
          status: { in: ['confirmed', 'waiting', 'in_service'] },
          endsAt: { gt: new Date() },
        },
      ],
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      modality: true,
      specialtyId: true,
      bookingSource: true,
    },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  })
  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  }))
}
