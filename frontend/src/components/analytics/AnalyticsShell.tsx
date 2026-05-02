import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, X } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import MonthPicker from '@/components/MonthPicker'
import { defaultDayPresets } from '@/components/datePresets'
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

          {/* Date picker — same MonthPicker used everywhere on the SPA, so
              the analytics filter strip behaves like the Dayslice region
              picker (calendar trigger + presets + custom range). When `from`
              or `to` is empty we fall back to a no-op "month" value so the
              picker has something to render; the filter object treats both
              as undefined upstream. */}
          <MonthPicker
            value={
              from || to
                ? { kind: 'range', from: from || to, to: to || from }
                : { kind: 'month', month: '' }
            }
            onChange={(v) => {
              if (v.kind === 'range') setRange(v.from || null, v.to || null)
              else if (v.month) {
                // Month selection → first/last day of that month.
                const [y, m] = v.month.split('-').map(Number)
                const f = `${y}-${String(m).padStart(2, '0')}-01`
                const last = new Date(y, m, 0)
                const tt = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
                setRange(f, tt)
              } else {
                setRange(null, null)
              }
            }}
            label={t('analytics.filters.dateRange')}
            presets={defaultDayPresets()}
          />

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
