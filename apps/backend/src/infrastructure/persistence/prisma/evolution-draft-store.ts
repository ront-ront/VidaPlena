import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type {
  EvolutionDraftStore,
  EvolutionDraftTransaction,
  EvolutionPayload,
  EvolutionRecord,
  EvolutionSubject,
} from '../../../application/ports/evolution-drafts'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PrismaClinicalRecordStore } from './clinical-record-store'
import type { PrismaTerminologyStore } from './terminology-store'

type EvolutionRow = {
  id: string
  encounterId: string
  authorProfessionalId: string
  status: string
  payloadEncrypted: string
  draftVersion: number
  savedAt: Date
  createdAt: Date
  finalizedAt: Date | null
  contentHash: string | null
}
const subject = (
  row: Omit<
    EvolutionRow,
    'payloadEncrypted' | 'createdAt' | 'finalizedAt' | 'contentHash'
  >,
): EvolutionSubject => ({
  id: row.id,
  encounterId: row.encounterId,
  authorProfessionalId: row.authorProfessionalId,
  status: row.status as EvolutionSubject['status'],
  draftVersion: row.draftVersion,
  savedAt: row.savedAt,
})
const subjectSelect = {
  id: true,
  encounterId: true,
  authorProfessionalId: true,
  status: true,
  draftVersion: true,
  savedAt: true,
} as const
export class PrismaEvolutionDraftStore implements EvolutionDraftStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly clinical: PrismaClinicalRecordStore,
    private readonly terms: PrismaTerminologyStore,
    private readonly secrets: SecretBox,
  ) {}
  private row(row: EvolutionRow): EvolutionRecord {
    return {
      ...subject(row),
      createdAt: row.createdAt,
      finalizedAt: row.finalizedAt,
      contentHash: row.contentHash,
      payload: JSON.parse(
        this.secrets.open(row.payloadEncrypted, `clinical_evolution:${row.id}`),
      ) as EvolutionPayload,
    }
  }
  transaction<T>(
    run: (tx: EvolutionDraftTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction((tx) => run(this.scope(tx)))
  }
  scope(tx: Prisma.TransactionClient): EvolutionDraftTransaction {
    return {
      ...this.clinical.scope(tx),
      ...this.terms.scope(tx),
      lockDraftCommand: async (key) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`evolution_draft:${key}`},0))`
      },
      lockEncounter: async (id) => {
        await tx.$queryRaw`SELECT "id" FROM "ClinicalEncounter" WHERE "id"=${id}::uuid FOR UPDATE`
      },
      lockEvolution: async (id) => {
        await tx.$queryRaw`SELECT "id" FROM "ClinicalEvolution" WHERE "id"=${id}::uuid FOR UPDATE`
      },
      evolutionEncounter: async (id) => {
        const row = await tx.clinicalEncounter.findUnique({
          where: { id },
          include: {
            record: { select: { patientId: true } },
            appointment: true,
          },
        })
        return row
          ? {
              id: row.id,
              recordId: row.recordId,
              patientId: row.record.patientId,
              professionalId: row.professionalId,
              status: row.status,
              appointment: row.appointment,
            }
          : null
      },
      evolutionSubject: async (id) => {
        const row = await tx.clinicalEvolution.findUnique({
          where: { id },
          select: subjectSelect,
        })
        return row ? subject(row) : null
      },
      evolutionForEncounter: async (encounterId) => {
        const row = await tx.clinicalEvolution.findUnique({
          where: { encounterId },
          select: subjectSelect,
        })
        return row ? subject(row) : null
      },
      evolution: async (id) => {
        const row = await tx.clinicalEvolution.findUnique({ where: { id } })
        return row ? this.row(row) : null
      },
      createEvolution: async (encounterId, professionalId, payload, now) => {
        const id = randomUUID()
        return this.row(
          await tx.clinicalEvolution.create({
            data: {
              id,
              encounterId,
              authorProfessionalId: professionalId,
              payloadEncrypted: this.secrets.seal(
                JSON.stringify(payload),
                `clinical_evolution:${id}`,
              ),
              savedAt: now,
              createdAt: now,
            },
          }),
        )
      },
      updateEvolution: async (id, expected, payload, now) => {
        const result = await tx.clinicalEvolution.updateMany({
          where: { id, status: 'draft', draftVersion: expected },
          data: {
            payloadEncrypted: this.secrets.seal(
              JSON.stringify(payload),
              `clinical_evolution:${id}`,
            ),
            draftVersion: { increment: 1 },
            savedAt: now,
          },
        })
        if (result.count !== 1) throw new ApplicationError('CONFLICT')
        return this.row(
          await tx.clinicalEvolution.findUniqueOrThrow({ where: { id } }),
        )
      },
      draftCommand: (key) =>
        tx.evolutionDraftCommand.findUnique({ where: { requestKey: key } }),
      saveDraftCommand: async (input) => {
        await tx.evolutionDraftCommand.create({ data: input })
      },
    }
  }
}
