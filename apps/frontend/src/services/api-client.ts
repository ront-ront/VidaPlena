import { publicEnv } from './env'

export type ApiFieldError = { field: string; reason: string }

type ApiErrorBody = {
  error?: {
    code?: string
    message?: string
    requestId?: string
    details?: ApiFieldError[]
  }
}

const errorMessages: Record<string, string> = {
  ACCOUNT_LOCKED:
    'Acesso temporariamente bloqueado. Aguarde e tente novamente.',
  CONFLICT:
    'Os dados foram alterados ou estão indisponíveis. Atualize a página e tente novamente.',
  CONSENT_REQUIRED: 'Revise o termo vigente para continuar.',
  FORBIDDEN:
    'Você não tem permissão para esta ação. Fale com a equipe responsável.',
  INTERNAL_ERROR:
    'Não foi possível concluir a ação. Tente novamente mais tarde.',
  NOT_FOUND_OR_FORBIDDEN:
    'Esta informação não está disponível. Volte e tente novamente.',
  RATE_LIMITED:
    'Foram feitas muitas tentativas. Aguarde antes de tentar novamente.',
  SERVICE_UNAVAILABLE:
    'O serviço está temporariamente indisponível. Tente novamente mais tarde.',
  TOKEN_EXPIRED: 'Este link expirou ou já foi usado. Solicite um novo link.',
  UNAUTHENTICATED: 'Sua sessão terminou. Entre novamente para continuar.',
  UNPROCESSABLE_FILE:
    'O arquivo não pôde ser aceito. Confira formato e tamanho.',
  VALIDATION_ERROR: 'Confira os campos indicados e tente novamente.',
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly details: ApiFieldError[] = [],
  ) {
    super(
      errorMessages[code] ??
        'Não foi possível concluir a ação. Tente novamente.',
    )
    this.name = 'ApiError'
  }
}

type Fetcher = typeof fetch
type SessionTokens = { accessToken: string; expiresAt: string }

function csrfFromCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const part = document.cookie
    .split('; ')
    .find((value) => value.startsWith('vp_csrf='))
  return part ? decodeURIComponent(part.slice('vp_csrf='.length)) : undefined
}

export class ApiClient {
  private accessToken: string | null = null
  private expiresAt = 0
  private refreshInFlight: Promise<string | null> | null = null
  private onSessionLost: (() => void) | null = null

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
    private readonly csrf: () => string | undefined = csrfFromCookie,
  ) {}

  setSessionLostHandler(handler: (() => void) | null) {
    this.onSessionLost = handler
  }

  adoptSession(tokens: SessionTokens) {
    this.accessToken = tokens.accessToken
    this.expiresAt = Date.parse(tokens.expiresAt)
  }

  clearSession() {
    this.accessToken = null
    this.expiresAt = 0
    this.onSessionLost?.()
  }

  async refreshSession(): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight
    this.refreshInFlight = this.rotateRefresh()
    try {
      return await this.refreshInFlight
    } finally {
      this.refreshInFlight = null
    }
  }

  private async rotateRefresh(): Promise<string | null> {
    const csrf = this.csrf()
    if (!csrf) {
      this.clearSession()
      return null
    }
    try {
      const response = await this.fetcher(`${this.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'X-CSRF-Token': csrf, 'X-Request-Id': crypto.randomUUID() },
      })
      if (!response.ok) {
        this.clearSession()
        return null
      }
      const tokens = (await response.json()) as SessionTokens
      this.adoptSession(tokens)
      return tokens.accessToken
    } catch {
      this.clearSession()
      return null
    }
  }

  async request<T>(
    path: `/v1/${string}`,
    init: RequestInit = {},
    options: { authenticated?: boolean } = {},
  ): Promise<T> {
    const authenticated = options.authenticated !== false
    let token = this.accessToken
    if (authenticated && (!token || Date.now() >= this.expiresAt - 5000)) {
      token = await this.refreshSession()
      if (!token) throw new ApiError(401, 'UNAUTHENTICATED')
    }

    let response = await this.send(path, init, authenticated ? token : null)
    if (authenticated && response.status === 401) {
      token =
        token !== this.accessToken
          ? this.accessToken
          : await this.refreshSession()
      if (!token) throw new ApiError(401, 'UNAUTHENTICATED')
      response = await this.send(path, init, token)
    }

    if (!response.ok) {
      if (authenticated && response.status === 401) this.clearSession()
      let body: ApiErrorBody = {}
      try {
        body = (await response.json()) as ApiErrorBody
      } catch {}
      throw new ApiError(
        response.status,
        body.error?.code ?? 'INTERNAL_ERROR',
        body.error?.requestId ??
          response.headers.get('X-Request-Id') ??
          undefined,
        body.error?.details ?? [],
      )
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  private async send(path: string, init: RequestInit, token: string | null) {
    const headers = new Headers(init.headers)
    headers.set('X-Request-Id', crypto.randomUUID())
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (init.body && !(init.body instanceof FormData))
      headers.set('Content-Type', 'application/json')
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        credentials: 'include',
        cache: 'no-store',
      })
    } catch {
      throw new ApiError(0, 'SERVICE_UNAVAILABLE')
    }
  }

  async logout() {
    try {
      const csrf = this.csrf()
      if (csrf) {
        await this.fetcher(`${this.baseUrl}/v1/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'X-CSRF-Token': csrf,
            'X-Request-Id': crypto.randomUUID(),
          },
        })
      }
    } finally {
      this.clearSession()
    }
  }
}

export const apiClient = new ApiClient(publicEnv.NEXT_PUBLIC_API_ORIGIN)
