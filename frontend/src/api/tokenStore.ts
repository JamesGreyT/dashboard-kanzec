import axios from 'axios'

let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}

// ── Session-seen flag ─────────────────────────────────────────────────────
// The kanzec_refresh cookie is httpOnly, so JS can't probe it. We set a tiny
// non-secret marker in localStorage on every successful login so we know
// whether it's worth attempting `/auth/refresh` on cold load. This avoids
// the noisy 401 probe on the very first visit (no session ever existed).

const SESSION_SEEN_KEY = 'kanzec_session_seen'

export function markSessionSeen(): void {
  try {
    localStorage.setItem(SESSION_SEEN_KEY, '1')
  } catch {
    // localStorage disabled — silently ignore; we'll just pay the 401 probe cost
  }
}

export function clearSessionSeen(): void {
  try {
    localStorage.removeItem(SESSION_SEEN_KEY)
  } catch {
    // ignore
  }
}

export function hasSessionSeen(): boolean {
  try {
    return localStorage.getItem(SESSION_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

// ── Shared refresh-token dedup ────────────────────────────────────────────
// Both the axios response interceptor (on 401) and the AuthContext bootstrap
// (`recover()`) call /auth/refresh. If they race, the cookie rotates twice
// and the second call 401s. Deduplicate so concurrent callers all wait on
// the same promise.

const baseURL = import.meta.env.VITE_API_URL || '/api'

let refreshPromise: Promise<string> | null = null

export async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise

  refreshPromise = axios
    .post<{ access_token: string }>(`${baseURL}/auth/refresh`, null, {
      withCredentials: true,
    })
    .then((r) => {
      setAccessToken(r.data.access_token)
      markSessionSeen()
      return r.data.access_token
    })
    .catch((err) => {
      clearAccessToken()
      clearSessionSeen()
      throw err
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}
