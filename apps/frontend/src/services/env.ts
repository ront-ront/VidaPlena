import { z } from 'zod'

const origin = z
  .url({ protocol: /^https?$/ })
  .refine(
    (value) => new URL(value).origin === value,
    'Informe somente a origem da API.',
  )

const publicEnvironment = z.object({
  NEXT_PUBLIC_API_ORIGIN: origin.default('http://localhost:3333'),
  NEXT_PUBLIC_PASSWORD_MIN_LENGTH: z.coerce
    .number()
    .int()
    .min(1)
    .max(72)
    .default(10),
  NEXT_PUBLIC_ATTACHMENT_MAX_MB: z.coerce
    .number()
    .int()
    .min(1)
    .max(1024)
    .default(10),
  NEXT_PUBLIC_LEGAL_ADULT_AGE_YEARS: z.coerce
    .number()
    .int()
    .min(16)
    .max(21)
    .default(18),
})

const parsed = publicEnvironment.safeParse({
  NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN,
  NEXT_PUBLIC_PASSWORD_MIN_LENGTH: process.env.NEXT_PUBLIC_PASSWORD_MIN_LENGTH,
  NEXT_PUBLIC_ATTACHMENT_MAX_MB: process.env.NEXT_PUBLIC_ATTACHMENT_MAX_MB,
  NEXT_PUBLIC_LEGAL_ADULT_AGE_YEARS:
    process.env.NEXT_PUBLIC_LEGAL_ADULT_AGE_YEARS,
})

if (!parsed.success) {
  throw new Error(
    'Configuração pública inválida. Confira as variáveis NEXT_PUBLIC_.',
  )
}

export const publicEnv = parsed.data
