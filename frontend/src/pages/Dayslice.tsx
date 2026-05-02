import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import MatrixTable from '@/components/analytics/MatrixTable'
import {
  useDaysliceScoreboard,
  useDaysliceProjection,
  useDaysliceRegionPivot,
  useDaysliceDrill,
  useSnapshotsDirections,
  type DaysliceScoreboard,
} from '@/api/hooks'
import { formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

// Plotly is heavy; lazy-load via the analytics chunk so the dashboard /
// data-viewer routes don't pull it in.
const PlotlyChart = lazy(() => import('@/charts/PlotlyChart').then((m) => ({ default: m.default })))

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

// Month picker helpers — the `<input type="month">` value is "YYYY-MM";
// translate to a query-friendly `as_of` ISO date (YYYY-MM-DD).
function currentMonthValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function asOfFromMonth(monthValue: string): string | undefined {
  // Empty month value → no filter, backend defaults to today.
  if (!monthValue) return undefined
  const [yStr, mStr] = monthValue.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return undefined

  const now = new Date()
  const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1
  if (isCurrent) {
    // Mid-month: anchor on today so the slice reads month_start..today.
    return now.toISOString().slice(0, 10)
  }
  // Past or future month: anchor on the last calendar day of that month.
  // Day 0 of next month = last day of current month.
  const last = new Date(y, m, 0)
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

export default function Dayslice() {
  const { t } = useTranslation()
  const [direction, setDirection] = useState('')
  const [years, setYears] = useState(4)
  const [month, setMonth] = useState<string>(() => currentMonthValue())
  const [drill, setDrill] = useState<{ measure: 'sotuv' | 'kirim'; manager: string; year: number } | null>(null)

  const directionsQ = useSnapshotsDirections()
  const as_of = asOfFromMonth(month)
  const filters = { direction, years, as_of }

  const scoreboardQ = useDaysliceScoreboard(filters)
  const projectionQ = useDaysliceProjection({ enabled: true, as_of, years, direction })
  const regionQ = useDaysliceRegionPivot(filters)

  const slice = scoreboardQ.data?.slice ?? projectionQ.data?.slice
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
            <p className="text-xs text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
              {slice.month_start} → {slice.as_of} · {t('admin.dayslice.day')} {slice.day_n}/{slice.month_days}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/40" style={{ fontFamily: DM_SANS }}>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 mr-1" style={{ fontFamily: PLEX_MONO }}>
            {t('data.filters.label')}
          </span>
          {/* Month picker — defaults to current month so the page boots with
              the live slice. Selecting a past month anchors `as_of` on the
              last day of that month (so the slice fills the whole month);
              the current month stays anchored on today, so day_n/month_days
              still reads as a real MTD progression. */}
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            max={currentMonthValue()}
            className={cn('month-btn font-medium normal-case', month !== currentMonthValue() && 'active')}
            aria-label={t('admin.dayslice.month')}
          />
          <button
            type="button"
            onClick={() => setMonth(currentMonthValue())}
            disabled={month === currentMonthValue()}
            className="month-btn normal-case disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('admin.dayslice.thisMonth')}
          </button>
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

      {/* Projection card */}
      {projectionQ.data && (
        <ProjectionPanel data={projectionQ.data} />
      )}

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

// ── Projection panel: Plotly chart with min/mean/max bands ──────────────

function ProjectionPanel({ data }: { data: NonNullable<ReturnType<typeof useDaysliceProjection>['data']> }) {
  const { t } = useTranslation()
  const sotuv = data.projection.sotuv
  const kirim = data.projection.kirim
  const currentSotuv = data.current_mtd.sotuv
  const currentKirim = data.current_mtd.kirim
  const dayN = data.slice.day_n
  const monthDays = data.slice.month_days

  // Build a small bar chart per measure: min/mean/max projection + actual MTD
  const sotuvProgress = sotuv.mean ? (currentSotuv / sotuv.mean) * 100 : 0
  const kirimProgress = kirim.mean ? (currentKirim / kirim.mean) * 100 : 0
  const sotuvOnPace = (currentSotuv / sotuv.mean) * (monthDays / Math.max(dayN, 1))
  const kirimOnPace = (currentKirim / kirim.mean) * (monthDays / Math.max(dayN, 1))

  return (
    <Section title={t('admin.dayslice.projection')}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProjectionCard
          label={t('analytics.comparison.sotuv')}
          current={currentSotuv}
          projection={sotuv}
          progressPct={sotuvProgress}
          onPaceRatio={sotuvOnPace}
          dayN={dayN}
          monthDays={monthDays}
        />
        <ProjectionCard
          label={t('analytics.comparison.kirim')}
          current={currentKirim}
          projection={kirim}
          progressPct={kirimProgress}
          onPaceRatio={kirimOnPace}
          dayN={dayN}
          monthDays={monthDays}
        />
      </div>
      <div className="glass-card rounded-xl p-3 h-72 mt-4">
        <Suspense fallback={<div className="shimmer-skeleton h-full w-full rounded-md" />}>
          <PlotlyChart
            data={[
              {
                type: 'bar',
                name: t('admin.dayslice.minProj'),
                x: ['Sotuv', 'Kirim'],
                y: [sotuv.min, kirim.min],
                marker: { color: '#FBBF24', opacity: 0.5 },
                hovertemplate: '%{x}<br>min: %{y:,.0f}<extra></extra>',
              },
              {
                type: 'bar',
                name: t('admin.dayslice.meanProj'),
                x: ['Sotuv', 'Kirim'],
                y: [sotuv.mean - sotuv.min, kirim.mean - kirim.min],
                marker: { color: '#9E7B2F', opacity: 0.7 },
                hovertemplate: '%{x}<br>mean delta: %{y:,.0f}<extra></extra>',
              },
              {
                type: 'bar',
                name: t('admin.dayslice.maxProj'),
                x: ['Sotuv', 'Kirim'],
                y: [sotuv.max - sotuv.mean, kirim.max - kirim.mean],
                marker: { color: '#34D399', opacity: 0.5 },
                hovertemplate: '%{x}<br>max delta: %{y:,.0f}<extra></extra>',
              },
              {
                type: 'scatter',
                mode: 'markers',
                name: t('admin.dayslice.currentMtd'),
                x: ['Sotuv', 'Kirim'],
                y: [currentSotuv, currentKirim],
                marker: { color: '#D4A843', size: 18, symbol: 'diamond', line: { color: '#7A5E20', width: 2 } },
              },
            ]}
            layout={{ barmode: 'stack', showlegend: true, margin: { t: 10, r: 10, b: 30, l: 60 } }}
          />
        </Suspense>
      </div>
    </Section>
  )
}

function ProjectionCard({
  label,
  current,
  projection,
  progressPct,
  onPaceRatio,
  dayN,
  monthDays,
}: {
  label: string
  current: number
  projection: { min: number; mean: number; max: number }
  progressPct: number
  onPaceRatio: number
  dayN: number
  monthDays: number
}) {
  const { t } = useTranslation()
  const onPacePct = onPaceRatio * 100
  const aheadOfPace = onPacePct >= 100
  return (
    <div className="glass-card kpi-glow rounded-xl p-5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em]" style={{ fontFamily: DM_SANS }}>
        {label} · {t('admin.dayslice.projection')}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums leading-tight" style={{ fontFamily: PLAYFAIR }}>
        {formatNumber(current)}
      </p>
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
        USD · {t('admin.dayslice.mtdAt')} {dayN}/{monthDays}
      </p>
      <div className="mt-4 flex items-baseline gap-3 text-xs" style={{ fontFamily: DM_SANS }}>
        <span className={cn('tabular-nums font-medium', aheadOfPace ? 'text-[#34D399]' : 'text-[#FB923C]')}>
          {aheadOfPace ? '▲' : '▼'} {Math.abs(onPacePct - 100).toFixed(0)}% {aheadOfPace ? t('dashboard.kpi.aheadOfPace') : t('dashboard.kpi.behindOfPace')}
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span className="text-muted-foreground tabular-nums">
          {formatPercent(progressPct, 0)} {t('admin.dayslice.ofMonthMean')}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs" style={{ fontFamily: DM_SANS }}>
        <ProjStat label={t('admin.dayslice.min')} value={projection.min} />
        <ProjStat label={t('admin.dayslice.mean')} value={projection.mean} />
        <ProjStat label={t('admin.dayslice.max')} value={projection.max} />
      </div>
    </div>
  )
}

function ProjStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70" style={{ fontFamily: PLEX_MONO }}>{label}</p>
      <p className="text-base tabular-nums font-medium" style={{ fontFamily: PLAYFAIR }}>{formatNumber(value)}</p>
    </div>
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
  onClose,
}: {
  measure: 'sotuv' | 'kirim'
  manager: string
  year: number
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const q = useDaysliceDrill({ measure, manager, year, enabled: true })
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

