import { randomUUID } from 'node:crypto'
import { ApplicationError } from '../../../application/errors/application-error'
import type { AuditContext } from '../../../application/ports/audit-writer'
import type {
  CareLinkRecord,
  CareLinkStore,
  CareLinkTransaction,
} from '../../../application/ports/care-links'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { Principal } from '../../../domain/rules/access'
import {
  type CareAppointment,
  type CareLinkPolicy,
  careWindow,
} from '../../../domain/rules/care-link'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { readPrincipal } from './access-store'
import { PrismaAuditWriter } from './audit-writer'

const professionalWhere = {
  active: true,
  user: {
    status: 'active' as const,
    roles: { some: { roleCode: 'professional', revokedAt: null } },
  },
}
const include = {
  appointment: true,
  parent: { include: { appointment: true } },
} as const
async function revokeDerived(
  tx: Prisma.TransactionClient,
  parent: { id: string; patientId: string },
  actor: Principal | null,
  context: AuditContext,
  reasonCode: string,
  now: Date,
) {
  const children = await tx.careLink.findMany({
    where: { parentLinkId: parent.id, status: 'active' },
    select: { id: true },
  })
  for (const child of children) {
    await tx.careLink.update({
      where: { id: child.id },
      data: { status: 'revoked', revokedAt: now },
    })
    await new PrismaAuditWriter(tx).append({
      ...context,
      actorUserId: actor?.userId,
      actorRoles: actor?.roles ?? [],
      action: 'care_link.revoked',
      resourceType: 'CareLink',
      resourceId: child.id,
      subjectPatientId: parent.patientId,
      authorizationBasis: `care_link:${parent.id}`,
      metadata: { reasonCode },
    })
  }
}
export async function syncAppointmentCareLink(
  tx: Prisma.TransactionClient,
  appointment: CareAppointment,
  policy: CareLinkPolicy,
  actor: Principal | null,
  context: AuditContext,
) {
  const now = new Date(),
    audit = new PrismaAuditWriter(tx)
  const closed = await tx.careLink.findMany({
    where: {
      sourceAppointmentId: appointment.id,
      status: 'active',
      ...(appointment.status === 'cancelled'
        ? {}
        : { professionalId: { not: appointment.professionalId } }),
    },
  })
  for (const row of closed) {
    await tx.careLink.update({
      where: { id: row.id },
      data: { status: 'revoked', revokedAt: now },
    })
    await revokeDerived(tx, row, actor, context, 'basis_revoked', now)
    await audit.append({
      ...context,
      actorUserId: actor?.userId,
      actorRoles: actor?.roles ?? [],
      action: 'care_link.revoked',
      resourceType: 'CareLink',
      resourceId: row.id,
      subjectPatientId: row.patientId,
      metadata: {
        version: appointment.version,
        reasonCode: 'appointment_changed',
      },
    })
  }
  const window = careWindow(appointment, policy)
  if (!window) return closed.length
  const prior = await tx.careLink.findUnique({
    where: {
      sourceAppointmentId_professionalId: {
        sourceAppointmentId: appointment.id,
        professionalId: appointment.professionalId,
      },
    },
  })
  if (
    prior &&
    prior.status === 'active' &&
    prior.appointmentVersion === appointment.version &&
    +prior.startsAt === +window.startsAt &&
    +prior.endsAt === +window.endsAt
  )
    return closed.length
  if (
    prior &&
    (+prior.startsAt !== +window.startsAt || +prior.endsAt !== +window.endsAt)
  ) {
    await revokeDerived(tx, prior, actor, context, 'basis_window_changed', now)
  }
  const row = await tx.careLink.upsert({
    where: {
      sourceAppointmentId_professionalId: {
        sourceAppointmentId: appointment.id,
        professionalId: appointment.professionalId,
      },
    },
    create: {
      id: randomUUID(),
      patientId: appointment.patientId,
      professionalId: appointment.professionalId,
      source: 'appointment',
      sourceAppointmentId: appointment.id,
      appointmentVersion: appointment.version,
      ...window,
    },
    update: {
      ...window,
      status: 'active',
      revokedAt: null,
      appointmentVersion: appointment.version,
    },
  })
  await audit.append({
    ...context,
    actorUserId: actor?.userId,
    actorRoles: actor?.roles ?? [],
    action: prior ? 'care_link.renewed' : 'care_link.created',
    resourceType: 'CareLink',
    resourceId: row.id,
    subjectPatientId: row.patientId,
    metadata: { source: 'appointment', version: appointment.version },
  })
  return closed.length + 1
}
export class PrismaCareLinkStore implements CareLinkStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly policy: CareLinkPolicy,
    private readonly idle: { internalMinutes: number; patientMinutes: number },
    private readonly secrets: SecretBox,
  ) {}
  transaction<T>(run: (tx: CareLinkTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => run(this.scope(tx)))
  }
  scope(tx: Prisma.TransactionClient): CareLinkTransaction {
    return {
      principal: (actor) =>
        readPrincipal(tx, actor.userId, actor.sessionId, this.idle),
      professional: (actor) =>
        tx.professionalProfile.findFirst({
          where: { ...professionalWhere, userId: actor.userId },
          select: { id: true },
        }),
      target: async (id) =>
        !!(await tx.professionalProfile.findFirst({
          where: { ...professionalWhere, id },
          select: { id: true },
        })),
      patientExists: async (id) =>
        !!(await tx.patientProfile.findFirst({
          where: { id, status: 'active' },
          select: { id: true },
        })),
      lock: async (patientId) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`care_link:${patientId}`},0))`
      },
      page: async (professionalId, query, now) => {
        const active: Prisma.CareLinkWhereInput = {
          status: 'active',
          startsAt: { lte: now },
          endsAt: { gt: now },
          OR: [
            { parentLinkId: null },
            {
              parent: {
                is: {
                  status: 'active',
                  startsAt: { lte: now },
                  endsAt: { gt: now },
                  appointment: { is: { startsAt: { lte: now } } },
                },
              },
            },
          ],
        }
        const filters: Record<string, Prisma.CareLinkWhereInput> = {
          active,
          revoked: { status: 'revoked' },
          scheduled: { status: 'active', startsAt: { gt: now } },
          expired: {
            status: 'active',
            OR: [
              { endsAt: { lte: now } },
              { parent: { is: { status: 'revoked' } } },
              { parent: { is: { endsAt: { lte: now } } } },
            ],
          },
        }
        const where: Prisma.CareLinkWhereInput = {
          professionalId,
          patientId: query.patientId,
          ...(query.status ? filters[query.status] : {}),
        }
        const cursor = query.cursor
          ? await tx.careLink.findFirst({
              where: { AND: [where, { id: query.cursor }] },
              select: { id: true, startsAt: true },
            })
          : null
        if (query.cursor && !cursor)
          throw new ApplicationError('NOT_FOUND_OR_FORBIDDEN')
        const rows = await tx.careLink.findMany({
          where: {
            AND: [
              where,
              ...(cursor
                ? [
                    {
                      OR: [
                        { startsAt: { lt: cursor.startsAt } },
                        { startsAt: cursor.startsAt, id: { lt: cursor.id } },
                      ],
                    },
                  ]
                : []),
            ],
          },
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          take: 31,
          include,
        })
        return {
          items: rows.slice(0, 30) as CareLinkRecord[],
          nextCursor: rows.length > 30 ? rows[29].id : null,
        }
      },
      links: async (professionalId, patientId) =>
        (await tx.careLink.findMany({
          where: { professionalId, patientId },
          include,
        })) as CareLinkRecord[],
      grant: async (input) => {
        const { reason, ...data } = input,
          id = randomUUID()
        return (await tx.careLink.create({
          data: {
            ...data,
            id,
            reasonEncrypted: this.secrets.seal(reason, `care_link:${id}`),
          },
          include,
        })) as CareLinkRecord
      },
      audit: new PrismaAuditWriter(tx),
    }
  }
  async reconcile(context: AuditContext) {
    let cursor: string | undefined,
      count = 0
    for (;;) {
      const rows = await this.db.appointment.findMany({
        where: cursor ? { id: { gt: cursor } } : {},
        orderBy: { id: 'asc' },
        take: 100,
        select: { id: true },
      })
      if (!rows.length) break
      for (const { id } of rows)
        count += await this.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id"=${id}::uuid FOR UPDATE`
          const appointment = await tx.appointment.findUniqueOrThrow({
            where: { id },
          })
          return syncAppointmentCareLink(tx, appointment, this.policy, null, {
            ...context,
            authorizationBasis: 'care_link_reconciliation',
          })
        })
      cursor = rows.at(-1)?.id
    }
    return { count }
  }
}
