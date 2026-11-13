import type {
  ScheduleStore,
  ScheduleTransaction,
} from '../../../application/ports/schedule'
import {
  scheduleBlocked,
  scheduleContains,
} from '../../../domain/rules/schedule'
import type { PrismaClient } from '../../../generated/prisma/client'
import { readPrincipal } from './access-store'
import { futureAppointmentImpacts } from './appointment-impact'
import { enqueueAppointmentNotification } from './appointment-notifications'
import { PrismaAuditWriter } from './audit-writer'
import { appointmentRecord } from './booking-store'
import { readCurrentSchedule } from './schedule-snapshot'

export class PrismaScheduleStore implements ScheduleStore {
  constructor(private readonly db: PrismaClient) {}
  transaction<T>(run: (tx: ScheduleTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
      return run({
        principal: (actor) => readPrincipal(tx, actor.userId, actor.sessionId),
        ownProfessional: async (userId) => {
          const row = await tx.professionalProfile.findFirst({
            where: {
              userId,
              active: true,
              user: {
                status: 'active',
                roles: { some: { roleCode: 'professional', revokedAt: null } },
              },
            },
            select: {
              id: true,
              modalities: true,
              user: { select: { fullName: true } },
            },
          })
          return row
            ? {
                id: row.id,
                displayName: row.user.fullName,
                modalities: row.modalities,
              }
            : null
        },
        professional: async (id) => {
          const row = await tx.professionalProfile.findUnique({
            where: { id },
            include: {
              user: {
                include: {
                  roles: {
                    where: { roleCode: 'professional', revokedAt: null },
                  },
                },
              },
            },
          })
          return row
            ? {
                id: row.id,
                userId: row.userId,
                active:
                  row.active &&
                  row.user.status === 'active' &&
                  row.user.roles.length > 0,
                modalities: row.modalities,
              }
            : null
        },
        current: (id) => readCurrentSchedule(tx, id),
        impacts: async (id, input, timeZone) => {
          const appointments = await futureAppointmentImpacts(tx, {
            professionalId: id,
          })
          return appointments.flatMap((a) => {
            const startsAt = new Date(a.startsAt),
              endsAt = new Date(a.endsAt)
            const fits =
              a.bookingSource === 'fit_in' ||
              scheduleContains(
                input.rules,
                startsAt,
                endsAt,
                a.modality,
                timeZone,
              )
            const ordinary =
              !fits || scheduleBlocked(input.blocks, startsAt, endsAt, false)
            if (!ordinary && !scheduleBlocked(input.blocks, startsAt, endsAt))
              return []
            return [
              {
                id: a.id,
                startsAt: a.startsAt,
                endsAt: a.endsAt,
                emergencyOnly: !ordinary,
              },
            ]
          })
        },
        notifyImpacts: async (ids, version, requestId) => {
          const appointments = await tx.appointment.findMany({
            where: { id: { in: ids } },
          })
          for (const row of appointments)
            await enqueueAppointmentNotification(
              tx,
              appointmentRecord(row),
              'appointment.schedule_changed',
              requestId,
              `schedule:${row.professionalId}:${version}`,
            )
        },
        publish: async (
          professionalId,
          version,
          input,
          clinicTimeZone,
          publishedBy,
        ) => {
          await tx.scheduleVersion.create({
            data: {
              professionalId,
              version,
              clinicTimeZone,
              publishedBy,
              rules: {
                create: input.rules.map((r) => ({
                  ...r,
                  effectiveFrom: new Date(`${r.effectiveFrom}T00:00:00.000Z`),
                  effectiveTo: r.effectiveTo
                    ? new Date(`${r.effectiveTo}T00:00:00.000Z`)
                    : null,
                })),
              },
              blocks: {
                create: input.blocks.map((b) => ({
                  ...b,
                  startsAt: new Date(b.startsAt),
                  endsAt: new Date(b.endsAt),
                })),
              },
            },
          })
        },
        audit: new PrismaAuditWriter(tx),
      })
    })
  }
}
