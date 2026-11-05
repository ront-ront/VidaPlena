import { z } from 'zod'
export const roomBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .transform((v) => v.replace(/\s+/g, ' ')),
    active: z.boolean(),
  })
  .strict()
export const roomPatch = roomBody
  .partial()
  .extend({ expectedVersion: z.int().positive() })
  .strict()
export const roomResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  capacity: z.literal(1),
  version: z.int(),
})
