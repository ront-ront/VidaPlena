import { z } from 'zod'
import { patientImportOriginSchema } from './imports'

export const patientInvitationParams = z.object({ id: z.uuid().toLowerCase() })
export const patientInvitationBody = z.object({}).strict()
export const onsitePatientQuery = z
  .object({ cpf: z.string().trim().min(11).max(14) })
  .strict()
export const patientInvitationStatus = z.object({
  canResend: z.boolean(),
  unavailableReason: z.string().nullable(),
})
export const onsitePatientResponse = z.object({
  patientId: z.uuid(),
  fullName: z.string(),
  birthDate: z.iso.datetime(),
  importOrigin: patientImportOriginSchema.nullable(),
  invitation: patientInvitationStatus,
})
export const patientInvitationResponse = z.object({
  patientId: z.uuid(),
  status: z.literal('invited'),
  invitationExpiresAt: z.iso.datetime(),
})
