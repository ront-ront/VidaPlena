import { apiReference } from '@scalar/express-api-reference'
import type { Router } from 'express'
import { z } from 'zod'
import { createDocument } from 'zod-openapi'
import {
  consentActionBody,
  consentDocumentResponse,
  consentEventResponse,
  currentConsentQuery,
  onsiteConsentData,
  onsiteRegistrationData,
  publishConsentDocumentBody,
  registrationBody,
  registrationResponse,
  revokeConsentBody,
} from './contracts/consent'
import {
  acceptInvitationBody,
  cursorQuery,
  dpoBody,
  emailContactBody,
  errorResponse,
  invitationTokenBody,
  inviteUserBody,
  loginBody,
  mfaEnrollBody,
  mfaVerifyBody,
  notificationPreferencesBody,
  phoneContactBody,
  recoveryCompleteBody,
  recoveryRequestBody,
  rolesBody,
  statusBody,
  userIdParams,
  userListQuery,
} from './contracts/m0'
import { maintenanceBody, maintenanceResponse } from './contracts/maintenance'
import {
  consentMetadataQuery,
  subjectCreatedResponse,
  subjectQueueQuery,
  subjectRequestBody,
  subjectRequestListQuery,
  subjectRequestParams,
  subjectResolutionBody,
  subjectResolvedResponse,
} from './contracts/subject-requests'

const accepted = z.object({
  userId: z.uuid(),
  status: z.literal('invited'),
  invitationExpiresAt: z.iso.datetime(),
})
const userChange = z.object({
  userId: z.uuid(),
  status: z.string(),
  roles: z.array(z.string()),
  dpoDesignated: z.boolean(),
})
const preference = notificationPreferencesBody
const collection = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  nextCursor: z.uuid().nullable(),
})
const json = (schema: z.ZodType) => ({
  content: { 'application/json': { schema } },
})
const response = (schema: z.ZodType, description: string) => ({
  description,
  ...json(schema),
})
const evidenceMultipart = (dataSchema: z.ZodType) => ({
  description: `Parte data contém JSON válido conforme ${dataSchema.description ?? 'contrato de consentimento'}; envie-a antes de signedTerm.`,
  content: {
    'multipart/form-data': {
      schema: z.object({
        data: z.string().meta({
          description: 'JSON da parte data',
          contentMediaType: 'application/json',
          contentSchema: z.toJSONSchema(dataSchema),
        }),
        signedTerm: z.string().meta({ format: 'binary' }),
      }),
    },
  },
})
const errors = {
  '400': response(errorResponse, 'Campos inválidos'),
  '401': response(errorResponse, 'Sessão não autenticada'),
  '403': response(errorResponse, 'Ação não autorizada'),
  '409': response(errorResponse, 'Conflito de estado'),
}
const bearer = [{ bearerAuth: [] }]
const sessionTokens = z.object({
  status: z.literal('authenticated'),
  accessToken: z.string(),
  expiresAt: z.iso.datetime(),
  user: z.object({
    id: z.uuid(),
    roles: z.array(z.string()),
    permissions: z.array(z.string()),
  }),
})

