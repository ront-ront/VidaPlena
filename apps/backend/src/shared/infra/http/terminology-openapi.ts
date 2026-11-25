import { errorResponse } from './contracts/m0'
import {
  terminologyListResponse,
  terminologyQuery,
} from './contracts/terminologies'

const errors = Object.fromEntries(
  ['400', '401', '403', '404', '503'].map((status) => [
    status,
    {
      description: 'Erro de catálogo',
      content: { 'application/json': { schema: errorResponse } },
    },
  ]),
)
const common = {
  tags: ['Clinico'],
  security: [{ bearerAuth: [] }],
  requestParams: { query: terminologyQuery },
  responses: {
    '200': {
      description: 'Catálogo local; demo explícito',
      content: { 'application/json': { schema: terminologyListResponse } },
    },
    ...errors,
  },
}
export const terminologyOpenApiPaths = {
  '/terminologies/cid10': {
    get: { ...common, operationId: 'searchDiagnosisCodes' },
  },
  '/terminologies/tuss': {
    get: { ...common, operationId: 'searchProcedureCodes' },
  },
}
