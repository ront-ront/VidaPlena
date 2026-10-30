export interface SecretBox {
  seal(plaintext: string, purpose: string): string
  open(ciphertext: string, purpose: string): string
}
