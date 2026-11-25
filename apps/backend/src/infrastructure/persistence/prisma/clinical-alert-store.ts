import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type {
  ClinicalAlertStore,
  ClinicalAlertTransaction,
} from '../../../application/ports/clinical-alerts'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import {
  activeClinicalAlertFilter,
  clinicalAlertInclude,
  projectClinicalAlert,
} from './clinical-alert-reader'
import type { PrismaClinicalRecordStore } from './clinical-record-store'
export class PrismaClinicalAlertStore implements ClinicalAlertStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly records: PrismaClinicalRecordStore,
    private readonly secrets: SecretBox,
  ) {}
  transaction<T>(
    run: (tx: ClinicalAlertTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction((tx) => run(this.scope(tx)))
  }
  scope(tx: Prisma.TransactionClient): ClinicalAlertTransaction {
    const read = async (id: string) => {
      const row = await tx.clinicalAlert.findUnique({
        where: { id },
        include: clinicalAlertInclude,
      })
      return row ? projectClinicalAlert(row, this.secrets) : null
    }
    return {
      ...this.records.scope(tx),
      alertSubject: (id) =>
        tx.clinicalAlert.findUnique({
          where: { id },
          select: { patientId: true },
        }),
      alertById: read,
      lockAlert: async (id) => {
        await tx.$queryRaw`SELECT "id" FROM "ClinicalAlert" WHERE "id"=${id}::uuid FOR UPDATE`
      },
      alertPage: async (patientId, query) => {
        const filter = {
          patientId,
          ...(query.active === true
            ? activeClinicalAlertFilter
            : query.active === false
              ? { events: { some: { kind: 'deactivated' } } }
              : {}),
        }
        let cursor: { createdAt: Date; id: string } | null = null
        if (query.cursor) {
          cursor = await tx.clinicalAlert.findFirst({
            where: { ...filter, id: query.cursor },
            select: { id: true, createdAt: true },
          })
          if (!cursor) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        }
        const rows = await tx.clinicalAlert.findMany({
          where: {
            ...filter,
            ...(cursor
              ? {
                  OR: [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
                }
              : {}),
          },
          include: clinicalAlertInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 31,
        })
        return {
          items: rows
            .slice(0, 30)
            .map((row) => projectClinicalAlert(row, this.secrets)),
          nextCursor: rows.length > 30 ? rows[29].id : null,
        }
      },
      createAlert: async (patientId, authorProfessionalId, input, now) => {
        const id = randomUUID()
        const row = await tx.clinicalAlert.create({
          data: {
            id,
            patientId,
            authorProfessionalId,
            kind: input.kind,
            verificationState: input.verificationState,
            createdAt: now,
            payloadEncrypted: this.secrets.seal(
              JSON.stringify({
                term: input.term,
                substanceCode: input.substanceCode ?? null,
              }),
              `clinical_alert:${id}`,
            ),
            events: {
              create: {
                id: randomUUID(),
                kind: 'created',
                version: 1,
                authorProfessionalId,
                createdAt: now,
              },
            },
          },
          include: clinicalAlertInclude,
        })
        return projectClinicalAlert(row, this.secrets)
      },
      appendAlertEvent: async (
        alertId,
        authorProfessionalId,
        kind,
        version,
        reason,
        now,
      ) => {
        const id = randomUUID()
        await tx.clinicalAlertEvent.create({
          data: {
            id,
            alertId,
            kind,
            version,
            authorProfessionalId,
            createdAt: now,
            reasonEncrypted: reason
              ? this.secrets.seal(reason, `clinical_alert_event:${id}`)
              : null,
          },
        })
        const result = await read(alertId)
        if (!result) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        return result
      },
    }
  }
}
