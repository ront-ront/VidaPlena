export interface Passwords {
  hash(password: string): Promise<string>
  verify(password: string, hash: string): Promise<boolean>
}
export interface OpaqueTokens {
  issue(): string
  digest(token: string): string
}
