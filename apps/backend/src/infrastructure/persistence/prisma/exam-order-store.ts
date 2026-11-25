import { ApplicationError } from '../../../application/errors/application-error'
import type {
  ExamOrderStore,
  ExamOrderTransaction,
} from '../../../application/ports/exam-orders'
import { Prisma, type PrismaClient } from '../../../generated/prisma/client'
import type { PrismaClinicalDocumentStore } from './clinical-document-store'

type PendingRow = {
  orderId: string
  documentId: string
  patientId: string
  patientName: string
  orderedAt: Date
  signatureStatus: 'issued_dev' | 'issued_valid'
}
export class PrismaExamOrderStore implements ExamOrderStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly documents: PrismaClinicalDocumentStore,
  ) {}
  transaction<T>(run: (tx: ExamOrderTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction((tx) => run(this.scope(tx)))
  }
  private readable(professionalId: string, now: Date) {
    return Prisma.sql`(
      EXISTS(SELECT 1 FROM "CareLink" c WHERE c."patientId"=r."patientId" AND c."professionalId"=${professionalId}::uuid AND c."status"='active' AND c."startsAt"<=${now} AND c."endsAt">${now} AND (
        c."source"='substitution' OR
        (c."source"='appointment' AND EXISTS(SELECT 1 FROM "Appointment" a WHERE a."id"=c."sourceAppointmentId" AND a."patientId"=c."patientId" AND a."professionalId"=c."professionalId" AND a."status"<>'cancelled' AND a."startsAt"<=${now})) OR
        (c."source"='shared_case' AND EXISTS(SELECT 1 FROM "CareLink" parent JOIN "Appointment" a ON a."id"=parent."sourceAppointmentId" WHERE parent."id"=c."parentLinkId" AND parent."patientId"=c."patientId" AND parent."source"='appointment' AND parent."status"='active' AND parent."startsAt"<=${now} AND parent."endsAt">${now} AND a."patientId"=parent."patientId" AND a."professionalId"=parent."professionalId" AND a."status"<>'cancelled' AND a."startsAt"<=${now}))
      )) OR EXISTS(SELECT 1 FROM "EmergencyAccessGrant" g WHERE g."patientId"=r."patientId" AND g."professionalId"=${professionalId}::uuid AND g."grantedAt"<=${now} AND g."expiresAt">${now} AND NOT EXISTS(SELECT 1 FROM "EmergencyAccessReview" review WHERE review."grantId"=g."id" AND review."outcome"='rejected'))
    )`
  }
  scope(tx: Prisma.TransactionClient): ExamOrderTransaction {
    return {
      ...this.documents.scope(tx),
      pendingExamOrders: async (professionalId, query, cutoff, now) => {
        const where = Prisma.sql`d."authorProfessionalId"=${professionalId}::uuid AND d."status" IN ('issued_dev','issued_valid') AND d."issuedAt"<=${cutoff} AND e."resultReceivedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM "ClinicalDocumentVoid" v WHERE v."documentId"=d."id") AND ${this.readable(professionalId, now)} ${query.patientId ? Prisma.sql`AND r."patientId"=${query.patientId}::uuid` : Prisma.empty}`
        const source = Prisma.sql`"ExamOrder" e JOIN "ClinicalDocument" d ON d."id"=e."documentId" JOIN "ClinicalRecord" r ON r."id"=d."recordId" JOIN "PatientProfile" patient ON patient."id"=r."patientId"`
        let seek = Prisma.sql`TRUE`
        if (query.cursor) {
          const [cursor] = await tx.$queryRaw<
            { orderId: string; orderedAt: Date }[]
          >(
            Prisma.sql`SELECT e."id" AS "orderId",d."issuedAt" AS "orderedAt" FROM ${source} WHERE ${where} AND e."id"=${query.cursor}::uuid LIMIT 1`,
          )
          if (!cursor) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
          seek = Prisma.sql`(d."issuedAt",e."id")<(${cursor.orderedAt},${cursor.orderId}::uuid)`
        }
        const rows = await tx.$queryRaw<PendingRow[]>(
          Prisma.sql`SELECT e."id" AS "orderId",d."id" AS "documentId",r."patientId",patient."fullName" AS "patientName",d."issuedAt" AS "orderedAt",d."status" AS "signatureStatus" FROM ${source} WHERE ${where} AND ${seek} ORDER BY d."issuedAt" DESC,e."id" DESC LIMIT 31`,
        )
        return {
          items: rows.slice(0, 30).map((row) => ({
            orderId: row.orderId,
            documentId: row.documentId,
            patient: { id: row.patientId, name: row.patientName },
            orderedAt: row.orderedAt.toISOString(),
            signatureStatus: row.signatureStatus,
          })),
          nextCursor: rows.length > 30 ? rows[29].orderId : null,
        }
      },
    }
  }
}
