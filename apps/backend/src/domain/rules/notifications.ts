export const notificationTemplates = [
  'account.invited',
  'account.inactivity_review',
  'auth.account_locked',
  'auth.password_reset',
  'contact.verification_requested',
  'appointment.confirmed',
  'appointment.reminder',
  'appointment.cancelled',
  'appointment.rescheduled',
  'waitlist.offered',
  'marketing.news',
] as const
export type NotificationTemplate = (typeof notificationTemplates)[number]
export type NotificationCategory = 'essential' | 'nonessential'
export type DeliveryChannel = 'email' | 'portal'
export interface NotificationPreferences {
  channels: DeliveryChannel[]
  nonEssentialOptOut: boolean
}
export const defaultNotificationPreferences: NotificationPreferences = {
  channels: ['email', 'portal'],
  nonEssentialOptOut: true,
}

export function notificationCategory(
  template: NotificationTemplate,
): NotificationCategory {
  return template === 'marketing.news' ? 'nonessential' : 'essential'
}

export function deliveryPolicy(
  category: NotificationCategory,
  preferences: NotificationPreferences,
  allowed: boolean,
  emailAvailable: boolean,
) {
  if (!allowed)
    return {
      channel: null,
      reason: 'consent_blocked',
      needsReceptionAttention: false,
    } as const
  if (category === 'nonessential' && preferences.nonEssentialOptOut)
    return {
      channel: null,
      reason: 'opted_out',
      needsReceptionAttention: false,
    } as const
  if (emailAvailable && preferences.channels.includes('email'))
    return {
      channel: 'email',
      reason: null,
      needsReceptionAttention: false,
    } as const
  if (category === 'essential' || preferences.channels.includes('portal'))
    return {
      channel: 'portal',
      reason: null,
      needsReceptionAttention: category === 'essential',
    } as const
  return {
    channel: null,
    reason: 'no_channel',
    needsReceptionAttention: false,
  } as const
}

export function safeNotificationText(template: NotificationTemplate): string {
  const texts: Record<NotificationTemplate, string> = {
    'auth.account_locked':
      'Um acesso foi temporariamente bloqueado por tentativas. Confira a segurança da conta.',
    'account.inactivity_review':
      'Há uma conta sem acesso recente aguardando revisão na administração.',
    'account.invited': 'Você recebeu um convite para acessar o VidaPlena.',
    'auth.password_reset': 'Foi solicitada a recuperação de seu acesso.',
    'contact.verification_requested':
      'Confirme seu contato para acessar o VidaPlena.',
    'appointment.confirmed':
      'Sua consulta foi confirmada. Consulte os detalhes no portal.',
    'appointment.reminder':
      'Você tem uma consulta próxima. Consulte os detalhes no portal.',
    'appointment.cancelled':
      'Sua consulta foi cancelada. Consulte os detalhes no portal.',
    'appointment.rescheduled':
      'Sua consulta foi remarcada. Consulte os detalhes no portal.',
    'waitlist.offered':
      'Há um horário disponível para você. Consulte a oferta no portal.',
    'marketing.news': 'Há novidades da clínica disponíveis no portal.',
  }
  return texts[template]
}
