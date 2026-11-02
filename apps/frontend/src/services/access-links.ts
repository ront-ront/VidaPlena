import { apiClient } from './api-client'

export function requestPasswordReset(identifier: string) {
  return apiClient.request<unknown>(
    '/v1/auth/recovery/request',
    { method: 'POST', body: JSON.stringify({ identifier }) },
    { authenticated: false },
  )
}

export function completePasswordReset(token: string, newPassword: string) {
  return apiClient.request<void>(
    '/v1/auth/recovery/complete',
    { method: 'POST', body: JSON.stringify({ token, newPassword }) },
    { authenticated: false },
  )
}

export function inspectPasswordReset(token: string) {
  return apiClient.request<{ status: 'valid' }>(
    '/v1/auth/recovery/inspect',
    { method: 'POST', body: JSON.stringify({ token }) },
    { authenticated: false },
  )
}

export type Invitation = {
  fullName: string
  roles: string[]
  expiresAt: string
}

export function inspectInvitation(token: string) {
  return apiClient.request<Invitation>(
    '/v1/auth/invitations/inspect',
    { method: 'POST', body: JSON.stringify({ token }) },
    { authenticated: false },
  )
}

export function acceptInvitation(token: string, password: string) {
  return apiClient.request<{ status: 'active' }>(
    '/v1/auth/invitations/accept',
    { method: 'POST', body: JSON.stringify({ token, password }) },
    { authenticated: false },
  )
}
