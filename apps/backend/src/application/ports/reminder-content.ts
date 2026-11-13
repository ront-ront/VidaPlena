import { z } from 'zod'

// Administrative payload only; never reuse an identity token as message content.
export const reminderContent = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    professionalName: z.string().min(1),
    modality: z.enum(['onsite', 'remote']),
    timeZone: z.string().min(1),
    address: z.string().min(1).nullable(),
    portalPath: z.literal('/minhas-consultas'),
  })
  .strict()

export function renderReminderContent(payload: string) {
  const value = reminderContent.parse(JSON.parse(payload))
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: value.timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value.startsAt))
  return `Lembrete: consulta em ${date}, com ${value.professionalName}. ${
    value.modality === 'onsite'
      ? `Presencial. ${value.address}.`
      : 'Online. Consulte as orientações no portal.'
  } Minhas consultas: ${value.portalPath}`
}
