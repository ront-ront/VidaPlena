import { ApplicationError } from '../../../application/errors/application-error'
import type {
  AppointmentRecord,
  BookingStore,
  BookingTransaction,
} from '../../../application/ports/booking'
import { appointmentSummary } from '../../../application/ports/booking'
import type {
  Appointment,
  PrismaClient,
} from '../../../generated/prisma/client'
import { readPrincipal } from './access-store'
import { enqueueAppointmentNotification } from './appointment-notifications'
import { PrismaAuditWriter } from './audit-writer'
import { dataConsentState } from './consent-state'
import {
  isExclusionConflict,
  isReservationRetryConflict,
  reservationTransaction,
} from './reservation-store'
import { readCurrentSchedule } from './schedule-snapshot'

export const appointmentRecord = (row: Appointment): AppointmentRecord => ({
  ...row,
  visitType: row.visitType as AppointmentRecord['visitType'],
  bookingSource: row.bookingSource as AppointmentRecord['bookingSource'],
})
export type BookingPersistencePolicy = {
  maxWaitMs: number
  timeoutMs: number
  retryAttempts: number
  internalMinutes: number
  patientMinutes: number
}
export class PrismaBookingStore implements BookingStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly policy: BookingPersistencePolicy,
  ) {}
  async transaction<T>(
    run: (tx: BookingTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++)
      try {
        return await this.db.$transaction(
          async (tx) =>
            run({
              lock: async (key, patientId) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking:${key}`},662021))`
                await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(775001)`
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${patientId},662021))`
              },
              principal: (actor) =>
                readPrincipal(tx, actor.userId, actor.sessionId, this.policy),
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
                      owned:
                        row.userId === actor.userId || row.guardians.length > 0,
                      consentState: await dataConsentState(tx, id, now),
                      suspendedUntil: row.autoBookingSuspendedUntil,
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
                        p.active &&
                        p.user.status === 'active' &&
                        p.user.roles.length > 0,
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
                const row = await tx.appointment.findUnique({ where: { id } })
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
              create: async (input) =>
                appointmentRecord(await tx.appointment.create({ data: input })),
              history: async (row, actor, action, previous, reason) => {
                await tx.appointmentHistory.create({
                  data: {
                    appointmentId: row.id,
                    action,
                    actorUserId: actor.userId,
                    reason,
                    previous: previous
                      ? appointmentSummary(previous)
                      : undefined,
                    next: appointmentSummary(row),
                  },
                })
              },
              notify: (row, type, requestId) =>
                enqueueAppointmentNotification(tx, row, type, requestId),
              reservations: reservationTransaction(tx),
              audit: new PrismaAuditWriter(tx),
            }),
          { maxWait: this.policy.maxWaitMs, timeout: this.policy.timeoutMs },
        )
      } catch (error) {
        if (isExclusionConflict(error))
          throw new ApplicationError('SLOT_UNAVAILABLE')
        if (!isReservationRetryConflict(error)) throw error
        if (attempt + 1 >= this.policy.retryAttempts)
          throw new ApplicationError('SLOT_UNAVAILABLE')
      }
  }
}
