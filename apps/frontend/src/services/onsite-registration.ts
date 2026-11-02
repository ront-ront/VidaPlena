import { apiClient } from './api-client'

export type OnsitePatient = {
  fullName: string
  birthDate: string
  cpf: string
  phone?: string
  email?: string
}
export type OnsiteConsent = {
  versionId: string
  consentingPersonName: string
  consentingRelationship?: string
  guardianUserId?: string
  accepted: true
}

function evidence(data: unknown, file: File) {
  const body = new FormData()
  body.append('data', JSON.stringify(data))
  body.append('signedTerm', file, file.name)
  return body
}

export const onsiteRegistration = {
  receipts: (patientId: string) =>
    apiClient.request<{
      items: {
        consentEventId: string
        version: string
        consentingPersonName: string
        consentingRelationship: string | null
        occurredAt: string
        signedFileId: string
      }[]
    }>(`/v1/patients/${patientId}/onsite-consents`),
  lookupGuardian: (identifier: string) =>
    apiClient.request<{ userId: string; fullName: string }>(
      `/v1/onsite-guardians?identifier=${encodeURIComponent(identifier)}`,
    ),
  lookupPatient: (cpf: string) =>
    apiClient.request<{
      patientId: string
      fullName: string
      birthDate: string
    }>(`/v1/onsite-patients?cpf=${encodeURIComponent(cpf)}`),
  register: (
    patient: OnsitePatient,
    consent: OnsiteConsent,
    file: File,
    guardianRelationship?: string,
  ) =>
    apiClient.request<{
      patientId: string
      accountState: string
      consentEventId: string
      signedFileId: string
    }>('/v1/patients', {
      method: 'POST',
      body: evidence(
        {
          patient,
          ...(consent.guardianUserId
            ? { guardianUserId: consent.guardianUserId, guardianRelationship }
            : {}),
          onsiteConsent: {
            versionId: consent.versionId,
            consentingPersonName: consent.consentingPersonName,
            consentingRelationship: consent.consentingRelationship,
            accepted: true,
          },
        },
        file,
      ),
    }),
  consent: (patientId: string, consent: OnsiteConsent, file: File) =>
    apiClient.request<{
      consentEventId: string
      signedFileId: string
      state: string
    }>(`/v1/patients/${patientId}/onsite-consents`, {
      method: 'POST',
      body: evidence(consent, file),
    }),
}
