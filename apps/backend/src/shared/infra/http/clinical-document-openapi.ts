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
import {
  pendingExamOrderQuery,
  pendingExamOrderResponse,
} from './contracts/exam-orders'
import { errorResponse } from './contracts/m0'
import {
  allergyCheckResponse,
  documentDraftBody,
  documentDraftPatch,
  documentReuseBody,
  medicationListResponse,
} from './contracts/prescriptions'
import { terminologyQuery } from './contracts/terminologies'

const response = (schema: z.ZodType) => ({
  description: 'Documento clínico',
  content: { 'application/json': { schema } },
})
const errors = Object.fromEntries(
  ['400', '401', '403', '404', '409', '422', '429', '503'].map((s) => [
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
  '/clinical/exam-orders/pending': {
    get: {
      tags: common.tags,
      security: common.security,
      operationId: 'listPendingExamOrders',
      requestParams: { query: pendingExamOrderQuery },
      responses: { '200': response(pendingExamOrderResponse), ...errors },
    },
  },

  '/terminologies/medications': {
    get: {
      tags: common.tags,
      security: common.security,
      operationId: 'searchMedications',
      requestParams: { query: terminologyQuery },
      responses: { '200': response(medicationListResponse), ...errors },
    },
  },
  '/clinical/encounters/{id}/documents/drafts': {
    post: {
      ...common,
      operationId: 'createClinicalDocumentDraft',
      requestBody: {
        content: { 'application/json': { schema: documentDraftBody } },
      },
      responses: { '201': response(clinicalDocumentResponse), ...errors },
    },
  },
  '/clinical/encounters/{id}/documents/reuse': {
    post: {
      ...common,
      operationId: 'reuseClinicalDocument',
      requestBody: {
        content: { 'application/json': { schema: documentReuseBody } },
      },
      responses: { '201': response(clinicalDocumentResponse), ...errors },
    },
  },
  '/clinical/documents/{id}/draft': {
    patch: {
      ...common,
      operationId: 'patchClinicalDocumentDraft',
      requestBody: {
        content: { 'application/json': { schema: documentDraftPatch } },
      },
      responses: { '200': response(clinicalDocumentResponse), ...errors },
    },
  },
  '/clinical/documents/{id}/allergy-check': {
    get: {
      ...common,
      operationId: 'reviewPrescriptionAllergies',
      responses: { '200': response(allergyCheckResponse), ...errors },
    },
  },

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
