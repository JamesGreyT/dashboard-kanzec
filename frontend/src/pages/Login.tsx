import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { AlertTriangle, ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, UserRound } from 'lucide-react'

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
      setError(status === 401 ? t('auth.invalidCredentials') : t('auth.loginFailed'))
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-shell grain-overlay relative min-h-[100dvh] overflow-hidden text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-75"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 34%), linear-gradient(135deg, color-mix(in srgb, var(--card) 54%, transparent), color-mix(in srgb, var(--background) 94%, transparent))',
        }}
      />

      <main className="relative z-[2] grid min-h-[100dvh] place-items-center px-4 py-8">
        <section className="w-full max-w-[430px] animate-fade-up">
          <div className="relative overflow-hidden rounded-xl border border-border/80 bg-card/92 p-1 shadow-[0_38px_110px_-62px_rgba(36,31,24,0.58)] backdrop-blur-sm">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-20 -left-16 h-44 w-44 rounded-full bg-emerald/8 blur-3xl"
            />

            <div className="relative rounded-[0.7rem] border border-white/45 bg-card/74 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.52)] md:p-6">
              <div className="mb-7">
                <h1
                  className="text-2xl font-semibold tracking-[-0.025em] text-foreground"
                  style={{ fontFamily: DM_SANS }}
                >
                  {t('auth.signIn')}
                </h1>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div className="group space-y-2">
                  <label
                    htmlFor="username"
                    className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors group-focus-within:text-primary"
                    style={{ fontFamily: PLEX_MONO }}
                  >
                    {t('auth.username')}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground transition-colors group-focus-within:text-primary">
                      <UserRound size={16} strokeWidth={1.75} />
                    </span>
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
                      className="w-full rounded-lg border border-border bg-input/86 px-4 py-3.5 pl-10 text-[15px] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] outline-none transition-all duration-300 ease-out placeholder:text-muted-foreground/55 focus:border-primary/45 focus:bg-card focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70"
                      style={{ fontFamily: DM_SANS }}
                    />
                  </div>
                </div>

                <div className="group space-y-2">
                  <label
                    htmlFor="password"
                    className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors group-focus-within:text-primary"
                    style={{ fontFamily: PLEX_MONO }}
                  >
                    {t('auth.password')}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground transition-colors group-focus-within:text-primary">
                      <KeyRound size={16} strokeWidth={1.75} />
                    </span>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                      className="w-full rounded-lg border border-border bg-input/86 px-4 py-3.5 pl-10 pr-12 text-[15px] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] outline-none transition-all duration-300 ease-out focus:border-primary/45 focus:bg-card focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70"
                      style={{ fontFamily: DM_SANS }}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                      title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                      className="absolute inset-y-1.5 right-1.5 flex w-10 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent/80 hover:text-primary focus:bg-accent/80 focus:text-primary focus:outline-none"
                    >
                      {showPassword ? (
                        <EyeOff size={16} strokeWidth={1.75} />
                      ) : (
                        <Eye size={16} strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-3.5 py-3 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                  >
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span className="text-sm leading-5" style={{ fontFamily: DM_SANS }}>
                      {error}
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !username || !password}
                  className="group relative mt-1 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_18px_34px_-24px_rgba(141,103,32,0.88)] transition-all duration-300 ease-out hover:-translate-y-[1px] hover:bg-primary/92 hover:shadow-[0_22px_40px_-26px_rgba(141,103,32,0.95)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-primary/40 disabled:shadow-none"
                  style={{ fontFamily: DM_SANS }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg] bg-white/18 opacity-0 transition-all duration-500 group-hover:left-full group-hover:opacity-100"
                  />
                  <span className="relative">{submitting ? t('auth.signingIn') : t('auth.signIn')}</span>
                  {submitting ? (
                    <LoaderCircle
                      size={15}
                      aria-hidden
                      strokeWidth={1.9}
                      className="relative animate-spin"
                    />
                  ) : (
                    <ArrowRight
                      size={15}
                      aria-hidden
                      strokeWidth={1.8}
                      className="relative transition-transform duration-300 group-hover:translate-x-0.5"
                    />
                  )}
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
