import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, X, AlertTriangle, Edit3 } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import MatrixTable from '@/components/analytics/MatrixTable'
import {
  useDaysliceScoreboard,
  useDaysliceProjection,
  useDaysliceRegionPivot,
  useDaysliceDrill,
  useDayslicePlan,
  useUpdateDayslicePlan,
  useSnapshotsDirections,
  type DaysliceScoreboard,
  type DaysliceePlanRow,
} from '@/api/hooks'
import { formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

// Plotly is heavy; lazy-load via the analytics chunk so the dashboard /
// data-viewer routes don't pull it in.
const PlotlyChart = lazy(() => import('@/charts/PlotlyChart').then((m) => ({ default: m.default })))

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

export default function Dayslice() {
  const { t } = useTranslation()
  const [direction, setDirection] = useState('')
  const [years, setYears] = useState(4)
  const [drill, setDrill] = useState<{ measure: 'sotuv' | 'kirim'; manager: string; year: number } | null>(null)
  const [planOpen, setPlanOpen] = useState(false)

  const directionsQ = useSnapshotsDirections()
  const filters = { direction, years }

  const scoreboardQ = useDaysliceScoreboard(filters)
  const projectionQ = useDaysliceProjection({ enabled: true })
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
          <button
            type="button"
            onClick={() => setPlanOpen(true)}
            className="month-btn inline-flex items-center gap-1.5 normal-case ml-auto"
          >
            <Edit3 size={11} />
            {t('admin.dayslice.editPlan')}
          </button>
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
            caption={`${t('admin.dayslice.regionByManager')} · ${formatNumber(regionQ.data.grand_total)} UZS`}
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
      {planOpen && (
        <PlanEditorModal onClose={() => setPlanOpen(false)} />
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
        UZS · {t('admin.dayslice.mtdAt')} {dayN}/{monthDays}
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

// ── Plan editor modal ───────────────────────────────────────────────────

function PlanEditorModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const planQ = useDayslicePlan(year, month)
  const update = useUpdateDayslicePlan()
  const scoreboardQ = useDaysliceScoreboard({ years: 1 })

  const [rows, setRows] = useState<DaysliceePlanRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Initialise editable rows once data lands. setRows runs once per dataset
  // change, not per render — guarded by length checks to avoid clobbering
  // the user's in-progress edits.
  useEffect(() => {
    if (planQ.data?.rows && planQ.data.rows.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows(planQ.data.rows)
    } else if (scoreboardQ.data?.sotuv?.rows && rows.length === 0) {
      setRows(
        scoreboardQ.data.sotuv.rows.map((r) => ({ manager: r.manager, plan_sotuv: null, plan_kirim: null })),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planQ.data, scoreboardQ.data])

  function setCell(idx: number, field: 'plan_sotuv' | 'plan_kirim', value: string) {
    const n = value === '' ? null : Number(value)
    if (value !== '' && (!Number.isFinite(n) || (n as number) < 0)) return
    setRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: n }
      return next
    })
    setSaved(false)
  }

  async function onSave() {
    setError(null)
    try {
      await update.mutateAsync({ year, month, rows })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(detail ?? t('admin.dayslice.saveFailed'))
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-card border border-border rounded-xl p-6 lg:p-7 shadow-xl animate-fade-up max-h-[85vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold leading-none" style={{ fontFamily: PLAYFAIR }}>
            {t('admin.dayslice.editPlan')}
          </h2>
          <button type="button" onClick={onClose} className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors" aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4" style={{ fontFamily: DM_SANS }}>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="inv-filter"
            style={{ width: 90 }}
          />
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="inv-filter">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
              <option key={m} value={m}>
                {m.toString().padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm" style={{ fontFamily: DM_SANS }}>
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground border-b border-border">{t('admin.dayslice.manager')}</th>
                <th className="px-3 py-2 text-right text-[10px] uppercase tracking-[0.12em] text-muted-foreground border-b border-border">{t('analytics.comparison.sotuv')}</th>
                <th className="px-3 py-2 text-right text-[10px] uppercase tracking-[0.12em] text-muted-foreground border-b border-border">{t('analytics.comparison.kirim')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={3} className="py-6 text-center text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>{t('admin.dayslice.noManagers')}</td></tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.manager}>
                    <td className="px-3 py-2 border-b border-border/40" style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}>{row.manager}</td>
                    <td className="px-3 py-2 border-b border-border/40 text-right">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={row.plan_sotuv ?? ''}
                        onChange={(e) => setCell(idx, 'plan_sotuv', e.target.value)}
                        placeholder="—"
                        className="inv-filter w-32 text-right"
                        style={{ fontFamily: PLAYFAIR }}
                      />
                    </td>
                    <td className="px-3 py-2 border-b border-border/40 text-right">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={row.plan_kirim ?? ''}
                        onChange={(e) => setCell(idx, 'plan_kirim', e.target.value)}
                        placeholder="—"
                        className="inv-filter w-32 text-right"
                        style={{ fontFamily: PLAYFAIR }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="mt-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-start gap-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {saved && (
          <p className="mt-4 text-xs italic text-[#9E7B2F]" style={{ fontFamily: DM_SANS }}>
            ✓ {t('admin.dayslice.planSaved')}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-border/40">
          <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
            {t('common.close')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={update.isPending}
            className="text-xs px-3.5 py-1.5 rounded bg-[#D4A843] hover:bg-[#C49833] disabled:bg-[#D4A843]/30 text-black font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <Save size={11} />
            {update.isPending ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </>
  )
}
