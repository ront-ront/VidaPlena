import { randomUUID } from 'node:crypto'
import type {
  ImportedHistoryStore,
  ImportedHistoryTransaction,
} from '../../../application/ports/imported-history'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PrismaClinicalRecordStore } from './clinical-record-store'

const professionalInclude = { user: { select: { fullName: true } } } as const
export class PrismaImportedHistoryStore implements ImportedHistoryStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly clinical: PrismaClinicalRecordStore,
    private readonly secrets: SecretBox,
    private readonly environment: string,
  ) {}
  transaction<T>(
    run: (tx: ImportedHistoryTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction((tx) => run(this.scope(tx)))
  }
  scope(tx: Prisma.TransactionClient): ImportedHistoryTransaction {
    return {
      ...this.clinical.scope(tx),
      historySubject: async (id) => {
        const row = await tx.importedHistory.findUnique({
          where: { id },
          select: { recordId: true, record: { select: { patientId: true } } },
        })
        return row
          ? { recordId: row.recordId, patientId: row.record.patientId }
          : null
      },
      lockHistory: async (id) => {
        await tx.$queryRaw`SELECT "id" FROM "ImportedHistory" WHERE "id"=${id}::uuid FOR UPDATE`
      },
      history: async (id) => {
        const row = await tx.importedHistory.findUnique({
          where: { id },
          include: {
            record: { select: { patientId: true } },
            file: true,
            check: {
              include: { professional: { include: professionalInclude } },
            },
            addenda: {
              include: { professional: { include: professionalInclude } },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        })
        if (!row) return null
        const metadata = JSON.parse(
          this.secrets.open(row.metadataEncrypted, `imported_history:${id}`),
        ) as { origin: string; originalAuthor?: string }
        return {
          id: row.id,
          patientId: row.record.patientId,
          originalDate: row.originalDate,
          origin: metadata.origin,
          originalAuthor: metadata.originalAuthor ?? null,
          importedBy: row.importedBy,
          importedAt: row.importedAt,
          file: {
            id: row.file.id,
            contentType: row.file.contentTypeDetected,
            size: Number(row.file.size),
            scanStatus: row.file.scanStatus,
          },
          check: row.check
            ? {
                id: row.check.id,
                professional: {
                  id: row.check.professionalId,
                  name: row.check.professional.user.fullName,
                },
                checkedAt: row.check.checkedAt,
              }
            : null,
          addenda: row.addenda.map((a) => {
            const content = JSON.parse(
              this.secrets.open(
                a.contentEncrypted,
                `imported_addendum:${a.id}`,
              ),
            ) as { reason: string; correctionText: string }
            return {
              id: a.id,
              professional: {
                id: a.professionalId,
                name: a.professional.user.fullName,
              },
              reason: content.reason,
              correctionText: content.correctionText,
              createdAt: a.createdAt,
            }
          }),
        }
      },
      historyFileMatches: async (intent, fileId, userId) =>
        !!(await tx.fileObject.findFirst({
          where: {
            id: fileId,
            category: 'attachment',
            ownerPatientId: intent.patientId,
            linkedResourceType: 'ImportedHistory',
            linkedResourceId: intent.id,
            uploadedBy: userId,
            revokedAt: null,
            importedHistory: { is: null },
            ...(['staging', 'production'].includes(this.environment)
              ? { scanStatus: 'clean' }
              : {}),
          },
          select: { id: true },
        })),
      createHistory: async (intent, recordId, fileId, userId, now) => {
        await tx.importedHistory.create({
          data: {
            id: intent.id,
            recordId,
            fileId,
            originalDate: intent.originalDate
              ? new Date(`${intent.originalDate}T00:00:00Z`)
              : null,
            metadataEncrypted: this.secrets.seal(
              JSON.stringify({
                origin: intent.origin,
                originalAuthor: intent.originalAuthor,
              }),
              `imported_history:${intent.id}`,
            ),
            importedBy: userId,
            importedAt: now,
          },
        })
      },
      checkHistory: async (historyId, professionalId, now) => {
        let row = await tx.importedHistoryCheck.findUnique({
          where: { historyId },
          include: { professional: { include: professionalInclude } },
        })
        if (!row)
          row = await tx.importedHistoryCheck.create({
            data: { historyId, professionalId, checkedAt: now },
            include: { professional: { include: professionalInclude } },
          })
        return {
          id: row.id,
          professional: {
            id: row.professionalId,
            name: row.professional.user.fullName,
          },
          checkedAt: row.checkedAt,
        }
      },
      addHistoryAddendum: async (historyId, professionalId, input, now) => {
        const id = randomUUID(),
          row = await tx.importedHistoryAddendum.create({
            data: {
              id,
              historyId,
              professionalId,
              createdAt: now,
              contentEncrypted: this.secrets.seal(
                JSON.stringify(input),
                `imported_addendum:${id}`,
              ),
            },
            include: { professional: { include: professionalInclude } },
          })
        return {
          id,
          professional: {
            id: row.professionalId,
            name: row.professional.user.fullName,
          },
          ...input,
          createdAt: row.createdAt,
        }
      },
    }
  }
}
