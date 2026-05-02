import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { AlertTriangle } from 'lucide-react'

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full" />
      </div>
    )
  }

  if (isAuthenticated) {
    const dest = (location.state as { from?: string } | null)?.from ?? '/dashboard'
    return <Navigate to={dest} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status
      if (status === 401) {
        setError(t('auth.invalidCredentials'))
      } else {
        setError(t('auth.loginFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        {/* Mast */}
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold text-foreground mb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Kanzec
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t('auth.tagline')}
          </p>
        </div>

        <form onSubmit={onSubmit} className="glass-card rounded-xl p-6 space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              {t('auth.username')}
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm bg-input border border-border rounded-lg text-foreground focus:outline-none focus:border-[#D4A843]/40 focus:ring-2 focus:ring-[#D4A843]/10 transition-colors"
              style={{ fontFamily: "'DM Sans', system-ui" }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              {t('auth.password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm bg-input border border-border rounded-lg text-foreground focus:outline-none focus:border-[#D4A843]/40 focus:ring-2 focus:ring-[#D4A843]/10 transition-colors"
              style={{ fontFamily: "'DM Sans', system-ui" }}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span className="text-xs font-medium">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="w-full py-2.5 rounded-lg bg-[#D4A843] hover:bg-[#C49833] disabled:bg-[#D4A843]/40 disabled:cursor-not-allowed text-black text-sm font-semibold transition-colors"
          >
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        <p className="text-[10px] text-center text-muted-foreground mt-6 tracking-wide">
          {t('auth.footer')}
        </p>
      </div>
    </div>
  )
}
