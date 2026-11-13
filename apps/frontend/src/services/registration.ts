import { apiClient } from './api-client'

export {
  type ConsentDocument,
  currentConsentDocument,
} from './consent-documents'

export type RegistrationPayload = {
  mode: 'self' | 'dependent'
  patient: {
    fullName: string
    birthDate: string
    cpf: string
    phone?: string
    email?: string
  }
  password?: string
  guardianRelationship?: string
  consent: { versionId: string; accepted: true }
}

export function registerPatient(payload: RegistrationPayload) {
  return apiClient.request<{
    patientId: string
    accountState: string
    consentEventId: string
  }>(
    '/v1/patient-registrations',
    { method: 'POST', body: JSON.stringify(payload) },
    { authenticated: payload.mode === 'dependent' },
  )
}
