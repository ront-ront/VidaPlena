import { ApplicationError } from '../../../application/errors/application-error'
import type {
  WaitlistEntryRecord,
  WaitlistOfferRecord,
  WaitlistStore,
  WaitlistTransaction,
} from '../../../application/ports/waitlist'
import type {
  Prisma,
  PrismaClient,
  WaitlistEntry,
} from '../../../generated/prisma/client'
import { patientNotificationRecipients } from './appointment-notifications'
import { loadAvailability } from './availability-store'
import {
  type BookingPersistencePolicy,
  bookingTransaction,
  bookingUnitOfWork,
} from './booking-store'
import { currentDataDocument, dataConsentState } from './consent-state'
import { enqueueNotification } from './notification-store'

const entryRecord = (row: WaitlistEntry): WaitlistEntryRecord => ({
  id: row.id,
  patientId: row.patientId,
  specialtyId: row.specialtyId,
  modality: row.modality,
  visitType: row.visitType as WaitlistEntryRecord['visitType'],
  dateFrom: row.dateFrom.toISOString().slice(0, 10),
  dateTo: row.dateTo.toISOString().slice(0, 10),
  timePreferences:
    row.timePreferences as WaitlistEntryRecord['timePreferences'],
  queuedAt: row.queuedAt,
  status: row.status as WaitlistEntryRecord['status'],
  createdBy: row.createdBy,
})
const offerInclude = {
  entry: true,
  reservation: {
    include: {
      professional: { include: { user: { select: { fullName: true } } } },
    },
  },
} as const
type OfferRow = Prisma.WaitlistOfferGetPayload<{ include: typeof offerInclude }>
const offerRecord = (row: OfferRow): WaitlistOfferRecord => ({
  ...row,
  status: row.status as WaitlistOfferRecord['status'],
  entry: entryRecord(row.entry),
  professionalName: row.reservation.professional.user.fullName,
})

