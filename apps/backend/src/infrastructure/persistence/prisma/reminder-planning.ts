import type { Appointment, Prisma } from '../../../generated/prisma/client'

export async function lockAppointmentDelivery(
  tx: Prisma.TransactionClient,
  id: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},662025))`
}

export async function planAppointmentReminders(
  tx: Prisma.TransactionClient,
  row: Appointment,
  hoursBefore: number[],
) {
  await tx.reminderJob.updateMany({
    where: {
      appointmentId: row.id,
      status: { in: ['pending', 'enqueued'] },
      ...(row.status === 'confirmed'
        ? { appointmentVersion: { not: row.version } }
        : {}),
    },
    data: { status: 'cancelled' },
  })
  if (row.status !== 'confirmed' || row.bookingSource === 'imported') return
  await tx.reminderJob.createMany({
    skipDuplicates: true,
    data: hoursBefore.map((hours) => {
      const scheduledAt = new Date(row.startsAt.getTime() - hours * 3_600_000)
      return {
        appointmentId: row.id,
        appointmentVersion: row.version,
        hoursBefore: hours,
        scheduledAt,
        status: scheduledAt < row.updatedAt ? 'skipped' : 'pending',
      }
    }),
  })
}
