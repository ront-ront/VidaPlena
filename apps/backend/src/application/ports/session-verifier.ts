export interface SessionProof {
  userId: string
  sessionId: string
}

// Cryptographic verification is supplied by BE-008, never by request body or IDs.
export interface SessionVerifier {
  verify(accessToken: string): Promise<SessionProof | null>
}
