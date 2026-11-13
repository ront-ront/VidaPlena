import type { z } from 'zod'
import {
  absenceBody,
  absenceCorrectionBody,
  absenceResponse,
} from './contracts/absence'
import {
  appointmentBody,
  appointmentParams,
  attendanceBody,
  attendanceResponse,
  bookingResponse,
  cancelBody,
  cancelResponse,
  idempotencyHeader,
  myAppointmentsQuery,
  myAppointmentsResponse,
  rescheduleBody,
  rescheduleResponse,
} from './contracts/appointments'
import {
  availabilityQuery,
  availabilityResponse,
  schedulingContextResponse,
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
import {
  importConfirmBody,
  importParams,
  importPreviewFields,
  importReadParams,
  importReport,
} from './contracts/imports'
import { errorResponse } from './contracts/m0'
import {
  agendaQuery,
  agendaResponse,
  checkInBody,
  checkInResponse,
  queueQuery,
  queueResponse,
} from './contracts/operational-agenda'
import {
  fitInRoomOptionsQuery,
  roomOptionsQuery,
  roomOptionsResponse,
} from './contracts/room-options'
import { roomBody, roomPatch, roomResponse } from './contracts/rooms'
import {
  ownProfessionalResponse,
  publishedScheduleResponse,
  scheduleBody,
  scheduleParams,
  scheduleQuery,
  scheduleResponse,
} from './contracts/schedule'
import {
  acceptOfferBody,
  acceptOfferResponse,
  fitInBody,
  fitInPatientQuery,
  fitInPatientResponse,
  waitlistBody,
  waitlistCreatedResponse,
  waitlistParams,
  waitlistQuery,
  waitlistResponse,
} from './contracts/waitlist'

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
  '/imports/patients/preview': {
    post: {
      operationId: 'previewPatientImport',
      tags: ['Importacoes'],
      security,
      requestBody: {
        content: { 'multipart/form-data': { schema: importPreviewFields } },
      },
      responses: {
        '200': response(importReport),
        ...errors,
        '400': response(
          errorResponse.extend({
            error: errorResponse.shape.error.extend({
              importReport: importReport.optional(),
            }),
          }),
        ),
        '413': response(errorResponse),
      },
    },
  },
  '/imports/patients/{batchId}/confirm': {
    post: {
      operationId: 'confirmPatientImport',
      tags: ['Importacoes'],
      security,
      requestParams: { path: importParams, header: idempotencyHeader },
      requestBody: {
        content: { 'application/json': { schema: importConfirmBody } },
      },
      responses: { '200': response(importReport), ...errors },
    },
  },
  '/imports/appointments/preview': {
    post: {
      operationId: 'previewAppointmentImport',
      tags: ['Importacoes'],
      security,
      requestBody: {
        content: { 'multipart/form-data': { schema: importPreviewFields } },
      },
      responses: {
        '200': response(importReport),
        ...errors,
        '400': response(
          errorResponse.extend({
            error: errorResponse.shape.error.extend({
              importReport: importReport.optional(),
            }),
          }),
        ),
        '413': response(errorResponse),
      },
    },
  },
  '/imports/appointments/{batchId}/confirm': {
    post: {
      operationId: 'confirmAppointmentImport',
      tags: ['Importacoes'],
      security,
      requestParams: { path: importParams, header: idempotencyHeader },
      requestBody: {
        content: { 'application/json': { schema: importConfirmBody } },
      },
      responses: { '200': response(importReport), ...errors },
    },
  },
  '/imports/{id}': {
    get: {
      operationId: 'readImportReport',
      tags: ['Importacoes'],
      security,
      requestParams: { path: importReadParams },
      responses: { '200': response(importReport), ...errors },
    },
  },
  '/appointments/{id}/absence': {
    post: {
      operationId: 'recordAbsence',
      tags: ['Agenda'],
      security,
      requestParams: { path: appointmentParams },
      requestBody: { content: { 'application/json': { schema: absenceBody } } },
      responses: { '200': response(absenceResponse), ...errors },
    },
    patch: {
      operationId: 'correctAbsence',
      tags: ['Agenda'],
      security,
      requestParams: { path: appointmentParams },
      requestBody: {
        content: { 'application/json': { schema: absenceCorrectionBody } },
      },
      responses: { '200': response(absenceResponse), ...errors },
    },
  },
  '/appointments/{id}/check-in': {
    post: {
      operationId: 'checkInAppointment',
      tags: ['Agenda'],
      security,
      requestParams: { path: appointmentParams },
      requestBody: { content: { 'application/json': { schema: checkInBody } } },
      responses: { '200': response(checkInResponse), ...errors },
    },
  },
  '/agenda/day': {
    get: {
      operationId: 'readAgendaDay',
      tags: ['Agenda'],
      security,
      requestParams: { query: agendaQuery },
      responses: { '200': response(agendaResponse), ...errors },
    },
  },
  '/professionals/me/queue': {
    get: {
      operationId: 'readOwnQueue',
      tags: ['Agenda'],
      security,
      requestParams: { query: queueQuery },
      responses: { '200': response(queueResponse), ...errors },
    },
  },
  '/appointments/{id}/attendance-response': {
    post: {
      operationId: 'respondAttendance',
      tags: ['Agenda'],
      security,
      requestParams: { path: appointmentParams },
      requestBody: {
        content: { 'application/json': { schema: attendanceBody } },
      },
      responses: { '200': response(attendanceResponse), ...errors },
    },
  },
  '/waitlist': {
    get: {
      operationId: 'listWaitlist',
      tags: ['Agenda'],
      security,
      requestParams: { query: waitlistQuery },
      responses: { '200': response(waitlistResponse), ...errors },
    },
    post: {
      operationId: 'enterWaitlist',
      tags: ['Agenda'],
      security,
      requestBody: {
        content: { 'application/json': { schema: waitlistBody } },
      },
      responses: { '201': response(waitlistCreatedResponse), ...errors },
    },
  },
  '/waitlist/{id}': {
    delete: {
      operationId: 'leaveWaitlist',
      tags: ['Agenda'],
      security,
      requestParams: { path: waitlistParams },
      responses: {
        '204': { description: 'Entrada retirada; histórico preservado.' },
        ...errors,
      },
    },
  },
  '/waitlist/offers/{id}/accept': {
    post: {
      operationId: 'acceptWaitlistOffer',
      tags: ['Agenda'],
      security,
      requestParams: { path: waitlistParams, header: idempotencyHeader },
      requestBody: {
        content: { 'application/json': { schema: acceptOfferBody } },
      },
      responses: { '201': response(acceptOfferResponse), ...errors },
    },
  },
  '/appointments/fit-ins': {
    post: {
      operationId: 'bookFitIn',
      tags: ['Agenda'],
      security,
      requestParams: { header: idempotencyHeader },
      requestBody: { content: { 'application/json': { schema: fitInBody } } },
      responses: { '201': response(bookingResponse), ...errors },
    },
  },
  '/appointments/{id}/cancel': {
    post: {
      operationId: 'cancelAppointment',
      tags: ['Agenda'],
      security,
      requestParams: { path: appointmentParams, header: idempotencyHeader },
      requestBody: { content: { 'application/json': { schema: cancelBody } } },
      responses: { '200': response(cancelResponse), ...errors },
    },
  },
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
  '/professionals/me/profile': {
    get: {
      operationId: 'readOwnProfessionalProfile',
      tags: ['Agenda'],
      security,
      responses: { '200': response(ownProfessionalResponse), ...errors },
    },
  },
  '/professionals/{id}/schedule/editor': {
    get: {
      operationId: 'readProfessionalScheduleEditor',
      tags: ['Agenda'],
      security,
      requestParams: { path: scheduleParams },
      responses: { '200': response(scheduleResponse), ...errors },
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
  '/patients/fit-in-candidate': {
    get: {
      operationId: 'findFitInPatient',
      tags: ['Agenda'],
      security,
      requestParams: { query: fitInPatientQuery },
      responses: { '200': response(fitInPatientResponse), ...errors },
    },
  },
  '/scheduling/context': {
    get: {
      operationId: 'readSchedulingContext',
      tags: ['Agenda'],
      security,
      responses: { '200': response(schedulingContextResponse), ...errors },
    },
  },
  '/appointments/fit-ins/room-options': {
    get: {
      operationId: 'findFitInRoomOptions',
      tags: ['Agenda'],
      security,
      requestParams: { query: fitInRoomOptionsQuery },
      responses: { '200': response(roomOptionsResponse), ...errors },
    },
  },
  '/appointments/room-options': {
    get: {
      operationId: 'findRoomOptions',
      tags: ['Agenda'],
      security,
      requestParams: { query: roomOptionsQuery },
      responses: { '200': response(roomOptionsResponse), ...errors },
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
