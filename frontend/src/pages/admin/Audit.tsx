import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, X } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import { useAdminAudit, useAdminUsers, type AuditRow } from '@/api/hooks'
import { formatLongDate, formatShortDate, toRomanLower } from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

const ALL_ACTIONS = [
  'login',
  'backfill_enqueue',
  'debt.log.create',
  'debt.log.update',
  'debt.log.delete',
  'legal_person.direction.update',
  'legal_person.instalment_days.update',
  'legal_person.group.update',
  'user_create',
  'user_patch',
  'user_delete',
  'user_revoke_sessions',
  'user_bulk_from_rooms',
  'admin.rooms.refresh',
  'admin.rooms.set_active',
] as const

const PAGE_SIZE = 50

export default function Audit() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0)
  const action = searchParams.get('action') ?? ''
  const userId = searchParams.get('user_id') ? Number(searchParams.get('user_id')) : undefined
  const since = searchParams.get('since') ?? ''

  const setParam = (key: string, value: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      next.set('offset', '0')
      return next
    })

  const setOffset = (n: number) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('offset', String(Math.max(n, 0)))
      return next
    })

  const auditQ = useAdminAudit({ limit: PAGE_SIZE, offset, action, user_id: userId, since })
  const usersQ = useAdminUsers()

  const total = auditQ.data?.total ?? 0
  const rows = auditQ.data?.rows ?? []
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  // Group rows by day for the timeline rail
  const groups = useMemo(() => {
    const out: { day: string; rows: AuditRow[] }[] = []
    for (const row of rows) {
      const day = row.created_at.slice(0, 10)
      const last = out[out.length - 1]
      if (last && last.day === day) last.rows.push(row)
      else out.push({ day, rows: [row] })
    }
    return out
  }, [rows])

  const activeFilters = [action, userId, since].filter(Boolean).length
  const clearAll = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('action')
      next.delete('user_id')
      next.delete('since')
      next.set('offset', '0')
      return next
    })

  return (
    <div>
      <PageHeader />

      <header className="mb-6">
        <span className="section-title">{t('admin.section')}</span>
        <h1
          className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight mt-3"
          style={{ fontFamily: PLAYFAIR }}
        >
          {t('admin.audit.title')}
        </h1>

        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/40" style={{ fontFamily: DM_SANS }}>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 mr-1" style={{ fontFamily: PLEX_MONO }}>
            {t('data.filters.label')}
          </span>

          <SelectPill
            label={t('admin.audit.action')}
            value={action}
            onChange={(v) => setParam('action', v)}
            options={ALL_ACTIONS.map((a) => ({ value: a, label: a }))}
          />
          <SelectPill
            label={t('admin.audit.user')}
            value={userId ? String(userId) : ''}
            onChange={(v) => setParam('user_id', v)}
            options={(usersQ.data ?? []).map((u) => ({ value: String(u.id), label: u.username }))}
          />
          <DateInputPill label={t('admin.audit.since')} value={since} onChange={(v) => setParam('since', v)} />

          {activeFilters > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#9E7B2F] transition-colors ml-auto"
            >
              {t('data.clearAll')} ({activeFilters})
            </button>
          )}
        </div>
      </header>

      {/* Timeline */}
      {auditQ.isLoading && !auditQ.data ? (
        <div className="space-y-3 animate-fade-up animate-fade-up-delay-2">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer-skeleton h-14 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center animate-fade-up">
          <div className="text-3xl text-[#D4A843] mb-3 tracking-[0.5em]" aria-hidden>※</div>
          <p className="text-lg italic" style={{ fontFamily: PLAYFAIR }}>
            {t('admin.audit.empty')}
          </p>
        </div>
      ) : (
        <ol className="relative animate-fade-up animate-fade-up-delay-2" style={{ fontFamily: DM_SANS }}>
          {/* Vertical rail */}
          <span aria-hidden className="absolute left-[7px] top-0 bottom-0 w-px bg-border/60" />
          {groups.map((g) => (
            <li key={g.day} className="mb-6">
              <div className="flex items-baseline gap-3 mb-3 pl-6">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                  {formatLongDate(g.day, i18n.language)}
                </span>
                <span className="text-[10px] text-muted-foreground/60">{g.rows.length} {t('admin.audit.entries')}</span>
              </div>
              <ul className="space-y-2">
                {g.rows.map((r) => (
                  <AuditEntry key={r.id} row={r} lang={i18n.language} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {/* Pager */}
      {total > 0 && (
        <footer
          className="mt-6 pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 text-xs"
          style={{ fontFamily: DM_SANS }}
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-medium text-foreground tabular-nums" style={{ fontFamily: PLAYFAIR }}>
              {toRomanLower(currentPage)}
              <span className="text-muted-foreground"> {t('data.of')} </span>
              {toRomanLower(totalPages)}
            </span>
            <span className="text-muted-foreground italic">
              · {t('data.showing')} {(offset + 1).toLocaleString()}–{Math.min(offset + PAGE_SIZE, total).toLocaleString()} {t('data.of')} {total.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(offset - PAGE_SIZE)}
              className="px-3 py-1.5 hover:bg-accent/60 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ‹ {t('data.prev')}
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="px-3 py-1.5 hover:bg-accent/60 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              {t('data.next')} ›
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}

function AuditEntry({ row, lang }: { row: AuditRow; lang: string }) {
  const { t } = useTranslation()
  const variant = actionBadgeVariant(row.action)
  const time = row.created_at.slice(11, 16) // HH:MM
  const hasDetails = row.details && Object.keys(row.details).length > 0
  return (
    <li className="relative pl-6">
      {/* Marker dot on the rail */}
      <span aria-hidden className={`absolute left-0 top-3 w-3.5 h-3.5 rounded-full bg-card border-2 ${markerColor(variant)}`} />
      <div className="glass-card rounded-lg p-3" style={{ fontFamily: DM_SANS }}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`action-badge ${variant}`}>{row.action}</span>
            {row.target && (
              <span className="text-xs text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                {row.target}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" style={{ fontFamily: PLEX_MONO }}>
            {time}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground" style={{ fontFamily: DM_SANS }}>
          <span className="font-medium text-foreground">{row.username ?? <span className="cell-empty">—</span>}</span>
          {row.ip_address && <> · <span style={{ fontFamily: PLEX_MONO }}>{row.ip_address}</span></>}
        </p>
        {hasDetails && (
          <details className="mt-2 group">
            <summary className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60 cursor-pointer hover:text-foreground transition-colors list-none">
              <span className="group-open:hidden">▸ {t('admin.audit.details')}</span>
              <span className="hidden group-open:inline">▾ {t('admin.audit.details')}</span>
            </summary>
            <pre className="mt-2 text-[11px] bg-input/50 rounded p-2 overflow-x-auto" style={{ fontFamily: PLEX_MONO }}>
              {JSON.stringify(row.details, null, 2)}
            </pre>
          </details>
        )}
      </div>
      {/* unused locals quiet */}
      {void lang}
    </li>
  )
}

function actionBadgeVariant(action: string): 'monitor' | 'plan' | 'markdown' | 'urgent' | 'critical' {
  if (action.endsWith('.delete') || action === 'user_delete') return 'critical'
  if (action.startsWith('user_') || action.startsWith('admin.')) return 'urgent'
  if (action === 'login') return 'monitor'
  if (action.endsWith('.update') || action.endsWith('.set_active') || action.endsWith('.refresh')) return 'markdown'
  return 'plan'
}

function markerColor(variant: string): string {
  switch (variant) {
    case 'critical': return 'border-[#F87171]'
    case 'urgent': return 'border-[#FB923C]'
    case 'markdown': return 'border-[#FBBF24]'
    case 'monitor': return 'border-[#34D399]'
    default: return 'border-[#60A5FA]'
  }
}

function SelectPill({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('month-btn appearance-none pr-6 cursor-pointer normal-case font-medium', value && 'active')}
        style={{ minWidth: '140px' }}
        aria-label={label}
      >
        <option value="">{label}</option>
        {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
      <ChevronDown size={10} className={cn('absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none', value ? 'opacity-100 text-[#9E7B2F]' : 'opacity-40')} aria-hidden />
    </div>
  )
}

function DateInputPill({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative inline-flex items-baseline">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('month-btn normal-case font-normal placeholder:italic placeholder:text-muted-foreground/50', value && 'active')}
        style={{ minWidth: '140px' }}
        aria-label={label}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-red-500 transition-colors"
          aria-label="Clear"
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}

void formatShortDate
