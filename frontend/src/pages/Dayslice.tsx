import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import MatrixTable from '@/components/analytics/MatrixTable'
import MonthPicker, { type DateRangeValue } from '@/components/MonthPicker'
import {
  useDaysliceScoreboard,
  useDaysliceRegionPivot,
  useDaysliceDrill,
  useSnapshotsDirections,
  type DaysliceScoreboard,
} from '@/api/hooks'
import { formatNumber, currentMonthValue } from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

// Translate the picker value into the dayslice filter shape the backend
// expects. Two modes:
//
//   month  → emit `slice_start = 1st` + `slice_end = last-of-month`
//            ALWAYS (even for the current month). The backend takes the
//            (month, day) tuple of each and replays the SAME window
//            across every year. So "May" means May 1-31 for every year
//            on the page — past years get the full month sums, the
//            current year gets sums up to today (future dates have no
//            data, so they don't add anything). This is the right model
//            for year-over-year comparison: "what did we do this May vs.
//            last May, full-month basis."
//
//            `as_of` is sent alongside (set to today for current month,
//            last-day for past) so the backend can populate the
//            month_start / day_n / month_days fields in the response
//            for the slice header label.
//
//   range  → emit `slice_start` + `slice_end` directly. Same semantics:
//            backend replays the (month, day) tuple across every year.
function filtersFromPicker(v: DateRangeValue): {
  as_of?: string
  slice_start?: string
  slice_end?: string
} {
  if (v.kind === 'range') {
    return { as_of: v.to, slice_start: v.from, slice_end: v.to }
  }
  const [yStr, mStr] = v.month.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return {}

  // First and last calendar day of the picked month.
  const firstIso = `${y}-${String(m).padStart(2, '0')}-01`
  const last = new Date(y, m, 0)
  const lastIso = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`

  const now = new Date()
  const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1
  const as_of = isCurrent ? now.toISOString().slice(0, 10) : lastIso

  return {
    as_of,
    slice_start: firstIso,
    slice_end: lastIso,
  }
}

export default function Dayslice() {
  const { t } = useTranslation()
  const [direction, setDirection] = useState('')
  const [years, setYears] = useState(4)
  const [pickerValue, setPickerValue] = useState<DateRangeValue>(() => ({
    kind: 'month',
    month: currentMonthValue(),
  }))
  const [drill, setDrill] = useState<{ measure: 'sotuv' | 'kirim'; manager: string; year: number } | null>(null)

  const directionsQ = useSnapshotsDirections()
  const dateFilters = filtersFromPicker(pickerValue)
  const filters = { direction, years, ...dateFilters }

  const scoreboardQ = useDaysliceScoreboard(filters)
  const regionQ = useDaysliceRegionPivot(filters)

  const slice = scoreboardQ.data?.slice
  const sotuvRows = scoreboardQ.data?.sotuv?.rows ?? []
  const kirimRows = scoreboardQ.data?.kirim?.rows ?? []
  const yearCols = scoreboardQ.data?.year_columns ?? []

  return (
    <div>
      <PageHeader />

      <header className="mb-6">
        <span className="section-title">{t('admin.section')}</span>
        <div className="flex items-end justify-between gap-4 mt-3 flex-wrap">
          <h1
            className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight"
            style={{ fontFamily: PLAYFAIR }}
          >
            {t('admin.dayslice.title')}
          </h1>
          {slice && (
            // Slice window (month_start → as_of) replayed across every year
            // on the page. Prefix with `↻` and trail with "across each year"
            // so the cross-year semantics are explicit. We deliberately drop
            // the day_n / month_days caption — when the slice is a full
            // month, "Kun 31/31" is meaningless; for partial windows
            // (custom ranges, MTD), the slice range itself already tells
            // you everything.
            <p className="text-xs text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
              <span className="text-muted-foreground/60 mr-1.5">↻</span>
              {slice.month_start} → {slice.as_of}
              <span className="text-muted-foreground/60 ml-1.5">· {t('admin.dayslice.acrossYears')}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/40" style={{ fontFamily: DM_SANS }}>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 mr-1" style={{ fontFamily: PLEX_MONO }}>
            {t('data.filters.label')}
          </span>
          {/* Month / range picker — calendar-icon trigger; dropdown surfaces
              presets, a 12-month grid, and a custom from/to expander. */}
          <MonthPicker value={pickerValue} onChange={setPickerValue} label={t('admin.dayslice.month')} />
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className={cn('month-btn appearance-none normal-case font-medium pr-6', direction && 'active')}
            aria-label={t('analytics.filters.direction')}
          >
            <option value="">{t('analytics.filters.direction')}</option>
            {(directionsQ.data ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="flex items-center gap-1">
            {[2, 3, 4, 5, 6].map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYears(y)}
                className={cn('month-btn', years === y && 'active')}
              >
                {y}{t('admin.dayslice.yearsShort')}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Scoreboard — sotuv */}
      <Section title={`${t('admin.dayslice.scoreboard')} · ${t('analytics.comparison.sotuv')}`}>
        <ScoreboardMatrix
          rows={sotuvRows}
          yearCols={yearCols}
          loading={scoreboardQ.isLoading && !scoreboardQ.data}
          onCellClick={(manager, year) => setDrill({ measure: 'sotuv', manager, year })}
          accent="#9E7B2F"
        />
      </Section>

      {/* Scoreboard — kirim */}
      <Section title={`${t('admin.dayslice.scoreboard')} · ${t('analytics.comparison.kirim')}`}>
        <ScoreboardMatrix
          rows={kirimRows}
          yearCols={yearCols}
          loading={scoreboardQ.isLoading && !scoreboardQ.data}
          onCellClick={(manager, year) => setDrill({ measure: 'kirim', manager, year })}
          accent="#1E8A5E"
        />
      </Section>

      {/* Region pivot */}
      <Section title={t('admin.dayslice.regionPivot')}>
        {regionQ.data && regionQ.data.row_labels.length > 0 ? (
          <MatrixTable
            rowLabels={regionQ.data.row_labels}
            colLabels={regionQ.data.col_labels}
            values={regionQ.data.values}
            format="currency"
            accentColor="#9E7B2F"
            caption={`${t('admin.dayslice.regionByManager')} · ${formatNumber(regionQ.data.grand_total)} USD`}
          />
        ) : regionQ.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="shimmer-skeleton h-8 w-full" />)}</div>
        ) : (
          <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>{t('admin.dayslice.noRegionData')}</p>
        )}
      </Section>

      {drill && (
        <DrillModal
          measure={drill.measure}
          manager={drill.manager}
          year={drill.year}
          filters={filters}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade-up animate-fade-up-delay-3 mt-8">
      <h2 className="section-title mb-4" style={{ fontFamily: DM_SANS }}>{title}</h2>
      {children}
    </section>
  )
}

// ── Scoreboard matrix ────────────────────────────────────────────────────

function ScoreboardMatrix({
  rows,
  yearCols,
  loading,
  onCellClick,
  accent,
}: {
  rows: DaysliceScoreboard['sotuv']['rows']
  yearCols: number[]
  loading: boolean
  onCellClick: (manager: string, year: number) => void
  accent: string
}) {
  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer-skeleton h-8 w-full" />)}</div>
  }
  if (rows.length === 0) {
    return <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>—</p>
  }
  return (
    <MatrixTable
      rowLabels={rows.map((r) => r.manager)}
      colLabels={yearCols.map(String)}
      values={rows.map((r) => r.by_year)}
      format="currency"
      accentColor={accent}
      onCellClick={(manager, year) => onCellClick(manager, Number(year))}
    />
  )
}

// ── Drill modal ──────────────────────────────────────────────────────────

function DrillModal({
  measure,
  manager,
  year,
  filters,
  onClose,
}: {
  measure: 'sotuv' | 'kirim'
  manager: string
  year: number
  filters: { direction?: string; as_of?: string; slice_start?: string; slice_end?: string }
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const q = useDaysliceDrill({ measure, manager, year, ...filters, enabled: true })
  const rows = q.data?.rows ?? []
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 right-0 z-40 w-full sm:w-120 bg-card border-l border-border flex flex-col"
        style={{ fontFamily: DM_SANS }}
      >
        <div className="flex items-center justify-between px-6 lg:px-8 pt-6 pb-3 border-b border-border/40 shrink-0">
          <span className="section-title flex-1">{t('admin.dayslice.drillTitle')}</span>
          <button type="button" onClick={onClose} className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors" aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-5">
          <h2 className="text-2xl font-semibold leading-tight mb-1" style={{ fontFamily: PLAYFAIR }}>
            {manager}
          </h2>
          <p className="text-xs text-muted-foreground mb-5" style={{ fontFamily: PLEX_MONO }}>
            {measure} · {year} · {q.data?.total ?? 0} {t('analytics.comparison.lines')}
          </p>
          {q.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer-skeleton h-8 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>—</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li key={i} className="grid grid-cols-[80px_1fr_auto] gap-3 items-baseline border-b border-border/30 pb-2">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {r.delivery_date || r.payment_date || '—'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm truncate">{r.client_name ?? r.product_name ?? '—'}</p>
                    {r.region && <p className="text-[10px] text-muted-foreground">{r.region}</p>}
                  </div>
                  <span className="text-sm tabular-nums font-medium" style={{ fontFamily: PLAYFAIR }}>
                    {formatNumber(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[10px] text-muted-foreground/60" style={{ fontFamily: PLEX_MONO }}>
            {i18n.language}
          </p>
        </div>
      </aside>
    </>
  )
}

