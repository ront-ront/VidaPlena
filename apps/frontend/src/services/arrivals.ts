import { z } from 'zod'
import { ApiError, apiClient } from './api-client'

export const absenceKind = z.enum(['unjustified', 'justified', 'clinic_fault'])
export type AbsenceKind = z.infer<typeof absenceKind>
const historySchema = z.object({
  items: z.array(
    z.object({
      version: z.int().positive(),
      previousKind: absenceKind.nullable(),
      kind: absenceKind,
      explanation: z.string().nullable(),
      occurredAt: z.iso.datetime(),
    }),
  ),
})
const checkInSchema = z.object({
  appointmentId: z.uuid(),
  appointmentVersion: z.int().positive(),
  status: z.literal('waiting'),
  arrivedAt: z.iso.datetime(),
  recordedAt: z.iso.datetime(),
  lateFlag: z.boolean(),
  administrativeFlags: z.array(z.string()),
})
const absenceSchema = z.object({
  appointmentId: z.uuid(),
  status: z.literal('no_show'),
  kind: absenceKind,
  absenceVersion: z.int().positive(),
  recordedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime(),
  autoBookingSuspended: z.boolean(),
  suspendedUntil: z.iso.datetime().nullable(),
  unjustifiedCount: z.int().nonnegative(),
})
async function parse<T>(
  promise: Promise<unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const result = schema.safeParse(await promise)
  if (!result.success) throw new ApiError(502, 'SERVICE_UNAVAILABLE')
  return result.data
}
export const arrivals = {
  checkIn: (id: string) =>
    parse(
      apiClient.request(
        `/v1/appointments/${id}/check-in`,
        { method: 'POST', body: '{}' },
        { expectedStatus: 200 },
      ),
      checkInSchema,
    ),
  decide: (
    id: string,
    input: {
      kind: AbsenceKind
      explanation?: string
      expectedVersion?: number
    },
  ) =>
    parse(
      apiClient.request(
        `/v1/appointments/${id}/absence`,
        {
          method: input.expectedVersion ? 'PATCH' : 'POST',
          body: JSON.stringify(input),
        },
        { expectedStatus: 200 },
      ),
      absenceSchema,
    ),
  history: (id: string) =>
    parse(
      apiClient.request(`/v1/appointments/${id}/absence/history`),
      historySchema,
    ),
}
