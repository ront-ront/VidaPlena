import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../application/errors/application-error'
import type {
  AuditContext,
  AuditWriter,
} from '../../application/ports/audit-writer'
import type { ClinicalRecordStore } from '../../application/ports/clinical-records'
import type {
  FileAccessPolicy,
  FileCategory,
  FileRecord,
} from '../../application/ports/files'
import {
  type AuthorizeClinical,
  clinicalBasisId,
} from '../../application/use-cases/authorize-clinical'
import { mayAccess, type Principal } from '../../domain/rules/access'
import type { PrismaClient } from '../../generated/prisma/client'

export class ClinicalFilePolicy implements FileAccessPolicy {
  constructor(
    private readonly db: PrismaClient,
    private readonly clinical: ClinicalRecordStore,
    private readonly authorization: AuthorizeClinical,
    private readonly audit: AuditWriter,
    private readonly fallback: FileAccessPolicy,
    private readonly environment: string,
  ) {}
  async canUpload(
    actor: Principal | null,
    input: {
      category: FileCategory
      patientId: string | null
      linkedResourceType: string
    },
  ) {
    if (input.linkedResourceType !== 'ImportedHistory')
      return this.fallback.canUpload(actor, input)
    if (!actor || input.category !== 'attachment' || !input.patientId)
      return false
    return this.clinical.transaction(async (tx) => {
      const current = await tx.principal(actor)
      return (
        !!current &&
        mayAccess(current, 'import_patients') &&
        (await tx.patientExists(input.patientId as string))
      )
    })
  }
  async canDownload(
    actor: Principal,
    file: FileRecord,
    context?: AuditContext,
  ): Promise<boolean | { authorizationBasis: string }> {
    if (file.linkedResourceType !== 'ImportedHistory')
      return this.fallback.canDownload(actor, file, context)
    const auditContext = context ?? {
      requestId: randomUUID(),
      actorRoles: [],
      originClient: 'internal',
      authorizationBasis: 'session',
    }
    try {
      return await this.clinical.transaction(async (tx) => {
        if (
          file.category !== 'attachment' ||
          !file.ownerPatientId ||
          (['staging', 'production'].includes(this.environment) &&
            file.scanStatus !== 'clean')
        )
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const basis = await this.authorization.basis(
          tx,
          actor,
          file.ownerPatientId,
        )
        if (basis.phase === 'pre')
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const history = await this.db.importedHistory.findFirst({
          where: {
            id: file.linkedResourceId,
            fileId: file.id,
            record: { patientId: file.ownerPatientId },
          },
          select: { id: true },
        })
        if (!history) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        return { authorizationBasis: clinicalBasisId(basis) }
      })
    } catch (error) {
      if (
        !(error instanceof ApplicationError) ||
        !['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN'].includes(error.code)
      )
        throw error
      await this.audit.append({
        ...auditContext,
        actorUserId: actor.userId,
        actorRoles: actor.roles,
        action: 'authorization.denied',
        resourceType: 'FileObject',
        resourceId: file.id,
        authorizationBasis: 'denied',
      })
      return false
    }
  }
}
