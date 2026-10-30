import type { ManageFiles } from '../../application/use-cases/manage-files'
import type { PrismaClient } from '../../generated/prisma/client'

export class ConsentEvidenceReconciler {
  constructor(
    private readonly db: PrismaClient,
    private readonly files: ManageFiles,
    private readonly staleMinutes: number,
    private readonly now = () => new Date(),
  ) {}

  async runOnce() {
    const cutoff = new Date(this.now().getTime() - this.staleMinutes * 60_000)
    const orphans = await this.db.fileObject.findMany({
      where: {
        linkedResourceType: 'ConsentEvent',
        createdAt: { lt: cutoff },
        consentEvidence: { is: null },
      },
      select: { id: true },
      take: 100,
    })
    for (const orphan of orphans) await this.files.discardUnlinked(orphan.id)
    return orphans.length
  }
}
