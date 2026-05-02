import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronDown, X } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { useSnapshotsDirections, type AnalyticsFilters } from '@/api/hooks'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

interface Props {
  sectionLabel: string
  title: string
  children: (filters: AnalyticsFilters) => React.ReactNode
}

/**
 * Shared chrome for /analytics/* pages: section-title + Playfair Display
 * h1 + a sticky filter strip with date-range and direction/region/manager
 * selects. Children receive the active filters and render the sectioned
 * content. URL is the source of truth via `useSearchParams`.
 */
export default function AnalyticsShell({ sectionLabel, title, children }: Props) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const direction = searchParams.get('direction') ?? ''
  const region = searchParams.get('region') ?? ''
  const manager = searchParams.get('manager') ?? ''

  const setParam = (key: string, value: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })

  const setRange = (f: string | null, tt: string | null) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (f) next.set('from', f)
      else next.delete('from')
      if (tt) next.set('to', tt)
      else next.delete('to')
      return next
    })

  const filters: AnalyticsFilters = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      direction: direction || undefined,
      region: region || undefined,
      manager: manager || undefined,
    }),
    [from, to, direction, region, manager],
  )

  const directionsQ = useSnapshotsDirections()
  const activeCount = [from, to, direction, region, manager].filter(Boolean).length

  const clearAll = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('from')
      next.delete('to')
      next.delete('direction')
      next.delete('region')
      next.delete('manager')
      return next
    })

  return (
    <div>
      <PageHeader />

      <header className="mb-6">
        <div className="animate-fade-up">
          <span className="section-title">{sectionLabel}</span>
        </div>
        <h1
          className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight mt-3 animate-fade-up animate-fade-up-delay-1"
          style={{ fontFamily: PLAYFAIR }}
        >
          {title}
        </h1>

        {/* Filter strip — pinned just under the title; stays visible while
            the analyst scrolls (but not sticky-floating, that breaks the
            page rhythm). */}
        <div
          className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/40 animate-fade-up animate-fade-up-delay-2"
          style={{ fontFamily: DM_SANS }}
        >
          <span
            className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 mr-1"
            style={{ fontFamily: PLEX_MONO }}
          >
            {t('analytics.filters.label')}
          </span>

          <DateRangePill from={from} to={to} onChange={setRange} />

          <SelectPill
            label={t('analytics.filters.direction')}
            value={direction}
            onChange={(v) => setParam('direction', v)}
            options={(directionsQ.data ?? []).map((d) => ({ value: d, label: d }))}
          />

          <SimpleInputPill
            label={t('analytics.filters.region')}
            value={region}
            onChange={(v) => setParam('region', v)}
          />

          <SimpleInputPill
            label={t('analytics.filters.manager')}
            value={manager}
            onChange={(v) => setParam('manager', v)}
          />

          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#9E7B2F] transition-colors ml-auto"
            >
              {t('data.clearAll')} ({activeCount})
            </button>
          )}
        </div>
      </header>

      {children(filters)}
    </div>
  )
}

// ── Date-range pill (lifted from FilterBar; kept local because the
// analytics filter strip uses single from/to params, not f= triples) ──

function DateRangePill({
  from,
  to,
  onChange,
}: {
  from: string
  to: string
  onChange: (f: string | null, t: string | null) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = !!(from || to)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const todayIso = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const presets = useMemo(() => {
    function iso(d: Date) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return [
      { labelKey: 'data.filters.presets.last7', range: () => {
        const f = new Date(); f.setDate(f.getDate() - 6); return [iso(f), todayIso] as const
      }},
      { labelKey: 'data.filters.presets.thisMonth', range: () => {
        const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), todayIso] as const
      }},
      { labelKey: 'data.filters.presets.lastMonth', range: () => {
        const n = new Date()
        const f = new Date(n.getFullYear(), n.getMonth() - 1, 1)
        const tt = new Date(n.getFullYear(), n.getMonth(), 0)
        return [iso(f), iso(tt)] as const
      }},
      { labelKey: 'data.filters.presets.ytd', range: () => {
        const n = new Date(); return [iso(new Date(n.getFullYear(), 0, 1)), todayIso] as const
      }},
      { labelKey: 'analytics.filters.presets.last90', range: () => {
        const f = new Date(); f.setDate(f.getDate() - 89); return [iso(f), todayIso] as const
      }},
    ]
  }, [todayIso])

  function shortLabel() {
    if (!from && !to) return t('analytics.filters.dateRange')
    if (from && to) return `${from} → ${to}`
    if (from) return `≥ ${from}`
    return `≤ ${to}`
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn('month-btn inline-flex items-center gap-1.5', isActive && 'active')}
      >
        <Calendar size={11} aria-hidden />
        <span>{shortLabel()}</span>
        <ChevronDown
          size={10}
          className={cn('transition-transform', open && 'rotate-180', isActive ? 'opacity-100' : 'opacity-40')}
        />
      </button>
      {open && (
        <div
          className="absolute left-0 z-30 mt-2 bg-card border border-border rounded-lg p-3 w-72"
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
            {t('data.filters.dateRange')}
          </p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              type="date"
              value={from}
              onChange={(e) => onChange(e.target.value || null, to || null)}
              className="text-xs bg-input border border-border rounded-md px-2 py-1.5 focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#9E7B2F]/10"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => onChange(from || null, e.target.value || null)}
              className="text-xs bg-input border border-border rounded-md px-2 py-1.5 focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#9E7B2F]/10"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/60">
            {presets.map((p) => (
              <button
                key={p.labelKey}
                type="button"
                onClick={() => {
                  const [f, tt] = p.range()
                  onChange(f, tt)
                }}
                className="month-btn"
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
          {isActive && (
            <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-border/60 text-[10px] uppercase tracking-[0.14em]">
              <button
                type="button"
                onClick={() => onChange(null, null)}
                className="text-red-500/80 hover:text-red-500 transition-colors normal-case font-medium"
              >
                {t('data.clearFilter')}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors normal-case font-medium"
              >
                {t('common.close')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SelectPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('month-btn appearance-none pr-6 cursor-pointer normal-case font-medium', value && 'active')}
        style={{ minWidth: '110px' }}
        aria-label={label}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={10}
        className={cn(
          'absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none',
          value ? 'opacity-100 text-[#9E7B2F]' : 'opacity-40',
        )}
        aria-hidden
      />
    </div>
  )
}

function SimpleInputPill({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative inline-flex items-baseline">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className={cn(
          'month-btn normal-case font-normal placeholder:italic placeholder:text-muted-foreground/50',
          value && 'active',
        )}
        style={{ minWidth: '120px' }}
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
