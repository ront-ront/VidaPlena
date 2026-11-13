import type {
  AbsenceRecord,
  AbsenceStore,
  AbsenceTransaction,
} from '../../../application/ports/absence'
import type { SecretBox } from '../../../application/ports/secret-box'
import type { PrismaClient } from '../../../generated/prisma/client'
import { readBookingRestriction } from './absence-policy'
import { PrismaAuditWriter } from './audit-writer'
import {
  type BookingPersistencePolicy,
  bookingTransaction,
  bookingUnitOfWork,
} from './booking-store'
import { enqueueNotification } from './notification-store'

export class PrismaAbsenceStore implements AbsenceStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly policy: BookingPersistencePolicy,
    private readonly secrets: SecretBox,
  ) {}
  transaction<T>(run: (tx: AbsenceTransaction) => Promise<T>): Promise<T> {
    return bookingUnitOfWork(this.db, this.policy, (tx) =>
      run({
        ...bookingTransaction(tx, this.policy),
        absence: async (appointmentId) => {
          const row = await tx.absence.findUnique({ where: { appointmentId } })
          return row
            ? {
                ...row,
                kind: row.kind as AbsenceRecord['kind'],
                explanation: row.explanationEncrypted
                  ? this.secrets.open(
                      row.explanationEncrypted,
                      `absence:${row.id}`,
                    )
                  : null,
              }
            : null
        },
        saveAbsence: async (input, previous) => {
          const { explanation, ...fields } = input
          const explanationEncrypted = explanation
            ? this.secrets.seal(explanation, `absence:${input.id}`)
            : null
          if (previous)
            await tx.absence.update({
              where: { id: input.id, version: previous.version },
              data: {
                kind: input.kind,
                explanationEncrypted,
                decidedBy: input.decidedBy,
                decidedAt: input.decidedAt,
                version: input.version,
              },
            })
          else
            await tx.absence.create({
              data: { ...fields, explanationEncrypted },
            })
          await tx.absenceRevision.create({
            data: {
              absenceId: input.id,
              version: input.version,
              previousKind: previous?.kind,
              kind: input.kind,
              explanationEncrypted,
              actorId: input.decidedBy,
              occurredAt: input.decidedAt,
            },
          })
        },
        recalculate: async (patientId, now, requestId) => {
          const previous = await tx.patientProfile.findUniqueOrThrow({
            where: { id: patientId },
          })
          const restriction = await readBookingRestriction(tx, patientId, now)
          const wasActive = !!(
            previous.autoBookingSuspendedUntil &&
            previous.autoBookingSuspendedUntil > now
          )
          const active = !!restriction.suspendedUntil
          const changed = wasActive !== active
          const row = await tx.patientProfile.update({
            where: { id: patientId },
            data: {
              autoBookingSuspendedUntil: restriction.suspendedUntil,
              ...(changed
                ? { autoBookingPolicyVersion: { increment: 1 } }
                : {}),
            },
          })
          if (changed)
            await new PrismaAuditWriter(tx).append({
              actorRoles: [],
              requestId,
              authorizationBasis: 'absence_policy',
              action: active
                ? 'patient.auto_booking_suspended'
                : 'patient.auto_booking_restored',
              resourceType: 'PatientProfile',
              resourceId: patientId,
              subjectPatientId: patientId,
              metadata: {
                version: row.autoBookingPolicyVersion,
                count: restriction.unjustifiedCount,
              },
            })
          if (changed && active) {
            const recipients = await tx.user.findMany({
              where: {
                status: 'active',
                roles: { some: { roleCode: 'receptionist', revokedAt: null } },
              },
              select: { id: true },
            })
            for (const user of recipients)
              await enqueueNotification(
                tx,
                {
                  type: 'patient.auto_booking_suspended',
                  aggregateId: patientId,
                  version: row.autoBookingPolicyVersion,
                  userId: user.id,
                  patientId,
                  requestId,
                },
                null,
              )
          }
          return restriction
        },
      }),
    )
  }
}
