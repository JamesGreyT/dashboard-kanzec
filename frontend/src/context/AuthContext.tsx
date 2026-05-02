import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import api from '@/api/client'
import {
  setAccessToken,
  clearAccessToken,
  refreshAccessToken,
  hasSessionSeen,
  markSessionSeen,
  clearSessionSeen,
} from '@/api/tokenStore'
import { clearAllCaches } from '@/api/queryClient'

export type Role = 'admin' | 'operator' | 'viewer'

export type ScopeRoom = { room_id: string; room_name: string }

export type UserInfo = {
  id: number
  username: string
  role: Role
  scope_rooms: ScopeRoom[]
}

type LoginResponse = {
  access_token: string
  user: UserInfo
}

type AuthContextType = {
  user: UserInfo | null
  isAuthenticated: boolean
  isLoading: boolean
  /**
   * True when the user is an admin — admins always have empty `scope_rooms`
   * server-side, but that means "all rooms", not "no rooms". Pages that need
   * to render scope filters should treat unscoped admins as "see everything".
   */
  isUnscopedAdmin: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On mount: try to recover the session via the refresh cookie.
  // Skip the probe entirely on first-ever visit (no session_seen flag) so we
  // don't generate a noisy 401 in DevTools for every cold-load login flow.
  useEffect(() => {
    let cancelled = false

    async function recover() {
      if (!hasSessionSeen()) {
        // No session has ever been established on this device — skip the
        // probe; the user must log in.
        if (!cancelled) setIsLoading(false)
        return
      }

      try {
        const token = await refreshAccessToken()
        if (cancelled) return
        // refreshAccessToken already setAccessToken'd; double-check defensively
        setAccessToken(token)

        const meRes = await api.get<UserInfo>('/auth/me')
        if (cancelled) return
        setUser(meRes.data)
      } catch {
        // Refresh cookie expired or revoked — user must log in.
        clearAccessToken()
        clearSessionSeen()
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    recover()

    const onUnauth = () => {
      clearAccessToken()
      clearSessionSeen()
      setUser(null)
    }
    window.addEventListener('auth-unauthorized', onUnauth)

    return () => {
      cancelled = true
      window.removeEventListener('auth-unauthorized', onUnauth)
    }
  }, [])

  const login = async (username: string, password: string) => {
    const res = await api.post<LoginResponse>('/auth/login', { username, password })
    setAccessToken(res.data.access_token)
    markSessionSeen()
    setUser(res.data.user)
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // proceed with local cleanup even if logout call fails
    }
    clearAccessToken()
    clearSessionSeen()
    clearAllCaches()
    setUser(null)
  }

  const isUnscopedAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isUnscopedAdmin,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
