import { z } from 'zod'
export const examResultMetadata = z
  .object({
    patientId: z.uuid(),
    origin: z.enum(['ordered', 'external']),
    orderId: z.uuid().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.origin === 'ordered') !== !!v.orderId)
      ctx.addIssue({
        code: 'custom',
        path: ['orderId'],
        message: 'Informe pedido somente para origem ordered.',
      })
  })
export const examResultId = z.object({ id: z.uuid() })
export const examResultPatient = z.object({ patientId: z.uuid() })
export const examResultQuery = z
  .object({ orderId: z.uuid().optional(), cursor: z.uuid().optional() })
  .strict()
export const examResultReceipt = z.object({
  resultId: z.uuid(),
  patientId: z.uuid(),
  fileId: z.uuid(),
  orderId: z.uuid().nullable(),
  origin: z.enum(['ordered', 'external']),
  receivedAt: z.iso.datetime(),
})
export const examResultDetail = z.object({
  id: z.uuid(),
  patientId: z.uuid(),
  recordId: z.uuid(),
  orderId: z.uuid().nullable(),
  submittedBy: z.uuid(),
  receivedAt: z.iso.datetime(),
  origin: z.enum(['ordered', 'external']),
  file: z.object({
    id: z.uuid(),
    contentType: z.string(),
    size: z.number(),
    sha256: z.string(),
    scanStatus: z.string(),
  }),
})
export const examResultPage = z.object({
  items: z.array(examResultDetail),
  nextCursor: z.uuid().nullable(),
})
