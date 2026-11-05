import type { z } from 'zod'
import {
  appointmentBody,
  appointmentParams,
  bookingResponse,
  idempotencyHeader,
  myAppointmentsQuery,
  myAppointmentsResponse,
  rescheduleBody,
  rescheduleResponse,
} from './contracts/appointments'
import {
  availabilityQuery,
  availabilityResponse,
} from './contracts/availability'
import {
  catalogId,
  catalogPage,
  catalogQuery,
  professionalBody,
  professionalPatch,
  professionalQuery,
  professionalResponse,
  publicProfessionalResponse,
  publicSpecialtyResponse,
  specialtyBody,
  specialtyPatch,
  specialtyResponse,
} from './contracts/catalog'
import { errorResponse } from './contracts/m0'
import { roomBody, roomPatch, roomResponse } from './contracts/rooms'
import {
  publishedScheduleResponse,
  scheduleBody,
  scheduleParams,
  scheduleQuery,
  scheduleResponse,
} from './contracts/schedule'

const response = (schema: z.ZodType) => ({
  description: 'Resposta do catalogo',
  content: { 'application/json': { schema } },
})
const security = [{ bearerAuth: [] }]
const errors = {
  '400': response(errorResponse),
  '401': response(errorResponse),
  '403': response(errorResponse),
  '404': response(errorResponse),
  '409': response(errorResponse),
}
const list = (operationId: string, schema: z.ZodType, query: z.ZodObject) => ({
  operationId,
  tags: ['Catalogo'],
  security,
  requestParams: { query },
  responses: { '200': response(catalogPage(schema)), ...errors },
})
const command = (
  operationId: string,
  schema: z.ZodType,
  result: z.ZodType,
  patch = false,
) => ({
  operationId,
  tags: ['Catalogo'],
  security,
  ...(patch ? { requestParams: { path: catalogId } } : {}),
  requestBody: { content: { 'application/json': { schema } } },
  responses: { [patch ? '200' : '201']: response(result), ...errors },
})
export const catalogOpenApiPaths = {
  '/me/appointments': {
    get: {
      operationId: 'listMyAppointments',
      tags: ['Agenda'],
      security,
      requestParams: { query: myAppointmentsQuery },
      responses: { '200': response(myAppointmentsResponse), ...errors },
    },
  },
  '/appointments/{id}/reschedule': {
    post: {
      operationId: 'rescheduleAppointment',
      tags: ['Agenda'],
      security,
      requestParams: { path: appointmentParams, header: idempotencyHeader },
      requestBody: {
        content: { 'application/json': { schema: rescheduleBody } },
      },
      responses: { '200': response(rescheduleResponse), ...errors },
    },
  },
  '/appointments': {
    post: {
      operationId: 'confirmAppointment',
      tags: ['Agenda'],
      security,
      requestParams: { header: idempotencyHeader },
      requestBody: {
        content: { 'application/json': { schema: appointmentBody } },
      },
      responses: { '201': response(bookingResponse), ...errors },
    },
  },
  '/availability': {
    get: {
      operationId: 'findAvailability',
      tags: ['Agenda'],
      security,
      requestParams: { query: availabilityQuery },
      responses: { '200': response(availabilityResponse), ...errors },
    },
  },
  '/professionals/{id}/schedule': {
    get: {
      operationId: 'readProfessionalSchedule',
      tags: ['Agenda'],
      security,
      requestParams: { path: scheduleParams, query: scheduleQuery },
      responses: { '200': response(scheduleResponse), ...errors },
    },
    put: {
      operationId: 'publishProfessionalSchedule',
      tags: ['Agenda'],
      security,
      requestParams: { path: scheduleParams },
      requestBody: {
        content: { 'application/json': { schema: scheduleBody } },
      },
      responses: { '200': response(publishedScheduleResponse), ...errors },
    },
  },
  '/rooms': { get: list('listRooms', roomResponse, catalogQuery) },
  '/admin/rooms': { post: command('createRoom', roomBody, roomResponse) },
  '/admin/rooms/{id}': {
    patch: command('updateRoom', roomPatch, roomResponse, true),
  },
  '/catalog/specialties': {
    get: list('listCatalogSpecialties', publicSpecialtyResponse, catalogQuery),
  },
  '/catalog/professionals': {
    get: list(
      'listCatalogProfessionals',
      publicProfessionalResponse,
      professionalQuery,
    ),
  },
  '/admin/specialties': {
    get: list('listAdminSpecialties', specialtyResponse, catalogQuery),
    post: command('createSpecialty', specialtyBody, specialtyResponse),
  },
  '/admin/specialties/{id}': {
    patch: command('updateSpecialty', specialtyPatch, specialtyResponse, true),
  },
  '/admin/professionals': {
    get: list(
      'listAdminProfessionals',
      professionalResponse,
      professionalQuery,
    ),
    post: command('createProfessional', professionalBody, professionalResponse),
  },
  '/admin/professionals/{id}': {
    patch: command(
      'updateProfessional',
      professionalPatch,
      professionalResponse,
      true,
    ),
  },
}
