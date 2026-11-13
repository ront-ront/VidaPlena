import { randomUUID } from 'node:crypto'
import { absencePenaltyExpiry } from '../../src/domain/rules/absence'
import type { PrismaClient } from '../../src/generated/prisma/client'

// Fictitious historical facts for consumer tests; no manually trusted suspension cache.
export async function seedAbsenceFacts(
  db: PrismaClient,
  ids: {
    patientId: string
    professionalId: string
    specialtyId: string
    actorId: string
  },
  occurrences = [30, 20, 10].map(
    (days) => new Date(Date.now() - days * 86_400_000),
  ),
) {
  return db.$transaction(async (tx) => {
    const rows = []
    for (const at of occurrences) {
      const appointment = await tx.appointment.create({
        data: {
          patientId: ids.patientId,
          professionalId: ids.professionalId,
          specialtyId: ids.specialtyId,
          modality: 'remote',
          visitType: 'first',
          startsAt: at,
          endsAt: new Date(at.getTime() + 3_600_000),
          durationMinutes: 60,
          specialtyVersion: 1,
          status: 'no_show',
          version: 1,
          bookingSource: 'reception',
          createdBy: ids.actorId,
        },
      })
      const absence = await tx.absence.create({
        data: {
          id: randomUUID(),
          appointmentId: appointment.id,
          appointmentVersion: 1,
          patientId: ids.patientId,
          occurredAt: at,
          penaltyExpiresAt: absencePenaltyExpiry(at, 'America/Fortaleza'),
          clinicTimeZone: 'America/Fortaleza',
          kind: 'unjustified',
          explanationEncrypted: null,
          recordedBy: ids.actorId,
          recordedAt: at,
          decidedBy: ids.actorId,
          decidedAt: at,
        },
      })
      await tx.absenceRevision.create({
        data: {
          absenceId: absence.id,
          version: 1,
          kind: 'unjustified',
          explanationEncrypted: absence.explanationEncrypted,
          actorId: ids.actorId,
          occurredAt: at,
        },
      })
      rows.push(appointment)
    }
    return rows
  })
}
