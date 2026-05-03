import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'

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
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#f6f0e3] text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(circle at top left, rgba(212,168,67,0.18), transparent 34%), radial-gradient(circle at bottom right, rgba(158,123,47,0.14), transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.72), rgba(246,240,227,0.96))',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-[8%] hidden w-px bg-gradient-to-b from-transparent via-[#9E7B2F]/35 to-transparent xl:block"
      />

      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-[1380px] grid-cols-1 px-4 py-6 md:px-8 lg:px-10 xl:grid-cols-[minmax(0,1.1fr)_minmax(440px,0.9fr)] xl:gap-14 xl:px-12 xl:py-10">
        <section className="flex flex-col justify-between gap-10 rounded-[2rem] border border-[#9E7B2F]/12 bg-white/58 p-6 shadow-[0_30px_80px_-48px_rgba(95,71,24,0.32)] backdrop-blur-[2px] md:p-8 xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none xl:backdrop-blur-0">
          <div className="space-y-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p
                  className="text-[11px] uppercase tracking-[0.28em] text-[#7b6640]"
                  style={{ fontFamily: PLEX_MONO }}
                >
                  {t('auth.tagline')}
                </p>
                <h1
                  className="mt-3 max-w-xl text-5xl font-semibold tracking-[-0.05em] text-[#201811] md:text-6xl xl:text-[5.4rem]"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  Kanzec
                </h1>
              </div>
              <span
                className="hidden rounded-full border border-[#9E7B2F]/18 bg-white/72 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#6d5937] md:inline-flex"
                style={{ fontFamily: PLEX_MONO }}
              >
                {t('auth.footer')}
              </span>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)] xl:items-end">
              <div>
                <p
                  className="max-w-2xl text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.06] tracking-[-0.04em] text-[#1f1a14]"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  Ichki operatsiyalarni boshqarish, qarzdorlar oqimini kuzatish va har bir kollektorning ish yuzasini bir joydan ochish.
                </p>
                <p
                  className="mt-4 max-w-xl text-sm leading-6 text-[#5c4f3f]"
                  style={{ fontFamily: DM_SANS }}
                >
                  {t('auth.subhead')}
                </p>
              </div>

              <div className="space-y-3">
                <SignalTile
                  icon={<ShieldCheck size={16} strokeWidth={1.75} />}
                  label="Access"
                  value="JWT + refresh"
                />
                <SignalTile
                  icon={<LockKeyhole size={16} strokeWidth={1.75} />}
                  label="Mode"
                  value="Internal only"
                />
                <SignalTile
                  icon={<KeyRound size={16} strokeWidth={1.75} />}
                  label="Surface"
                  value="Collections + ops"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <ContextStrip
              eyebrow="Monitor"
              text="Qarz, aging va va'da intizomi bo'yicha bir xil ish yuzasi."
            />
            <ContextStrip
              eyebrow="Decide"
              text="Mijozning to'lov ritmi va qarz riski bir ko'rishda ko'rinadi."
            />
            <ContextStrip
              eyebrow="Act"
              text="Kollektorlar kundalik qarorlarni kechikmasdan beradi."
            />
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-[560px] animate-fade-up">
            <div className="relative overflow-hidden rounded-[2rem] border border-[#9E7B2F]/20 bg-white/88 p-5 shadow-[0_36px_90px_-56px_rgba(80,58,14,0.42)] backdrop-blur-sm md:p-7">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#9E7B2F] via-[#D4A843] to-[#b2862c]"
              />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p
                      className="text-[11px] uppercase tracking-[0.24em] text-[#7c6740]"
                      style={{ fontFamily: PLEX_MONO }}
                    >
                      Secure sign in
                    </p>
                    <h2
                      className="mt-3 text-3xl leading-none tracking-[-0.04em] text-[#1f1911] md:text-[2.7rem]"
                      style={{ fontFamily: PLAYFAIR }}
                    >
                      {t('auth.signIn')}
                    </h2>
                    <p
                      className="mt-3 max-w-sm text-sm leading-6 text-[#625448]"
                      style={{ fontFamily: DM_SANS }}
                    >
                      Foydalanuvchi kirishi token bilan tasdiqlanadi. Kirgandan keyin ish xonasi rolingizga mos ochiladi.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#9E7B2F]/15 bg-[#f5efe1] px-3 py-2 text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#826737]" style={{ fontFamily: PLEX_MONO }}>
                      Kanzec
                    </p>
                    <p className="mt-1 text-sm text-[#34281c]" style={{ fontFamily: DM_SANS }}>
                      Dashboard access
                    </p>
                  </div>
                </div>

                <form onSubmit={onSubmit} className="mt-8 space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="username"
                      className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7c6740]"
                      style={{ fontFamily: PLEX_MONO }}
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
                      className="w-full rounded-[1.05rem] border border-[#9E7B2F]/18 bg-[#fbf8f1] px-4 py-3 text-[15px] text-[#231c14] outline-none transition-all duration-300 ease-out focus:border-[#9E7B2F]/45 focus:bg-white focus:ring-4 focus:ring-[#D4A843]/10 disabled:cursor-not-allowed disabled:opacity-70"
                      style={{ fontFamily: DM_SANS }}
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="password"
                      className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7c6740]"
                      style={{ fontFamily: PLEX_MONO }}
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
                        className="w-full rounded-[1.05rem] border border-[#9E7B2F]/18 bg-[#fbf8f1] px-4 py-3 pr-12 text-[15px] text-[#231c14] outline-none transition-all duration-300 ease-out focus:border-[#9E7B2F]/45 focus:bg-white focus:ring-4 focus:ring-[#D4A843]/10 disabled:cursor-not-allowed disabled:opacity-70"
                        style={{ fontFamily: DM_SANS }}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                        title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-[#72624c] transition-colors hover:text-[#9E7B2F] focus:text-[#9E7B2F] focus:outline-none"
                      >
                        {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-[1rem] border border-red-500/20 bg-red-500/8 px-3.5 py-3 text-red-700"
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
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-[1.15rem] bg-[#D4A843] px-4 py-3 text-sm font-semibold text-[#1a140c] transition-all duration-300 ease-out hover:-translate-y-[1px] hover:bg-[#c79b37] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#D4A843]/40"
                    style={{ fontFamily: DM_SANS }}
                  >
                    <span>{submitting ? t('auth.signingIn') : t('auth.signIn')}</span>
                    {!submitting && (
                      <ArrowRight
                        size={15}
                        aria-hidden
                        strokeWidth={1.8}
                        className="transition-transform duration-300 group-hover:translate-x-0.5"
                      />
                    )}
                  </button>
                </form>

                <div className="mt-6 grid gap-3 border-t border-[#9E7B2F]/12 pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#826a43]" style={{ fontFamily: PLEX_MONO }}>
                      {t('auth.footer')}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#66584a]" style={{ fontFamily: DM_SANS }}>
                      Sessiya xavfsiz cookie va qisqa muddatli token bilan himoyalanadi.
                    </p>
                  </div>
                  <span
                    className="cursor-help text-sm text-[#5e503f] transition-colors hover:text-[#9E7B2F]"
                    title={t('auth.contactAdminHelp')}
                    style={{ fontFamily: DM_SANS }}
                  >
                    {t('auth.contactAdmin')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function SignalTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-[1.25rem] border border-[#9E7B2F]/14 bg-white/72 px-4 py-3 shadow-[0_18px_44px_-38px_rgba(112,79,17,0.34)]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#9E7B2F]/14 bg-[#f8f1e4] text-[#7a622f]">
          {icon}
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7c6740]" style={{ fontFamily: PLEX_MONO }}>
            {label}
          </p>
          <p className="mt-1 text-sm text-[#261f16]" style={{ fontFamily: DM_SANS }}>
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}

function ContextStrip({
  eyebrow,
  text,
}: {
  eyebrow: string
  text: string
}) {
  return (
    <div className="border-t border-[#9E7B2F]/16 pt-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#7b6540]" style={{ fontFamily: PLEX_MONO }}>
        {eyebrow}
      </p>
      <p className="mt-2 max-w-[28ch] text-sm leading-6 text-[#5f5244]" style={{ fontFamily: DM_SANS }}>
        {text}
      </p>
    </div>
  )
}
