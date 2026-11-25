import { z } from 'zod'
export const importedHistoryMetadata = z
  .object({
    originalDate: z.iso.date().optional(),
    origin: z.string().trim().min(1).max(200),
    originalAuthor: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
export const importedHistoryId = z.object({ id: z.uuid() })
export const importedHistoryPatient = z.object({ patientId: z.uuid() })
export const importedHistoryAddendumBody = z
  .object({
    reason: z.string().trim().min(1).max(1000),
    correctionText: z.string().trim().min(1).max(20000),
  })
  .strict()
export const importedHistoryCheckBody = z.object({}).strict()
const professional = z.object({ id: z.uuid(), name: z.string() })
export const importedHistoryCheckResponse = z.object({
  id: z.uuid(),
  professional,
  checkedAt: z.iso.datetime(),
})
export const importedHistoryAddendumResponse =
  importedHistoryAddendumBody.extend({
    id: z.uuid(),
    professional,
    createdAt: z.iso.datetime(),
  })
export const importedHistoryReceipt = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  originalDate: z.iso.date().nullable(),
  origin: z.string(),
  importedBy: z.uuid(),
  importedAt: z.iso.datetime(),
  signatureStatus: z.literal('not_signed'),
  fileReceived: z.literal(true),
})
export const importedHistoryDetail = importedHistoryReceipt
  .omit({ fileReceived: true })
  .extend({
    originalAuthor: z.string().nullable(),
    file: z.object({
      id: z.uuid(),
      contentType: z.string(),
      size: z.number(),
      scanStatus: z.string(),
    }),
    check: importedHistoryCheckResponse.nullable(),
    addenda: z.array(importedHistoryAddendumResponse),
  })
