import type { z } from 'zod'
import {
  emergencyCreated,
  emergencyDetailSchema,
  emergencyGrantBody,
  emergencyId,
  emergencyQuery,
  emergencyQueueSchema,
  emergencyReviewBody,
  emergencyReviewSchema,
} from './contracts/emergency-access'
import { errorResponse } from './contracts/m0'

const response = (schema: z.ZodType) => ({
  description: 'Acesso de urgência',
  content: { 'application/json': { schema } },
})
const errors = Object.fromEntries(
  ['400', '401', '403', '404', '409', '503'].map((status) => [
    status,
    response(errorResponse),
  ]),
)
const shared = { tags: ['Clinico'], security: [{ bearerAuth: [] }] }
export const emergencyAccessOpenApiPaths = {
  '/clinical/emergency-access': {
    post: {
      ...shared,
      operationId: 'requestEmergencyAccess',
      requestBody: {
        content: { 'application/json': { schema: emergencyGrantBody } },
      },
      responses: { '201': response(emergencyCreated), ...errors },
    },
  },
  '/clinical/emergency-access/{id}': {
    get: {
      ...shared,
      operationId: 'inspectEmergencyAccess',
      requestParams: { path: emergencyId },
      responses: { '200': response(emergencyDetailSchema), ...errors },
    },
  },
  '/admin/emergency-access': {
    get: {
      ...shared,
      operationId: 'listEmergencyReviews',
      requestParams: { query: emergencyQuery },
      responses: { '200': response(emergencyQueueSchema), ...errors },
    },
  },
  '/admin/emergency-access/{id}/review': {
    post: {
      ...shared,
      operationId: 'reviewEmergencyAccess',
      requestParams: { path: emergencyId },
      requestBody: {
        content: { 'application/json': { schema: emergencyReviewBody } },
      },
      responses: { '200': response(emergencyReviewSchema), ...errors },
    },
  },
}
