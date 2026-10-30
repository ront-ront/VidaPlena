import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'
import type { SecretBox } from '../../application/ports/secret-box'

export class AesSecretBox implements SecretBox {
  private readonly key: Buffer
  constructor(masterKey: Buffer, domain: string) {
    if (masterKey.length !== 32) throw new Error('Chave de cifra inválida.')
    this.key = Buffer.from(
      hkdfSync('sha256', masterKey, 'vidaplena-v1', domain, 32),
    )
  }
  seal(plaintext: string, purpose: string) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from(purpose))
    const body = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ])
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
  }
  open(ciphertext: string, purpose: string) {
    const value = Buffer.from(ciphertext, 'base64url')
    if (value.length < 28) throw new Error('Conteúdo cifrado inválido.')
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      value.subarray(0, 12),
    )
    decipher.setAAD(Buffer.from(purpose))
    decipher.setAuthTag(value.subarray(12, 28))
    return Buffer.concat([
      decipher.update(value.subarray(28)),
      decipher.final(),
    ]).toString('utf8')
  }
}
