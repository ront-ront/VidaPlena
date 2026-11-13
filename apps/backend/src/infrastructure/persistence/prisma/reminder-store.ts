import { randomUUID } from 'node:crypto'
import type { ReminderStore } from '../../../application/ports/reminders'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { PrismaClient } from '../../../generated/prisma/client'
import { patientNotificationRecipients } from './appointment-notifications'
import { PrismaAuditWriter } from './audit-writer'
import { dataConsentState } from './consent-state'
import { enqueueNotification } from './notification-store'
import {
  lockAppointmentDelivery,
  planAppointmentReminders,
} from './reminder-planning'

export class PrismaReminderStore implements ReminderStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly secrets: SecretBox,
    private readonly policy: {
      hoursBefore: number[]
      timeZone: string
      onsiteAddress: string
    },
  ) {}
  async reconcile(now: Date, limit: number) {
    const rows = await this.db.appointment.findMany({
      where: {
        status: 'confirmed',
        startsAt: { gt: now },
        bookingSource: { not: 'imported' },
        reminders: { none: {} },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    })
    for (const row of rows)
      await this.db.$transaction(async (tx) => {
        await lockAppointmentDelivery(tx, row.id)
        const current = await tx.appointment.findUniqueOrThrow({
          where: { id: row.id },
        })
        await planAppointmentReminders(tx, current, this.policy.hoursBefore)
      })
    return rows.length
  }
  async due(now: Date, limit: number) {
    return (
      await this.db.reminderJob.findMany({
        where: { status: 'pending', scheduledAt: { lte: now } },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: { id: true },
      })
    ).map((row) => row.id)
  }
  async enqueue(id: string, now: Date) {
    await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(775001)`
        const owner = await tx.reminderJob.findUnique({
          where: { id },
          select: { appointmentId: true },
        })
        if (!owner) return
        await lockAppointmentDelivery(tx, owner.appointmentId)
        const job = await tx.reminderJob.findUniqueOrThrow({
          where: { id },
          include: {
            appointment: {
              include: { professional: { include: { user: true } } },
            },
          },
        })
        if (job.status !== 'pending' || job.scheduledAt > now) return
        const row = job.appointment
        const eligible =
          row.status === 'confirmed' &&
          row.version === job.appointmentVersion &&
          row.startsAt > now &&
          row.bookingSource !== 'imported'
        const reachedLimit =
          (await tx.reminderJob.count({
            where: { appointmentId: row.id, firstSuccessfulAt: { not: null } },
          })) >= 2
        const consent = await dataConsentState(tx, row.patientId, now)
        if (!eligible || reachedLimit || consent !== 'active') {
          await tx.reminderJob.update({
            where: { id },
            data: { status: eligible ? 'suppressed' : 'cancelled' },
          })
          return
        }
        const recipients = await patientNotificationRecipients(
          tx,
          row.patientId,
          now,
        )
        const requestId = randomUUID()
        const content = JSON.stringify({
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          professionalName: row.professional.user.fullName,
          modality: row.modality,
          timeZone: this.policy.timeZone,
          address: row.modality === 'onsite' ? this.policy.onsiteAddress : null,
          portalPath: '/minhas-consultas',
        })
        for (const userId of recipients)
          await enqueueNotification(
            tx,
            {
              type: 'appointment.reminder',
              aggregateId: row.id,
              version: row.version,
              userId,
              patientId: row.patientId,
              requestId,
              deduplicationKey: id,
              reminderJobId: id,
            },
            this.secrets.seal(
              content,
              `notification:${userId}:appointment.reminder`,
            ),
          )
        await tx.reminderJob.update({
          where: { id },
          data: { status: recipients.length ? 'enqueued' : 'failed' },
        })
        if (!recipients.length)
          await tx.appointment.update({
            where: { id: row.id },
            data: { notificationAttention: true },
          })
        await new PrismaAuditWriter(tx).append({
          actorRoles: [],
          requestId,
          authorizationBasis: 'notification_policy',
          action: 'reminder.scheduled',
          resourceType: 'ReminderJob',
          resourceId: id,
          subjectPatientId: row.patientId,
          metadata: { count: recipients.length },
        })
      },
      { timeout: 10000 },
    )
  }
}
