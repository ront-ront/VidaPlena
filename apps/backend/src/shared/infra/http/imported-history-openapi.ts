import { z } from 'zod'
import {
  importedHistoryAddendumBody,
  importedHistoryAddendumResponse,
  importedHistoryCheckBody,
  importedHistoryCheckResponse,
  importedHistoryDetail,
  importedHistoryId,
  importedHistoryMetadata,
  importedHistoryPatient,
  importedHistoryReceipt,
} from './contracts/imported-history'
import { errorResponse } from './contracts/m0'

const response = (schema: z.ZodType) => ({
  description: 'Histórico importado',
  content: { 'application/json': { schema } },
})
const errors = Object.fromEntries(
  ['400', '401', '403', '404', '422'].map((status) => [
    status,
    response(errorResponse),
  ]),
)
const common = { tags: ['Clinico'], security: [{ bearerAuth: [] }] }
export const importedHistoryOpenApiPaths = {
  '/clinical/records/{patientId}/imported-history': {
    post: {
      ...common,
      operationId: 'blindImportClinicalHistory',
      requestParams: { path: importedHistoryPatient },
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: z.object({
              data: importedHistoryMetadata,
              file: z.string().meta({ format: 'binary' }),
            }),
          },
        },
      },
      responses: { '201': response(importedHistoryReceipt), ...errors },
    },
  },
  '/clinical/imported-history/{id}': {
    get: {
      ...common,
      operationId: 'readImportedHistory',
      requestParams: { path: importedHistoryId },
      responses: { '200': response(importedHistoryDetail), ...errors },
    },
  },
  '/clinical/imported-history/{id}/check': {
    post: {
      ...common,
      operationId: 'checkImportedHistory',
      requestParams: { path: importedHistoryId },
      requestBody: {
        content: { 'application/json': { schema: importedHistoryCheckBody } },
      },
      responses: { '200': response(importedHistoryCheckResponse), ...errors },
    },
  },
  '/clinical/imported-history/{id}/addenda': {
    post: {
      ...common,
      operationId: 'addImportedHistoryAddendum',
      requestParams: { path: importedHistoryId },
      requestBody: {
        content: {
          'application/json': { schema: importedHistoryAddendumBody },
        },
      },
      responses: {
        '201': response(importedHistoryAddendumResponse),
        ...errors,
      },
    },
  },
}
