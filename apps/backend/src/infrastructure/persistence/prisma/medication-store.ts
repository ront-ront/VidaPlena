import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type {
  MedicationEntry,
  MedicationStore,
  MedicationSubstance,
  MedicationTransaction,
} from '../../../application/ports/medications'
import { terminologySearch } from '../../../domain/rules/terminology'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PrismaCareLinkStore } from './care-link-store'

const entry = (row: {
  code: string
  name: string
  activeSubstances: Prisma.JsonValue
  active: boolean
  controlled: boolean
}): MedicationEntry => ({
  code: row.code,
  name: row.name,
  active: row.active,
  controlled: row.controlled,
  activeSubstances: row.activeSubstances as MedicationSubstance[],
})
export class PrismaMedicationStore implements MedicationStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly links: PrismaCareLinkStore,
  ) {}
  transaction<T>(run: (tx: MedicationTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction((tx) => run(this.scope(tx)))
  }
  scope(tx: Prisma.TransactionClient): MedicationTransaction {
    const identity = this.links.scope(tx)
    return {
      principal: identity.principal,
      professional: identity.professional,
      audit: identity.audit,
      lockMedications: async (shared = false) => {
        if (shared)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended('medications',0))`
        else
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('medications',0))`
      },
      medicationCatalogVersion: (version) =>
        tx.medicationCatalog.findUnique({ where: { version } }),
      activeMedicationCatalog: async (allowDemo) => {
        const row = await tx.medicationSelection.findUnique({
          where: { id: 'active' },
          include: { catalog: true },
        })
        return row && (allowDemo || !row.catalog.demo) ? row.catalog : null
      },
      createMedicationCatalog: async (dataset, checksum) => {
        const { entries, ...metadata } = dataset,
          row = await tx.medicationCatalog.create({
            data: { ...metadata, checksum },
          })
        await tx.medicationEntry.createMany({
          data: entries.map((e) => ({
            ...e,
            id: randomUUID(),
            catalogId: row.id,
            searchText: terminologySearch(
              `${e.code} ${e.name} ${e.activeSubstances.map((s) => `${s.code} ${s.description}`).join(' ')}`,
            ),
          })),
        })
        return row
      },
      activateMedicationCatalog: async (catalog) => {
        await tx.medicationSelection.upsert({
          where: { id: 'active' },
          create: { id: 'active', catalogId: catalog.id },
          update: { catalogId: catalog.id },
        })
      },
      medicationPage: async (catalog, query) => {
        const filter = {
          catalogId: catalog.id,
          active: true,
          searchText: { contains: terminologySearch(query.q ?? '') },
        }
        const cursor = query.cursor
          ? await tx.medicationEntry.findFirst({
              where: { ...filter, id: query.cursor },
              select: { code: true, id: true },
            })
          : null
        if (query.cursor && !cursor)
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const rows = await tx.medicationEntry.findMany({
          where: {
            ...filter,
            ...(cursor
              ? {
                  OR: [
                    { code: { gt: cursor.code } },
                    { code: cursor.code, id: { gt: cursor.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          take: 31,
        })
        return {
          items: rows.slice(0, 30).map(entry),
          nextCursor: rows.length > 30 ? rows[29].id : null,
        }
      },
      medicationEntry: async (catalog, code) => {
        const row = await tx.medicationEntry.findFirst({
          where: { catalogId: catalog.id, code, active: true },
        })
        return row ? entry(row) : null
      },
      knownMedicationSubstances: async (catalog) => {
        const rows = await tx.$queryRaw<
          { code: string }[]
        >`SELECT DISTINCT s->>'code' AS "code" FROM "MedicationEntry" m CROSS JOIN LATERAL jsonb_array_elements(m."activeSubstances") s WHERE m."catalogId"=${catalog.id}::uuid AND m."active"=true`
        return rows.map((r) => r.code)
      },
    }
  }
}
