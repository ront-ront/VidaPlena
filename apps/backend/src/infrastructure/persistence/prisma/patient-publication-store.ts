import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type {
  PatientPublication,
  PatientPublicationStore,
  PatientPublicationTransaction,
  PublicationSource,
} from '../../../application/ports/patient-publications'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PrismaClinicalDocumentStore } from './clinical-document-store'
import type { PrismaClinicalEvolutionStore } from './clinical-evolution-store'
import type { PrismaExamResultStore } from './exam-result-store'

const include = {
  author: { include: { user: { select: { fullName: true } } } },
  specialty: { select: { id: true, name: true } },
} as const
type Row = Prisma.PatientPublicationGetPayload<{ include: typeof include }>
const appointmentInclude = { appointment: true } as const
export class PrismaPatientPublicationStore implements PatientPublicationStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly documents: PrismaClinicalDocumentStore,
    private readonly evolutions: PrismaClinicalEvolutionStore,
    private readonly results: PrismaExamResultStore,
    private readonly secrets: SecretBox,
  ) {}
  transaction<T>(
    run: (tx: PatientPublicationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(775001)`
        return run(this.scope(tx))
      },
      { timeout: 10000 },
    )
  }
  private project(row: Row): PatientPublication {
    return {
      id: row.id,
      patientId: row.patientId,
      resourceType: row.resourceType as PatientPublication['resourceType'],
      resourceId: row.resourceId,
      visibilityKind:
        row.visibilityKind as PatientPublication['visibilityKind'],
      publishedByProfessionalId: row.publishedByProfessionalId,
      publishedAt: row.publishedAt,
      occurredAt: row.occurredAt,
      timelineType: row.timelineType,
      professional: {
        id: row.publishedByProfessionalId,
        name: row.author.user.fullName,
      },
      specialty: row.specialty,
      modality: row.modality as PatientPublication['modality'],
      projection: row.projectionEncrypted
        ? JSON.parse(
            this.secrets.open(row.projectionEncrypted, `publication:${row.id}`),
          )
        : null,
      importedOrigin: row.importedOriginEncrypted
        ? JSON.parse(
            this.secrets.open(
              row.importedOriginEncrypted,
              `publication-origin:${row.id}`,
            ),
          )
        : null,
      revokedAt: row.revokedAt,
    }
  }
  scope(tx: Prisma.TransactionClient): PatientPublicationTransaction {
    const get = async (id: string) => {
      const r = await tx.patientPublication.findUnique({
        where: { id },
        include,
      })
      return r ? this.project(r) : null
    }
    const encounterSource = async (
      recordId: string,
      encounterId: string,
      authorProfessionalId: string,
      occurredAt: Date | null,
      eligible: boolean,
      timelineType: string,
    ): Promise<PublicationSource | null> => {
      const [record, encounter] = await Promise.all([
        tx.clinicalRecord.findUnique({
          where: { id: recordId },
          select: { patientId: true },
        }),
        tx.clinicalEncounter.findUnique({
          where: { id: encounterId },
          include: appointmentInclude,
        }),
      ])
      if (!record || !encounter) return null
      const a = encounter.appointment
      return {
        patientId: record.patientId,
        recordId,
        encounterId,
        authorProfessionalId,
        occurredAt,
        eligible,
        timelineType,
        specialtyId: a.specialtyId,
        modality: a.modality,
        importedOrigin:
          a.bookingSource === 'imported'
            ? {
                origin: 'agenda_importada',
                importedAt: a.createdAt.toISOString(),
                importedBy: a.createdBy,
              }
            : null,
      }
    }
    return {
      ...this.evolutions.scope(tx),
      ...this.documents.scope(tx),
      ...this.results.scope(tx),
      publicationSource: async (type, id) => {
        if (type === 'ClinicalDocument') {
          const row = await tx.clinicalDocument.findUnique({
            where: { id },
            include: { typeVersion: { include: { type: true } } },
          })
          return row
            ? encounterSource(
                row.recordId,
                row.encounterId,
                row.authorProfessionalId,
                row.issuedAt,
                row.status !== 'draft',
                ['prescription', 'exam_order'].includes(
                  row.typeVersion.type.code,
                )
                  ? row.typeVersion.type.code
                  : 'document',
              )
            : null
        }
        if (type === 'ClinicalEvolution') {
          const row = await tx.clinicalEvolution.findUnique({
            where: { id },
            include: { encounter: { select: { recordId: true } } },
          })
          return row
            ? encounterSource(
                row.encounter.recordId,
                row.encounterId,
                row.authorProfessionalId,
                row.finalizedAt,
                row.status === 'finalized',
                'confirmed_summary',
              )
            : null
        }
        const row = await tx.examResult.findUnique({
          where: { id },
          include: { record: true, order: { include: { document: true } } },
        })
        if (!row) return null
        const d = row.order?.document
        const context = d
          ? await encounterSource(
              row.recordId,
              d.encounterId,
              d.authorProfessionalId,
              row.receivedAt,
              true,
              'exam_result',
            )
          : null
        return {
          ...(context ?? {
            recordId: row.recordId,
            patientId: row.record.patientId,
            encounterId: null,
            authorProfessionalId: null,
            occurredAt: row.receivedAt,
            eligible: true,
            timelineType: 'exam_result',
            specialtyId: null,
            modality: null,
            importedOrigin: null,
          }),
          authorProfessionalId: null,
        }
      },
      publication: get,
      activePublication: async (resourceType, resourceId, visibilityKind) => {
        const row = await tx.patientPublication.findFirst({
          where: { resourceType, resourceId, visibilityKind, revokedAt: null },
          include,
        })
        return row ? this.project(row) : null
      },
      publicationPage: async (patientId, query) => {
        const state = query.state ?? 'active',
          where: Prisma.PatientPublicationWhereInput = {
            patientId,
            ...(state === 'all'
              ? {}
              : { revokedAt: state === 'active' ? null : { not: null } }),
            ...(query.specialtyId ? { specialtyId: query.specialtyId } : {}),
            ...(query.type ? { timelineType: query.type } : {}),
            ...(query.from || query.to
              ? {
                  occurredAt: {
                    ...(query.from ? { gte: new Date(query.from) } : {}),
                    ...(query.to ? { lt: new Date(query.to) } : {}),
                  },
                }
              : {}),
          }
        if (query.cursor) {
          const cursor = await tx.patientPublication.findFirst({
            where: { ...where, id: query.cursor },
            select: { id: true, occurredAt: true },
          })
          if (!cursor) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
          where.OR = [
            { occurredAt: { lt: cursor.occurredAt } },
            { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
          ]
        }
        const rows = await tx.patientPublication.findMany({
          where,
          include,
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 31,
        })
        return {
          items: rows.slice(0, 30).map((r) => this.project(r)),
          nextCursor: rows.length > 30 ? rows[29].id : null,
        }
      },
      createPublication: async (
        input,
        source,
        projection,
        publishedByProfessionalId,
        now,
      ) => {
        const id = randomUUID()
        const row = await tx.patientPublication.create({
          data: {
            id,
            patientId: input.patientId,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            visibilityKind: input.visibilityKind,
            publishedByProfessionalId,
            publishedAt: now,
            occurredAt: source.occurredAt as Date,
            timelineType:
              input.resourceType === 'ClinicalEvolution'
                ? input.visibilityKind
                : source.timelineType,
            specialtyId: source.specialtyId,
            modality: source.modality,
            projectionEncrypted: projection
              ? this.secrets.seal(
                  JSON.stringify(projection),
                  `publication:${id}`,
                )
              : null,
            importedOriginEncrypted: source.importedOrigin
              ? this.secrets.seal(
                  JSON.stringify(source.importedOrigin),
                  `publication-origin:${id}`,
                )
              : null,
          },
          include,
        })
        return this.project(row)
      },
      revokePublication: async (
        id,
        revokedByProfessionalId,
        reason,
        revokedAt,
      ) =>
        this.project(
          await tx.patientPublication.update({
            where: { id },
            data: {
              revokedAt,
              revokedByProfessionalId,
              revocationReasonEncrypted: this.secrets.seal(
                reason,
                `publication-revocation:${id}`,
              ),
            },
            include,
          }),
        ),
    }
  }
}
