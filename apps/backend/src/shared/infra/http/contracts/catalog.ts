import { z } from 'zod'

export const modalitySchema = z.enum(['onsite', 'remote'])
const modalities = z
  .array(modalitySchema)
  .min(1)
  .max(2)
  .refine((v) => new Set(v).size === v.length)
const uppercase = (value: string) => value.trim().toUpperCase()
export const specialtyBody = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .transform(uppercase)
      .pipe(z.string().regex(/^[A-Z0-9_-]+$/)),
    name: z.string().trim().min(2).max(255),
    active: z.boolean(),
    allowedModalities: modalities,
    defaultMinutesFirst: z.int().positive(),
    defaultMinutesReturn: z.int().positive(),
  })
  .strict()
export const professionalBody = z
  .object({
    userId: z.uuid(),
    councilType: z
      .string()
      .transform(uppercase)
      .pipe(z.string().regex(/^[A-Z]{2,12}$/)),
    councilNumber: z
      .string()
      .transform(uppercase)
      .pipe(z.string().regex(/^[A-Z0-9]{1,30}$/)),
    councilRegion: z
      .string()
      .transform(uppercase)
      .pipe(
        z.enum([
          'AC',
          'AL',
          'AP',
          'AM',
          'BA',
          'CE',
          'DF',
          'ES',
          'GO',
          'MA',
          'MT',
          'MS',
          'MG',
          'PA',
          'PB',
          'PR',
          'PE',
          'PI',
          'RJ',
          'RN',
          'RS',
          'RO',
          'RR',
          'SC',
          'SP',
          'SE',
          'TO',
        ]),
      ),
    specialtyIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((v) => new Set(v).size === v.length),
    modalities,
    active: z.boolean(),
  })
  .strict()
export const specialtyPatch = specialtyBody
  .partial()
  .extend({ expectedVersion: z.int().positive() })
  .strict()
export const professionalPatch = professionalBody
  .partial()
  .extend({ expectedVersion: z.int().positive() })
  .strict()
export const catalogQuery = z
  .object({
    active: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    cursor: z.uuid().optional(),
  })
  .strict()
export const professionalQuery = catalogQuery.extend({
  specialtyId: z.uuid().optional(),
  modality: modalitySchema.optional(),
})
export const catalogId = z.object({ id: z.uuid() })
export const specialtyResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  allowedModalities: z.array(modalitySchema),
  defaultMinutesFirst: z.int(),
  defaultMinutesReturn: z.int(),
  version: z.int(),
})
export const professionalResponse = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  councilType: z.string(),
  councilNumber: z.string(),
  councilRegion: z.string(),
  specialtyIds: z.array(z.uuid()),
  modalities: z.array(modalitySchema),
  active: z.boolean(),
  version: z.int(),
})
export const publicSpecialtyResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  modalities: z.array(modalitySchema),
  durations: z.object({ first: z.int(), return: z.int() }),
})
export const publicProfessionalResponse = professionalResponse.pick({
  id: true,
  displayName: true,
  specialtyIds: true,
  modalities: true,
})
export const catalogPage = <T extends z.ZodType>(schema: T) =>
  z.object({ items: z.array(schema), nextCursor: z.uuid().nullable() })
