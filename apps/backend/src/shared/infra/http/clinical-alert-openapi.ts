import type { z } from 'zod'
import {
  alertBody,
  alertConfirmBody,
  alertDeactivateBody,
  alertPageResponse,
  alertParams,
  alertPatientParams,
  alertQuery,
  alertResponse,
} from './contracts/clinical-alerts'
import { errorResponse } from './contracts/m0'

const response = (schema: z.ZodType) => ({
  description: 'Alerta clínico',
  content: { 'application/json': { schema } },
})
const errors = Object.fromEntries(
  ['400', '401', '403', '404', '409'].map((s) => [s, response(errorResponse)]),
)
const common = { tags: ['Clinico'], security: [{ bearerAuth: [] }] }
export const clinicalAlertOpenApiPaths = {
  '/clinical/records/{patientId}/alerts': {
    get: {
      ...common,
      operationId: 'listClinicalAlerts',
      requestParams: { path: alertPatientParams, query: alertQuery },
      responses: { '200': response(alertPageResponse), ...errors },
    },
    post: {
      ...common,
      operationId: 'createClinicalAlert',
      requestParams: { path: alertPatientParams },
      requestBody: { content: { 'application/json': { schema: alertBody } } },
      responses: { '201': response(alertResponse), ...errors },
    },
  },
  '/clinical/alerts/{id}/confirm': {
    post: {
      ...common,
      operationId: 'confirmClinicalAlert',
      requestParams: { path: alertParams },
      requestBody: {
        content: { 'application/json': { schema: alertConfirmBody } },
      },
      responses: { '200': response(alertResponse), ...errors },
    },
  },
  '/clinical/alerts/{id}/deactivate': {
    post: {
      ...common,
      operationId: 'deactivateClinicalAlert',
      requestParams: { path: alertParams },
      requestBody: {
        content: { 'application/json': { schema: alertDeactivateBody } },
      },
      responses: { '200': response(alertResponse), ...errors },
    },
  },
}
