import { createHash, randomBytes } from 'node:crypto'
import { dictionary } from '@zxcvbn-ts/language-common'
import bcrypt from 'bcryptjs'
import { ApplicationError } from '../../application/errors/application-error'
import type { OpaqueTokens, Passwords } from '../../application/ports/passwords'

const commonPasswords = new Set(
  dictionary['passwords-common'].map((value: string) => value.toLowerCase()),
)
export class BcryptPasswords implements Passwords {
  constructor(
    private readonly minimumLength: number,
    private readonly commonListEnabled: boolean,
    private readonly rounds: number,
  ) {}
  async hash(password: string) {
    if (
      [...password].length < this.minimumLength ||
      Buffer.byteLength(password) > 72 ||
      (this.commonListEnabled && commonPasswords.has(password.toLowerCase()))
    ) {
      throw new ApplicationError('VALIDATION_ERROR', [
        {
          field: 'password',
          reason: `Use pelo menos ${this.minimumLength} caracteres, até 72 bytes e uma senha que não seja comum.`,
        },
      ])
    }
    return bcrypt.hash(password, this.rounds)
  }
  async verify(password: string, hash: string) {
    if (Buffer.byteLength(password) > 72) return false
    return bcrypt.compare(password, hash)
  }
}
export class CryptoOpaqueTokens implements OpaqueTokens {
  issue() {
    return randomBytes(32).toString('base64url')
  }
  digest(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }
}
