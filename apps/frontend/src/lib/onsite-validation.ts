import { z } from 'zod'
import { publicEnv } from '@/services/env'

export const patientSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Informe o nome completo.'),
    birthDate: z.iso.date({ error: 'Informe uma data válida.' }),
    cpf: z.string().refine((value) => value.replace(/\D/g, '').length === 11, {
      error: 'Informe um CPF com 11 dígitos.',
    }),
    phone: z.string(),
    email: z.string(),
  })
  .superRefine((value, context) => {
    if (new Date(`${value.birthDate}T00:00:00.000Z`) > new Date())
      context.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'A data não pode ser futura.',
      })
    if (value.phone && value.phone.replace(/\D/g, '').length < 10)
      context.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Informe um telefone válido.',
      })
    if (value.email && !z.email().safeParse(value.email).success)
      context.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Informe um e-mail válido.',
      })
  })

export function minorAt(birthDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false
  const birth = new Date(`${birthDate}T00:00:00.000Z`)
  if (Number.isNaN(birth.getTime())) return false
  const now = new Date()
  const years = now.getUTCFullYear() - birth.getUTCFullYear()
  const hadBirthday =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() >= birth.getUTCDate())
  return (
    years - (hadBirthday ? 0 : 1) < publicEnv.NEXT_PUBLIC_LEGAL_ADULT_AGE_YEARS
  )
}

const signatures = [
  {
    extension: ['pdf'],
    mime: 'application/pdf',
    bytes: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  { extension: ['jpg', 'jpeg'], mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  {
    extension: ['png'],
    mime: 'image/png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
]

export async function checkSignedTerm(file: File): Promise<string | null> {
  if (file.size > publicEnv.NEXT_PUBLIC_ATTACHMENT_MAX_MB * 1024 * 1024)
    return `O arquivo excede o limite configurado de ${publicEnv.NEXT_PUBLIC_ATTACHMENT_MAX_MB} MB.`
  if (file.size === 0) return 'Selecione um arquivo com conteúdo.'
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const format = signatures.find(({ bytes }) =>
    bytes.every((byte, index) => header[index] === byte),
  )
  if (!format)
    return 'Envie um PDF, JPG ou PNG válido. O conteúdo deve corresponder à extensão.'
  if (
    !format.extension.includes(extension) ||
    (file.type && file.type !== format.mime)
  )
    return 'Envie um PDF, JPG ou PNG válido. O conteúdo deve corresponder à extensão.'
  return null
}
