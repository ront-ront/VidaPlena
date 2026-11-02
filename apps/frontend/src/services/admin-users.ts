import { apiClient } from './api-client'

export type InternalRole = 'receptionist' | 'professional' | 'manager' | 'admin'
export type InternalUser = {
  id: string
  email: string
  fullName: string
  status: 'invited' | 'active' | 'inactive' | 'locked'
  roles: InternalRole[]
  permissions: string[]
  lastLoginAt: string | null
  reviewRequiredAt: string | null
}
export type UserPage = {
  items: InternalUser[]
  nextCursor: string | null
  dpoDesignated: boolean
  dpoHolders: { id: string; fullName: string }[]
}

export const adminUsers = {
  list: (filters: {
    role?: InternalRole
    status?: InternalUser['status']
    cursor?: string
  }) => {
    const query = new URLSearchParams()
    if (filters.role) query.set('role', filters.role)
    if (filters.status) query.set('status', filters.status)
    if (filters.cursor) query.set('cursor', filters.cursor)
    return apiClient.request<UserPage>(
      `/v1/admin/users${query.size ? `?${query}` : ''}`,
    )
  },
  invite: (input: { email: string; fullName: string; role: InternalRole }) =>
    apiClient.request<{
      userId: string
      status: 'invited'
      invitationExpiresAt: string
    }>('/v1/admin/users', { method: 'POST', body: JSON.stringify(input) }),
  resend: (id: string) =>
    apiClient.request<{
      userId: string
      status: 'invited'
      invitationExpiresAt: string
    }>(`/v1/admin/users/${id}/invitation`, { method: 'POST' }),
  status: (id: string, status: 'active' | 'inactive') =>
    apiClient.request<{
      userId: string
      status: InternalUser['status']
      dpoDesignated: boolean
    }>(`/v1/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  roles: (id: string, roles: InternalRole[]) =>
    apiClient.request<{
      userId: string
      roles: InternalRole[]
      dpoDesignated: boolean
    }>(`/v1/admin/users/${id}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roles }),
    }),
  dpo: (id: string, enabled: boolean) =>
    apiClient.request<{ userId: string; dpoDesignated: boolean }>(
      `/v1/admin/users/${id}/permissions/privacy.dpo`,
      { method: 'PUT', body: JSON.stringify({ enabled }) },
    ),
}
