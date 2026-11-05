import { ApplicationError } from '../../../application/errors/application-error'
import type {
  CatalogQuery,
  CatalogStore,
  CatalogTransaction,
  Modality,
  ProfessionalInput,
  SpecialtyInput,
} from '../../../application/ports/catalog'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { readPrincipal } from './access-store'
import { PrismaAuditWriter } from './audit-writer'

const includeProfessional = {
  user: { select: { fullName: true } },
  specialties: { where: { active: true }, include: { specialty: true } },
} as const
type Profile = Prisma.ProfessionalProfileGetPayload<{
  include: typeof includeProfessional
}>
function professional(row: Profile) {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.user.fullName,
    councilType: row.councilType,
    councilNumber: row.councilNumber,
    councilRegion: row.councilRegion,
    active: row.active,
    modalities: row.modalities,
    specialtyIds: row.specialties.map((s) => s.specialtyId),
    version: row.version,
  }
}
function page<T extends { id: string }>(rows: T[]) {
  return {
    items: rows.slice(0, 30),
    nextCursor: rows.length > 30 ? rows[29].id : null,
  }
}
export class PrismaCatalogStore implements CatalogStore {
  constructor(private readonly db: PrismaClient) {}

  async specialties(query: CatalogQuery) {
    return page(
      await this.db.specialty.findMany({
        where: {
          active: query.active,
          ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 31,
      }),
    )
  }

  async professionals(
    query: CatalogQuery & { specialtyId?: string; modality?: Modality },
    administrative: boolean,
  ) {
    const choices = query.modality
      ? [query.modality]
      : (['onsite', 'remote'] as const)
    const where: Prisma.ProfessionalProfileWhereInput = {
      active: query.active,
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      ...(query.specialtyId
        ? {
            specialties: {
              some: { specialtyId: query.specialtyId, active: true },
            },
          }
        : {}),
      ...(!administrative
        ? {
            user: {
              status: 'active',
              roles: { some: { roleCode: 'professional', revokedAt: null } },
            },
            OR: choices.map((modality) => ({
              modalities: { has: modality },
              specialties: {
                some: {
                  active: true,
                  specialty: {
                    active: true,
                    allowedModalities: { has: modality },
                    ...(query.specialtyId ? { id: query.specialtyId } : {}),
                  },
                },
              },
            })),
          }
        : {}),
    }
    const rows = await this.db.professionalProfile.findMany({
      where,
      include: includeProfessional,
      orderBy: { id: 'asc' },
      take: 31,
    })
    return page(
      rows.map((row) => {
        const result = professional(row)
        if (administrative) return result
        const visible = row.specialties.filter(
          (s) =>
            s.specialty.active &&
            s.specialty.allowedModalities.some((m) =>
              row.modalities.includes(m),
            ),
        )
        return {
          ...result,
          specialtyIds: visible.map((s) => s.specialtyId),
          modalities: row.modalities.filter((m) =>
            visible.some((s) => s.specialty.allowedModalities.includes(m)),
          ),
        }
      }),
    )
  }

  async transaction<T>(
    run: (tx: CatalogTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(async (tx) => {
        // Same lock as role changes: account eligibility cannot change during a catalog write.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(775001)`
        return run({
          principal: (actor) =>
            readPrincipal(tx, actor.userId, actor.sessionId),
          professionalAccount: async (userId) =>
            !!(await tx.user.findFirst({
              where: {
                id: userId,
                status: { in: ['active', 'invited'] },
                roles: { some: { roleCode: 'professional', revokedAt: null } },
              },
              select: { id: true },
            })),
          specialty: (id) => tx.specialty.findUnique({ where: { id } }),
          professional: async (id) => {
            const row = await tx.professionalProfile.findUnique({
              where: { id },
              include: includeProfessional,
            })
            return row ? professional(row) : null
          },
          saveSpecialty: async (input: SpecialtyInput, id?: string) => {
            const data = {
              code: input.code,
              name: input.name,
              active: input.active,
              allowedModalities: input.allowedModalities,
              defaultMinutesFirst: input.defaultMinutesFirst,
              defaultMinutesReturn: input.defaultMinutesReturn,
            }
            return id
              ? tx.specialty.update({
                  where: { id },
                  data: { ...data, version: { increment: 1 } },
                })
              : tx.specialty.create({ data })
          },
          saveProfessional: async (input: ProfessionalInput, id?: string) => {
            const data = {
              userId: input.userId,
              councilType: input.councilType,
              councilNumber: input.councilNumber,
              councilRegion: input.councilRegion,
              active: input.active,
              modalities: input.modalities,
            }
            const row = id
              ? await tx.professionalProfile.update({
                  where: { id },
                  data: { ...data, version: { increment: 1 } },
                })
              : await tx.professionalProfile.create({ data })
            await tx.professionalSpecialty.updateMany({
              where: {
                professionalId: row.id,
                specialtyId: { notIn: input.specialtyIds },
              },
              data: { active: false },
            })
            for (const specialtyId of input.specialtyIds)
              await tx.professionalSpecialty.upsert({
                where: {
                  professionalId_specialtyId: {
                    professionalId: row.id,
                    specialtyId,
                  },
                },
                create: { professionalId: row.id, specialtyId },
                update: { active: true },
              })
            const saved = await tx.professionalProfile.findUniqueOrThrow({
              where: { id: row.id },
              include: includeProfessional,
            })
            return professional(saved)
          },
          affectedAppointments: async () => [],
          audit: new PrismaAuditWriter(tx),
        })
      })
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ApplicationError('CONFLICT')
      throw error
    }
  }
}
