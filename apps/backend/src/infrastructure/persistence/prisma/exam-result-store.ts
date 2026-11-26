import { ApplicationError } from '../../../application/errors/application-error'
import type {
  ExamResultRecord,
  ExamResultStore,
  ExamResultTransaction,
} from '../../../application/ports/exam-results'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PrismaClinicalRecordStore } from './clinical-record-store'
import { dataConsentState } from './consent-state'
import { enqueueNotification } from './notification-store'

const include = { record: { select: { patientId: true } }, file: true } as const
type Row = Prisma.ExamResultGetPayload<{ include: typeof include }>
const project = (r: Row): ExamResultRecord => ({
  id: r.id,
  patientId: r.record.patientId,
  recordId: r.recordId,
  orderId: r.orderId,
  submittedBy: r.submittedBy,
  receivedAt: r.receivedAt,
  origin: r.origin as ExamResultRecord['origin'],
  file: {
    id: r.file.id,
    contentType: r.file.contentTypeDetected,
    size: Number(r.file.size),
    sha256: r.file.sha256,
    scanStatus: r.file.scanStatus,
  },
})
export class PrismaExamResultStore implements ExamResultStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly clinical: PrismaClinicalRecordStore,
    private readonly environment: string,
  ) {}
  transaction<T>(run: (tx: ExamResultTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        // Same lock as consent/guardian changes: upload authorization is fresh at commit.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
        return run(this.scope(tx))
      },
      { timeout: 10000 },
    )
  }
  scope(tx: Prisma.TransactionClient): ExamResultTransaction {
    return {
      ...this.clinical.scope(tx),
      uploadSubject: async (userId, patientId) => {
        const patient = await tx.patientProfile.findUnique({
          where: { id: patientId },
          select: {
            userId: true,
            guardians: {
              where: {
                guardianUserId: userId,
                status: 'active',
                endedAt: null,
              },
              select: { id: true },
            },
          },
        })
        return {
          exists: !!patient,
          owns:
            !!patient &&
            (patient.userId === userId || patient.guardians.length > 0),
          consentState: patient
            ? await dataConsentState(tx, patientId)
            : 'pending',
        }
      },
      resultOrder: async (id) => {
        const order = await tx.examOrder.findUnique({
          where: { id },
          include: {
            document: {
              include: {
                record: true,
                author: true,
                encounter: { include: { appointment: true } },
                voidEvent: true,
              },
            },
          },
        })
        if (!order) return null
        const d = order.document
        return {
          id: order.id,
          documentId: d.id,
          recordId: d.recordId,
          patientId: d.record.patientId,
          requesterId: d.authorProfessionalId,
          requesterUserId: d.author.userId,
          specialtyId: d.encounter.appointment.specialtyId,
          modality: d.encounter.appointment.modality as 'onsite' | 'remote',
          issued: ['issued_dev', 'issued_valid'].includes(d.status),
          voided: !!d.voidEvent,
        }
      },
      lockResultOrder: async (id) => {
        await tx.$queryRaw`SELECT d."id" FROM "ClinicalDocument" d JOIN "ExamOrder" e ON e."documentId"=d."id" WHERE e."id"=${id}::uuid FOR UPDATE OF d`
        await tx.$queryRaw`SELECT "id" FROM "ExamOrder" WHERE "id"=${id}::uuid FOR UPDATE`
      },
      resultSubject: async (id) => {
        const r = await tx.examResult.findUnique({
          where: { id },
          select: { recordId: true, record: { select: { patientId: true } } },
        })
        return r
          ? { recordId: r.recordId, patientId: r.record.patientId }
          : null
      },
      result: async (id) => {
        const r = await tx.examResult.findUnique({ where: { id }, include })
        return r ? project(r) : null
      },
      results: async (recordId, query) => {
        const where: Prisma.ExamResultWhereInput = {
          recordId,
          ...(query.orderId ? { orderId: query.orderId } : {}),
        }
        if (
          query.orderId &&
          !(await tx.examOrder.findFirst({
            where: { id: query.orderId, document: { recordId } },
            select: { id: true },
          }))
        )
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        if (query.cursor) {
          const cursor = await tx.examResult.findFirst({
            where: { ...where, id: query.cursor },
            select: { id: true, receivedAt: true },
          })
          if (!cursor) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
          where.OR = [
            { receivedAt: { lt: cursor.receivedAt } },
            { receivedAt: cursor.receivedAt, id: { lt: cursor.id } },
          ]
        }
        const rows = await tx.examResult.findMany({
          where,
          include,
          orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
          take: 31,
        })
        return {
          items: rows.slice(0, 30).map(project),
          nextCursor: rows.length > 30 ? rows[29].id : null,
        }
      },
      resultFileMatches: async (intent, fileId, userId) => {
        await tx.$queryRaw`SELECT "id" FROM "FileObject" WHERE "id"=${fileId}::uuid FOR UPDATE`
        return !!(await tx.fileObject.findFirst({
          where: {
            id: fileId,
            category: 'result',
            ownerPatientId: intent.patientId,
            linkedResourceType: 'ExamResult',
            linkedResourceId: intent.id,
            uploadedBy: userId,
            revokedAt: null,
            examResult: { is: null },
            ...(['staging', 'production'].includes(this.environment)
              ? { scanStatus: 'clean' }
              : {}),
          },
          select: { id: true },
        }))
      },
      createResult: async (intent, recordId, fileId, userId, now) => {
        await tx.examResult.create({
          data: {
            id: intent.id,
            recordId,
            fileId,
            submittedBy: userId,
            receivedAt: now,
            orderId: intent.orderId ?? null,
            origin: intent.origin,
          },
        })
      },
      markOrderReceived: async (orderId, now) => {
        await tx.examOrder.updateMany({
          where: { id: orderId, resultReceivedAt: null },
          data: { resultReceivedAt: now },
        })
      },
      retainResult: async (
        examResultId,
        recordId,
        anchorAt,
        retentionYears,
        retainUntil,
      ) => {
        await tx.clinicalRetentionEvent.create({
          data: {
            examResultId,
            recordId,
            anchorAt,
            retentionYears,
            retainUntil,
            createdAt: anchorAt,
          },
        })
      },
      queueResultNotice: async (order, resultId, context) => {
        await enqueueNotification(
          tx,
          {
            type: 'exam.result_received',
            aggregateId: resultId,
            version: 1,
            userId: order.requesterUserId,
            patientId: order.patientId,
            requestId: context.requestId,
          },
          null,
        )
      },
    }
  }
}
