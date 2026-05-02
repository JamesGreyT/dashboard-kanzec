import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import axios from 'axios'
import api from '@/api/client'
import { setAccessToken, clearAccessToken } from '@/api/tokenStore'
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
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const baseURL = import.meta.env.VITE_API_URL || '/api'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On mount: try to recover the session via the refresh cookie.
  useEffect(() => {
    let cancelled = false

    async function recover() {
      try {
        // Use raw axios (not our `api` client) to avoid the 401 → refresh interceptor loop
        // before we even have a token.
        const refreshRes = await axios.post<{ access_token: string }>(
          `${baseURL}/auth/refresh`,
          null,
          { withCredentials: true },
        )
        if (cancelled) return
        setAccessToken(refreshRes.data.access_token)

        const meRes = await api.get<UserInfo>('/auth/me')
        if (cancelled) return
        setUser(meRes.data)
      } catch {
        // No valid refresh cookie — user must log in.
        clearAccessToken()
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    recover()

    const onUnauth = () => {
      clearAccessToken()
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
    setUser(res.data.user)
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // proceed with local cleanup even if logout call fails
    }
    clearAccessToken()
    clearAllCaches()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
