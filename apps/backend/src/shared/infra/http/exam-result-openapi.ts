import { z } from 'zod'
import {
  examResultDetail,
  examResultId,
  examResultMetadata,
  examResultPage,
  examResultPatient,
  examResultQuery,
  examResultReceipt,
} from './contracts/exam-results'
import { errorResponse } from './contracts/m0'

const response = (schema: z.ZodType) => ({
  description: 'Resultado de exame',
  content: { 'application/json': { schema } },
})
const common = { tags: ['Clinico'], security: [{ bearerAuth: [] }] }
const errors = Object.fromEntries(
  ['400', '401', '403', '404', '409', '422'].map((status) => [
    status,
    response(errorResponse),
  ]),
)
export const examResultOpenApiPaths = {
  '/clinical/exam-results': {
    post: {
      ...common,
      operationId: 'uploadExamResult',
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: z.object({
              data: examResultMetadata,
              resultFile: z.string().meta({ format: 'binary' }),
            }),
          },
        },
      },
      responses: { '201': response(examResultReceipt), ...errors },
    },
  },
  '/clinical/exam-results/{id}': {
    get: {
      ...common,
      operationId: 'readExamResult',
      requestParams: { path: examResultId },
      responses: { '200': response(examResultDetail), ...errors },
    },
  },
  '/clinical/records/{patientId}/exam-results': {
    get: {
      ...common,
      operationId: 'listExamResults',
      requestParams: { path: examResultPatient, query: examResultQuery },
      responses: { '200': response(examResultPage), ...errors },
    },
  },
}
