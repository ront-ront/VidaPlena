import { z } from 'zod'
export const pendingExamOrderQuery = z
  .object({
    professionalId: z.uuid().toLowerCase().optional(),
    patientId: z.uuid().toLowerCase().optional(),
    cursor: z.uuid().toLowerCase().optional(),
  })
  .strict()
export const pendingExamOrderResponse = z.object({
  items: z.array(
    z.object({
      orderId: z.uuid(),
      documentId: z.uuid(),
      patient: z.object({ id: z.uuid(), name: z.string() }),
      orderedAt: z.iso.datetime(),
      signatureStatus: z.enum(['issued_dev', 'issued_valid']),
    }),
  ),
  nextCursor: z.uuid().nullable(),
  thresholdDays: z.number().int().positive(),
  asOf: z.iso.datetime(),
})
