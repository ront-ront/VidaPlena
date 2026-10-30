import { z } from 'zod'
import { idSchema } from './m0'

export const patientInput = z.object({
  fullName: z.string(),
  birthDate: z.string(),
  cpf: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
})
export const registrationBody = z.object({
  mode: z.enum(['self', 'dependent']),
  patient: patientInput,
  password: z.string().optional(),
  guardianRelationship: z.string().trim().min(1).max(100).optional(),
  consent: z.object({ versionId: idSchema, accepted: z.boolean() }),
})
export const consentActionBody = z.object({
  patientId: idSchema,
  versionId: idSchema,
  action: z.enum(['accept', 'refuse']),
})
export const revokeConsentBody = z.object({
  patientId: idSchema,
  versionId: idSchema,
  reason: z.string().max(500).optional(),
})
export const publishConsentDocumentBody = z.object({
  kind: z.literal('data'),
  version: z.string().trim().min(1).max(50),
  bodyReference: z.string().trim().min(1).max(200_000),
  effectiveAt: z.iso.datetime(),
})
export const currentConsentQuery = z.object({ kind: z.literal('data') })
export const onsiteRegistrationData = z.object({
  patient: patientInput,
  guardianUserId: idSchema.optional(),
  guardianRelationship: z.string().trim().min(1).max(100).optional(),
  onsiteConsent: z.object({
    versionId: idSchema,
    consentingPersonName: z.string().trim().min(2).max(255),
    consentingRelationship: z.string().trim().min(1).max(100).optional(),
    accepted: z.literal(true),
  }),
})
export const onsiteConsentData = z.object({
  versionId: idSchema,
  consentingPersonName: z.string().trim().min(2).max(255),
  consentingRelationship: z.string().trim().min(1).max(100).optional(),
  guardianUserId: idSchema.optional(),
  accepted: z.literal(true),
})
export const consentDocumentResponse = z.object({
  id: idSchema,
  version: z.string(),
  body: z.string(),
  effectiveAt: z.iso.datetime(),
})
export const consentEventResponse = z.object({
  consentEventId: idSchema,
  state: z.enum(['active', 'pending', 'revoked']),
})
export const registrationResponse = z.object({
  patientId: idSchema,
  accountState: z.string(),
  consentEventId: idSchema,
})
