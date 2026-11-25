export type SignatureLevel = 'simple' | 'qualified'
export type DocumentSigner = {
  id: string
  name: string
  council: { type: string; region: string; number: string }
}
export type SignatureEvidence = {
  provider: string
  level: SignatureLevel
  signer: DocumentSigner
  signedAt: string
  version: string
  sha256: string
  legalValidity: boolean
  seal: string | null
}
export interface SignatureProvider {
  readonly kind: string
  readonly developmentOnly: boolean
  available(level: SignatureLevel): boolean
  sign(input: {
    bytes: Uint8Array
    signer: DocumentSigner
    level: SignatureLevel
    signedAt: Date
    payloadVersion: number
  }): Promise<SignatureEvidence>
}
export interface CanonicalDocuments {
  serialize(value: unknown): string
  bytes(text: string): Uint8Array
  sha256(text: string): string
}
