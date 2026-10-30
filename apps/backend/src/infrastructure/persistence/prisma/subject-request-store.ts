import { createHash } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditContext } from '../../../application/ports/audit-writer'
import type { SecretBox } from '../../../application/ports/secret-box'
import type {
  SubjectDecision,
  SubjectRequestStore,
} from '../../../application/ports/subject-requests'
import type { Principal } from '../../../domain/rules/access'
import type { PrismaClient } from '../../../generated/prisma/client'
import { PrismaAuditWriter } from './audit-writer'

const ownSubject = (userId: string) => ({
  OR: [
    { userId },
    {
      guardians: {
        some: { guardianUserId: userId, status: 'active', endedAt: null },
      },
    },
  ],
})

export class PrismaSubjectRequestStore implements SubjectRequestStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly box: SecretBox,
  ) {}

  async create(input: Parameters<SubjectRequestStore['create']>[0]) {
    return this.db.$transaction(async (tx) => {
      const subject = await tx.patientProfile.findFirst({
        where: { id: input.patientId, ...ownSubject(input.actor.userId) },
        select: { id: true },
      })
      if (!subject) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const item = await tx.dataSubjectRequest.create({
        data: {
          subjectPatientId: subject.id,
          requesterUserId: input.actor.userId,
          kind: input.kind,
          description: input.description,
          dueAt: input.dueAt,
        },
      })
      await new PrismaAuditWriter(tx).append({
        ...input.context,
        actorUserId: input.actor.userId,
        actorRoles: input.actor.roles,
        authorizationBasis: 'patient:own-or-guardian',
        action: 'privacy.request_created',
        resourceType: 'DataSubjectRequest',
        resourceId: item.id,
        subjectPatientId: subject.id,
        metadata: { category: input.kind },
      })
      return { requestId: item.id, status: item.status, dueAt: item.dueAt }
    })
  }

  async own(actor: Principal, context: AuditContext, cursor?: string) {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.dataSubjectRequest.findMany({
        where: { subject: ownSubject(actor.userId) },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        take: 51,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          subjectPatientId: true,
          kind: true,
          status: true,
          description: true,
          submittedAt: true,
          dueAt: true,
          completedAt: true,
          resolution: true,
          export: { select: { requestId: true } },
        },
      })
      await new PrismaAuditWriter(tx).append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        authorizationBasis: 'patient:own-or-guardian',
        action: 'privacy.own_requests_viewed',
        resourceType: 'DataSubjectRequest',
        resourceId: actor.userId,
        metadata: { count: rows.length },
      })
      return {
        items: rows.slice(0, 50).map(({ export: exported, ...row }) => ({
          ...row,
          exportReady: !!exported,
        })),
        nextCursor: rows.length > 50 ? rows[49]?.id : null,
      }
    })
  }

  async queue(
    actor: Principal,
    input: Parameters<SubjectRequestStore['queue']>[1],
    context: AuditContext,
  ) {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.dataSubjectRequest.findMany({
        where: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.overdue
            ? { dueAt: { lt: new Date() }, status: 'open' }
            : {}),
        },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        take: 51,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          subjectPatientId: true,
          requesterUserId: true,
          kind: true,
          status: true,
          submittedAt: true,
          dueAt: true,
          handledBy: true,
          completedAt: true,
          resolution: true,
        },
      })
      await new PrismaAuditWriter(tx).append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        authorizationBasis: actor.permissions.includes('privacy.dpo')
          ? 'permission:privacy.dpo'
          : 'admin:no-dpo',
        action: 'privacy.request_queue_viewed',
        resourceType: 'DataSubjectRequest',
        resourceId: actor.userId,
        metadata: { count: rows.length },
      })
      return {
        items: rows.slice(0, 50),
        nextCursor: rows.length > 50 ? rows[49]?.id : null,
      }
    })
  }

  async consentMetadata(
    actor: Principal,
    input: Parameters<SubjectRequestStore['consentMetadata']>[1],
    context: AuditContext,
  ) {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.consentEvent.findMany({
        where: {
          ...(input.patientId ? { patientId: input.patientId } : {}),
          ...(input.action ? { action: input.action } : {}),
          ...(input.from || input.to
            ? {
                occurredAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lte: input.to } : {}),
                },
              }
            : {}),
        },
        orderBy: [{ sequence: 'desc' }],
        take: 51,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          patientId: true,
          action: true,
          actorUserId: true,
          source: true,
          occurredAt: true,
          documentVersion: { select: { version: true } },
        },
      })
      await new PrismaAuditWriter(tx).append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        authorizationBasis: 'permission:privacy.dpo',
        action: 'privacy.consent_metadata_viewed',
        resourceType: 'ConsentEvent',
        resourceId: input.patientId ?? actor.userId,
        subjectPatientId: input.patientId,
        metadata: { count: rows.length },
      })
      return {
        items: rows.slice(0, 50).map(({ documentVersion, ...row }) => ({
          ...row,
          version: documentVersion.version,
        })),
        nextCursor: rows.length > 50 ? rows[49]?.id : null,
      }
    })
  }

  async resolve(
    actor: Principal,
    id: string,
    decision: SubjectDecision,
    explanation: string,
    context: AuditContext,
  ) {
    return this.db.$transaction(async (tx) => {
      const item = await tx.dataSubjectRequest.findUnique({ where: { id } })
      if (!item) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      if (item.status !== 'open') throw new ApplicationError('CONFLICT')
      if (item.kind === 'erasure' && decision !== 'retained')
        throw new ApplicationError('CONFLICT')
      if (
        item.kind === 'correction' &&
        !['referred', 'denied'].includes(decision)
      )
        throw new ApplicationError('CONFLICT')
      if (['export', 'access'].includes(item.kind) && decision === 'approved') {
        const profile = await tx.patientProfile.findUniqueOrThrow({
          where: { id: item.subjectPatientId },
          select: {
            id: true,
            fullName: true,
            birthDate: true,
            cpf: true,
            phone: true,
            email: true,
            status: true,
          },
        })
        const consents = await tx.consentEvent.findMany({
          where: { patientId: item.subjectPatientId },
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            action: true,
            occurredAt: true,
            source: true,
            documentVersion: { select: { version: true } },
          },
        })
        const payload = JSON.stringify({
          format: 'VidaPlena.SubjectExport.v1',
          generatedAt: new Date().toISOString(),
          patient: profile,
          consents: consents.map(({ documentVersion, ...event }) => ({
            ...event,
            version: documentVersion.version,
          })),
          scope: 'M0 identity and consent',
        })
        await tx.dataSubjectExport.create({
          data: {
            requestId: id,
            payloadEncrypted: this.box.seal(payload, `subject-export:${id}`),
            sha256: createHash('sha256').update(payload).digest('hex'),
          },
        })
      }
      const resolution = {
        decision,
        explanation,
        deleted: [] as string[],
        preserved:
          item.kind === 'erasure'
            ? [
                'patient.identity',
                'consent.history',
                'audit.history',
                'clinical.record',
                'fiscal.data',
              ]
            : ([] as string[]),
      }
      const changed = await tx.dataSubjectRequest.updateMany({
        where: { id, status: 'open' },
        data: {
          status: 'resolved',
          handledBy: actor.userId,
          resolution,
          completedAt: new Date(),
        },
      })
      if (changed.count !== 1) throw new ApplicationError('CONFLICT')
      await new PrismaAuditWriter(tx).append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        authorizationBasis: actor.permissions.includes('privacy.dpo')
          ? 'permission:privacy.dpo'
          : 'admin:no-dpo',
        action: 'privacy.request_resolved',
        resourceType: 'DataSubjectRequest',
        resourceId: id,
        subjectPatientId: item.subjectPatientId,
        metadata: { status: decision },
      })
      return {
        requestId: id,
        status: 'resolved',
        resolution,
        exportReady:
          ['export', 'access'].includes(item.kind) && decision === 'approved',
      }
    })
  }

  async exportFor(actor: Principal, id: string, context: AuditContext) {
    return this.db.$transaction(async (tx) => {
      const item = await tx.dataSubjectRequest.findFirst({
        where: {
          id,
          requesterUserId: actor.userId,
          subject: ownSubject(actor.userId),
        },
        select: {
          subjectPatientId: true,
          export: { select: { payloadEncrypted: true, sha256: true } },
        },
      })
      if (!item?.export) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      const payload = this.box.open(
        item.export.payloadEncrypted,
        `subject-export:${id}`,
      )
      if (
        createHash('sha256').update(payload).digest('hex') !==
        item.export.sha256
      )
        throw new ApplicationError('SERVICE_UNAVAILABLE')
      await new PrismaAuditWriter(tx).append({
        ...context,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        authorizationBasis: 'patient:requester',
        action: 'privacy.export_downloaded',
        resourceType: 'DataSubjectExport',
        resourceId: id,
        subjectPatientId: item.subjectPatientId,
      })
      return payload
    })
  }
}
