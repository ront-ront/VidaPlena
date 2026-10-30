import type { IdentityReader } from '../../../application/ports/identity-reader'
import type { PrismaClient } from '../../../generated/prisma/client'

export class PrismaIdentityReader implements IdentityReader {
  constructor(private readonly db: PrismaClient) {}

  findByEmail(email: string) {
    return this.db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, fullName: true, status: true },
    })
  }

  async listDependents(guardianUserId: string) {
    const links = await this.db.guardianLink.findMany({
      where: { guardianUserId, status: 'active', endedAt: null },
      select: {
        patientId: true,
        relationship: true,
        patient: { select: { fullName: true } },
      },
    })
    return links.map(({ patientId, relationship, patient }) => ({
      patientId,
      relationship,
      fullName: patient.fullName,
    }))
  }
}
