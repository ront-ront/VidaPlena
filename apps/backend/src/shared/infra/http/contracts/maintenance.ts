import { z } from 'zod'

export const maintenanceBody = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  noticeReference: z.string().trim().min(1).max(500),
})
export const maintenanceResponse = z.object({
  id: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  registeredAt: z.iso.datetime(),
  noticeReference: z.string(),
})
