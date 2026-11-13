import { randomUUID } from 'node:crypto'
import type {
  AppointmentImportStore,
  AppointmentImportTransaction,
} from '../../../application/ports/appointment-imports'
import type {
  ImportBatch,
  StoredImportRow,
} from '../../../application/ports/patient-imports'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { PrismaClient } from '../../../generated/prisma/client'
import {
  type BookingPersistencePolicy,
  bookingTransaction,
  bookingUnitOfWork,
} from './booking-store'
import { dataConsentState } from './consent-state'

export class PrismaAppointmentImportStore implements AppointmentImportStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly secrets: SecretBox,
    private readonly policy: BookingPersistencePolicy,
  ) {}
  transaction<T>(
    run: (tx: AppointmentImportTransaction) => Promise<T>,
  ): Promise<T> {
    return bookingUnitOfWork(this.db, this.policy, async (tx) => {
      // Same order as catalog/identity mutations. Each line commits independently.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
      const booking = bookingTransaction(tx, this.policy)
      return run({
        booking,
        principal: booking.principal,
        audit: booking.audit,
        batch: async (id, ownerId) => {
          const batch = await tx.importBatch.findFirst({
            where: { id, createdBy: ownerId, kind: 'appointments' },
            include: { rows: { orderBy: { line: 'asc' } } },
          })
          return batch
            ? {
                ...batch,
                status: batch.status as ImportBatch['status'],
                fileErrors: batch.fileErrors as string[],
                file: Buffer.from(
                  this.secrets.open(batch.fileEncrypted, `import:${id}`),
                  'base64',
                ),
                rows: batch.rows.map((r) => ({
                  ...r,
                  targetId: r.appointmentId,
                  previewStatus:
                    r.previewStatus as StoredImportRow['previewStatus'],
                  finalStatus: r.finalStatus as StoredImportRow['finalStatus'],
                  previewErrors: r.previewErrors as string[],
                  finalErrors: r.finalErrors as string[] | null,
                })),
              }
            : null
        },
        kind: async (id, ownerId) => {
          const batch = await tx.importBatch.findFirst({
            where: { id, createdBy: ownerId },
            select: { kind: true },
          })
          return batch?.kind === 'patients' || batch?.kind === 'appointments'
            ? batch.kind
            : null
        },
        occupied: async (data, now) =>
          !!(await tx.slotReservation.findFirst({
            where: {
              AND: [
                {
                  OR: [
                    { state: 'confirmed' },
                    { state: 'held', expiresAt: { gt: now } },
                  ],
                },
                {
                  OR: [
                    { professionalId: data.professionalId },
                    ...(data.roomId ? [{ roomId: data.roomId }] : []),
                  ],
                },
              ],
              startsAt: { lt: data.endsAt },
              endsAt: { gt: data.startsAt },
            },
            select: { id: true },
          })),
        row: async (batchId, line) => {
          const r = await tx.importRow.findUnique({
            where: { batchId_line: { batchId, line } },
          })
          return r
            ? {
                ...r,
                targetId: r.appointmentId,
                previewStatus:
                  r.previewStatus as StoredImportRow['previewStatus'],
                finalStatus: r.finalStatus as StoredImportRow['finalStatus'],
                previewErrors: r.previewErrors as string[],
                finalErrors: r.finalErrors as string[] | null,
              }
            : null
        },
        saveBatch: async (batch) => {
          const { file, rows, ...data } = batch
          await tx.importBatch.create({
            data: {
              ...data,
              kind: 'appointments',
              fileEncrypted: this.secrets.seal(
                file.toString('base64'),
                `import:${batch.id}`,
              ),
            },
          })
          if (rows.length)
            await tx.importRow.createMany({
              data: rows.map((r) => ({
                id: randomUUID(),
                batchId: batch.id,
                line: r.line,
                previewStatus: r.previewStatus,
                previewErrors: r.previewErrors,
                previewDuplicateOf: r.previewDuplicateOf,
                appointmentId: r.targetId,
              })),
            })
        },
        patient: async (cpf) => {
          const p = await tx.patientProfile.findUnique({
            where: { cpf },
            select: { id: true, status: true },
          })
          return p
            ? {
                id: p.id,
                active: p.status === 'active',
                revoked: (await dataConsentState(tx, p.id)) === 'revoked',
              }
            : null
        },
        references: async (data) => {
          const p = await tx.professionalProfile.findUnique({
            where: { id: data.professionalExternalId },
            select: { id: true },
          })
          const s = await tx.specialty.findUnique({
            where: { code: data.specialtyCode },
            select: { id: true },
          })
          const r = data.roomName
            ? await tx.room.findFirst({
                where: { name: data.roomName },
                orderBy: [{ active: 'desc' }, { id: 'asc' }],
                select: { id: true },
              })
            : null
          return {
            professionalId: p?.id ?? null,
            specialtyId: s?.id ?? null,
            roomId: r?.id ?? null,
          }
        },
        identity: async (sourceSystem, externalId) => {
          const row = await tx.importIdentity.findUnique({
            where: {
              sourceSystem_kind_externalId: {
                sourceSystem,
                kind: 'appointments',
                externalId,
              },
            },
            select: { appointmentId: true, rowHash: true },
          })
          return row?.appointmentId
            ? { appointmentId: row.appointmentId, rowHash: row.rowHash }
            : null
        },
        start: async (id) => {
          await tx.importBatch.update({
            where: { id },
            data: { status: 'processing' },
          })
        },
        finishRow: async (batchId, r) => {
          await tx.importRow.update({
            where: { batchId_line: { batchId, line: r.line } },
            data: {
              finalStatus: r.status,
              finalErrors: r.errors,
              finalDuplicateOf: r.duplicateOf ?? null,
              appointmentId: r.targetId ?? null,
            },
          })
        },
        complete: async (id, confirmedAt) => {
          await tx.importBatch.update({
            where: { id },
            data: { status: 'confirmed', confirmedAt },
          })
        },
        identify: async (
          data,
          rowHash,
          appointmentId,
          batch,
          importedAt,
          historicalStatus,
        ) => {
          await tx.importIdentity.create({
            data: {
              sourceSystem: data.sourceSystem,
              kind: 'appointments',
              externalId: data.externalId,
              rowHash,
              appointmentId,
              batchId: batch.id,
              importedBy: batch.createdBy,
              importedAt,
              historicalStatus,
            },
          })
        },
        command: (requestKey) =>
          tx.importCommand.findUnique({
            where: { requestKey },
            select: { batchId: true, inputHash: true },
          }),
        recordCommand: async (requestKey, inputHash, actorId, batchId) => {
          await tx.importCommand.create({
            data: { requestKey, inputHash, actorId, batchId },
          })
        },
      })
    })
  }
}