/** Generated from the same Zod schemas used by the mounted M0 HTTP routes. */
export const openApiDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'VidaPlena API',
    version: '0.1.0',
    description:
      'Contratos HTTP implementados da M0. Regras e escopo: specs/shared/api-contracts.md.',
  },
  servers: [{ url: '/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths: {
    '/admin/ops/maintenance-windows': {
      get: {
        operationId: 'listMaintenanceWindows',
        summary: 'Consultar janelas de manutenção registradas',
        tags: ['Operação'],
        security: bearer,
        responses: {
          '200': response(
            z.object({
              items: z.array(
                maintenanceResponse.extend({ createdBy: z.uuid() }),
              ),
            }),
            'Janelas registradas',
          ),
          ...errors,
        },
      },
      post: {
        operationId: 'registerMaintenanceWindow',
        summary: 'Registrar janela com referência ao aviso externo',
        tags: ['Operação'],
        security: bearer,
        requestBody: json(maintenanceBody),
        responses: {
          '201': response(maintenanceResponse, 'Janela registrada e auditada'),
          ...errors,
        },
      },
    },
    '/admin/ops/metrics': {
      get: {
        operationId: 'readOperationalMetrics',
        summary: 'Métricas Prometheus restritas a admin',
        tags: ['Operação'],
        security: bearer,
        responses: {
          '200': {
            description: 'Métricas agregadas sem dados pessoais',
            content: { 'text/plain': { schema: z.string() } },
          },
          ...errors,
        },
      },
    },
    '/me/subject-requests': {
      post: {
        operationId: 'createSubjectRequest',
        summary: 'Abrir solicitação do titular',
        tags: ['Privacidade'],
        security: bearer,
        requestBody: json(subjectRequestBody),
        responses: {
          '201': response(subjectCreatedResponse, 'Pedido aberto'),
          ...errors,
        },
      },
      get: {
        operationId: 'listOwnSubjectRequests',
        summary: 'Consultar próprios pedidos',
        tags: ['Privacidade'],
        security: bearer,
        requestParams: { query: subjectRequestListQuery },
        responses: {
          '200': response(collection, 'Pedidos próprios'),
          ...errors,
        },
      },
    },
    '/me/subject-requests/{id}/export': {
      get: {
        operationId: 'downloadSubjectExport',
        summary: 'Baixar exportação do titular',
        tags: ['Privacidade'],
        security: bearer,
        requestParams: { path: subjectRequestParams },
        responses: {
          '200': {
            description: 'JSON estruturado, acesso do solicitante auditado',
            content: {
              'application/json': {
                schema: z.object({
                  format: z.string(),
                  generatedAt: z.iso.datetime(),
                  patient: z.record(z.string(), z.unknown()),
                  consents: z.array(z.record(z.string(), z.unknown())),
                  scope: z.string(),
                }),
              },
            },
          },
          ...errors,
        },
      },
    },
    '/privacy/subject-requests': {
      get: {
        operationId: 'listPrivacyQueue',
        summary: 'Fila de solicitações sem conteúdo clínico',
        tags: ['Privacidade'],
        security: bearer,
        requestParams: { query: subjectQueueQuery },
        responses: {
          '200': response(collection, 'Fila autorizada'),
          ...errors,
        },
      },
    },
    '/privacy/consents': {
      get: {
        operationId: 'listConsentMetadata',
        summary: 'Metadados de consentimento para DPO',
        tags: ['Privacidade'],
        security: bearer,
        requestParams: { query: consentMetadataQuery },
        responses: {
          '200': response(collection, 'Metadados auditados'),
          ...errors,
        },
      },
    },
    '/privacy/subject-requests/{id}/resolve': {
      post: {
        operationId: 'resolveSubjectRequest',
        summary: 'Decidir solicitação do titular',
        tags: ['Privacidade'],
        security: bearer,
        requestParams: { path: subjectRequestParams },
        requestBody: json(subjectResolutionBody),
        responses: {
          '200': response(subjectResolvedResponse, 'Decisão auditada'),
          ...errors,
        },
      },
    },
    '/consent-documents/current': {
      get: {
        operationId: 'currentDataConsentDocument',
        summary: 'Termo de dados vigente',
        tags: ['Consentimento'],
        requestParams: { query: currentConsentQuery },
        responses: {
          '200': response(consentDocumentResponse, 'Termo vigente'),
          '404': response(errorResponse, 'Nenhum termo vigente'),
        },
      },
    },
    '/admin/consent-documents': {
      post: {
        operationId: 'publishDataConsentDocument',
        summary: 'Publicar versão imutável do termo',
        tags: ['Consentimento'],
        security: bearer,
        requestBody: json(publishConsentDocumentBody),
        responses: {
          '201': response(
            z.object({
              id: z.uuid(),
              version: z.string(),
              effectiveAt: z.iso.datetime(),
            }),
            'Versão publicada e auditada',
          ),
          ...errors,
        },
      },
    },
    '/patient-registrations': {
      post: {
        operationId: 'registerPatientWithConsent',
        summary: 'Cadastrar paciente ou dependente com aceite atômico',
        tags: ['Consentimento', 'Pacientes'],
        requestBody: json(registrationBody),
        responses: {
          '201': response(
            registrationResponse,
            'Cadastro e aceite persistidos',
          ),
          ...errors,
        },
      },
    },
    '/patients': {
      post: {
        operationId: 'registerPatientOnsite',
        summary: 'Cadastro presencial com termo assinado obrigatório',
        tags: ['Consentimento', 'Pacientes'],
        security: bearer,
        requestBody: evidenceMultipart(onsiteRegistrationData),
        responses: {
          '201': response(
            registrationResponse.extend({ signedFileId: z.uuid() }),
            'Cadastro, aceite e evidência associados',
          ),
          ...errors,
          '422': response(errorResponse, 'Termo inválido ou ausente'),
        },
      },
    },
    '/patients/{id}/onsite-consents': {
      post: {
        operationId: 'recordOnsiteConsent',
        summary: 'Registrar novo aceite presencial',
        tags: ['Consentimento'],
        security: bearer,
        requestParams: { path: z.object({ id: z.uuid() }) },
        requestBody: evidenceMultipart(onsiteConsentData),
        responses: {
          '201': response(
            consentEventResponse.extend({ signedFileId: z.uuid() }),
            'Aceite e evidência associados',
          ),
          ...errors,
          '422': response(errorResponse, 'Termo inválido ou ausente'),
        },
      },
    },
    '/me/consents': {
      get: {
        operationId: 'myConsentHistory',
        summary: 'Histórico próprio e dos dependentes vinculados',
        tags: ['Consentimento'],
        security: bearer,
        responses: {
          '200': response(
            z.object({
              items: z.array(
                z.object({
                  patientId: z.uuid(),
                  consentEventId: z.uuid(),
                  version: z.string(),
                  action: z.enum(['accept', 'refuse', 'revoke']),
                  occurredAt: z.iso.datetime(),
                  source: z.string(),
                }),
              ),
            }),
            'Histórico append-only',
          ),
          '401': response(errorResponse, 'Sessão inválida'),
        },
      },
      post: {
        operationId: 'recordPortalConsent',
        summary: 'Aceitar ou recusar termo no portal',
        tags: ['Consentimento'],
        security: bearer,
        requestBody: json(consentActionBody),
        responses: {
          '201': response(consentEventResponse, 'Manifestação registrada'),
          ...errors,
        },
      },
    },
    '/me/consents/revoke': {
      post: {
        operationId: 'revokeDataConsent',
        summary: 'Revogar e restringir portal imediatamente',
        tags: ['Consentimento'],
        security: bearer,
        requestBody: json(revokeConsentBody),
        responses: {
          '201': response(
            consentEventResponse.extend({
              portalState: z.literal('restricted'),
            }),
            'Revogação registrada e sessão encerrada',
          ),
          ...errors,
        },
      },
    },
    '/files/{id}/download-link': {
      post: {
        operationId: 'createFileDownloadLink',
        summary: 'Emitir link curto para arquivo autorizado',
        tags: ['Arquivos'],
        security: bearer,
        requestParams: {
          path: z.object({ id: z.uuid() }),
        },
        responses: {
          '200': response(
            z.object({ url: z.string(), expiresAt: z.iso.datetime() }),
            'Link restrito à sessão atual',
          ),
          '401': response(errorResponse, 'Sessão inválida'),
          '404': response(
            errorResponse,
            'Arquivo indisponível ou sem permissão',
          ),
        },
      },
    },
    '/file-download/{token}': {
      get: {
        operationId: 'downloadFile',
        summary: 'Baixar arquivo com sessão, link e permissão atual',
        tags: ['Arquivos'],
        security: bearer,
        requestParams: { path: z.object({ token: z.string() }) },
        responses: {
          '200': { description: 'Stream binário auditado' },
          '401': response(errorResponse, 'Sessão inválida'),
          '403': response(errorResponse, 'Link vinculado a outra sessão'),
          '404': response(
            errorResponse,
            'Arquivo indisponível ou sem permissão',
          ),
          '410': response(errorResponse, 'Link inválido ou expirado'),
        },
      },
    },
    '/me/dependents': {
      get: {
        operationId: 'listMyDependents',
        summary: 'Listar dependentes legalmente vinculados',
        tags: ['Pacientes'],
        security: bearer,
        responses: {
          '200': response(
            z.object({
              items: z.array(
                z.object({
                  patientId: z.uuid(),
                  fullName: z.string(),
                  relationship: z.string(),
                  status: z.string(),
                }),
              ),
            }),
            'Somente vínculos ativos do próprio usuário',
          ),
          '401': response(errorResponse, 'Sessão inválida'),
        },
      },
    },
    '/auth/recovery/request': {
      post: {
        operationId: 'requestPasswordRecovery',
        summary: 'Solicitar recuperação sem revelar existência de conta',
        tags: ['Identidade'],
        requestBody: json(recoveryRequestBody),
        responses: {
          '202': response(
            z.object({ status: z.literal('accepted') }),
            'Pedido recebido',
          ),
          '429': response(errorResponse, 'Limite de pedidos excedido'),
        },
      },
    },
    '/auth/recovery/complete': {
      post: {
        operationId: 'completePasswordRecovery',
        summary: 'Redefinir senha com token de uso único',
        tags: ['Identidade'],
        requestBody: json(recoveryCompleteBody),
        responses: {
          '204': {
            description: 'Senha redefinida; sessões anteriores revogadas',
          },
          '400': response(errorResponse, 'Senha rejeitada'),
          '410': response(errorResponse, 'Link expirado ou usado'),
        },
      },
    },
    '/auth/contact-verifications/complete': {
      post: {
        operationId: 'confirmNewEmail',
        summary: 'Confirmar novo e-mail com token',
        tags: ['Identidade'],
        requestBody: json(invitationTokenBody),
        responses: {
          '204': { description: 'Novo e-mail confirmado' },
          '410': response(errorResponse, 'Link expirado ou usado'),
        },
      },
    },
    '/me/contact': {
      patch: {
        operationId: 'requestEmailChange',
        summary: 'Solicitar alteração do e-mail próprio',
        tags: ['Identidade'],
        security: bearer,
        requestBody: json(emailContactBody),
        responses: {
          '202': response(
            z.object({ status: z.literal('pending') }),
            'Confirmação pendente',
          ),
          ...errors,
        },
      },
    },
    '/onsite-contact/phone': {
      post: {
        operationId: 'confirmPatientPhoneOnsite',
        summary: 'Confirmar telefone presencialmente',
        tags: ['Identidade'],
        security: bearer,
        requestBody: json(phoneContactBody),
        responses: {
          '200': response(
            z.object({ status: z.literal('confirmed') }),
            'Telefone confirmado',
          ),
          ...errors,
        },
      },
    },
    '/auth/login': {
      post: {
        operationId: 'login',
        summary: 'Iniciar sessão ou desafio MFA',
        tags: ['Identidade'],
        requestBody: json(loginBody),
        responses: {
          '200': response(sessionTokens, 'Paciente autenticado'),
          '202': response(
            z.object({
              status: z.literal('mfa_required'),
              challengeId: z.string(),
              expiresAt: z.iso.datetime(),
              enrollmentRequired: z.boolean(),
            }),
            'Segundo fator exigido',
          ),
          '401': response(errorResponse, 'Credenciais inválidas'),
          '423': response(errorResponse, 'Conta temporariamente bloqueada'),
          '429': response(errorResponse, 'Muitas tentativas'),
        },
      },
    },
    '/auth/mfa/enroll': {
      post: {
        operationId: 'enrollMfa',
        summary: 'Obter segredo TOTP para matrícula',
        tags: ['Identidade'],
        requestBody: json(mfaEnrollBody),
        responses: {
          '200': response(
            z.object({ secret: z.string(), otpauthUri: z.string() }),
            'Segredo TOTP exibido apenas no desafio válido',
          ),
          '401': response(errorResponse, 'Desafio inválido'),
        },
      },
    },
    '/auth/mfa/verify': {
      post: {
        operationId: 'verifyMfa',
        summary: 'Concluir segundo fator',
        tags: ['Identidade'],
        requestBody: json(mfaVerifyBody),
        responses: {
          '200': response(sessionTokens, 'Sessão autenticada'),
          '401': response(errorResponse, 'Código ou desafio inválido'),
        },
      },
    },
    '/auth/refresh': {
      post: {
        operationId: 'refreshSession',
        summary: 'Rotacionar sessão com vp_refresh e X-CSRF-Token',
        tags: ['Identidade'],
        responses: {
          '200': response(
            z.object({ accessToken: z.string(), expiresAt: z.iso.datetime() }),
            'Novo access token; refresh e CSRF rotacionados em cookies',
          ),
          '401': response(errorResponse, 'Sessão expirada ou reutilizada'),
          '403': response(errorResponse, 'Origem ou CSRF inválido'),
        },
      },
    },
    '/auth/logout': {
      post: {
        operationId: 'logout',
        summary: 'Revogar sessão com vp_refresh e X-CSRF-Token',
        tags: ['Identidade'],
        responses: {
          '204': { description: 'Sessão revogada; cookies removidos' },
          '401': response(errorResponse, 'Sessão ausente'),
          '403': response(errorResponse, 'Origem ou CSRF inválido'),
        },
      },
    },
    '/me': {
      get: {
        operationId: 'currentUser',
        summary: 'Consultar projeção do usuário atual',
        tags: ['Identidade'],
        security: bearer,
        responses: {
          '200': response(
            z.object({
              id: z.uuid(),
              roles: z.array(z.string()),
              permissions: z.array(z.string()),
              profile: z.object({
                fullName: z.string(),
                email: z.email(),
                phone: z.string().nullable(),
              }),
              consentState: z.string(),
            }),
            'Perfil filtrado do usuário atual',
          ),
          '401': response(errorResponse, 'Sessão inválida'),
        },
      },
    },
    '/admin/users': {
      post: {
        operationId: 'inviteInternalUser',
        summary: 'Convidar usuário interno',
        tags: ['Administração'],
        security: bearer,
        requestBody: json(inviteUserBody),
        responses: { '201': response(accepted, 'Convite criado'), ...errors },
      },
      get: {
        operationId: 'listInternalUsers',
        summary: 'Listar contas internas',
        tags: ['Administração'],
        security: bearer,
        requestParams: { query: userListQuery },
        responses: {
          '200': response(
            collection.extend({ dpoDesignated: z.boolean() }),
            'Contas e estado do DPO',
          ),
          ...errors,
        },
      },
    },
    '/admin/users/{id}/invitation': {
      post: {
        operationId: 'resendInvitation',
        summary: 'Reenviar convite',
        tags: ['Administração'],
        security: bearer,
        requestParams: { path: userIdParams },
        responses: {
          '201': response(accepted, 'Novo convite criado'),
          ...errors,
        },
      },
    },
    '/admin/users/{id}/roles': {
      put: {
        operationId: 'replaceUserRoles',
        summary: 'Alterar papéis',
        tags: ['Administração'],
        security: bearer,
        requestParams: { path: userIdParams },
        requestBody: json(rolesBody),
        responses: {
          '200': response(userChange, 'Papéis atualizados'),
          ...errors,
        },
      },
    },
    '/admin/users/{id}/status': {
      patch: {
        operationId: 'setUserStatus',
        summary: 'Alterar status de conta',
        tags: ['Administração'],
        security: bearer,
        requestParams: { path: userIdParams },
        requestBody: json(statusBody),
        responses: {
          '200': response(userChange, 'Status atualizado'),
          ...errors,
        },
      },
    },
    '/admin/users/{id}/permissions/privacy.dpo': {
      put: {
        operationId: 'setDpoPermission',
        summary: 'Atribuir ou retirar permissão DPO',
        tags: ['Administração'],
        security: bearer,
        requestParams: { path: userIdParams },
        requestBody: json(dpoBody),
        responses: {
          '200': response(userChange, 'Permissão atualizada'),
          ...errors,
        },
      },
    },
    '/auth/invitations/inspect': {
      post: {
        operationId: 'inspectInvitation',
        summary: 'Conferir convite',
        tags: ['Identidade'],
        requestBody: json(invitationTokenBody),
        responses: {
          '200': response(
            z.object({
              fullName: z.string(),
              roles: z.array(z.string()),
              expiresAt: z.iso.datetime(),
            }),
            'Convite válido',
          ),
          '410': response(errorResponse, 'Link expirado ou usado'),
        },
      },
    },
    '/auth/invitations/accept': {
      post: {
        operationId: 'acceptInvitation',
        summary: 'Aceitar convite',
        tags: ['Identidade'],
        requestBody: json(acceptInvitationBody),
        responses: {
          '200': response(
            z.object({ status: z.literal('active') }),
            'Conta ativada',
          ),
          '400': response(errorResponse, 'Senha inválida'),
          '410': response(errorResponse, 'Link expirado ou usado'),
        },
      },
    },
    '/me/notification-preferences': {
      get: {
        operationId: 'getNotificationPreferences',
        summary: 'Consultar preferências',
        tags: ['Notificações'],
        security: bearer,
        responses: {
          '200': response(preference, 'Preferências atuais'),
          ...errors,
        },
      },
      put: {
        operationId: 'putNotificationPreferences',
        summary: 'Alterar preferências',
        tags: ['Notificações'],
        security: bearer,
        requestBody: json(preference),
        responses: {
          '200': response(preference, 'Preferências atualizadas'),
          ...errors,
        },
      },
    },
    '/me/notifications': {
      get: {
        operationId: 'listMyNotifications',
        summary: 'Consultar notificações próprias',
        tags: ['Notificações'],
        security: bearer,
        requestParams: { query: cursorQuery },
        responses: {
          '200': response(collection, 'Notificações filtradas'),
          ...errors,
        },
      },
    },
    '/notifications/attention': {
      get: {
        operationId: 'listNotificationAttention',
        summary: 'Avisos operacionais para recepção',
        tags: ['Notificações'],
        security: bearer,
        requestParams: { query: cursorQuery },
        responses: {
          '200': response(collection, 'Avisos sem conteúdo clínico'),
          ...errors,
        },
      },
    },
  },
})

export function registerApiDocumentation(router: Router) {
  router.get('/openapi.json', (_req, res) => res.json(openApiDocument))
  router.use(
    '/docs',
    apiReference({ content: openApiDocument, persistAuth: false }),
  )
}
