import { Router } from 'express'
import type { SessionVerifier } from '../../../application/ports/session-verifier'
import type { Authorize } from '../../../application/use-cases/authorize'
import type { ManageCatalog } from '../../../application/use-cases/manage-catalog'
import {
  catalogId,
  catalogQuery,
  professionalBody,
  professionalPatch,
  professionalQuery,
  specialtyBody,
  specialtyPatch,
} from './contracts/catalog'
import { accessGuard, auditContext, principalOf } from './middleware/access'
import { parseInput } from './parse-input'

export function createCatalogRouter(
  tokens: SessionVerifier,
  authorize: Authorize,
  service: ManageCatalog,
) {
  const router = Router()
  for (const administrative of [false, true]) {
    const prefix = administrative ? '/admin' : '/catalog'
    const guard = accessGuard(
      tokens,
      authorize,
      administrative ? 'manage_catalog' : 'session',
    )
    router.get(`${prefix}/specialties`, guard, async (req, res) => {
      const page = await service.list(
        principalOf(res),
        'specialty',
        parseInput(catalogQuery, req.query),
        administrative,
      )
      if (administrative)
        await service.auditRead(
          principalOf(res),
          'Specialty',
          auditContext(req, res),
        )
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        administrative
          ? page
          : {
              ...page,
              items: page.items.map((item) => {
                if (!('code' in item))
                  throw new Error('Projecao de especialidade invalida.')
                return {
                  id: item.id,
                  code: item.code,
                  name: item.name,
                  modalities: item.allowedModalities,
                  durations: {
                    first: item.defaultMinutesFirst,
                    return: item.defaultMinutesReturn,
                  },
                }
              }),
            },
      )
    })
    router.get(`${prefix}/professionals`, guard, async (req, res) => {
      const page = await service.list(
        principalOf(res),
        'professional',
        parseInput(professionalQuery, req.query),
        administrative,
      )
      if (administrative)
        await service.auditRead(
          principalOf(res),
          'ProfessionalProfile',
          auditContext(req, res),
        )
      res.setHeader('Cache-Control', 'no-store')
      res.json(
        administrative
          ? page
          : {
              ...page,
              items: page.items.map((item) => {
                if (!('displayName' in item))
                  throw new Error('Projecao de profissional invalida.')
                return {
                  id: item.id,
                  displayName: item.displayName,
                  specialtyIds: item.specialtyIds,
                  modalities: item.modalities,
                }
              }),
            },
      )
    })
  }
  const guard = accessGuard(tokens, authorize, 'manage_catalog')
  router.post('/admin/specialties', guard, async (req, res) => {
    res
      .status(201)
      .json(
        await service.specialty(
          principalOf(res),
          parseInput(specialtyBody, req.body),
          auditContext(req, res),
        ),
      )
  })
  router.patch('/admin/specialties/:id', guard, async (req, res) => {
    const { id } = parseInput(catalogId, req.params)
    const { expectedVersion, ...body } = parseInput(specialtyPatch, req.body)
    res.json(
      await service.specialty(
        principalOf(res),
        body,
        auditContext(req, res),
        id,
        expectedVersion,
      ),
    )
  })
  router.post('/admin/professionals', guard, async (req, res) => {
    res
      .status(201)
      .json(
        await service.professional(
          principalOf(res),
          parseInput(professionalBody, req.body),
          auditContext(req, res),
        ),
      )
  })
  router.patch('/admin/professionals/:id', guard, async (req, res) => {
    const { id } = parseInput(catalogId, req.params)
    const { expectedVersion, ...body } = parseInput(professionalPatch, req.body)
    res.json(
      await service.professional(
        principalOf(res),
        body,
        auditContext(req, res),
        id,
        expectedVersion,
      ),
    )
  })
  return router
}
