import { randomUUID } from 'node:crypto'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import {
  ApplicationError,
  type ErrorCode,
} from '../../../../application/errors/application-error'

const errors: Record<ErrorCode, { status: number; message: string }> = {
  IMPORT_TOO_LARGE: {
    status: 413,
    message:
      'O arquivo excede o limite da importação. Divida os dados em lotes menores.',
  },
  WAITLIST_NOT_NEEDED: {
    status: 409,
    message:
      'Há horários disponíveis nas suas preferências. Escolha um horário para agendar.',
  },
  BOOKING_CHANGE_WINDOW: {
    status: 409,
    message:
      'O prazo para alterar esta consulta pelo portal terminou. Fale com a recepção.',
  },
  DUPLICATE_SPECIALTY_WARNING: {
    status: 409,
    message:
      'Já existe uma consulta futura nesta especialidade. Confira os dados e confirme se deseja outra consulta.',
  },
  AUTO_BOOKING_SUSPENDED: {
    status: 403,
    message:
      'O agendamento online está temporariamente suspenso. Fale com a recepção para agendar.',
  },
  BOOKING_LEAD_TIME: {
    status: 409,
    message:
      'O horário não atende à antecedência necessária. Escolha outro horário ou fale com a recepção.',
  },
  SLOT_UNAVAILABLE: {
    status: 409,
    message:
      'O horário deixou de estar disponível. Atualize a busca e escolha outro horário.',
  },
  OFFER_EXPIRED: {
    status: 409,
    message:
      'Esta oferta expirou ou já foi utilizada. Confira sua posição na lista de espera.',
  },
  SCHEDULE_IMPACT_REVIEW: {
    status: 409,
    message:
      'Existem consultas afetadas. Reagende ou cancele cada uma antes de publicar a alteração.',
  },
  ACCOUNT_LOCKED: {
    status: 423,
    message: 'Acesso temporariamente bloqueado. Aguarde e tente novamente.',
  },
  TOKEN_EXPIRED: {
    status: 410,
    message: 'Este link expirou ou já foi usado. Solicite um novo link.',
  },
  VALIDATION_ERROR: {
    status: 400,
    message:
      'Há campos inválidos. Confira os campos indicados e tente novamente.',
  },
  UNAUTHENTICATED: {
    status: 401,
    message: 'Sua sessão não está válida. Entre novamente para continuar.',
  },
  FORBIDDEN: {
    status: 403,
    message:
      'Você não tem permissão para esta ação. Consulte o responsável pelo acesso.',
  },
  NOT_FOUND_OR_FORBIDDEN: {
    status: 404,
    message:
      'Este recurso não está disponível. Confira o endereço ou retorne à tela anterior.',
  },
  CONFLICT: {
    status: 409,
    message:
      'O recurso foi alterado ou está indisponível. Atualize a tela e escolha uma alternativa.',
  },
  CONSENT_REQUIRED: {
    status: 409,
    message:
      'É necessário revisar o termo vigente. Abra seus consentimentos para continuar.',
  },
  RATE_LIMITED: {
    status: 429,
    message:
      'Foram feitas muitas tentativas. Aguarde antes de tentar novamente.',
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message:
      'O serviço está temporariamente indisponível. Tente novamente mais tarde.',
  },
  UNPROCESSABLE_FILE: {
    status: 422,
    message: 'O arquivo não pôde ser aceito. Confira o formato e o tamanho.',
  },
}

export const requestId: RequestHandler = (req, res, next) => {
  const supplied = req.get('X-Request-Id')
  res.locals.requestId =
    supplied &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      supplied,
    )
      ? supplied
      : randomUUID()
  res.setHeader('X-Request-Id', res.locals.requestId)
  next()
}

export const notFound: RequestHandler = (_req, _res, next) =>
  next(new ApplicationError('NOT_FOUND_OR_FORBIDDEN'))

export function errorHandler(
  report: (event: { event: string; requestId: string }) => void = (event) =>
    console.error(JSON.stringify(event)),
): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error)
      return
    }
    if (error instanceof ApplicationError) {
      const definition = errors[error.code]
      res.status(definition.status).json({
        error: {
          code: error.code,
          message: definition.message,
          details: error.details,
          ...error.context,
          requestId: res.locals.requestId,
        },
      })
      return
    }
    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      ['entity.parse.failed', 'entity.too.large'].includes(String(error.type))
    ) {
      res.status(error.type === 'entity.too.large' ? 413 : 400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'O conteúdo enviado é inválido ou excede o limite. Confira os dados e tente novamente.',
          requestId: res.locals.requestId,
        },
      })
      return
    }
    report({ event: 'http.unexpected_error', requestId: res.locals.requestId })
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          'Não foi possível concluir a ação. Tente novamente; se persistir, informe o código de atendimento ao suporte.',
        requestId: res.locals.requestId,
      },
    })
  }
}
