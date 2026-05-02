import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, type Role } from '@/context/AuthContext'

const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"
const DM_SANS = "'DM Sans', system-ui"

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function nowLabel(lang: string): string {
  const d = new Date()
  const months: Record<string, string[]> = {
    uz: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
    ru: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  }
  const m = (months[lang] ?? months.uz)[d.getMonth()]
  // Minute resolution; Tashkent fixed at GMT+5.
  return `${pad(d.getDate())} ${m} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())} GMT+5`
}

const ROLE_DOT: Record<Role, string> = {
  admin: 'bg-red-500/70',
  operator: 'bg-[#D4A843]',
  viewer: 'bg-emerald-500/70',
}

/**
 * Site-wide page header.
 *
 * - `variant="dashboard"` shows the editorial BUGUN stamp + the user's role
 *   as a pill. Used only on `/dashboard`, where a temporal anchor reads as
 *   intentional rather than repetitive.
 * - default compact variant shows the user identity with a small role-dot.
 *   No stamp, no pill — chrome stays out of the way on detail pages.
 */
export default function PageHeader({ variant = 'compact' }: { variant?: 'dashboard' | 'compact' } = {}) {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const [stamp, setStamp] = useState(() => nowLabel(i18n.language))

  useEffect(() => {
    // Subscribe to a 1-minute clock tick + reflect locale changes immediately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStamp(nowLabel(i18n.language))
    const id = setInterval(() => setStamp(nowLabel(i18n.language)), 60_000)
    return () => clearInterval(id)
  }, [i18n.language])

  const isDashboard = variant === 'dashboard'

  return (
    <header className="flex items-baseline justify-between gap-3 pb-3 mb-6 border-b border-border/40 animate-fade-up">
      {isDashboard ? (
        <span
          className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate"
          style={{ fontFamily: PLEX_MONO }}
        >
          {t('common.today')} · {stamp}
        </span>
      ) : (
        <span aria-hidden />
      )}

      {user && (
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs text-foreground/90 truncate"
            style={{ fontFamily: DM_SANS }}
          >
            {user.username}
          </span>
          {/* Compact: a 6-px role dot + text label. Dashboard: keep the pill
              for editorial weight, but use the same monitor variant — the
              red admin pill was reading as a warning, not as identity. */}
          {isDashboard ? (
            <span className="action-badge monitor" style={{ fontFamily: DM_SANS }}>
              {t(`roles.${user.role}`)}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground" style={{ fontFamily: DM_SANS }}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${ROLE_DOT[user.role]}`} aria-hidden />
              {t(`roles.${user.role}`)}
            </span>
          )}
        </div>
      )}
    </header>
  )
}
