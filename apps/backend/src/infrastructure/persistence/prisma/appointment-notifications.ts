import type { AppointmentRecord } from '../../../application/ports/booking'
import type { NotificationTemplate } from '../../../domain/rules/notifications'
import type { Prisma } from '../../../generated/prisma/client'
import { userDataConsentState } from './consent-state'
import { enqueueNotification } from './notification-store'

export async function patientNotificationRecipients(
  tx: Prisma.TransactionClient,
  patientId: string,
) {
  const patient = await tx.patientProfile.findUniqueOrThrow({
    where: { id: patientId },
    include: {
      user: {
        include: { roles: { where: { roleCode: 'patient', revokedAt: null } } },
      },
      guardians: {
        where: { status: 'active', endedAt: null },
        include: {
          guardian: {
            include: {
              roles: { where: { roleCode: 'patient', revokedAt: null } },
            },
          },
        },
      },
    },
  })
  const ids = new Set<string>()
  if (patient.user?.status === 'active' && patient.user.roles.length)
    ids.add(patient.user.id)
  for (const link of patient.guardians)
    if (
      link.guardian.status === 'active' &&
      link.guardian.roles.length &&
      (await userDataConsentState(tx, link.guardianUserId)) === 'active'
    )
      ids.add(link.guardianUserId)
  return [...ids]
}
export async function enqueueAppointmentNotification(
  tx: Prisma.TransactionClient,
  row: AppointmentRecord,
  type: NotificationTemplate,
  requestId: string,
): Promise<'queued' | 'unreachable'> {
  const patientRecipients = await patientNotificationRecipients(
    tx,
    row.patientId,
  )
  const professional = await tx.professionalProfile.findUniqueOrThrow({
    where: { id: row.professionalId },
    select: { userId: true },
  })
  for (const userId of new Set([...patientRecipients, professional.userId]))
    await enqueueNotification(
      tx,
      {
        type,
        aggregateId: row.id,
        version: row.version,
        userId,
        patientId: row.patientId,
        requestId,
      },
      null,
    )
  if (!patientRecipients.length)
    await tx.appointment.update({
      where: { id: row.id },
      data: { notificationAttention: true },
    })
  return patientRecipients.length ? 'queued' : 'unreachable'
}
