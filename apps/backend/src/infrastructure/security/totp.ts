import { Secret, TOTP } from 'otpauth'
import type { TotpProvider } from '../../application/ports/authentication'

export class AuthenticatorTotp implements TotpProvider {
  createSecret() {
    return new Secret({ size: 20 }).base32
  }
  private totp(secret: string, label = 'VidaPlena') {
    return new TOTP({
      issuer: 'VidaPlena',
      label,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    })
  }
  uri(secret: string, label: string) {
    return this.totp(secret, label).toString()
  }
  verify(secret: string, code: string, at: Date) {
    if (!/^\d{6}$/.test(code)) return null
    const delta = this.totp(secret).validate({
      token: code,
      timestamp: at.getTime(),
      window: 1,
    })
    return delta === null ? null : Math.floor(at.getTime() / 30000) + delta
  }
}
