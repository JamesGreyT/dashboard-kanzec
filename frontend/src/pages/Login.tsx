import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { AlertTriangle, ArrowRight, Eye, EyeOff } from 'lucide-react'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-dvh grid place-items-center bg-background px-4">
      <div className="w-full max-w-95 animate-fade-up">
        {/* The mast and the card share one column with a hairline rule between
            them — feels composed rather than two stacked widgets. */}

        {/* Mast — printed-paper masthead. Wordmark, primary tagline (gold-rule
            flanked), then a single italic subhead in Playfair giving the page
            its editorial register. The subhead also includes a year so the
            login screen feels like a dated edition rather than a faceless
            form. */}
        <div className="text-center pb-6">
          <h1
            className="text-5xl font-bold text-foreground leading-none mb-3"
            style={{ fontFamily: PLAYFAIR }}
          >
            Kanzec
          </h1>
          <div className="flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <span aria-hidden className="h-px w-8 bg-border" />
            <span>{t('auth.tagline')}</span>
            <span aria-hidden className="h-px w-8 bg-border" />
          </div>
          <p
            className="mt-3 italic text-xs text-muted-foreground/80"
            style={{ fontFamily: PLAYFAIR }}
          >
            {t('auth.subhead')}
          </p>
        </div>

        {/* Card with gold top rail (kpi-glow vocabulary) */}
        <form
          onSubmit={onSubmit}
          className="relative bg-card border border-[#9E7B2F]/25 rounded-xl p-7 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          {/* gold rail — same device as KPI cards on the dashboard */}
          <span
            aria-hidden
            className="absolute top-0 left-0 right-0 h-0.5 bg-[#D4A843] opacity-60 rounded-t-xl"
          />

          <div>
            <label
              htmlFor="username"
              className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5"
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
              className="w-full px-3 py-2 text-sm bg-input border border-border rounded-lg text-foreground focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#D4A843]/10 transition-colors"
              style={{ fontFamily: DM_SANS }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5"
            >
              {t('auth.password')}
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="w-full pl-3 pr-9 py-2 text-sm bg-input border border-border rounded-lg text-foreground focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#D4A843]/10 transition-colors"
                style={{ fontFamily: DM_SANS }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                className="absolute inset-y-0 right-0 px-2.5 flex items-center text-muted-foreground hover:text-[#9E7B2F] focus:outline-none focus:text-[#9E7B2F] transition-colors"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
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
            className="group w-full py-2.5 rounded-lg bg-[#D4A843] hover:bg-[#C49833] disabled:bg-[#D4A843]/40 disabled:cursor-not-allowed text-black text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <span>{submitting ? t('auth.signingIn') : t('auth.signIn')}</span>
            {!submitting && (
              <ArrowRight
                size={14}
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            )}
          </button>

          {/* Tagline + contact-admin moved INSIDE the card footer so they read
              as part of the form, not as page chrome. */}
          <div className="pt-3 mt-1 border-t border-border/60 flex items-baseline justify-between gap-2 text-[10px]">
            <span
              className="uppercase tracking-[0.14em] text-muted-foreground"
              style={{ fontFamily: PLEX_MONO }}
            >
              {t('auth.footer')}
            </span>
            <span
              className="text-muted-foreground hover:text-[#9E7B2F] transition-colors cursor-help"
              title={t('auth.contactAdminHelp')}
              style={{ fontFamily: DM_SANS }}
            >
              {t('auth.contactAdmin')}
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}
