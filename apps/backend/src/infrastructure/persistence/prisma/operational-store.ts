import { ApplicationError } from '../../../application/errors/application-error'
import { appointmentSummary } from '../../../application/ports/booking'
import type {
  OperationalStore,
  OperationalTransaction,
} from '../../../application/ports/operational-agenda'
import { type AbsenceKind, isNoShowDue } from '../../../domain/rules/absence'
import { patientChangeDeadline } from '../../../domain/rules/patient-change-window'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import {
  appointmentRecord,
  type BookingPersistencePolicy,
  bookingTransaction,
  bookingUnitOfWork,
} from './booking-store'
import { dataConsentState } from './consent-state'
import { appointmentImportOrigin, patientImportOrigin } from './import-origin'

const contacts = {
  select: { email: true, phone: true, emailVerifiedAt: true },
} as const
export class PrismaOperationalStore implements OperationalStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly policy: BookingPersistencePolicy,
    private readonly afterMinutes: number,
  ) {}
  transaction<T>(run: (tx: OperationalTransaction) => Promise<T>): Promise<T> {
    return bookingUnitOfWork(this.db, this.policy, async (tx) => {
      const flags = async (patientId: string, now: Date) => {
        const patient = await tx.patientProfile.findUniqueOrThrow({
          where: { id: patientId },
          select: {
            phone: true,
            email: true,
            user: contacts,
            guardians: {
              where: { status: 'active', endedAt: null },
              select: { guardian: contacts },
            },
          },
        })
        const values: string[] = []
        if (
          !patient.phone &&
          !patient.email &&
          !patient.user?.email &&
          !patient.user?.phone &&
          !patient.guardians.some(
            (link) => link.guardian.email || link.guardian.phone,
          )
        )
          values.push('contact_missing')
        if (patient.user?.email && !patient.user.emailVerifiedAt)
          values.push('email_unverified')
        const consent = await dataConsentState(tx, patientId, now)
        if (consent !== 'active')
          values.push(
            consent === 'revoked' ? 'consent_revoked' : 'consent_pending',
          )
        return values
      }
      return run({
        ...bookingTransaction(tx, this.policy),
        createCheckIn: (input) => tx.checkIn.create({ data: input }),
        administrativeFlags: flags,
        professionalFor: async (actor) =>
          (
            await tx.professionalProfile.findFirst({
              where: { userId: actor.userId, active: true },
              select: { id: true },
            })
          )?.id ?? null,
        day: async (query, from, to, identityFields, now, absenceFields) => {
          const eligibleIds = query.absenceEligibleOnly
            ? await tx.$queryRaw<
                Array<{ id: string }>
              >`SELECT a."id" FROM "Appointment" a
            WHERE a."startsAt">=${from} AND a."startsAt"<${to} AND a."status"='confirmed'
              AND a."startsAt"<=${new Date(now.getTime() - this.afterMinutes * 60_000)}
              AND NOT EXISTS(SELECT 1 FROM "CheckIn" c WHERE c."appointmentId"=a."id" AND c."appointmentVersion"=a."version")
              AND NOT EXISTS(SELECT 1 FROM "Absence" x WHERE x."appointmentId"=a."id")
              AND COALESCE((SELECT c."action"::text FROM "ConsentEvent" c JOIN "ConsentDocumentVersion" d ON d."id"=c."documentVersionId"
                WHERE c."patientId"=a."patientId" AND d."kind"='data' ORDER BY c."sequence" DESC LIMIT 1),'pending')<>'revoke'`
            : null
          const digits =
            query.patientQuery && /^[\d.\-\s]+$/.test(query.patientQuery)
              ? query.patientQuery.replace(/\D/g, '')
              : undefined
          const base: Prisma.AppointmentWhereInput = {
            ...(eligibleIds
              ? { id: { in: eligibleIds.map((row) => row.id) } }
              : {}),
            startsAt: { gte: from, lt: to },
            professionalId: query.professionalId,
            specialtyId: query.specialtyId,
            ...(query.patientQuery
              ? {
                  patient: {
                    OR: [
                      {
                        fullName: {
                          contains: query.patientQuery,
                          mode: 'insensitive',
                        },
                      },
                      ...(digits ? [{ cpf: { contains: digits } }] : []),
                    ],
                  },
                }
              : {}),
          }
          const where = { ...base, status: query.status }
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
                          { startsAt: cursor.startsAt, id: { gt: cursor.id } },
                        ],
                      },
                    ]
                  : []),
              ],
            },
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            take: 31,
            include: {
              history: absenceFields
                ? {
                    where: { action: { in: ['rescheduled', 'cancelled'] } },
                    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
                    take: 1,
                    select: { action: true, origin: true, occurredAt: true },
                  }
                : false,
              importIdentity: true,
              patient: {
                select: {
                  id: true,
                  fullName: true,
                  birthDate: identityFields,
                  cpf: identityFields,
                  importIdentity: true,
                },
              },
              professional: {
                select: { id: true, user: { select: { fullName: true } } },
              },
              specialty: { select: { id: true, name: true } },
              room: { select: { id: true, name: true } },
              attendanceResponses: { orderBy: { sequence: 'desc' }, take: 1 },
              checkIns: { orderBy: { appointmentVersion: 'desc' }, take: 1 },
              absence: {
                select: {
                  kind: true,
                  version: true,
                  recordedAt: true,
                  decidedAt: true,
                },
              },
            },
          })
          const counts = await tx.appointment.groupBy({
            by: ['status'],
            where: base,
            _count: true,
          })
          const items = []
          for (const row of rows.slice(0, 30)) {
            const administrativeFlags = await flags(row.patientId, now)
            const check =
              row.checkIns[0]?.appointmentVersion === row.version
                ? row.checkIns[0]
                : null
            const record = appointmentRecord(row)
            items.push({
              ...appointmentSummary(record),
              patientChangeDeadline: patientChangeDeadline(
                row.startsAt,
              ).toISOString(),
              lastChange:
                absenceFields && record.lastChange
                  ? {
                      ...record.lastChange,
                      occurredAt: record.lastChange.occurredAt.toISOString(),
                    }
                  : null,
              importOrigin: absenceFields
                ? appointmentImportOrigin(row.importIdentity)
                : null,
              patient: {
                id: row.patientId,
                importOrigin: absenceFields
                  ? patientImportOrigin(row.patient.importIdentity)
                  : null,
                name: row.patient.fullName,
                birthDate: identityFields
                  ? (row.patient.birthDate?.toISOString().slice(0, 10) ?? null)
                  : null,
                cpfMasked:
                  identityFields && row.patient.cpf
                    ? `***.***.***-${row.patient.cpf.slice(-2)}`
                    : null,
              },
              professional: {
                id: row.professional.id,
                name: row.professional.user.fullName,
              },
              specialty: row.specialty,
              room: row.room,
              checkIn: check
                ? {
                    arrivedAt: check.arrivedAt.toISOString(),
                    recordedAt: check.recordedAt.toISOString(),
                    lateFlag: check.lateFlag,
                  }
                : null,
              administrativeFlags,
              noShowEligible:
                absenceFields &&
                !administrativeFlags.includes('consent_revoked') &&
                isNoShowDue(
                  row.status,
                  row.startsAt,
                  !!check,
                  now,
                  this.afterMinutes,
                ),
              absence:
                absenceFields && row.absence
                  ? {
                      kind: row.absence.kind as AbsenceKind,
                      version: row.absence.version,
                      recordedAt: row.absence.recordedAt.toISOString(),
                      decidedAt: row.absence.decidedAt.toISOString(),
                    }
                  : null,
            })
          }
          return {
            items,
            totals: {
              all: counts.reduce((sum, c) => sum + c._count, 0),
              confirmed:
                counts.find((c) => c.status === 'confirmed')?._count ?? 0,
              noShow: counts.find((c) => c.status === 'no_show')?._count ?? 0,
            },
            nextCursor: rows.length > 30 ? rows[29].id : null,
          }
        },
      })
    })
  }
}
