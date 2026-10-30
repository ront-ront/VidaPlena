import {
  type AuditInput,
  type AuditWriter,
  safeAuditMetadata,
} from '../../../application/ports/audit-writer'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'

export class PrismaAuditWriter implements AuditWriter {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient) {}

  async append(input: AuditInput) {
    const { metadata, ...context } = input
    const event = await this.db.auditEvent.create({
      data: { ...context, metadataSafe: safeAuditMetadata(metadata) },
    })
    return event.id
  }
}

export function auditedTransaction<T>(
  db: PrismaClient,
  operation: (
    transaction: Prisma.TransactionClient,
    audit: AuditWriter,
  ) => Promise<T>,
): Promise<T> {
  return db.$transaction((transaction) =>
    operation(transaction, new PrismaAuditWriter(transaction)),
  )
}
