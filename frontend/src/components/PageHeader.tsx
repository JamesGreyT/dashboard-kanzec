import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'

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
  // Tashkent is GMT+5 fixed; show that explicitly so the operator sees the timezone.
  return `${pad(d.getDate())} ${m} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())} GMT+5`
}

export default function PageHeader() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const [stamp, setStamp] = useState(() => nowLabel(i18n.language))

  useEffect(() => {
    setStamp(nowLabel(i18n.language))
    // tick every minute so the stamp doesn't go stale
    const id = setInterval(() => setStamp(nowLabel(i18n.language)), 60_000)
    return () => clearInterval(id)
  }, [i18n.language])

  return (
    <header className="flex items-baseline justify-between pb-3 mb-6 border-b border-border/40 animate-fade-up">
      <span
        className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
        style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
      >
        {t('common.today')} · {stamp}
      </span>
      {user && (
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="text-foreground">{user.username}</span>
          <span className="mx-1.5">·</span>
          <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
            {t(`roles.${user.role}`)}
          </span>
        </span>
      )}
    </header>
  )
}
