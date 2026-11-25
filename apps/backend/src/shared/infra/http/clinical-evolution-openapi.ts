import type { z } from 'zod'
import {
  addendumBody,
  addendumResponse,
  authoredEvolutionQuery,
  authoredEvolutionResponse,
  evolutionPolicyResponse,
  evolutionReadResponse,
  finalizeEvolutionBody,
  finalizeEvolutionResponse,
} from './contracts/clinical-evolutions'
import { evolutionId } from './contracts/evolution-drafts'
import { errorResponse } from './contracts/m0'

const response = (schema: z.ZodType) => ({
  description: 'Evolução clínica',
  content: { 'application/json': { schema } },
})
const errors = Object.fromEntries(
  ['400', '401', '403', '404', '409', '503'].map((s) => [
    s,
    response(errorResponse),
  ]),
)
const common = {
  tags: ['Clinico'],
  security: [{ bearerAuth: [] }],
  requestParams: { path: evolutionId },
}
export const clinicalEvolutionOpenApiPaths = {
  '/clinical/evolution-policy': {
    get: {
      tags: ['Clinico'],
      security: common.security,
      operationId: 'readEvolutionPolicy',
      responses: { '200': response(evolutionPolicyResponse), ...errors },
    },
  },
  '/clinical/evolutions/mine': {
    get: {
      ...common,
      operationId: 'listAuthoredEvolutions',
      requestParams: { query: authoredEvolutionQuery },
      responses: { '200': response(authoredEvolutionResponse), ...errors },
    },
  },
  '/clinical/evolutions/{id}': {
    get: {
      ...common,
      operationId: 'readEvolution',
      responses: { '200': response(evolutionReadResponse), ...errors },
    },
  },
  '/clinical/evolutions/{id}/finalize': {
    post: {
      ...common,
      operationId: 'finalizeEvolution',
      requestBody: {
        content: { 'application/json': { schema: finalizeEvolutionBody } },
      },
      responses: { '200': response(finalizeEvolutionResponse), ...errors },
    },
  },
  '/clinical/evolutions/{id}/addenda': {
    post: {
      ...common,
      operationId: 'addEvolutionAddendum',
      requestBody: {
        content: { 'application/json': { schema: addendumBody } },
      },
      responses: { '201': response(addendumResponse), ...errors },
    },
  },
}
