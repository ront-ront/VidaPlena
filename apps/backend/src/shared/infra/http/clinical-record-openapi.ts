import type { z } from 'zod'
import {
  encounterResponse,
  openEncounterBody,
  recordHeaderResponse,
  recordParams,
  timelineQuery,
  timelineResponse,
} from './contracts/clinical-records'
import { errorResponse } from './contracts/m0'

const response = (schema: z.ZodType) => ({
  description: 'Prontuário autorizado',
  content: { 'application/json': { schema } },
})
const errors = Object.fromEntries(
  ['400', '401', '403', '404', '409'].map((status) => [
    status,
    response(errorResponse),
  ]),
)
const shared = { tags: ['Clinico'], security: [{ bearerAuth: [] }] }
export const clinicalRecordOpenApiPaths = {
  '/clinical/records/{patientId}': {
    get: {
      ...shared,
      operationId: 'readClinicalRecord',
      requestParams: { path: recordParams },
      responses: { '200': response(recordHeaderResponse), ...errors },
    },
  },
  '/clinical/records/{patientId}/timeline': {
    get: {
      ...shared,
      operationId: 'readClinicalTimeline',
      requestParams: { path: recordParams, query: timelineQuery },
      responses: { '200': response(timelineResponse), ...errors },
    },
  },
  '/clinical/encounters': {
    post: {
      ...shared,
      operationId: 'startClinicalEncounter',
      requestBody: {
        content: { 'application/json': { schema: openEncounterBody } },
      },
      responses: {
        '200': response(encounterResponse),
        '201': response(encounterResponse),
        ...errors,
      },
    },
  },
}
