import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type {
  ClinicalAddendum,
  ClinicalEvolutionStore,
  ClinicalEvolutionTransaction,
} from '../../../application/ports/clinical-evolutions'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { CareLinkPolicy } from '../../../domain/rules/care-link'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { syncAppointmentCareLink } from './care-link-store'
import type { PrismaEvolutionDraftStore } from './evolution-draft-store'

const authorInclude = { user: { select: { fullName: true } } } as const
export class PrismaClinicalEvolutionStore implements ClinicalEvolutionStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly drafts: PrismaEvolutionDraftStore,
    private readonly secrets: SecretBox,
    private readonly linkPolicy: CareLinkPolicy,
  ) {}
  transaction<T>(
    run: (tx: ClinicalEvolutionTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction((tx) => run(this.scope(tx)))
  }
  scope(tx: Prisma.TransactionClient): ClinicalEvolutionTransaction {
    const draft = this.drafts.scope(tx)
    return {
      ...draft,
      authorProfessional: async (id) => {
        const row = await tx.professionalProfile.findUniqueOrThrow({
          where: { id },
          include: authorInclude,
        })
        return { id, name: row.user.fullName }
      },
      evolutionAttachments: async (id) =>
        (
          await tx.fileObject.findMany({
            where: {
              linkedResourceType: 'ClinicalEvolution',
              linkedResourceId: id,
              category: 'attachment',
              revokedAt: null,
            },
            orderBy: { id: 'asc' },
            select: {
              id: true,
              contentTypeDetected: true,
              size: true,
              sha256: true,
              scanStatus: true,
            },
          })
        ).map((row) => ({
          id: row.id,
          contentType: row.contentTypeDetected,
          size: Number(row.size),
          sha256: row.sha256,
          scanStatus: row.scanStatus,
        })),
      evolutionAddenda: async (originalEvolutionId) => {
        const rows = await tx.evolutionAddendum.findMany({
          where: { originalEvolutionId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { author: { include: authorInclude } },
        })
        return rows.map((row) => {
          const content = JSON.parse(
            this.secrets.open(
              row.contentEncrypted,
              `evolution_addendum:${row.id}`,
            ),
          ) as { reason: string; correctionText: string }
          return {
            id: row.id,
            originalEvolutionId,
            authorProfessionalId: row.authorProfessionalId,
            ...content,
            createdAt: row.createdAt,
            contentHash: row.contentHash,
            author: {
              id: row.authorProfessionalId,
              name: row.author.user.fullName,
            },
          }
        })
      },
      finalizeEvolution: async (id, expectedVersion, hash, now) => {
        const changed = await tx.clinicalEvolution.updateMany({
          where: { id, status: 'draft', draftVersion: expectedVersion },
          data: { status: 'finalized', finalizedAt: now, contentHash: hash },
        })
        if (changed.count !== 1) throw new ApplicationError('CONFLICT')
        const row = await draft.evolution(id)
        if (!row) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        return row
      },
      completeClinicalEncounter: async (
        encounter,
        actor,
        context,
        now,
        retentionYears,
        retainUntil,
      ) => {
        await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id"=${encounter.appointment.id}::uuid FOR UPDATE`
        const prior = await tx.appointment.findUniqueOrThrow({
          where: { id: encounter.appointment.id },
        })
        if (
          prior.status !== 'in_service' ||
          prior.professionalId !== encounter.professionalId
        )
          throw new ApplicationError('CONFLICT')
        const closed = await tx.clinicalEncounter.updateMany({
          where: { id: encounter.id, status: 'in_progress' },
          data: { status: 'completed', endedAt: now },
        })
        if (closed.count !== 1) throw new ApplicationError('CONFLICT')
        await tx.slotReservation.updateMany({
          where: { appointmentId: prior.id, state: 'confirmed' },
          data: { state: 'released' },
        })
        const appointment = await tx.appointment.update({
          where: { id: prior.id },
          data: { status: 'completed', version: { increment: 1 } },
        })
        const history = await tx.appointmentHistory.create({
          data: {
            appointmentId: prior.id,
            action: 'completed',
            previous: { status: prior.status, version: prior.version },
            next: { status: appointment.status, version: appointment.version },
            actorUserId: actor.userId,
            origin: 'clinic',
            occurredAt: now,
          },
        })
        await syncAppointmentCareLink(tx, appointment, this.linkPolicy, actor, {
          ...context,
          authorizationBasis: `appointment_history:${history.id}`,
        })
        if (now < prior.endsAt)
          await tx.slotReleaseEvent.create({
            data: {
              appointmentId: prior.id,
              changeVersion: appointment.version,
              professionalId: prior.professionalId,
              specialtyId: prior.specialtyId,
              roomId: prior.roomId,
              modality: prior.modality,
              startsAt: now,
              endsAt: prior.endsAt,
              kind: 'completed',
            },
          })
        await tx.clinicalRetentionEvent.create({
          data: {
            recordId: encounter.recordId,
            encounterId: encounter.id,
            anchorAt: now,
            retentionYears,
            retainUntil,
            createdAt: now,
          },
        })
        return { specialtyId: prior.specialtyId, modality: prior.modality }
      },
      createEvolutionAddendum: async (input) => {
        const { reason, correctionText, ...data } = input,
          id = randomUUID()
        const row = await tx.evolutionAddendum.create({
          data: {
            ...data,
            id,
            contentEncrypted: this.secrets.seal(
              JSON.stringify({ reason, correctionText }),
              `evolution_addendum:${id}`,
            ),
          },
          include: { author: { include: authorInclude } },
        })
        return {
          ...input,
          id,
          author: {
            id: input.authorProfessionalId,
            name: row.author.user.fullName,
          },
        } satisfies ClinicalAddendum
      },
      authoredEvolutions: async (professionalId, query) => {
        const where: Prisma.ClinicalEvolutionWhereInput = {
          authorProfessionalId: professionalId,
          status: 'finalized',
          encounter: { record: { patientId: query.patientId } },
        }
        const cursor = query.cursor
          ? await tx.clinicalEvolution.findFirst({
              where: { AND: [where, { id: query.cursor }] },
              select: { id: true, finalizedAt: true },
            })
          : null
        if (query.cursor && !cursor?.finalizedAt)
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const rows = await tx.clinicalEvolution.findMany({
          where: {
            AND: [
              where,
              ...(cursor
                ? [
                    {
                      OR: [
                        { finalizedAt: { lt: cursor.finalizedAt } },
                        {
                          finalizedAt: cursor.finalizedAt,
                          id: { lt: cursor.id },
                        },
                      ],
                    },
                  ]
                : []),
            ],
          },
          orderBy: [{ finalizedAt: 'desc' }, { id: 'desc' }],
          take: 31,
        })
        const selected = rows.slice(0, 30)
        const attachments = await tx.fileObject.findMany({
          where: {
            linkedResourceType: 'ClinicalEvolution',
            linkedResourceId: { in: selected.map((row) => row.id) },
            category: 'attachment',
            revokedAt: null,
          },
          select: {
            id: true,
            linkedResourceId: true,
            contentTypeDetected: true,
            size: true,
            sha256: true,
            scanStatus: true,
          },
        })
        const items = selected.map((row) => ({
          row: this.drafts.project(row),
          patientId: query.patientId,
          attachments: attachments
            .filter((file) => file.linkedResourceId === row.id)
            .map((file) => ({
              id: file.id,
              contentType: file.contentTypeDetected,
              size: Number(file.size),
              sha256: file.sha256,
              scanStatus: file.scanStatus,
            })),
        }))
        return { items, nextCursor: rows.length > 30 ? rows[29].id : null }
      },
    }
  }
}
