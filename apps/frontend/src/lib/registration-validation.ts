import { z } from 'zod'
import { publicEnv } from '@/services/env'

export const registrationSchema = z
  .object({
    mode: z.enum(['self', 'dependent']),
    fullName: z.string().trim().min(2, 'Informe o nome completo.'),
    birthDate: z.iso.date({ error: 'Informe uma data de nascimento válida.' }),
    cpf: z.string().refine((value) => value.replace(/\D/g, '').length === 11, {
      error: 'Informe um CPF com 11 dígitos.',
    }),
    phone: z.string(),
    email: z.string(),
    password: z.string(),
    confirmation: z.string(),
    guardianRelationship: z.string(),
    accepted: z.boolean(),
  })
  .superRefine((value, context) => {
    if (new Date(`${value.birthDate}T12:00:00Z`) > new Date())
      context.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'A data de nascimento não pode ser futura.',
      })
    if (value.mode === 'self') {
      if (value.phone.replace(/\D/g, '').length < 10)
        context.addIssue({
          code: 'custom',
          path: ['phone'],
          message: 'Informe um celular válido.',
        })
      if (!z.email().safeParse(value.email).success)
        context.addIssue({
          code: 'custom',
          path: ['email'],
          message: 'Informe um e-mail válido.',
        })
      if (value.password.length < publicEnv.NEXT_PUBLIC_PASSWORD_MIN_LENGTH)
        context.addIssue({
          code: 'custom',
          path: ['password'],
          message: `Use ao menos ${publicEnv.NEXT_PUBLIC_PASSWORD_MIN_LENGTH} caracteres.`,
        })
      if (value.password !== value.confirmation)
        context.addIssue({
          code: 'custom',
          path: ['confirmation'],
          message: 'As senhas não coincidem.',
        })
    } else {
      if (value.guardianRelationship.trim().length < 2)
        context.addIssue({
          code: 'custom',
          path: ['guardianRelationship'],
          message: 'Informe seu parentesco ou vínculo legal.',
        })
      if (value.phone && value.phone.replace(/\D/g, '').length < 10)
        context.addIssue({
          code: 'custom',
          path: ['phone'],
          message: 'Informe um celular válido.',
        })
      if (value.email && !z.email().safeParse(value.email).success)
        context.addIssue({
          code: 'custom',
          path: ['email'],
          message: 'Informe um e-mail válido.',
        })
    }
    if (!value.accepted)
      context.addIssue({
        code: 'custom',
        path: ['accepted'],
        message: 'Leia e aceite o termo para concluir o cadastro digital.',
      })
  })

export type RegistrationForm = z.input<typeof registrationSchema>

export function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(
    error.issues.map((issue) => [String(issue.path[0]), issue.message]),
  ) as Partial<Record<keyof RegistrationForm, string>>
}
