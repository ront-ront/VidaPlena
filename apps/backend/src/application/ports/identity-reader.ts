export interface AccountIdentity {
  id: string
  email: string
  fullName: string
  status: 'invited' | 'active' | 'locked' | 'inactive'
}

export interface IdentityReader {
  findByEmail(email: string): Promise<AccountIdentity | null>
  listDependents(guardianUserId: string): Promise<
    Array<{
      patientId: string
      fullName: string
      relationship: string
    }>
  >
}
