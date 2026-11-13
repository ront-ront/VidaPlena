import { randomUUID } from 'node:crypto'
import type {
  ImportBatch,
  PatientImportStore,
  PatientImportTransaction,
  StoredImportRow,
} from '../../../application/ports/patient-imports'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { PrismaClient } from '../../../generated/prisma/client'
import { readPrincipal } from './access-store'
import { PrismaAuditWriter } from './audit-writer'
export class PrismaPatientImportStore implements PatientImportStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly secrets: SecretBox,
    private readonly policy: {
      timeoutMs: number
      maxWaitMs: number
      internalMinutes: number
      patientMinutes: number
    },
  ) {}
  transaction<T>(
    run: (tx: PatientImportTransaction) => Promise<T>,
    confirm = false,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        if (confirm) await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
        else await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(775001)`
        return run({
          principal: (actor) =>
            readPrincipal(tx, actor.userId, actor.sessionId, this.policy),
          batch: async (id, ownerId) => {
            const row = await tx.importBatch.findFirst({
              where: { id, createdBy: ownerId, kind: 'patients' },
              include: { rows: { orderBy: { line: 'asc' } } },
            })
            return row
              ? {
                  ...row,
                  status: row.status as ImportBatch['status'],
                  file: Buffer.from(
                    this.secrets.open(row.fileEncrypted, `import:${id}`),
                    'base64',
                  ),
                  fileErrors: row.fileErrors as string[],
                  rows: row.rows.map((line) => ({
                    ...line,
                    previewStatus:
                      line.previewStatus as StoredImportRow['previewStatus'],
                    previewErrors: line.previewErrors as string[],
                    finalStatus:
                      line.finalStatus as StoredImportRow['finalStatus'],
                    finalErrors: line.finalErrors as string[] | null,
                  })),
                }
              : null
          },
          saveBatch: async (batch) => {
            const { file, rows, ...data } = batch
            await tx.importBatch.create({
              data: {
                ...data,
                kind: 'patients',
                fileEncrypted: this.secrets.seal(
                  file.toString('base64'),
                  `import:${batch.id}`,
                ),
              },
            })
            if (rows.length)
              await tx.importRow.createMany({
                data: rows.map((row) => ({
                  id: randomUUID(),
                  batchId: batch.id,
                  line: row.line,
                  previewStatus: row.previewStatus,
                  previewErrors: row.previewErrors,
                  previewDuplicateOf: row.previewDuplicateOf,
                  targetId: row.targetId,
                })),
              })
          },
          identity: async (sourceSystem, externalId) => {
            const row = await tx.importIdentity.findUnique({
              where: {
                sourceSystem_kind_externalId: {
                  sourceSystem,
                  kind: 'patients',
                  externalId,
                },
              },
              select: { patientId: true, rowHash: true },
            })
            return row?.patientId
              ? { patientId: row.patientId, rowHash: row.rowHash }
              : null
          },
          patient: (cpf) =>
            tx.patientProfile.findUnique({
              where: { cpf },
              select: { id: true },
            }),
          createPatient: async (data) => {
            const id = randomUUID()
            const result = await tx.patientProfile.createMany({
              skipDuplicates: true,
              data: {
                id,
                fullName: data.fullName,
                birthDate: new Date(`${data.birthDate}T00:00:00Z`),
                cpf: data.cpf,
                email: data.email,
                phone: data.phone,
              },
            })
            return result.count ? id : null
          },
          identify: async (data, rowHash, patientId, batch, now) => {
            await tx.importIdentity.create({
              data: {
                sourceSystem: data.sourceSystem,
                kind: 'patients',
                externalId: data.externalId,
                rowHash,
                patientId,
                batchId: batch.id,
                importedAt: now,
                importedBy: batch.createdBy,
                historicalStatus: 'undated',
              },
            })
          },
          finalize: async (batchId, rows, now) => {
            for (const row of rows)
              await tx.importRow.update({
                where: { batchId_line: { batchId, line: row.line } },
                data: {
                  finalStatus: row.status,
                  finalErrors: row.errors,
                  finalDuplicateOf: row.duplicateOf ?? null,
                  targetId: row.targetId ?? null,
                },
              })
            await tx.importBatch.update({
              where: { id: batchId },
              data: { status: 'confirmed', confirmedAt: now },
            })
          },
          command: (key) =>
            tx.importCommand.findUnique({
              where: { requestKey: key },
              select: { inputHash: true, batchId: true },
            }),
          recordCommand: async (requestKey, inputHash, actorId, batchId) => {
            await tx.importCommand.create({
              data: { requestKey, inputHash, actorId, batchId },
            })
          },
          audit: new PrismaAuditWriter(tx),
        })
      },
      { timeout: this.policy.timeoutMs, maxWait: this.policy.maxWaitMs },
    )
  }
}
