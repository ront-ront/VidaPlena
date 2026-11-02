import { apiClient } from './api-client'

export type AuthenticatedResult = {
  status: 'authenticated'
  accessToken: string
  expiresAt: string
}

export type LoginResult =
  | AuthenticatedResult
  | {
      status: 'mfa_required'
      challengeId: string
      expiresAt: string
      enrollmentRequired: boolean
    }

export function login(identifier: string, password: string) {
  return apiClient.request<LoginResult>(
    '/v1/auth/login',
    { method: 'POST', body: JSON.stringify({ identifier, password }) },
    { authenticated: false },
  )
}

export function enrollMfa(challengeId: string) {
  return apiClient.request<{ secret: string; otpauthUri: string }>(
    '/v1/auth/mfa/enroll',
    { method: 'POST', body: JSON.stringify({ challengeId }) },
    { authenticated: false },
  )
}

export function verifyMfa(challengeId: string, code: string) {
  return apiClient.request<AuthenticatedResult>(
    '/v1/auth/mfa/verify',
    { method: 'POST', body: JSON.stringify({ challengeId, code }) },
    { authenticated: false },
  )
}
