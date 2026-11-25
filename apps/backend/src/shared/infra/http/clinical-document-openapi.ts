import type { z } from 'zod'
import {
  clinicalDocumentResponse,
  documentIssueBody,
  documentParams,
  documentTypeChange,
  documentTypeQuery,
  documentTypeResponse,
  documentTypesResponse,
  documentVerificationParams,
  documentVoidBody,
  publicDocumentVerificationResponse,
} from './contracts/clinical-documents'
import { errorResponse } from './contracts/m0'

const response = (schema: z.ZodType) => ({
  description: 'Documento clínico',
  content: { 'application/json': { schema } },
})
const errors = Object.fromEntries(
  ['400', '401', '403', '404', '409', '429', '503'].map((s) => [
    s,
    response(errorResponse),
  ]),
)
const common = {
  tags: ['Clinico'],
  security: [{ bearerAuth: [] }],
  requestParams: { path: documentParams },
}
export const clinicalDocumentOpenApiPaths = {
  '/document-types': {
    get: {
      tags: common.tags,
      security: common.security,
      operationId: 'listDocumentTypes',
      requestParams: { query: documentTypeQuery },
      responses: { '200': response(documentTypesResponse), ...errors },
    },
  },
  '/admin/document-types/{id}': {
    put: {
      ...common,
      operationId: 'changeDocumentType',
      requestBody: {
        content: { 'application/json': { schema: documentTypeChange } },
      },
      responses: { '200': response(documentTypeResponse), ...errors },
    },
  },
  '/documents/verify/{code}': {
    get: {
      tags: common.tags,
      operationId: 'verifyDocumentPublicly',
      security: [],
      requestParams: { path: documentVerificationParams },
      responses: {
        '200': response(publicDocumentVerificationResponse),
        ...errors,
      },
    },
  },
  '/clinical/documents/{id}': {
    get: {
      ...common,
      operationId: 'readClinicalDocument',
      responses: { '200': response(clinicalDocumentResponse), ...errors },
    },
  },
  '/clinical/documents/{id}/issue': {
    post: {
      ...common,
      operationId: 'issueClinicalDocument',
      requestBody: {
        content: { 'application/json': { schema: documentIssueBody } },
      },
      responses: { '200': response(clinicalDocumentResponse), ...errors },
    },
  },
  '/clinical/documents/{id}/void': {
    post: {
      ...common,
      operationId: 'voidClinicalDocument',
      requestBody: {
        content: { 'application/json': { schema: documentVoidBody } },
      },
      responses: { '200': response(clinicalDocumentResponse), ...errors },
    },
  },
}
