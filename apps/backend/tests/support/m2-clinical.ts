import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import request from 'supertest'
import type { ManageTerminologies } from '../../src/application/use-cases/manage-terminologies'
import { syncAppointmentCareLink } from '../../src/infrastructure/persistence/prisma/care-link-store'
import {
  createServiceContainer,
  services,
} from '../../src/shared/composition/container'
import { createBookingFixture } from './m1-bookings'
export async function createClinicalFixture() {
  const f = await createBookingFixture(),
    scope = createServiceContainer(f.config, f.db)
  const cid = JSON.parse(
    await readFile(
      resolve(__dirname, '../../fixtures/terminologies/cid10.dev.json'),
      'utf8',
    ),
  )
  await scope
    .resolve<ManageTerminologies>(services.manageTerminologies)
    .load(cid, {
      requestId: randomUUID(),
      actorRoles: [],
      originClient: 'test',
      authorizationBasis: 'fixture',
    })
  async function visit(
    patient = undefined as Awaited<ReturnType<typeof f.patient>> | undefined,
    past = false,
  ) {
    const p = patient ?? (await f.patient()),
      startsAt = new Date(Date.now() - (past ? 120 : 30) * 60000),
      endsAt = new Date(+startsAt + 3600000)
    const appointment = await f.db.$transaction(async (tx) => {
      const row = await tx.appointment.create({
        data: {
          patientId: p.patientId,
          professionalId: f.professionalIds[0],
          specialtyId: f.specialtyId,
          modality: 'remote',
          visitType: 'first',
          startsAt,
          endsAt,
          durationMinutes: 60,
          specialtyVersion: 1,
          status: past ? 'in_service' : 'confirmed',
          bookingSource: 'imported',
          createdBy: f.admin.user.id,
        },
      })
      await tx.slotReservation.create({
        data: {
          professionalId: row.professionalId,
          appointmentId: row.id,
          modality: row.modality,
          startsAt,
          endsAt,
          state: 'confirmed',
          requestKey: randomUUID(),
          requestHash: 'f'.repeat(64),
        },
      })
      await syncAppointmentCareLink(tx, row, f.config.careLinkPolicy, null, {
        requestId: randomUUID(),
        actorRoles: [],
        originClient: 'test',
        authorizationBasis: 'fixture',
      })
      return row
    })
    let encounterId: string
    if (past) {
      const record =
        (await f.db.clinicalRecord.findUnique({
          where: { patientId: p.patientId },
        })) ??
        (await f.db.clinicalRecord.create({
          data: {
            patientId: p.patientId,
            recordNumber: `FIXTURE-${randomUUID()}`,
          },
        }))
      encounterId = (
        await f.db.clinicalEncounter.create({
          data: {
            recordId: record.id,
            appointmentId: appointment.id,
            professionalId: appointment.professionalId,
            startedAt: new Date(+startsAt + 60000),
          },
        })
      ).id
    } else
      encounterId = (
        await request(f.app)
          .post('/v1/clinical/encounters')
          .set('Authorization', f.professionalAccounts[0].token)
          .send({ appointmentId: appointment.id })
          .expect(201)
      ).body.encounter.id
    const link = await f.db.careLink.findFirstOrThrow({
      where: {
        sourceAppointmentId: appointment.id,
        professionalId: appointment.professionalId,
      },
    })
    return {
      patient: p,
      patientId: p.patientId,
      appointmentId: appointment.id,
      encounterId,
      linkId: link.id,
    }
  }
  async function clearActive() {
    await f.db.$transaction(async (tx) => {
      const rows = await tx.appointment.findMany({
          where: { status: { in: ['confirmed', 'waiting', 'in_service'] } },
          select: { id: true },
        }),
        ids = rows.map((r) => r.id)
      await tx.slotReservation.updateMany({
        where: { appointmentId: { in: ids }, state: 'confirmed' },
        data: { state: 'released' },
      })
      await tx.appointment.updateMany({
        where: { id: { in: ids } },
        data: { status: 'cancelled' },
      })
    })
  }
  return { ...f, scope, cid, visit, clearActive }
}
