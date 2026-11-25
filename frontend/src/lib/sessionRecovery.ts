import { supabase } from './supabase'

/**
 * Recovers from a login session the backend rejects (HTTP 401): an expired token, a
 * session revoked in Supabase, or an account deleted/recreated while still signed in.
 *
 * Every backend call goes through window.fetch, so this wraps it once at startup:
 * on a 401 from the backend it refreshes the Supabase session and retries the request
 * one time with the new token. If the session can't be refreshed, it signs out locally
 * and sends the user to the sign-in page, instead of every save failing with an error.
 */
const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

let installed = false
let signingOut = false
let refreshing: Promise<string | null> | null = null

const refreshToken = (): Promise<string | null> => {
  // Concurrent 401s share one refresh.
  refreshing ??= supabase.auth
    .refreshSession()
    .then(({ data, error }) => (error ? null : data.session?.access_token ?? null))
    .catch(() => null)
    .finally(() => { refreshing = null })
  return refreshing
}

const endSession = async () => {
  if (signingOut) return
  signingOut = true
  try {
    // 'local': the server already refuses this session, so only clear it in the browser.
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // Storage is cleared either way.
  }
  const onAdminPortal = window.location.hostname.startsWith('admin.') || window.location.pathname.startsWith('/admin')
  window.location.assign(onAdminPortal ? window.location.pathname : '/auth?session=expired')
}

export function installSessionRecovery() {
  if (installed) return
  installed = true
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const sentToken = headers.get('Authorization')?.startsWith('Bearer ')

    if (response.status !== 401 || !sentToken || !url.startsWith(BACKEND_URL) || signingOut) {
      return response
    }

    const token = await refreshToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
      const retried = await originalFetch(input, { ...init, headers })
      if (retried.status !== 401) return retried
    }
    await endSession()
    return response
  }
}
