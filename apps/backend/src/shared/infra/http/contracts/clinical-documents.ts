import { z } from 'zod'
import { documentTypeCodes } from '../../../../application/ports/clinical-documents'
export const documentParams = z.object({ id: z.uuid().toLowerCase() })
export const documentTypeQuery = z
  .object({
    active: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict()
export const documentTypeChange = z
  .object({
    expectedVersion: z.number().int().positive(),
    requiredSignatureLevel: z.enum(['simple', 'qualified']),
    templateVersion: z.string().trim().min(1).max(80),
    active: z.boolean(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
const named = z.object({ id: z.uuid(), name: z.string() })
const typeView = z.object({
  id: z.uuid(),
  code: z.enum(documentTypeCodes),
  label: z.string(),
  version: z.number().int().positive(),
  requiredSignatureLevel: z.enum(['simple', 'qualified']),
  templateVersion: z.string(),
  active: z.boolean(),
  source: z.enum(['seed', 'admin']),
  changedBy: named.nullable(),
  changedAt: z.iso.datetime(),
})
export const documentTypeResponse = typeView
export const documentTypesResponse = z.object({
  items: z.array(
    typeView.extend({
      history: z
        .array(typeView.extend({ reason: z.string().nullable() }))
        .optional(),
    }),
  ),
  provider: z.object({
    kind: z.string(),
    developmentOnly: z.boolean(),
    legalValidity: z.boolean(),
  }),
})
export const documentIssueBody = z
  .object({
    expectedVersion: z.number().int().positive(),
    acknowledgedAllergyIds: z.array(z.uuid().toLowerCase()).max(100).optional(),
  })
  .strict()
export const documentVoidBody = z
  .object({
    reason: z.string().trim().min(1).max(1000),
    replacementDocumentId: z.uuid().toLowerCase().optional(),
  })
  .strict()
export const documentVerificationParams = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
})
const signer = named.extend({
  council: z.object({
    type: z.string(),
    region: z.string(),
    number: z.string(),
  }),
})
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const signature = z.object({
  provider: z.string(),
  level: z.enum(['simple', 'qualified']),
  signer,
  signedAt: z.iso.datetime(),
  version: z.string(),
  sha256,
  legalValidity: z.boolean(),
  seal: z.string().nullable(),
})
export const clinicalDocumentResponse = z.object({
  documentId: z.uuid(),
  patientId: z.uuid(),
  encounterId: z.uuid(),
  typeCode: z.enum(documentTypeCodes),
  typeLabel: z.string(),
  typeVersion: z.number().int().positive(),
  templateVersion: z.string(),
  requiredSignatureLevel: z.enum(['simple', 'qualified']),
  examOrder: z
    .object({ id: z.uuid(), resultReceivedAt: z.iso.datetime().nullable() })
    .nullable(),
  copiedFromDocumentId: z.uuid().nullable(),
  files: z.array(
    z.object({
      id: z.uuid(),
      contentType: z.string(),
      size: z.number().int().nonnegative(),
      sha256,
    }),
  ),
  allergyAcknowledgements: z.array(
    z.object({
      alertId: z.uuid(),
      alertVersion: z.number().int().positive(),
      professionalId: z.uuid(),
      acknowledgedAt: z.iso.datetime(),
    }),
  ),
  payloadVersion: z.number().int().positive(),
  payload: z.unknown(),
  version: z.number().int().positive(),
  status: z.enum(['draft', 'issued_dev', 'issued_valid', 'voided']),
  savedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  issuedAt: z.iso.datetime().nullable(),
  signature: signature.nullable(),
  verificationCode: z.string().nullable(),
  sha256: sha256.nullable(),
  voidEvent: z
    .object({
      id: z.uuid(),
      reason: z.string(),
      replacementDocumentId: z.uuid().nullable(),
      createdAt: z.iso.datetime(),
      authorProfessionalId: z.uuid(),
    })
    .nullable(),
})
export const publicDocumentVerificationResponse = z.object({
  documentId: z.uuid(),
  type: z.object({ code: z.enum(documentTypeCodes), label: z.string() }),
  issuedAt: z.iso.datetime(),
  issuer: signer,
  sha256,
  status: z.enum(['issued_dev', 'issued_valid', 'voided']),
  signatureLevel: z.enum(['simple', 'qualified']),
  legalValidity: z.boolean(),
  seal: z.string().nullable(),
})
