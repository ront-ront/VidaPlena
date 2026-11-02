import { apiClient } from './api-client'

export type Dependent = {
  patientId: string
  fullName: string
  relationship: string
  status: string
}

export type ConsentEvent = {
  patientId: string
  consentEventId: string
  versionId: string
  version: string
  action: 'accept' | 'refuse' | 'revoke'
  occurredAt: string
  source: string
  actorName: string
}

export type SubjectRequest = {
  id: string
  subjectPatientId: string
  kind: 'access' | 'correction' | 'export' | 'erasure'
  status: string
  description: string | null
  submittedAt: string
  dueAt: string
  completedAt: string | null
  resolution: { decision: string; explanation: string } | null
  exportReady: boolean
}

export const myAccount = {
  dependents: () =>
    apiClient.request<{ items: Dependent[] }>('/v1/me/dependents'),
  consents: () =>
    apiClient.request<{ items: ConsentEvent[] }>('/v1/me/consents'),
  requests: () =>
    apiClient.request<{ items: SubjectRequest[]; nextCursor: string | null }>(
      '/v1/me/subject-requests',
    ),
  changeEmail: (email: string) =>
    apiClient.request<{ status: 'pending' }>('/v1/me/contact', {
      method: 'PATCH',
      body: JSON.stringify({ email }),
    }),
  confirmEmail: (token: string) =>
    apiClient.request<void>(
      '/v1/auth/contact-verifications/complete',
      { method: 'POST', body: JSON.stringify({ token }) },
      { authenticated: false },
    ),
  revoke: (patientId: string, versionId: string) =>
    apiClient.request<{ consentEventId: string; portalState: 'restricted' }>(
      '/v1/me/consents/revoke',
      { method: 'POST', body: JSON.stringify({ patientId, versionId }) },
    ),
  currentTerm: () =>
    apiClient.request<{ id: string; version: string; body: string }>(
      '/v1/consent-documents/current?kind=data',
      {},
      { authenticated: false },
    ),
  accept: (patientId: string, versionId: string) =>
    apiClient.request<{ consentEventId: string; state: string }>(
      '/v1/me/consents',
      {
        method: 'POST',
        body: JSON.stringify({ patientId, versionId, action: 'accept' }),
      },
    ),
  createRequest: (
    patientId: string,
    kind: SubjectRequest['kind'],
    description?: string,
  ) =>
    apiClient.request<{ requestId: string; status: string; dueAt: string }>(
      '/v1/me/subject-requests',
      {
        method: 'POST',
        body: JSON.stringify({ patientId, kind, description }),
      },
    ),
  exportRequest: (id: string) =>
    apiClient.request<unknown>(`/v1/me/subject-requests/${id}/export`),
}
