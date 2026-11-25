import { z } from 'zod'
export const terminologyQuery = z
  .object({
    q: z.string().trim().max(200).optional(),
    cursor: z.uuid().optional(),
  })
  .strict()
export const terminologySnapshot = z.object({
  code: z.string(),
  description: z.string(),
  version: z.string(),
  source: z.string(),
  demo: z.boolean(),
})
export const terminologySelection = z
  .object({
    code: z.string().trim().min(1).max(50),
    version: z.string().trim().min(1).max(100),
  })
  .strict()
export const terminologyListResponse = z.object({
  items: z.array(terminologySnapshot),
  nextCursor: z.uuid().nullable(),
  catalogVersion: z.string().nullable(),
  demo: z.boolean(),
})
