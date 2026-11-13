import { ApplicationError } from '../../../application/errors/application-error'
import type {
  AppointmentRecord,
  BookingStore,
  BookingTransaction,
} from '../../../application/ports/booking'
import { appointmentSummary } from '../../../application/ports/booking'
import type {
  Appointment,
  AttendanceResponse,
  Prisma,
  PrismaClient,
} from '../../../generated/prisma/client'
import { readBookingRestriction } from './absence-policy'
import { readPrincipal } from './access-store'
import { enqueueAppointmentNotification } from './appointment-notifications'
import { PrismaAuditWriter } from './audit-writer'
import { dataConsentState } from './consent-state'
import {
  lockAppointmentDelivery,
  planAppointmentReminders,
} from './reminder-planning'
import {
  isExclusionConflict,
  isReservationRetryConflict,
  reservationTransaction,
} from './reservation-store'
import { readCurrentSchedule } from './schedule-snapshot'

export const appointmentRecord = (
  row: Appointment & {
    history?: { action: string; origin: string | null; occurredAt: Date }[]
    attendanceResponses?: AttendanceResponse[]
    professional?: { user: { fullName: string } }
    specialty?: { name: string }
    room?: { name: string } | null
  },
): AppointmentRecord => ({
  ...row,
  lastChange: row.history?.[0]
    ? {
        action: row.history[0].action as 'rescheduled' | 'cancelled',
        origin: row.history[0].origin as
          | 'patient'
          | 'reception'
          | 'clinic'
          | null,
        occurredAt: row.history[0].occurredAt,
      }
    : null,
  professionalName: row.professional?.user.fullName ?? null,
  specialtyName: row.specialty?.name ?? null,
  roomName: row.room?.name ?? null,
  visitType: row.visitType as AppointmentRecord['visitType'],
  bookingSource: row.bookingSource as AppointmentRecord['bookingSource'],
  attendanceResponse:
    row.attendanceResponses?.[0]?.appointmentVersion === row.version
      ? {
          response: row.attendanceResponses[0].response as
            | 'confirm'
            | 'cannot_attend',
          respondedAt: row.attendanceResponses[0].occurredAt,
        }
      : null,
})
const appointmentDisplay = {
  professional: { select: { user: { select: { fullName: true } } } },
  specialty: { select: { name: true } },
  room: { select: { name: true } },
} as const
export type BookingPersistencePolicy = {
  maxWaitMs: number
  timeoutMs: number
  retryAttempts: number
  internalMinutes: number
  patientMinutes: number
  reminderScheduleHours: number[]
}
export function bookingTransaction(
  tx: Prisma.TransactionClient,
  policy: BookingPersistencePolicy,
): BookingTransaction {
  return {
    freeRooms: async (
      professionalId,
      startsAt,
      endsAt,
      now,
      ignoreAppointmentId,
    ) => {
      const occupied: Prisma.SlotReservationWhereInput = {
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        AND: [
          {
            OR: [
              { state: 'confirmed' },
              { state: 'held', expiresAt: { gt: now } },
            ],
          },
          ...(ignoreAppointmentId
            ? [
                {
                  OR: [
                    { appointmentId: null },
                    { appointmentId: { not: ignoreAppointmentId } },
                  ],
                },
              ]
            : []),
        ],
      }
      if (
        await tx.slotReservation.findFirst({
          where: { ...occupied, professionalId },
          select: { id: true },
        })
      )
        return []
      return tx.room.findMany({
        where: { active: true, reservations: { none: occupied } },
        orderBy: { id: 'asc' },
        select: { id: true, name: true },
      })
    },
    checkIn: (id, version) =>
      tx.checkIn.findUnique({
        where: {
          appointmentId_appointmentVersion: {
            appointmentId: id,
            appointmentVersion: version,
          },
        },
      }),
    lock: async (key, patientId) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking:${key}`},662021))`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(775001)`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${patientId},662021))`
    },
    principal: (actor) =>
      readPrincipal(tx, actor.userId, actor.sessionId, policy),
    patient: async (actor, id, now) => {
      const row = await tx.patientProfile.findUnique({
        where: { id },
        include: {
          guardians: {
            where: {
              guardianUserId: actor.userId,
              status: 'active',
              endedAt: null,
            },
          },
        },
      })
      return row
        ? {
            id,
            active: row.status === 'active',
            owned: row.userId === actor.userId || row.guardians.length > 0,
            consentState: await dataConsentState(tx, id, now),
            suspendedUntil: (await readBookingRestriction(tx, id, now))
              .suspendedUntil,
          }
        : null
    },
    target: async (professionalId, specialtyId) => {
      const p = await tx.professionalProfile.findUnique({
        where: { id: professionalId },
        include: {
          user: {
            include: {
              roles: {
                where: { roleCode: 'professional', revokedAt: null },
              },
            },
          },
          specialties: { where: { specialtyId, active: true } },
        },
      })
      const s = await tx.specialty.findUnique({
        where: { id: specialtyId },
      })
      return p && s
        ? {
            professionalId: p.id,
            professionalUserId: p.userId,
            active:
              p.active && p.user.status === 'active' && p.user.roles.length > 0,
            linked: p.specialties.length > 0,
            modalities: p.modalities,
            specialtyActive: s.active,
            specialtyModalities: s.allowedModalities,
            specialtyVersion: s.version,
            durationFirst: s.defaultMinutesFirst,
            durationReturn: s.defaultMinutesReturn,
            schedule: await readCurrentSchedule(tx, p.id),
          }
        : null
    },
    command: (key) =>
      tx.bookingCommand.findUnique({
        where: { requestKey: key },
        select: { inputHash: true, appointmentId: true },
      }),
    recordCommand: async (
      requestKey,
      actorId,
      operation,
      inputHash,
      appointmentId,
    ) => {
      await tx.bookingCommand.create({
        data: {
          requestKey,
          actorId,
          operation,
          inputHash,
          appointmentId,
        },
      })
    },
    appointment: async (id) => {
      const row = await tx.appointment.findUnique({
        where: { id },
        include: {
          ...appointmentDisplay,
          attendanceResponses: { orderBy: { sequence: 'desc' }, take: 1 },
        },
      })
      return row ? appointmentRecord(row) : null
    },
    duplicateAppointments: (patientId, specialtyId, now, exceptId) =>
      tx.appointment.findMany({
        where: {
          patientId,
          specialtyId,
          id: exceptId ? { not: exceptId } : undefined,
          status: { in: ['confirmed', 'waiting', 'in_service'] },
          startsAt: { gt: now },
        },
        select: { id: true, startsAt: true },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      }),
    create: async (input) => {
      const row = await tx.appointment.create({
        data: input,
        include: appointmentDisplay,
      })
      await planAppointmentReminders(tx, row, policy.reminderScheduleHours)
      return appointmentRecord(row)
    },
    update: async (id, version, input) => {
      await lockAppointmentDelivery(tx, id)
      const row = await tx.appointment.update({
        where: { id, version },
        data: { ...input, version: { increment: 1 } },
        include: appointmentDisplay,
      })
      await planAppointmentReminders(tx, row, policy.reminderScheduleHours)
      return appointmentRecord(row)
    },
    attendanceResponse: async (row, actor, response, now) => {
      const previous = await tx.attendanceResponse.findFirst({
        where: { appointmentId: row.id, appointmentVersion: row.version },
        orderBy: { sequence: 'desc' },
      })
      if (previous?.response === response)
        return { respondedAt: previous.occurredAt, created: false }
      await tx.attendanceResponse.create({
        data: {
          appointmentId: row.id,
          appointmentVersion: row.version,
          actorUserId: actor.userId,
          response,
          occurredAt: now,
        },
      })
      return { respondedAt: now, created: true }
    },
    confirmedReservation: (appointmentId) =>
      tx.slotReservation.findFirst({
        where: { appointmentId, state: 'confirmed' },
        select: { id: true },
      }),
    professionalOwned: async (id, actor) =>
      !!(await tx.professionalProfile.findFirst({
        where: { id, userId: actor.userId },
        select: { id: true },
      })),
    slotReleased: async (previous, changeVersion, kind) => {
      await tx.slotReleaseEvent.create({
        data: {
          appointmentId: previous.id,
          changeVersion,
          professionalId: previous.professionalId,
          specialtyId: previous.specialtyId,
          roomId: previous.roomId,
          modality: previous.modality,
          startsAt: previous.startsAt,
          endsAt: previous.endsAt,
          kind,
        },
      })
    },
    invalidateNotifications: async (appointmentId) => {
      await lockAppointmentDelivery(tx, appointmentId)
      await tx.notification.updateMany({
        where: {
          aggregateId: appointmentId,
          deliveryStatus: { in: ['queued', 'retry'] },
        },
        data: {
          deliveryStatus: 'suppressed',
          failureReasonSafe: 'appointment_changed',
          payloadEncrypted: null,
          destinationEncrypted: null,
        },
      })
    },
    ownAppointments: async (actor, query) => {
      const subjects = await tx.patientProfile.findMany({
        where: {
          status: 'active',
          OR: [
            { userId: actor.userId },
            {
              guardians: {
                some: {
                  guardianUserId: actor.userId,
                  status: 'active',
                  endedAt: null,
                },
              },
            },
          ],
        },
        select: { id: true },
      })
      const ids: string[] = []
      for (const subject of subjects)
        if (
          (!query.patientId || query.patientId === subject.id) &&
          (await dataConsentState(tx, subject.id)) === 'active'
        )
          ids.push(subject.id)
      const where: Prisma.AppointmentWhereInput = {
        patientId: { in: ids },
        AND:
          query.view === 'upcoming'
            ? [
                {
                  startsAt: { gte: query.referenceAt },
                  status: { in: ['confirmed', 'waiting', 'in_service'] },
                },
              ]
            : query.view === 'history'
              ? [
                  {
                    OR: [
                      { startsAt: { lt: query.referenceAt } },
                      { status: { in: ['cancelled', 'completed', 'no_show'] } },
                    ],
                  },
                ]
              : undefined,
        status: query.status,
        startsAt: { gte: query.from, lt: query.to },
      }
      const cursor = query.cursor
        ? await tx.appointment.findFirst({
            where: { AND: [where, { id: query.cursor }] },
            select: { id: true, startsAt: true },
          })
        : null
      if (query.cursor && !cursor)
        throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const rows = await tx.appointment.findMany({
        where: {
          AND: [
            where,
            ...(cursor
              ? [
                  {
                    OR: [
                      { startsAt: { gt: cursor.startsAt } },
                      {
                        startsAt: cursor.startsAt,
                        id: { gt: cursor.id },
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 31,
        include: {
          ...appointmentDisplay,
          history: {
            where: { action: { in: ['rescheduled', 'cancelled'] } },
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { action: true, origin: true, occurredAt: true },
          },
          attendanceResponses: { orderBy: { sequence: 'desc' }, take: 1 },
        },
      })
      return {
        items: rows.slice(0, 30).map(appointmentRecord),
        nextCursor: rows.length > 30 ? rows[29].id : null,
      }
    },
    history: async (row, actor, action, previous, reason, origin) => {
      await tx.appointmentHistory.create({
        data: {
          appointmentId: row.id,
          action,
          actorUserId: actor.userId,
          reason,
          origin,
          previous: previous ? appointmentSummary(previous) : undefined,
          next: appointmentSummary(row),
        },
      })
    },
    notify: (row, type, requestId, previousProfessionalId) =>
      enqueueAppointmentNotification(
        tx,
        row,
        type,
        requestId,
        undefined,
        previousProfessionalId,
      ),
    reservations: reservationTransaction(tx),
    audit: new PrismaAuditWriter(tx),
  }
}
export async function bookingUnitOfWork<T>(
  db: PrismaClient,
  policy: BookingPersistencePolicy,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(run, {
        maxWait: policy.maxWaitMs,
        timeout: policy.timeoutMs,
      })
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2025'
      )
        throw new ApplicationError('CONFLICT')
      if (isExclusionConflict(error))
        throw new ApplicationError('SLOT_UNAVAILABLE')
      if (!isReservationRetryConflict(error)) throw error
      if (attempt + 1 >= policy.retryAttempts)
        throw new ApplicationError('SLOT_UNAVAILABLE')
    }
  }
}
export class PrismaBookingStore implements BookingStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly policy: BookingPersistencePolicy,
  ) {}
  transaction<T>(run: (tx: BookingTransaction) => Promise<T>): Promise<T> {
    return bookingUnitOfWork(this.db, this.policy, (tx) =>
      run(bookingTransaction(tx, this.policy)),
    )
  }
}
