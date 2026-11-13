import { z } from 'zod'
import { ApiError, apiClient } from './api-client'

const consentDocumentSchema = z.object({
  id: z.uuid(),
  version: z.string(),
  body: z.string(),
  effectiveAt: z.iso.datetime(),
})
const publishedDocumentSchema = consentDocumentSchema.omit({ body: true })
export type ConsentDocument = z.infer<typeof consentDocumentSchema>

export const publishDocumentSchema = z.object({
  version: z
    .string()
    .trim()
    .min(1, 'Informe a versão.')
    .max(50, 'Use até 50 caracteres.'),
  bodyReference: z
    .string()
    .trim()
    .min(1, 'Informe o texto completo do termo.')
    .max(200_000, 'Use até 200.000 caracteres.'),
})
export type PublishDocumentInput = z.infer<typeof publishDocumentSchema>

export async function currentConsentDocument() {
  const raw = await apiClient.request(
    '/v1/consent-documents/current?kind=data',
    {},
    { authenticated: false },
  )
  const result = consentDocumentSchema.safeParse(raw)
  if (!result.success) throw new ApiError(502, 'SERVICE_UNAVAILABLE')
  return result.data
}

export async function publishConsentDocument(input: PublishDocumentInput) {
  const raw = await apiClient.request(
    '/v1/admin/consent-documents',
    { method: 'POST', body: JSON.stringify({ kind: 'data', ...input }) },
    { expectedStatus: 201 },
  )
  const result = publishedDocumentSchema.safeParse(raw)
  if (!result.success) throw new ApiError(502, 'SERVICE_UNAVAILABLE')
  return result.data
}
