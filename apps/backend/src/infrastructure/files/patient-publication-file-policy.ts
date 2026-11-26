import { ApplicationError } from '../../application/errors/application-error'
import type { AuditContext } from '../../application/ports/audit-writer'
import type {
  FileAccessPolicy,
  FileCategory,
  FileRecord,
} from '../../application/ports/files'
import type { ManagePatientPublications } from '../../application/use-cases/manage-patient-publications'
import type { Principal } from '../../domain/rules/access'
export class PatientPublicationFilePolicy implements FileAccessPolicy {
  constructor(
    private readonly publications: ManagePatientPublications,
    private readonly fallback: FileAccessPolicy,
    private readonly environment: string,
  ) {}
  canUpload(
    actor: Principal | null,
    input: {
      category: FileCategory
      patientId: string | null
      linkedResourceType: string
    },
  ) {
    return this.fallback.canUpload(actor, input)
  }
  async canDownload(
    actor: Principal,
    file: FileRecord,
    context?: AuditContext,
  ): Promise<boolean | { authorizationBasis: string }> {
    if (
      !actor.roles.includes('patient') ||
      !['ClinicalDocument', 'ExamResult'].includes(file.linkedResourceType)
    )
      return this.fallback.canDownload(actor, file, context)
    if (
      !context ||
      (['staging', 'production'].includes(this.environment) &&
        file.scanStatus !== 'clean')
    )
      return false
    try {
      return await this.publications.fileBasis(actor, file, context)
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN'].includes(error.code)
      )
        return actor.roles.includes('professional')
          ? this.fallback.canDownload(actor, file, context)
          : false
      throw error
    }
  }
}
