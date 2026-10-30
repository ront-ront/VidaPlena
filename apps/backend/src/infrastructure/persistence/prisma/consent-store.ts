import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditContext } from '../../../application/ports/audit-writer'
import type {
  ConsentInput,
  ConsentStore,
  ConsentTransaction,
} from '../../../application/ports/consent'
import type { Principal } from '../../../domain/rules/access'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { PrismaAuditWriter } from './audit-writer'
import { currentDataDocument, dataConsentState } from './consent-state'

export async function recordConsentEvent(
  tx: Prisma.TransactionClient,
  input: ConsentInput,
) {
  const document = await tx.consentDocumentVersion.findUnique({
    where: { id: input.documentVersionId },
  })
  if (document?.kind !== 'data') throw new ApplicationError('CONFLICT')
  if (input.action !== 'revoke') {
    const current = await currentDataDocument(tx)
    if (current?.id !== document.id) throw new ApplicationError('CONFLICT')
  } else {
    const accepted = await tx.consentEvent.findFirst({
      where: {
        patientId: input.patientId,
        documentVersionId: document.id,
        action: 'accept',
      },
      select: { id: true },
    })
    if (!accepted) throw new ApplicationError('CONFLICT')
  }
  const id = input.eventId ?? randomUUID()
  if (input.source === 'onsite' && input.action === 'accept') {
    if (!input.signedFileId) throw new ApplicationError('UNPROCESSABLE_FILE')
    const file = await tx.fileObject.findUnique({
      where: { id: input.signedFileId },
    })
    if (
      file?.category !== 'attachment' ||
      file.linkedResourceType !== 'ConsentEvent' ||
      file.linkedResourceId !== id ||
      file.revokedAt ||
      (file.ownerPatientId && file.ownerPatientId !== input.patientId)
    )
      throw new ApplicationError('UNPROCESSABLE_FILE')
    await tx.fileObject.update({
      where: { id: file.id },
      data: { ownerPatientId: input.patientId },
    })
  }
  const event = await tx.consentEvent.create({
    data: {
      id,
      patientId: input.patientId,
      documentVersionId: document.id,
      action: input.action,
      actorUserId: input.actorUserId,
      source: input.source,
      guardianLinkId: input.guardianLinkId ?? null,
      consentingPersonName: input.consentingPersonName,
      consentingRelationship: input.consentingRelationship ?? null,
      signedFileId: input.signedFileId ?? null,
    },
  })
  return { id: event.id, state: await dataConsentState(tx, input.patientId) }
}

export class PrismaConsentStore implements ConsentStore {
  constructor(private readonly db: PrismaClient) {}

  async current() {
    const document = await currentDataDocument(this.db)
    return document
      ? {
          id: document.id,
          version: document.version,
          body: document.bodyReference,
          effectiveAt: document.effectiveAt,
        }
      : null
  }

  async publish(input: {
    version: string
    bodyReference: string
    effectiveAt: Date
    actorId: string
    requestId: string
  }) {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
        const current = await currentDataDocument(tx)
        if (current && input.effectiveAt <= current.effectiveAt)
          throw new ApplicationError('CONFLICT')
        const document = await tx.consentDocumentVersion.create({
          data: {
            kind: 'data',
            version: input.version,
            bodyReference: input.bodyReference,
            effectiveAt: input.effectiveAt,
            publishedBy: input.actorId,
          },
        })
        await new PrismaAuditWriter(tx).append({
          actorUserId: input.actorId,
          actorRoles: ['admin'],
          requestId: input.requestId,
          authorizationBasis: 'role:admin',
          action: 'consent.document_published',
          resourceType: 'ConsentDocumentVersion',
          resourceId: document.id,
        })
        return {
          id: document.id,
          version: document.version,
          effectiveAt: document.effectiveAt,
        }
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ApplicationError('CONFLICT')
      throw error
    }
  }

  transaction<T>(run: (tx: ConsentTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
      return run({
        ownsPatient: async (userId, patientId) =>
          !!(await tx.patientProfile.findFirst({
            where: {
              id: patientId,
              OR: [
                { userId },
                {
                  guardians: {
                    some: {
                      guardianUserId: userId,
                      status: 'active',
                      endedAt: null,
                    },
                  },
                },
              ],
            },
            select: { id: true },
          })),
        patient: (id) =>
          tx.patientProfile.findUnique({
            where: { id },
            select: { id: true, fullName: true, birthDate: true },
          }),
        guardianLink: (userId, patientId) =>
          tx.guardianLink.findFirst({
            where: {
              guardianUserId: userId,
              patientId,
              status: 'active',
              endedAt: null,
            },
            select: { id: true, relationship: true },
          }),
        actorName: async (userId) =>
          (
            await tx.user.findUnique({
              where: { id: userId },
              select: { fullName: true },
            })
          )?.fullName ?? null,
        revokeSessionsForPatient: async (patientId) => {
          const patient = await tx.patientProfile.findUnique({
            where: { id: patientId },
            select: { userId: true },
          })
          if (patient?.userId)
            await tx.session.updateMany({
              where: { userId: patient.userId, revokedAt: null },
              data: { revokedAt: new Date() },
            })
        },
        record: (input) => recordConsentEvent(tx, input),
        audit: new PrismaAuditWriter(tx),
      })
    })
  }

  async history(actor: Principal, context: AuditContext) {
    return this.db.$transaction(async (tx) => {
      const userId = actor.userId
      const rows = await tx.consentEvent.findMany({
        where: {
          patient: {
            OR: [
              { userId },
              {
                guardians: {
                  some: {
                    guardianUserId: userId,
                    status: 'active',
                    endedAt: null,
                  },
                },
              },
            ],
          },
        },
        include: { documentVersion: true },
        orderBy: { sequence: 'desc' },
        take: 100,
      })
      await new PrismaAuditWriter(tx).append({
        ...context,
        actorUserId: userId,
        actorRoles: actor.roles,
        authorizationBasis: 'patient:self-or-guardian',
        action: 'consent.history_viewed',
        resourceType: 'ConsentEvent',
        resourceId: userId,
      })
      return rows.map((row) => ({
        patientId: row.patientId,
        consentEventId: row.id,
        version: row.documentVersion.version,
        action: row.action as 'accept' | 'refuse' | 'revoke',
        occurredAt: row.occurredAt,
        source: row.source,
      }))
    })
  }
}
