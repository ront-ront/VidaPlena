import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type {
  ClinicalRecord,
  ClinicalRecordStore,
  ClinicalRecordTransaction,
  TimelineItem,
  TimelineQuery,
  TimelineType,
} from '../../../application/ports/clinical-records'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { CareLinkPolicy } from '../../../domain/rules/care-link'
import { Prisma, type PrismaClient } from '../../../generated/prisma/client'
import { syncAppointmentCareLink } from './care-link-store'
import type { PrismaEmergencyAccessStore } from './emergency-access-store'

type TimelineRow = {
  id: string
  resourceId: string
  type: TimelineType
  date: Date
  professionalId: string | null
  specialtyId: string | null
  modality: 'onsite' | 'remote' | null
  summaryEncrypted: string | null
  importedOriginEncrypted: string | null
  visitType: string | null
  bookingSource: string | null
  createdAt: Date | null
  createdBy: string | null
}
export class PrismaClinicalRecordStore implements ClinicalRecordStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly emergency: PrismaEmergencyAccessStore,
    private readonly secrets: SecretBox,
    private readonly linkPolicy: CareLinkPolicy,
  ) {}
  transaction<T>(
    run: (tx: ClinicalRecordTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction((tx) => run(this.scope(tx)))
  }
  scope(tx: Prisma.TransactionClient): ClinicalRecordTransaction {
    return {
      ...this.emergency.scope(tx),
      record: async (patientId) => {
        const prior = await tx.clinicalRecord.findUnique({
          where: { patientId },
        })
        if (prior) return prior
        const id = randomUUID()
        return tx.clinicalRecord.create({
          data: { id, patientId, recordNumber: `VP-${id.toUpperCase()}` },
        })
      },
      appendTimeline: async (input) => {
        const { summary, importedOrigin, ...data } = input,
          id = randomUUID()
        return tx.clinicalTimelineEntry.create({
          data: {
            ...data,
            id,
            summaryEncrypted: this.secrets.seal(
              summary,
              `clinical_timeline:${id}`,
            ),
            importedOriginEncrypted: importedOrigin
              ? this.secrets.seal(
                  JSON.stringify(importedOrigin),
                  `clinical_origin:${id}`,
                )
              : null,
          },
          select: { id: true },
        })
      },
      identification: async (patientId) => {
        const patient = await tx.patientProfile.findUnique({
          where: { id: patientId },
          select: { id: true, fullName: true, birthDate: true },
        })
        return patient
          ? {
              id: patient.id,
              name: patient.fullName,
              birthDate: patient.birthDate.toISOString().slice(0, 10),
            }
          : null
      },
      lastEncounterAt: async (patientId) => {
        const [row] = await tx.$queryRaw<
          { last: Date | null }[]
        >`SELECT MAX(COALESCE(e."endedAt",a."endsAt")) AS last FROM "Appointment" a LEFT JOIN "ClinicalEncounter" e ON e."appointmentId"=a."id" WHERE a."patientId"=${patientId}::uuid AND a."status"='completed'`
        return row.last
      },
      hasHistory: async (record) =>
        !!(await tx.appointment.findFirst({
          where: { patientId: record.patientId, status: 'completed' },
          select: { id: true },
        })) ||
        !!(await tx.clinicalTimelineEntry.findFirst({
          where: { recordId: record.id },
          select: { id: true },
        })),
      currentEncounter: (recordId, professionalId) =>
        tx.clinicalEncounter.findFirst({
          where: { recordId, professionalId, status: 'in_progress' },
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        }),
      criticalAlerts: async () => [],
      timeline: (record, query) => this.timeline(tx, record, query),
      lockAppointment: async (id) => {
        await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id"=${id}::uuid FOR UPDATE`
      },
      clinicalAppointment: (id) => tx.appointment.findUnique({ where: { id } }),
      encounterByAppointment: (appointmentId) =>
        tx.clinicalEncounter.findUnique({ where: { appointmentId } }),
      startEncounter: async (record, appointment, actor, now, context) => {
        const encounter = await tx.clinicalEncounter.create({
          data: {
            recordId: record.id,
            appointmentId: appointment.id,
            professionalId: appointment.professionalId,
            startedAt: now,
          },
        })
        const next = await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: 'in_service', version: { increment: 1 } },
        })
        const history = await tx.appointmentHistory.create({
          data: {
            appointmentId: appointment.id,
            action: 'started',
            previous: {
              status: appointment.status,
              version: appointment.version,
            },
            next: { status: next.status, version: next.version },
            actorUserId: actor.userId,
            origin: 'clinic',
            occurredAt: now,
          },
        })
        // Caller performs the clinical audit; link hook carries the originating request.
        await syncAppointmentCareLink(tx, next, this.linkPolicy, actor, {
          ...context,
          authorizationBasis: `appointment_history:${history.id}`,
        })
        return encounter
      },
    }
  }
  private source(record: ClinicalRecord) {
    return Prisma.sql`(
      SELECT a."id",a."id" AS "resourceId",'encounter'::text AS "type",COALESCE(e."endedAt",a."endsAt") AS "date",
        a."professionalId",a."specialtyId",a."modality",NULL::text AS "summaryEncrypted",NULL::text AS "importedOriginEncrypted",
        a."visitType",a."bookingSource",a."createdAt",a."createdBy"
      FROM "Appointment" a LEFT JOIN "ClinicalEncounter" e ON e."appointmentId"=a."id"
      WHERE a."patientId"=${record.patientId}::uuid AND a."status"='completed'
      UNION ALL
      SELECT t."id",t."resourceId",t."type",t."occurredAt" AS "date",t."professionalId",t."specialtyId",t."modality",t."summaryEncrypted",t."importedOriginEncrypted",
        NULL::text,NULL::text,NULL::timestamptz,NULL::uuid
      FROM "ClinicalTimelineEntry" t WHERE t."recordId"=${record.id}::uuid
    ) AS items`
  }
  private async timeline(
    tx: Prisma.TransactionClient,
    record: ClinicalRecord,
    query: TimelineQuery,
  ) {
    const conditions = [Prisma.sql`TRUE`]
    if (query.from)
      conditions.push(Prisma.sql`items."date">=${new Date(query.from)}`)
    if (query.to)
      conditions.push(Prisma.sql`items."date"<${new Date(query.to)}`)
    if (query.specialtyId)
      conditions.push(
        Prisma.sql`items."specialtyId"=${query.specialtyId}::uuid`,
      )
    if (query.type) conditions.push(Prisma.sql`items."type"=${query.type}`)
    const filters = Prisma.join(conditions, ' AND '),
      source = this.source(record)
    let seek = Prisma.sql`TRUE`
    if (query.cursor) {
      const [type, id] = query.cursor.split(':')
      const [cursor] = await tx.$queryRaw<TimelineRow[]>(
        Prisma.sql`SELECT * FROM ${source} WHERE ${filters} AND items."id"=${id}::uuid AND items."type"=${type} LIMIT 1`,
      )
      if (!cursor) throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
      seek = Prisma.sql`(items."date",items."id",items."type")<(${cursor.date},${cursor.id}::uuid,${cursor.type})`
    }
    const rows = await tx.$queryRaw<TimelineRow[]>(
      Prisma.sql`SELECT * FROM ${source} WHERE ${filters} AND ${seek} ORDER BY items."date" DESC,items."id" DESC,items."type" DESC LIMIT 31`,
    )
    const selected = rows.slice(0, 30)
    const professionals = await tx.professionalProfile.findMany({
      where: {
        id: {
          in: selected.flatMap((r) =>
            r.professionalId ? [r.professionalId] : [],
          ),
        },
      },
      select: { id: true, user: { select: { fullName: true } } },
    })
    const specialties = await tx.specialty.findMany({
      where: {
        id: {
          in: selected.flatMap((r) => (r.specialtyId ? [r.specialtyId] : [])),
        },
      },
      select: { id: true, name: true },
    })
    const names = new Map(professionals.map((r) => [r.id, r.user.fullName])),
      specialtyNames = new Map(specialties.map((r) => [r.id, r.name]))
    const items: TimelineItem[] = selected.map((row) => ({
      id: row.id,
      resourceId: row.resourceId,
      type: row.type,
      date: row.date.toISOString(),
      professional: row.professionalId
        ? {
            id: row.professionalId,
            name: names.get(row.professionalId) ?? 'Profissional',
          }
        : null,
      specialty: row.specialtyId
        ? {
            id: row.specialtyId,
            name: specialtyNames.get(row.specialtyId) ?? 'Especialidade',
          }
        : null,
      modality: row.modality,
      summary: row.summaryEncrypted
        ? this.secrets.open(row.summaryEncrypted, `clinical_timeline:${row.id}`)
        : row.visitType === 'return'
          ? 'Consulta de retorno'
          : 'Consulta inicial',
      importedOrigin: row.importedOriginEncrypted
        ? JSON.parse(
            this.secrets.open(
              row.importedOriginEncrypted,
              `clinical_origin:${row.id}`,
            ),
          )
        : row.bookingSource === 'imported' && row.createdAt && row.createdBy
          ? {
              origin: 'agenda_importada',
              importedAt: row.createdAt.toISOString(),
              importedBy: row.createdBy,
            }
          : null,
    }))
    const last = selected.at(-1)
    return {
      items,
      nextCursor: rows.length > 30 && last ? `${last.type}:${last.id}` : null,
    }
  }
}
