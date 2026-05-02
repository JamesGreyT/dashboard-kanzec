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

const ROLE_BADGE_VARIANT: Record<Role, string> = {
  admin: 'critical',
  operator: 'plan',
  viewer: 'monitor',
}

export default function PageHeader() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const [stamp, setStamp] = useState(() => nowLabel(i18n.language))

  useEffect(() => {
    setStamp(nowLabel(i18n.language))
    const id = setInterval(() => setStamp(nowLabel(i18n.language)), 60_000)
    return () => clearInterval(id)
  }, [i18n.language])

  return (
    <header className="flex items-baseline justify-between gap-3 pb-3 mb-6 border-b border-border/40 animate-fade-up">
      {/* Operational stamp — keep as the only "Bugun" surface on the page;
          the dashboard sidebar/group headers don't repeat it any longer. */}
      <span
        className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate"
        style={{ fontFamily: PLEX_MONO }}
      >
        {t('common.today')} · {stamp}
      </span>

      {user && (
        <div className="flex items-baseline gap-2 shrink-0">
          <span
            className="text-xs text-foreground/90 truncate"
            style={{ fontFamily: DM_SANS }}
          >
            {user.username}
          </span>
          <span
            className={`action-badge ${ROLE_BADGE_VARIANT[user.role]}`}
            style={{ fontFamily: DM_SANS }}
          >
            {t(`roles.${user.role}`)}
          </span>
        </div>
      )}
    </header>
  )
}
