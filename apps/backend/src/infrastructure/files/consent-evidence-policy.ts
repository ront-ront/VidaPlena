import type {
  FileAccessPolicy,
  FileRecord,
} from '../../application/ports/files'
import type { Principal } from '../../domain/rules/access'
import type { PrismaClient } from '../../generated/prisma/client'
import { dataConsentState } from '../persistence/prisma/consent-state'

export class ConsentEvidenceFilePolicy implements FileAccessPolicy {
  constructor(
    private readonly db: PrismaClient,
    private readonly environment: string,
  ) {}

  async canUpload(
    actor: Principal | null,
    input: {
      category: 'attachment' | 'result' | 'recording'
      linkedResourceType: string
    },
  ) {
    return !!(
      actor?.mfaVerified &&
      actor.roles.some((role) => role === 'admin' || role === 'receptionist') &&
      input.category === 'attachment' &&
      input.linkedResourceType === 'ConsentEvent'
    )
  }

  async canDownload(actor: Principal, file: FileRecord) {
    if (
      !actor.roles.includes('patient') ||
      file.linkedResourceType !== 'ConsentEvent' ||
      file.category !== 'attachment' ||
      !file.ownerPatientId ||
      (['staging', 'production'].includes(this.environment) &&
        file.scanStatus !== 'clean') ||
      (await dataConsentState(this.db, file.ownerPatientId)) !== 'active'
    )
      return false
    return !!(await this.db.patientProfile.findFirst({
      where: {
        id: file.ownerPatientId,
        OR: [
          { userId: actor.userId },
          {
            guardians: {
              some: {
                guardianUserId: actor.userId,
                status: 'active',
                endedAt: null,
              },
            },
          },
        ],
      },
      select: { id: true },
    }))
  }
}
