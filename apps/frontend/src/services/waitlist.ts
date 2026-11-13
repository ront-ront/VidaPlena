import { z } from 'zod'
import { ApiError, apiClient } from './api-client'
import { receiptSchema } from './appointments'

const contextSchema = z.object({
  clinicTimeZone: z.string(),
  serverNow: z.iso.datetime(),
  localDate: z.iso.date(),
})
export type SchedulingContext = z.infer<typeof contextSchema>
export const preferenceSchema = z
  .object({
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    localStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    localEnd: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/),
  })
  .refine((v) => v.localStart < v.localEnd)
export const waitlistInputSchema = z
  .object({
    patientId: z.uuid(),
    specialtyId: z.uuid(),
    modality: z.enum(['onsite', 'remote']),
    visitType: z.enum(['first', 'return']),
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
    timePreferences: z.array(preferenceSchema).min(1).max(14),
  })
  .refine((v) => v.dateFrom <= v.dateTo)
const status = z.enum(['waiting', 'offered', 'fulfilled', 'cancelled'])
const entrySchema = z.object({
  ...waitlistInputSchema.shape,
  id: z.uuid(),
  queuedAt: z.iso.datetime(),
  status,
  position: z.number().int().nonnegative(),
  patientName: z.string().optional(),
  offer: z
    .object({
      id: z.uuid(),
      status: z.enum(['active', 'accepted', 'expired', 'cancelled']),
      offeredAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
      professionalId: z.uuid(),
      professionalName: z.string(),
      modality: z.enum(['onsite', 'remote']),
      manualContactRequired: z.boolean(),
    })
    .nullable(),
})
const pageSchema = z.object({
  items: z.array(entrySchema),
  nextCursor: z.uuid().nullable(),
})
export type WaitlistEntry = z.infer<typeof entrySchema>
export type WaitlistInput = z.infer<typeof waitlistInputSchema>
export type WaitlistPage = z.infer<typeof pageSchema>
async function parse<T>(raw: unknown, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new ApiError(502, 'SERVICE_UNAVAILABLE')
  return parsed.data
}
export const waitlist = {
  context: async () =>
    parse(await apiClient.request('/v1/scheduling/context'), contextSchema),
  list: async (
    query: { specialtyId?: string; status?: string; cursor?: string } = {},
  ) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query))
      if (value) params.set(key, value)
    return parse(await apiClient.request(`/v1/waitlist?${params}`), pageSchema)
  },
  enter: async (input: WaitlistInput) =>
    parse(
      await apiClient.request(
        '/v1/waitlist',
        { method: 'POST', body: JSON.stringify(input) },
        { expectedStatus: 201 },
      ),
      z.object({ entryId: z.uuid(), queuedAt: z.iso.datetime(), status }),
    ),
  leave: async (id: string) =>
    apiClient.request<void>(
      `/v1/waitlist/${id}`,
      { method: 'DELETE' },
      { expectedStatus: 204 },
    ),
  accept: async (
    id: string,
    patientId: string,
    duplicate: boolean,
    key: string,
  ) =>
    parse(
      await apiClient.request(
        `/v1/waitlist/offers/${id}/accept`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: JSON.stringify({
            patientId,
            confirmDuplicateSpecialty: duplicate,
          }),
        },
        { expectedStatus: 201 },
      ),
      receiptSchema,
    ),
  fitIn: async (
    input: {
      patientId: string
      specialtyId: string
      professionalId: string
      modality: 'onsite' | 'remote'
      visitType: 'first' | 'return'
      startsAt: string
      roomId?: string
      reason: string
      confirmDuplicateSpecialty: boolean
    },
    key: string,
  ) =>
    parse(
      await apiClient.request(
        '/v1/appointments/fit-ins',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: JSON.stringify(input),
        },
        { expectedStatus: 201 },
      ),
      receiptSchema,
    ),
  candidate: async (cpf: string) =>
    parse(
      await apiClient.request(
        `/v1/patients/fit-in-candidate?${new URLSearchParams({ cpf })}`,
      ),
      z.object({ patientId: z.uuid(), fullName: z.string() }),
    ),
}
