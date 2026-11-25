import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import type { CanonicalDocuments } from '../../application/ports/signature-provider'
export class JcsCanonicalDocuments implements CanonicalDocuments {
  serialize(value: unknown) {
    const text = canonicalize(value)
    if (typeof text !== 'string')
      throw new Error('Documento canônico inválido.')
    return text
  }
  bytes(text: string) {
    return Buffer.from(text, 'utf8')
  }
  sha256(text: string) {
    return createHash('sha256').update(text, 'utf8').digest('hex')
  }
}
