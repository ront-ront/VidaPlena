import type { Request, RequestHandler, Response } from 'express'
import { ApplicationError } from '../../../../application/errors/application-error'
import type { AuditContext } from '../../../../application/ports/audit-writer'
import type { SessionVerifier } from '../../../../application/ports/session-verifier'
import type { Authorize } from '../../../../application/use-cases/authorize'
import type { Capability, Principal } from '../../../../domain/rules/access'

export function auditContext(req: Request, res: Response): AuditContext {
  return {
    requestId: res.locals.requestId,
    actorRoles: [],
    originIp: req.ip,
    originClient: 'web',
    authorizationBasis: 'session',
  }
}

export function accessGuard(
  verifier: SessionVerifier,
  authorize: Authorize,
  capability: Capability,
  patientId?: (req: Request) => string,
): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('authorization')
    if (!header?.startsWith('Bearer '))
      throw new ApplicationError('UNAUTHENTICATED')
    const proof = await verifier.verify(header.slice(7))
    if (!proof) throw new ApplicationError('UNAUTHENTICATED')
    res.locals.principal = await authorize.execute(
      proof,
      capability,
      auditContext(req, res),
      patientId?.(req),
    )
    next()
  }
}

export function principalOf(res: Response): Principal {
  if (!res.locals.principal) throw new ApplicationError('UNAUTHENTICATED')
  return res.locals.principal
}
