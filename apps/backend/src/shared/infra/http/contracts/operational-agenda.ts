import { z } from 'zod'
import { absenceProjection } from './absence'
import { appointmentLastChange, appointmentResponse } from './appointments'
import {
  appointmentImportOriginSchema,
  patientImportOriginSchema,
} from './imports'
export const checkInBody = z
  .object({ arrivedAt: z.iso.datetime().optional() })
  .strict()
export const checkInResponse = z.object({
  appointmentId: z.uuid(),
  appointmentVersion: z.int().positive(),
  status: z.literal('waiting'),
  arrivedAt: z.iso.datetime(),
  recordedAt: z.iso.datetime(),
  lateFlag: z.boolean(),
  administrativeFlags: z.array(z.string()),
})
export const agendaQuery = z
  .object({
    localDate: z.iso.date().optional(),
    professionalId: z.uuid().optional(),
    specialtyId: z.uuid().optional(),
    status: appointmentResponse.shape.status.optional(),
    patientQuery: z.string().trim().min(1).max(100).optional(),
    cursor: z.uuid().optional(),
    absenceEligibleOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict()
export const queueQuery = agendaQuery
  .pick({
    localDate: true,
    professionalId: true,
    cursor: true,
  })
  .extend({ localDate: z.iso.date() })
export const operationalAppointment = appointmentResponse.extend({
  patientChangeDeadline: z.iso.datetime(),
  lastChange: appointmentLastChange.nullable(),
  importOrigin: appointmentImportOriginSchema.nullable(),
  noShowEligible: z.boolean(),
  absence: absenceProjection.nullable(),
  patient: z.object({
    id: z.uuid(),
    name: z.string(),
    birthDate: z.iso.date().nullable(),
    cpfMasked: z.string().nullable(),
    importOrigin: patientImportOriginSchema.nullable(),
  }),
  professional: z.object({ id: z.uuid(), name: z.string() }),
  specialty: z.object({ id: z.uuid(), name: z.string() }),
  room: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  checkIn: z
    .object({
      arrivedAt: z.iso.datetime(),
      recordedAt: z.iso.datetime(),
      lateFlag: z.boolean(),
    })
    .nullable(),
  administrativeFlags: z.array(
    z.enum([
      'contact_missing',
      'email_unverified',
      'consent_pending',
      'consent_revoked',
    ]),
  ),
})
export const queueResponse = z.object({
  items: z.array(operationalAppointment),
  nextCursor: z.uuid().nullable(),
})
export const agendaResponse = queueResponse.extend({
  localDate: z.iso.date(),
  clinicTimeZone: z.string(),
  serverNow: z.iso.datetime(),
  totals: z.object({ all: z.int(), confirmed: z.int(), noShow: z.int() }),
})
