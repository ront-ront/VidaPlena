export const roles = [
  'patient',
  'receptionist',
  'professional',
  'manager',
  'admin',
] as const
export type Role = (typeof roles)[number]
export interface Principal {
  userId: string
  sessionId: string
  roles: Role[]
  permissions: string[]
  mfaVerified: boolean
  consentState?: 'active' | 'pending' | 'revoked'
}
export type Capability =
  | 'record_absence'
  | 'correct_absence'
  | 'check_in'
  | 'own_queue'
  | 'operational_agenda'
  | 'manage_catalog'
  | 'operational_catalog'
  | 'manage_schedule'
  | 'book_appointment'
  | 'cancel_appointment'
  | 'create_fit_in'
  | 'operational_waitlist'
  | 'session'
  | 'consent_management'
  | 'consent_patient'
  | 'notification_attention'
  | 'admin_users'
  | 'invite_users'
  | 'onsite_registration'
  | 'privacy_consents'
  | 'privacy_queue'
  | 'audit'
  | 'clinical'
  | 'own_patient'

export function mayAccess(
  actor: Principal,
  capability: Capability,
  ownPatient = false,
  hasDpo = true,
): boolean {
  if (
    actor.roles.includes('patient') &&
    actor.consentState &&
    actor.consentState !== 'active' &&
    capability !== 'consent_management' &&
    capability !== 'consent_patient'
  )
    return false
  const internal = actor.roles.some((role) => role !== 'patient')
  if (internal && !actor.mfaVerified) return false
  const dpo =
    actor.mfaVerified &&
    actor.permissions.includes('privacy.dpo') &&
    actor.roles.some((role) => role === 'admin' || role === 'manager')
  switch (capability) {
    case 'record_absence':
      return actor.roles.includes('receptionist')
    case 'correct_absence':
      return actor.roles.some(
        (role) => role === 'receptionist' || role === 'manager',
      )
    case 'check_in':
      return actor.roles.includes('receptionist')
    case 'own_queue':
      return actor.roles.includes('professional')
    case 'operational_agenda':
      return actor.roles.some((role) => role !== 'patient')
    case 'consent_management':
      return true
    case 'consent_patient':
      return ownPatient
    case 'session':
      return true
    case 'notification_attention':
      return actor.roles.some(
        (role) =>
          role === 'receptionist' || role === 'admin' || role === 'manager',
      )
    case 'operational_catalog':
    case 'manage_schedule':
      return actor.roles.some((role) => role !== 'patient')
    case 'book_appointment':
      return actor.roles.some(
        (role) =>
          role === 'patient' || role === 'receptionist' || role === 'admin',
      )
    case 'cancel_appointment':
      return actor.roles.some((role) =>
        ['patient', 'receptionist', 'professional', 'admin'].includes(role),
      )
    case 'create_fit_in':
      return actor.roles.some(
        (role) => role === 'receptionist' || role === 'manager',
      )
    case 'operational_waitlist':
      return actor.roles.some(
        (role) => role === 'receptionist' || role === 'admin',
      )
    case 'admin_users':
      return actor.roles.includes('admin')
    case 'invite_users':
    case 'manage_catalog':
      return actor.roles.some((role) => role === 'admin' || role === 'manager')
    case 'onsite_registration':
      return actor.roles.some(
        (role) => role === 'admin' || role === 'receptionist',
      )
    case 'privacy_consents':
      return dpo
    case 'privacy_queue':
      return dpo || (!hasDpo && actor.roles.includes('admin'))
    case 'audit':
      return dpo || actor.roles.includes('admin')
    case 'own_patient':
      return ownPatient
    // M2 must supply a separately approved clinical link policy.
    case 'clinical':
      return false
  }
}
