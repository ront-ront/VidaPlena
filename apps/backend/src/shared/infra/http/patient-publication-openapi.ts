import type { z } from 'zod'
import { errorResponse } from './contracts/m0'
import {
  patientHistoryQuery,
  patientHistoryResponse,
  publicationId,
  publicationInputSchema,
  publicationListQuery,
  publicationListResponse,
  publicationPatient,
  publicationReceipt,
  publicationRevoke,
  publishedDocumentResponse,
} from './contracts/patient-publications'

const response = (schema: z.ZodType) => ({
  description: 'Publicação clínica',
  content: { 'application/json': { schema } },
})
const common = { tags: ['Clinico'], security: [{ bearerAuth: [] }] }
const errors = Object.fromEntries(
  ['400', '401', '403', '404', '409', '503'].map((s) => [
    s,
    response(errorResponse),
  ]),
)
export const patientPublicationOpenApiPaths = {
  '/clinical/publications': {
    post: {
      ...common,
      operationId: 'publishPatientResource',
      requestBody: {
        content: { 'application/json': { schema: publicationInputSchema } },
      },
      responses: { '201': response(publicationReceipt), ...errors },
    },
  },
  '/clinical/publications/{id}/revoke': {
    post: {
      ...common,
      operationId: 'revokePatientPublication',
      requestParams: { path: publicationId },
      requestBody: {
        content: { 'application/json': { schema: publicationRevoke } },
      },
      responses: { '200': response(publicationReceipt), ...errors },
    },
  },
  '/clinical/records/{patientId}/publications': {
    get: {
      ...common,
      operationId: 'listPatientPublications',
      requestParams: { path: publicationPatient, query: publicationListQuery },
      responses: { '200': response(publicationListResponse), ...errors },
    },
  },
  '/me/clinical-history': {
    get: {
      ...common,
      operationId: 'readOwnClinicalHistory',
      requestParams: { query: patientHistoryQuery },
      responses: { '200': response(patientHistoryResponse), ...errors },
    },
  },
  '/me/clinical-documents/{id}': {
    get: {
      ...common,
      operationId: 'readOwnPublishedDocument',
      requestParams: { path: publicationId },
      responses: { '200': response(publishedDocumentResponse), ...errors },
    },
  },
}
