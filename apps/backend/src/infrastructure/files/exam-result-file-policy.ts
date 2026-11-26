import { ApplicationError } from '../../application/errors/application-error'
import type { AuditContext } from '../../application/ports/audit-writer'
import type {
  FileAccessPolicy,
  FileCategory,
  FileRecord,
} from '../../application/ports/files'
import type { ManageExamResults } from '../../application/use-cases/manage-exam-results'
import type { Principal } from '../../domain/rules/access'
export class ExamResultFilePolicy implements FileAccessPolicy {
  constructor(
    private readonly results: ManageExamResults,
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
    if (input.linkedResourceType !== 'ExamResult')
      return this.fallback.canUpload(actor, input)
    return actor && input.patientId && input.category === 'result'
      ? this.results.canUpload(actor, input.patientId)
      : Promise.resolve(false)
  }
  async canDownload(
    actor: Principal,
    file: FileRecord,
    context?: AuditContext,
  ): Promise<boolean | { authorizationBasis: string }> {
    if (file.linkedResourceType !== 'ExamResult')
      return this.fallback.canDownload(actor, file, context)
    if (
      !context ||
      (['staging', 'production'].includes(this.environment) &&
        file.scanStatus !== 'clean')
    )
      return false
    try {
      return await this.results.fileBasis(actor, file, context)
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        ['FORBIDDEN', 'NOT_FOUND_OR_FORBIDDEN'].includes(error.code)
      )
        return false
      throw error
    }
  }
}
