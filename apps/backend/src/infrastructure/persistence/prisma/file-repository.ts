import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditContext } from '../../../application/ports/audit-writer'
import type {
  FileCategory,
  FileRecord,
  FileRepository,
} from '../../../application/ports/files'
import type { PrismaClient } from '../../../generated/prisma/client'
import { PrismaAuditWriter } from './audit-writer'

function project(row: {
  id: string
  category: string
  ownerPatientId: string | null
  linkedResourceType: string
  linkedResourceId: string
  storageKey: string
  contentTypeDetected: string
  size: bigint
  sha256: string
  scanStatus: string
  revokedAt: Date | null
}): FileRecord {
  return {
    ...row,
    category: row.category as FileCategory,
    size: Number(row.size),
  }
}

export class PrismaFileRepository implements FileRepository {
  readonly audit: PrismaAuditWriter
  constructor(private readonly db: PrismaClient) {
    this.audit = new PrismaAuditWriter(db)
  }

  create(
    input: Omit<FileRecord, 'id' | 'revokedAt'> & { uploadedBy?: string },
    maxPerRecord: number,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.linkedResourceType}:${input.linkedResourceId}`}, 661013))`
      const count = await tx.fileObject.count({
        where: {
          linkedResourceType: input.linkedResourceType,
          linkedResourceId: input.linkedResourceId,
          revokedAt: null,
        },
      })
      if (count >= maxPerRecord)
        throw new ApplicationError('UNPROCESSABLE_FILE', [
          {
            field: 'file',
            reason: 'Limite de arquivos deste registro atingido.',
          },
        ])
      const row = await tx.fileObject.create({
        data: {
          ...input,
          size: BigInt(input.size),
          encryptionKeyRef: 'local:v1',
        },
      })
      await new PrismaAuditWriter(tx).append({
        ...context,
        actorUserId: input.uploadedBy,
        action: 'file.uploaded',
        resourceType: 'FileObject',
        resourceId: row.id,
        subjectPatientId: input.ownerPatientId ?? undefined,
        metadata: {
          fileCategory: input.category,
          scanStatus: input.scanStatus,
        },
      })
      return project(row)
    })
  }

  async get(id: string) {
    const row = await this.db.fileObject.findUnique({ where: { id } })
    return row ? project(row) : null
  }

  async revoke(id: string, at: Date) {
    await this.db.fileObject.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: at },
    })
  }

  async discardUnlinked(id: string) {
    const result = await this.db.fileObject.deleteMany({
      where: {
        id,
        linkedResourceType: 'ConsentEvent',
        consentEvidence: { is: null },
      },
    })
    return result.count === 1
  }
}
