import type { z } from 'zod'
import {
  evolutionCommandHeader,
  evolutionCreateBody,
  evolutionId,
  evolutionLookupResponse,
  evolutionPatchBody,
  evolutionSavedResponse,
} from './contracts/evolution-drafts'
import { errorResponse } from './contracts/m0'

const response = (schema: z.ZodType) => ({
  description: 'Evolução em rascunho',
  content: { 'application/json': { schema } },
})
const errors = Object.fromEntries(
  ['400', '401', '403', '404', '409'].map((s) => [s, response(errorResponse)]),
)
const common = {
  tags: ['Clinico'],
  security: [{ bearerAuth: [] }],
  requestParams: { path: evolutionId },
}
export const evolutionDraftOpenApiPaths = {
  '/clinical/encounters/{id}/evolutions/draft': {
    post: {
      ...common,
      operationId: 'createEvolutionDraft',
      requestBody: {
        content: { 'application/json': { schema: evolutionCreateBody } },
      },
      responses: { '201': response(evolutionSavedResponse), ...errors },
    },
    get: {
      ...common,
      operationId: 'findEncounterDraft',
      responses: { '200': response(evolutionLookupResponse), ...errors },
    },
  },
  '/clinical/evolutions/{id}/draft': {
    patch: {
      ...common,
      operationId: 'saveEvolutionDraft',
      requestParams: { path: evolutionId, header: evolutionCommandHeader },
      requestBody: {
        content: { 'application/json': { schema: evolutionPatchBody } },
      },
      responses: { '200': response(evolutionSavedResponse), ...errors },
    },
  },
}
