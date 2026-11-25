import { ApplicationError } from '../../application/errors/application-error'
import type { AuditContext } from '../../application/ports/audit-writer'
import type {
  FileAccessPolicy,
  FileCategory,
  FileRecord,
} from '../../application/ports/files'
import type { ManageClinicalEvolutions } from '../../application/use-cases/manage-clinical-evolutions'
import type { Principal } from '../../domain/rules/access'
export class EvolutionFilePolicy implements FileAccessPolicy {
  constructor(
    private readonly evolutions: ManageClinicalEvolutions,
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
    if (file.linkedResourceType !== 'ClinicalEvolution')
      return this.fallback.canDownload(actor, file, context)
    if (
      !context ||
      (['staging', 'production'].includes(this.environment) &&
        file.scanStatus !== 'clean')
    )
      return false
    try {
      return await this.evolutions.fileBasis(actor, file, context)
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
