import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type {
  TerminologyCatalog,
  TerminologyStore,
  TerminologyTransaction,
} from '../../../application/ports/terminologies'
import {
  type TerminologyKind,
  terminologySearch,
} from '../../../domain/rules/terminology'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PrismaCareLinkStore } from './care-link-store'

type CatalogRow = {
  id: string
  terminology: string
  version: string
  source: string
  license: string
  demo: boolean
  checksum: string
}
const catalog = (row: CatalogRow): TerminologyCatalog => ({
  ...row,
  terminology: row.terminology as TerminologyKind,
})
export class PrismaTerminologyStore implements TerminologyStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly links: PrismaCareLinkStore,
  ) {}
  transaction<T>(run: (tx: TerminologyTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction((tx) => run(this.scope(tx)))
  }
  scope(tx: Prisma.TransactionClient): TerminologyTransaction {
    const identity = this.links.scope(tx)
    return {
      principal: identity.principal,
      professional: identity.professional,
      audit: identity.audit,
      lockTerminology: async (kind) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`terminology:${kind}`},0))`
      },
      catalogVersion: async (terminology, version) => {
        const row = await tx.terminologyCatalog.findUnique({
          where: { terminology_version: { terminology, version } },
        })
        return row ? catalog(row) : null
      },
      activeCatalog: async (terminology, allowDemo) => {
        const selection = await tx.terminologySelection.findUnique({
          where: { terminology },
          include: { catalog: true },
        })
        return selection && (allowDemo || !selection.catalog.demo)
          ? catalog(selection.catalog)
          : null
      },
      createCatalog: async (dataset, checksum) => {
        const { entries, ...metadata } = dataset,
          row = await tx.terminologyCatalog.create({
            data: { ...metadata, checksum },
          })
        const data = entries.map((e) => ({
          ...e,
          id: randomUUID(),
          catalogId: row.id,
          searchText: terminologySearch(`${e.code} ${e.description}`),
        }))
        if (dataset.terminology === 'CID10')
          await tx.diagnosisCode.createMany({ data })
        else await tx.procedureCode.createMany({ data })
        return catalog(row)
      },
      activateCatalog: async (row) => {
        await tx.terminologySelection.upsert({
          where: { terminology: row.terminology },
          create: { terminology: row.terminology, catalogId: row.id },
          update: { catalogId: row.id },
        })
      },
      terminologyPage: async (row, query) => {
        const where = {
            catalogId: row.id,
            active: true,
            searchText: { contains: terminologySearch(query.q ?? '') },
          },
          cursorWhere = { ...where, id: query.cursor }
        const cursor = query.cursor
          ? row.terminology === 'CID10'
            ? await tx.diagnosisCode.findFirst({ where: cursorWhere })
            : await tx.procedureCode.findFirst({ where: cursorWhere })
          : null
        if (query.cursor && !cursor)
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const scoped = {
          ...where,
          ...(cursor
            ? {
                OR: [
                  { code: { gt: cursor.code } },
                  { code: cursor.code, id: { gt: cursor.id } },
                ],
              }
            : {}),
        }
        const args = {
          where: scoped,
          orderBy: [{ code: 'asc' as const }, { id: 'asc' as const }],
          take: 31,
          select: { id: true, code: true, description: true },
        }
        const rows =
          row.terminology === 'CID10'
            ? await tx.diagnosisCode.findMany(args)
            : await tx.procedureCode.findMany(args)
        return {
          items: rows
            .slice(0, 30)
            .map(({ code, description }) => ({ code, description })),
          nextCursor: rows.length > 30 ? rows[29].id : null,
        }
      },
      terminologyCode: async (row, code) => {
        const args = {
          where: { catalogId: row.id, code, active: true },
          select: { code: true, description: true },
        }
        return row.terminology === 'CID10'
          ? tx.diagnosisCode.findFirst(args)
          : tx.procedureCode.findFirst(args)
      },
    }
  }
}
