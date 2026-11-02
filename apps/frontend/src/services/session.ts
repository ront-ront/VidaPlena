import { apiClient } from './api-client'

export type CurrentUser = {
  id: string
  patientId: string | null
  roles: ('patient' | 'receptionist' | 'professional' | 'manager' | 'admin')[]
  permissions: string[]
  profile: { fullName: string; email: string; phone: string | null }
  consentState: string
}

export function currentUser() {
  return apiClient.request<CurrentUser>('/v1/me')
}
