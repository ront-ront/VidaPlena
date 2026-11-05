import { createHash } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditContext } from '../../../application/ports/audit-writer'
import type {
  NotificationDeliveryTransaction,
  NotificationEvent,
  NotificationMessage,
  NotificationStore,
} from '../../../application/ports/notifications'
import type { SecretBox } from '../../../application/ports/secret-box'
import {
  defaultNotificationPreferences,
  type NotificationPreferences,
  notificationCategory,
  safeNotificationText,
} from '../../../domain/rules/notifications'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { PrismaAuditWriter } from './audit-writer'
import { dataConsentState, userDataConsentState } from './consent-state'

export type NotificationConsentCheck = (
  tx: Prisma.TransactionClient,
  message: NotificationMessage,
) => Promise<boolean>

// BE-011 replaces this gate with current consent reads, under the same recipient lock.
export const internalIdentityNotificationsOnly: NotificationConsentCheck =
  async (tx, message) => {
    if (
      message.patientId ||
      ![
        'account.invited',
        'account.inactivity_review',
        'auth.account_locked',
        'auth.password_reset',
        'contact.verification_requested',
      ].includes(message.templateKey)
    )
      return false
    const internal = await tx.userRoleAssignment.findFirst({
      where: {
        userId: message.userId,
        revokedAt: null,
        roleCode: { in: ['admin', 'manager', 'receptionist', 'professional'] },
      },
    })
    return !!internal
  }

export const consentAwareNotificationCheck: NotificationConsentCheck = async (
  tx,
  message,
) => {
  if (await internalIdentityNotificationsOnly(tx, message)) return true
  if (message.templateKey === 'waitlist.offered') {
    // Serialize delivery with offer acceptance/withdrawal until this transaction commits.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(662024)`
    if (
      !message.aggregateId ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
        message.aggregateId,
      ) ||
      message.aggregateVersion !== 1
    )
      return false
    const offer = await tx.waitlistOffer.findUnique({
      where: { id: message.aggregateId },
      include: {
        entry: {
          include: {
            patient: {
              include: {
                guardians: {
                  where: {
                    guardianUserId: message.userId,
                    status: 'active',
                    endedAt: null,
                  },
                },
              },
            },
          },
        },
        reservation: true,
      },
    })
    if (
      offer?.status !== 'active' ||
      offer.expiresAt <= new Date() ||
      offer.entry.status !== 'offered' ||
      offer.reservation.state !== 'held' ||
      offer.entry.patientId !== message.patientId ||
      (offer.entry.patient.userId !== message.userId &&
        !offer.entry.patient.guardians.length)
    )
      return false
  }
  if (message.templateKey.startsWith('appointment.')) {
    if (
      !message.aggregateId ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
        message.aggregateId,
      ) ||
      message.aggregateVersion == null
    )
      return false
    const appointment = await tx.appointment.findUnique({
      where: { id: message.aggregateId },
      include: {
        professional: true,
        patient: {
          include: {
            guardians: {
              where: {
                guardianUserId: message.userId,
                status: 'active',
                endedAt: null,
              },
            },
          },
        },
      },
    })
    if (
      !appointment ||
      appointment.version !== message.aggregateVersion ||
      appointment.patientId !== message.patientId
    )
      return false
    if (
      ['appointment.cancelled', 'appointment.cancelled_by_clinic'].includes(
        message.templateKey,
      )
        ? appointment.status !== 'cancelled'
        : !['confirmed', 'waiting', 'in_service'].includes(appointment.status)
    )
      return false
    if (
      message.templateKey === 'appointment.reminder' &&
      appointment.status !== 'confirmed'
    )
      return false
    if ((await dataConsentState(tx, appointment.patientId)) !== 'active')
      return false
    if (appointment.professional.userId === message.userId)
      return !!(await tx.userRoleAssignment.findFirst({
        where: {
          userId: message.userId,
          roleCode: 'professional',
          revokedAt: null,
        },
      }))
    if (
      ['appointment.rescheduled', 'appointment.rescheduled_by_clinic'].includes(
        message.templateKey,
      )
    ) {
      const previous = await tx.professionalProfile.findUnique({
        where: { userId: message.userId },
        select: { id: true },
      })
      if (
        previous &&
        (await tx.appointmentHistory.findFirst({
          where: {
            appointmentId: appointment.id,
            action: 'rescheduled',
            previous: { path: ['professionalId'], equals: previous.id },
            next: { path: ['version'], equals: appointment.version },
          },
          select: { id: true },
        }))
      )
        return !!(await tx.userRoleAssignment.findFirst({
          where: {
            userId: message.userId,
            roleCode: 'professional',
            revokedAt: null,
          },
          select: { id: true },
        }))
    }
    if (
      appointment.patient.userId !== message.userId &&
      !appointment.patient.guardians.length
    )
      return false
  }
  const patientRole = await tx.userRoleAssignment.findFirst({
    where: { userId: message.userId, roleCode: 'patient', revokedAt: null },
    select: { id: true },
  })
  if (!patientRole) return false
  if ((await userDataConsentState(tx, message.userId)) !== 'active')
    return false
  return (
    !message.patientId ||
    (await dataConsentState(tx, message.patientId)) === 'active'
  )
}

