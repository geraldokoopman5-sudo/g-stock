const root = '/api/v1'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface TokenResponse { accessToken: string; expiresIn: number }

/** Access tokens stay in memory. The API owns the HttpOnly refresh cookie. */
export function createApiClient(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let accessToken: string | null = null
  let refreshPending: Promise<boolean> | null = null
  let onSessionExpired: (() => void) | undefined

  async function send<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await fetcher(`${root}${path}`, { ...options, credentials: 'same-origin' })
    } catch {
      throw new ApiError(0, 'Could not connect to G-Stock. Check your connection and try again.')
    }
    if (!response.ok) {
      const problem = await response.json().catch(() => null)
      const validation = problem?.errors ? Object.values(problem.errors).flat().join(' ') : ''
      throw new ApiError(response.status, validation || problem?.detail || ({
        401: 'Your session has expired. Please sign in again.',
        403: 'This account cannot perform that action.',
        429: 'Too many requests. Please wait a moment and try again.',
      }[response.status] ?? 'The request could not be completed. Please try again.'))
    }
    return response.status === 204 ? undefined as T : response.json()
  }

  async function csrf() {
    return (await send<{ csrfToken: string }>('/auth/csrf')).csrfToken
  }

  async function rotate() {
    try {
      const token = await csrf()
      const result = await send<TokenResponse>('/auth/refresh', {
        method: 'POST', headers: { 'X-CSRF-Token': token },
      })
      accessToken = result.accessToken
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        accessToken = null
        return false
      }
      throw error
    }
  }

  function refresh() {
    // Rotation consumes the old cookie; concurrent requests must share one rotation.
    // Web Locks also serialize refreshes across tabs sharing the same cookie.
    refreshPending ??= (typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('gstock-auth-cookie', rotate)
      : rotate()).finally(() => { refreshPending = null })
    return refreshPending
  }

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const attemptedToken = accessToken
    const perform = () => {
      const headers = new Headers(options.headers)
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
      return send<T>(path, { ...options, headers })
    }
    try {
      return await perform()
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      if (accessToken === attemptedToken && !await refresh()) {
        onSessionExpired?.()
        throw error
      }
      try {
        return await perform()
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 401) {
          accessToken = null
          onSessionExpired?.()
        }
        throw retryError
      }
    }
  }

  return {
    request,
    restore: refresh,
    onSessionExpired(callback: () => void) { onSessionExpired = callback },
    async login(email: string, password: string, rememberMe: boolean) {
      const result = await send<TokenResponse>('/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      })
      accessToken = result.accessToken
    },
    async logout() {
      await refreshPending
      async function endSession() {
        const headers = new Headers()
        if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
        try { headers.set('X-CSRF-Token', await csrf()) } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) throw error
        }
        await send('/auth/logout', { method: 'POST', headers })
        accessToken = null
      }
      if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request('gstock-auth-cookie', endSession)
      else await endSession()
    },
  }
}

export const api = createApiClient()

export function jsonBody(value: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed. Please try again.'
}