export class PrismaWaitlistStore implements WaitlistStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly policy: BookingPersistencePolicy,
  ) {}
  due(now: Date, limit: number) {
    return this.db.slotReleaseEvent
      .findMany({
        where: { processedAt: null, nextAttemptAt: { lte: now } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id))
  }
  async transaction<T>(
    run: (tx: WaitlistTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await bookingUnitOfWork(this.db, this.policy, async (tx) => {
        const base = bookingTransaction(tx, this.policy)
        return run({
          ...base,
          availability: {
            load: (query, from, to, now) =>
              loadAvailability(tx, query, from, to, now),
          },
          lockQueue: async () => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(775001)`
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(662024)`
          },
          specialty: async (id) => {
            const s = await tx.specialty.findUnique({
              where: { id },
              select: { active: true, allowedModalities: true },
            })
            return s
              ? { active: s.active, modalities: s.allowedModalities }
              : null
          },
          createEntry: async (input, id, fingerprint, actorId, now) =>
            entryRecord(
              await tx.waitlistEntry.create({
                data: {
                  ...input,
                  id,
                  fingerprint,
                  createdBy: actorId,
                  queuedAt: now,
                  dateFrom: new Date(`${input.dateFrom}T00:00:00Z`),
                  dateTo: new Date(`${input.dateTo}T00:00:00Z`),
                  timePreferences: input.timePreferences,
                },
              }),
            ),
          entry: async (id) => {
            const row = await tx.waitlistEntry.findUnique({ where: { id } })
            return row ? entryRecord(row) : null
          },
          updateEntry: async (id, status) => {
            await tx.waitlistEntry.update({ where: { id }, data: { status } })
          },
          listEntries: async (actor, query, operational) => {
            const scope: Prisma.PatientProfileWhereInput = operational
              ? {}
              : {
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
                }
            const patients = operational
              ? []
              : await tx.patientProfile.findMany({
                  where: {
                    AND: [
                      scope,
                      query.patientId ? { id: query.patientId } : {},
                    ],
                  },
                  select: { id: true },
                })
            const allowedIds: string[] = []
            for (const p of patients)
              if (
                operational ||
                (await dataConsentState(tx, p.id)) === 'active'
              )
                allowedIds.push(p.id)
            if (!operational && query.patientId && !patients.length)
              throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
            const where: Prisma.WaitlistEntryWhereInput = {
              patientId: operational ? query.patientId : { in: allowedIds },
              specialtyId: query.specialtyId,
              status: query.status,
            }
            const cursor = query.cursor
              ? await tx.waitlistEntry.findFirst({
                  where: { AND: [where, { id: query.cursor }] },
                  select: { id: true, queuedAt: true },
                })
              : null
            if (query.cursor && !cursor)
              throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
            const rows = await tx.waitlistEntry.findMany({
              where: {
                AND: [
                  where,
                  ...(cursor
                    ? [
                        {
                          OR: [
                            { queuedAt: { gt: cursor.queuedAt } },
                            {
                              queuedAt: cursor.queuedAt,
                              id: { gt: cursor.id },
                            },
                          ],
                        },
                      ]
                    : []),
                ],
              },
              orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
              take: 31,
              include: {
                patient: { select: { fullName: true } },
                offers: {
                  where: { status: 'active' },
                  include: offerInclude,
                  take: 1,
                },
              },
            })
            const items = []
            for (const row of rows.slice(0, 30)) {
              const position = ['waiting', 'offered'].includes(row.status)
                ? 1 +
                  (await tx.waitlistEntry.count({
                    where: {
                      specialtyId: row.specialtyId,
                      modality: row.modality,
                      visitType: row.visitType,
                      status: { in: ['waiting', 'offered'] },
                      OR: [
                        { queuedAt: { lt: row.queuedAt } },
                        { queuedAt: row.queuedAt, id: { lt: row.id } },
                      ],
                    },
                  }))
                : 0
              items.push({
                entry: entryRecord(row),
                ...(operational ? { patientName: row.patient.fullName } : {}),
                position,
                offer: row.offers[0] ? offerRecord(row.offers[0]) : null,
              })
            }
            return { items, nextCursor: rows.length > 30 ? rows[29].id : null }
          },
          offer: async (id) => {
            const row = await tx.waitlistOffer.findUnique({
              where: { id },
              include: offerInclude,
            })
            return row ? offerRecord(row) : null
          },
          activeOffer: async (releaseEventId) => {
            const row = await tx.waitlistOffer.findFirst({
              where: { releaseEventId, status: 'active' },
              include: offerInclude,
            })
            return row ? offerRecord(row) : null
          },
          entryOffer: async (entryId) => {
            const row = await tx.waitlistOffer.findFirst({
              where: { entryId, status: 'active' },
              include: offerInclude,
            })
            return row ? offerRecord(row) : null
          },
          createOffer: async (input) =>
            offerRecord(
              await tx.waitlistOffer.create({
                data: input,
                include: offerInclude,
              }),
            ),
          updateOffer: async (id, status, now) => {
            await tx.waitlistOffer.update({
              where: { id },
              data: { status, acceptedAt: status === 'accepted' ? now : null },
            })
          },
          invalidateOfferNotification: async (id) => {
            await tx.notification.updateMany({
              where: {
                aggregateId: id,
                templateKey: 'waitlist.offered',
                deliveryStatus: { in: ['queued', 'retry'] },
              },
              data: {
                deliveryStatus: 'suppressed',
                failureReasonSafe: 'offer_closed',
              },
            })
          },
          recipients: (id, now) => patientNotificationRecipients(tx, id, now),
          notifyOffer: async (offer, requestId) => {
            for (const userId of await patientNotificationRecipients(
              tx,
              offer.entry.patientId,
              offer.offeredAt,
            ))
              await enqueueNotification(
                tx,
                {
                  type: 'waitlist.offered',
                  aggregateId: offer.id,
                  version: 1,
                  userId,
                  patientId: offer.entry.patientId,
                  requestId,
                },
                null,
              )
          },
          opportunity: (id) =>
            tx.slotReleaseEvent.findUnique({ where: { id } }),
          finishOpportunity: async (id, now) => {
            await tx.slotReleaseEvent.update({
              where: { id },
              data: { processedAt: now },
            })
          },
          scheduleOpportunity: async (id, nextAttemptAt) => {
            await tx.slotReleaseEvent.update({
              where: { id },
              data: { nextAttemptAt, attempts: { increment: 1 } },
            })
          },
          candidates: async (opportunity, localDate, now) => {
            const document = await currentDataDocument(tx, now)
            if (!document) return []
            const ids = await tx.$queryRaw<Array<{ id: string }>>`SELECT e."id"
              FROM "WaitlistEntry" e
              JOIN "PatientProfile" p ON p."id"=e."patientId"
              JOIN LATERAL (
                SELECT c."action",c."documentVersionId"
                FROM "ConsentEvent" c
                JOIN "ConsentDocumentVersion" d ON d."id"=c."documentVersionId"
                WHERE c."patientId"=p."id" AND d."kind"='data'
                ORDER BY c."sequence" DESC LIMIT 1
              ) consent ON consent."action"='accept' AND consent."documentVersionId"=${document.id}::uuid
              WHERE e."status"='waiting'
                AND e."specialtyId"=${opportunity.specialtyId}::uuid
                AND e."modality"=${opportunity.modality}::"AppointmentModality"
                AND e."dateFrom"<=${localDate}::date AND e."dateTo">=${localDate}::date
                AND p."status"='active'
                AND NOT EXISTS (
                  SELECT 1 FROM "WaitlistOffer" o
                  WHERE o."entryId"=e."id" AND o."releaseEventId"=${opportunity.id}::uuid
                )
              ORDER BY e."queuedAt",e."id"`
            return (
              await tx.waitlistEntry.findMany({
                where: { id: { in: ids.map((r) => r.id) } },
                orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
              })
            ).map(entryRecord)
          },
          candidatePatient: async (id, now) => {
            const p = await tx.patientProfile.findUnique({ where: { id } })
            return p
              ? {
                  id,
                  owned: false,
                  active: p.status === 'active',
                  consentState: await dataConsentState(tx, id, now),
                  suspendedUntil: p.autoBookingSuspendedUntil,
                }
              : null
          },
        })
      })
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ApplicationError('CONFLICT')
      throw error
    }
  }
}