export async function lockNotificationRecipient(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 661006))`
}

export class PrismaNotificationStore implements NotificationStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly consentCheck: NotificationConsentCheck = internalIdentityNotificationsOnly,
    private readonly destinationSecrets?: SecretBox,
  ) {}

  async enqueue(input: NotificationEvent, encrypted: string | null) {
    return enqueueNotification(this.db, input, encrypted)
  }

  async due(now: Date, limit: number) {
    const rows = await this.db.notification.findMany({
      where: {
        deliveryStatus: { in: ['queued', 'retry'] },
        scheduledAt: { lte: now },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    })
    return rows.map((row) => row.id)
  }

  async withDelivery(
    id: string,
    now: Date,
    run: (tx: NotificationDeliveryTransaction) => Promise<void>,
  ) {
    await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(775001)`
        const owner = await tx.notification.findUnique({
          where: { id },
          select: { userId: true },
        })
        if (!owner) return
        await lockNotificationRecipient(tx, owner.userId)
        const row = await tx.notification.findUniqueOrThrow({
          where: { id },
          include: { user: { include: { notificationPreference: true } } },
        })
        if (
          !['queued', 'retry'].includes(row.deliveryStatus) ||
          row.scheduledAt > now
        )
          return
        const message = {
          ...row,
          aggregateVersion:
            row.aggregateVersion == null ? null : Number(row.aggregateVersion),
        } as NotificationMessage
        const identity = [
          'account.invited',
          'auth.password_reset',
          'contact.verification_requested',
        ].includes(row.templateKey)
        await run({
          message,
          preferences: row.user.notificationPreference
            ? {
                channels: row.user.notificationPreference
                  .channels as NotificationPreferences['channels'],
                nonEssentialOptOut:
                  row.user.notificationPreference.nonEssentialOptOut,
              }
            : { ...defaultNotificationPreferences },
          email: row.destinationEncrypted
            ? (this.destinationSecrets?.open(
                row.destinationEncrypted,
                `notification-destination:${row.userId}`,
              ) ?? '')
            : row.user.email,
          emailAvailable:
            (row.destinationEncrypted
              ? !!this.destinationSecrets
              : !!row.user.email) &&
            (identity || !!row.user.emailVerifiedAt),
          isAllowed: async () =>
            row.user.status !== 'inactive' &&
            (await this.consentCheck(tx, message)),
          save: async (result) => {
            await tx.notification.update({
              where: { id },
              data: {
                ...result,
                preferenceSnapshot: {
                  channels: result.preferenceSnapshot.channels,
                  nonEssentialOptOut:
                    result.preferenceSnapshot.nonEssentialOptOut,
                },
                payloadEncrypted: ['sent', 'suppressed', 'failed'].includes(
                  result.deliveryStatus,
                )
                  ? null
                  : row.payloadEncrypted,
                destinationEncrypted: ['sent', 'suppressed', 'failed'].includes(
                  result.deliveryStatus,
                )
                  ? null
                  : row.destinationEncrypted,
              },
            })
          },
          audit: new PrismaAuditWriter(tx),
        })
      },
      { timeout: 10000 },
    )
  }

  async preferences(userId: string) {
    const value = await this.db.notificationPreference.findUnique({
      where: { userId },
    })
    return value
      ? {
          channels: value.channels as NotificationPreferences['channels'],
          nonEssentialOptOut: value.nonEssentialOptOut,
        }
      : { ...defaultNotificationPreferences }
  }

  async updatePreferences(
    userId: string,
    value: NotificationPreferences,
    context: AuditContext,
  ) {
    await this.db.$transaction(async (tx) => {
      await lockNotificationRecipient(tx, userId)
      await tx.notificationPreference.upsert({
        where: { userId },
        create: { userId, ...value },
        update: value,
      })
      await new PrismaAuditWriter(tx).append({
        ...context,
        actorUserId: userId,
        action: 'notification.preferences_changed',
        resourceType: 'User',
        resourceId: userId,
        metadata: {
          channel: value.channels.join('/'),
          status: value.nonEssentialOptOut ? 'opted_out' : 'opted_in',
        },
      })
    })
  }

  async list(userId: string, cursor?: string) {
    if (
      cursor &&
      !(await this.db.notification.findFirst({
        where: { id: cursor, userId },
        select: { id: true },
      }))
    )
      throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
    const rows = await this.db.notification.findMany({
      where: { userId, deliveryStatus: 'sent' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      take: 51,
      select: {
        id: true,
        category: true,
        channel: true,
        sentAt: true,
        deliveryStatus: true,
        templateKey: true,
      },
    })
    return {
      items: rows.slice(0, 50).map(({ templateKey, ...row }) => ({
        ...row,
        text: safeNotificationText(
          templateKey as NotificationMessage['templateKey'],
        ),
      })),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    }
  }

  async attention(cursor?: string) {
    const rows = await this.db.notification.findMany({
      where: { needsReceptionAttention: true },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      take: 51,
      select: {
        id: true,
        userId: true,
        patientId: true,
        deliveryStatus: true,
        failureReasonSafe: true,
        createdAt: true,
      },
    })
    return {
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    }
  }
}

export async function enqueueNotification(
  db: Prisma.TransactionClient,
  input: NotificationEvent,
  encrypted: string | null,
  destinationEncrypted: string | null = null,
) {
  if (!Number.isSafeInteger(input.version) || input.version < 0)
    throw new ApplicationError('VALIDATION_ERROR')
  const idempotencyKey = createHash('sha256')
    .update(
      JSON.stringify([
        input.type,
        input.aggregateId,
        input.version,
        input.userId,
        ...(input.deduplicationKey ? [input.deduplicationKey] : []),
      ]),
    )
    .digest('hex')
  await db.notification.createMany({
    skipDuplicates: true,
    data: {
      idempotencyKey,
      userId: input.userId,
      patientId: input.patientId,
      templateKey: input.type,
      aggregateId: input.aggregateId,
      aggregateVersion: BigInt(input.version),
      category: notificationCategory(input.type),
      payloadEncrypted: encrypted,
      destinationEncrypted,
      requestId: input.requestId,
    },
  })
  const row = await db.notification.findUniqueOrThrow({
    where: { idempotencyKey },
  })
  return row.id
}
