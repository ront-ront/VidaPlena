import type { z } from 'zod'
import {
  careLinkListResponse,
  careLinkQuery,
  careLinkResponse,
  shareCareLinkBody,
  substituteCareLinkBody,
} from './contracts/care-links'
import { errorResponse } from './contracts/m0'

const response = (schema: z.ZodType) => ({
  description: 'Resposta de vínculo assistencial',
  content: { 'application/json': { schema } },
})
const errors = {
  '400': response(errorResponse),
  '401': response(errorResponse),
  '403': response(errorResponse),
  '404': response(errorResponse),
}
const security = [{ bearerAuth: [] }]
export const careLinkOpenApiPaths = {
  '/clinical/care-links/me': {
    get: {
      operationId: 'listOwnCareLinks',
      tags: ['Clinico'],
      security,
      requestParams: { query: careLinkQuery },
      responses: { '200': response(careLinkListResponse), ...errors },
    },
  },
  '/clinical/care-links/share': {
    post: {
      operationId: 'shareCareLink',
      tags: ['Clinico'],
      security,
      requestBody: {
        content: { 'application/json': { schema: shareCareLinkBody } },
      },
      responses: { '201': response(careLinkResponse), ...errors },
    },
  },
  '/admin/care-links/substitution': {
    post: {
      operationId: 'substituteCareLink',
      tags: ['Clinico'],
      security,
      requestBody: {
        content: { 'application/json': { schema: substituteCareLinkBody } },
      },
      responses: { '201': response(careLinkResponse), ...errors },
    },
  },
}
