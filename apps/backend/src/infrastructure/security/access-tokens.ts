import { randomUUID } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'
import type { AccessTokens } from '../../application/ports/authentication'
import type { SessionProof } from '../../application/ports/session-verifier'

export class JwtAccessTokens implements AccessTokens {
  private readonly key: Uint8Array
  constructor(
    secret: string,
    private readonly now = () => new Date(),
  ) {
    this.key = new TextEncoder().encode(secret)
  }
  issue(proof: SessionProof, expiresAt: Date) {
    return new SignJWT({ sid: proof.sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(proof.userId)
      .setIssuer('vidaplena')
      .setAudience('vidaplena-api')
      .setJti(randomUUID())
      .setIssuedAt(Math.floor(this.now().getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key)
  }
  async verify(token: string) {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: 'vidaplena',
        audience: 'vidaplena-api',
        currentDate: this.now(),
        requiredClaims: ['sub', 'sid', 'exp', 'iat'],
      })
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        ![payload.sub, payload.sid].every((value) =>
          /^[a-f0-9-]{36}$/i.test(value),
        )
      )
        return null
      return { userId: payload.sub, sessionId: payload.sid }
    } catch {
      return null
    }
  }
}
