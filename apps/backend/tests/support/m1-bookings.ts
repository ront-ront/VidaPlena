import { randomUUID } from 'node:crypto'
import { Temporal } from '@js-temporal/polyfill'
import request from 'supertest'
import { FindAvailability } from '../../src/application/use-cases/find-availability'
import type { Principal, Role } from '../../src/domain/rules/access'
import { localInstant } from '../../src/domain/rules/schedule'
import { PrismaAvailabilityStore } from '../../src/infrastructure/persistence/prisma/availability-store'
import { PrismaBookingStore } from '../../src/infrastructure/persistence/prisma/booking-store'
import { composeBackendApplication } from '../../src/shared/composition/root'
import { createM1Database, fictitiousCpf } from './m1-database'

export async function createBookingFixture() {
  const ctx = await createM1Database()
  let runtime: Awaited<ReturnType<typeof composeBackendApplication>> | undefined
  try {
    const admin = await ctx.account('admin'),
      reception = await ctx.account('receptionist')
    const documentId = (
      await ctx.db.consentDocumentVersion.create({
        data: {
          kind: 'data',
          version: 'test',
          bodyReference: 'Termo Fictício',
          effectiveAt: new Date(Date.now() - 1000),
          publishedBy: admin.user.id,
        },
      })
    ).id
    const specialtyId = (
      await ctx.db.specialty.create({
        data: {
          code: 'M1',
          name: 'Especialidade Fictícia',
          allowedModalities: ['onsite', 'remote'],
          defaultMinutesFirst: 60,
          defaultMinutesReturn: 30,
        },
      })
    ).id
    const professionalAccounts = [
        await ctx.account('professional'),
        await ctx.account('professional'),
      ],
      professionalIds: string[] = []
    for (let i = 0; i < professionalAccounts.length; i++) {
      const profile = await ctx.db.professionalProfile.create({
        data: {
          userId: professionalAccounts[i].user.id,
          councilType: 'CRM',
          councilRegion: 'CE',
          councilNumber: String(100 + i),
          modalities: ['onsite', 'remote'],
          specialties: { create: { specialtyId } },
        },
      })
      professionalIds.push(profile.id)
      await ctx.db.scheduleVersion.create({
        data: {
          professionalId: profile.id,
          version: 1,
          clinicTimeZone: ctx.config.clinicTimeZone,
          publishedBy: admin.user.id,
          rules: {
            create: [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
              {
                weekday,
                localStart: '08:00',
                localEnd: '12:00',
                effectiveFrom: new Date('2026-01-01'),
                modality: 'onsite' as const,
              },
              {
                weekday,
                localStart: '13:00',
                localEnd: '18:00',
                effectiveFrom: new Date('2026-01-01'),
                modality: 'remote' as const,
              },
            ]),
          },
        },
      })
    }
    await ctx.db.room.createMany({
      data: [{ name: 'Sala 1' }, { name: 'Sala 2' }],
    })
    runtime = await composeBackendApplication(ctx.config)
    const app = runtime.app,
      running = runtime
    const day = Temporal.Now.plainDateISO(ctx.config.clinicTimeZone).add({
      days: 7,
    })
    const at = (offset: number, time = '08:00') =>
      localInstant(
        day.add({ days: offset }).toString(),
        time,
        ctx.config.clinicTimeZone,
      ).toISOString()
    async function patient() {
      const account = await ctx.account('patient')
      const profile = await ctx.db.patientProfile.create({
        data: {
          userId: account.user.id,
          fullName: 'Paciente Fictício',
          cpf: fictitiousCpf(),
          birthDate: new Date('1990-01-01'),
        },
      })
      await ctx.db.consentEvent.create({
        data: {
          patientId: profile.id,
          documentVersionId: documentId,
          action: 'accept',
          source: 'portal',
          actorUserId: account.user.id,
          consentingPersonName: account.user.fullName,
        },
      })
      return { ...account, patientId: profile.id }
    }
    async function book(
      p: Awaited<ReturnType<typeof patient>>,
      offset: number,
      extra: Record<string, unknown> = {},
      token = p.token,
    ) {
      return (
        await request(app)
          .post('/v1/appointments')
          .set('Authorization', token)
          .set('Idempotency-Key', randomUUID())
          .send({
            patientId: p.patientId,
            professionalId: professionalIds[0],
            specialtyId,
            modality: 'onsite',
            visitType: 'first',
            startsAt: at(offset),
            ...extra,
          })
          .expect(201)
      ).body.appointment
    }
    const principal = (account: typeof admin, role: Role): Principal => ({
      userId: account.user.id,
      sessionId: account.session.id,
      roles: [role],
      permissions: [],
      mfaVerified: role !== 'patient',
      consentState: 'active',
    })
    const store = new PrismaBookingStore(ctx.db, {
      maxWaitMs: ctx.config.reservationTxMaxWaitMs,
      timeoutMs: ctx.config.reservationTxTimeoutMs,
      retryAttempts: ctx.config.reservationTxRetryAttempts,
      internalMinutes: ctx.config.internalIdleMinutes,
      patientMinutes: ctx.config.patientIdleMinutes,
    })
    const availability = new FindAvailability(
      new PrismaAvailabilityStore(ctx.db),
      ctx.config.clinicTimeZone,
      ctx.config.availabilityMaxWindowDays,
      ctx.config.availabilityLookaheadDays,
    )
    return {
      ...ctx,
      app,
      admin,
      reception,
      professionalAccounts,
      professionalIds,
      specialtyId,
      documentId,
      day,
      at,
      patient,
      book,
      principal,
      store,
      availability,
      close: async () => {
        await running.close()
        await ctx.close()
      },
    }
  } catch (error) {
    if (runtime) await runtime.close()
    await ctx.close()
    throw error
  }
}
