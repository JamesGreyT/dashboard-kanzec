import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import MatrixTable from '@/components/analytics/MatrixTable'
import { useSnapshotsDirections, useComparisonMatrix, useComparisonDrill, type ComparisonParams } from '@/api/hooks'
import { formatNumber, formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

type Tab = 'sotuv' | 'kirim'

const ALL_DIMENSIONS = ['manager', 'direction', 'brand', 'model', 'region'] as const
const KIRIM_DIMENSIONS = ['manager', 'direction', 'region'] as const

export default function Comparison() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = (searchParams.get('tab') === 'kirim' ? 'kirim' : 'sotuv') as Tab
  const dimension = (searchParams.get('dimension') ?? 'manager') as ComparisonParams['dimension']
  const mode = (searchParams.get('mode') ?? 'yearly') as ComparisonParams['mode']
  const year = searchParams.get('year') ? Number(searchParams.get('year')) : undefined
  const month = searchParams.get('month') ? Number(searchParams.get('month')) : undefined
  const direction = searchParams.get('direction') ?? ''
  const withPlan = searchParams.get('with_plan') === '1'

  const setParam = (key: string, value: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })

  const params: ComparisonParams = {
    measure: tab,
    dimension: dimension as ComparisonParams['dimension'],
    mode,
    years: 4,
    year,
    month,
    direction: direction || undefined,
    with_plan: withPlan && tab === 'sotuv' && dimension === 'manager' ? true : undefined,
  }

  const matrixQ = useComparisonMatrix(params)
  const data = matrixQ.data

  const directionsQ = useSnapshotsDirections()

  const [drill, setDrill] = useState<{ rowLabel: string; bucket: string } | null>(null)

  // If user is on kirim and dimension is brand/model, force back to manager
  useEffect(() => {
    if (tab === 'kirim' && (dimension === 'brand' || dimension === 'model')) {
      setParam('dimension', 'manager')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const dimensionsForTab = tab === 'kirim' ? KIRIM_DIMENSIONS : ALL_DIMENSIONS

  return (
    <div>
      <PageHeader />

      <header className="mb-6">
        <div className="animate-fade-up">
          <span className="section-title">{t('analytics.section')}</span>
        </div>
        <h1
          className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight mt-3 animate-fade-up animate-fade-up-delay-1"
          style={{ fontFamily: PLAYFAIR }}
        >
          {t('analytics.comparison.title')}
        </h1>

        {/* Tabs sotuv | kirim */}
        <div className="flex items-baseline gap-1 border-b border-border/60 mt-4 animate-fade-up animate-fade-up-delay-1">
          <TabPill active={tab === 'sotuv'} onClick={() => setParam('tab', '')}>
            {t('analytics.comparison.sotuv')}
          </TabPill>
          <TabPill active={tab === 'kirim'} onClick={() => setParam('tab', 'kirim')}>
            {t('analytics.comparison.kirim')}
          </TabPill>
        </div>

        {/* Mode + dimension + plan toggle */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/40 animate-fade-up animate-fade-up-delay-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 mr-1" style={{ fontFamily: PLEX_MONO }}>
            {t('analytics.filters.label')}
          </span>

          {/* Mode toggle */}
          <div className="flex items-center gap-0.5">
            {(['yearly', 'monthly', 'daily'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setParam('mode', m === 'yearly' ? '' : m)}
                className={cn('month-btn', mode === m && 'active')}
              >
                {t(`analytics.comparison.modes.${m}`)}
              </button>
            ))}
          </div>

          {/* Dimension select */}
          <select
            value={dimension}
            onChange={(e) => setParam('dimension', e.target.value === 'manager' ? '' : e.target.value)}
            className="month-btn appearance-none normal-case font-medium pr-6"
            aria-label={t('analytics.comparison.dimension')}
          >
            {dimensionsForTab.map((d) => (
              <option key={d} value={d}>
                {t(`analytics.comparison.dimensions.${d}`)}
              </option>
            ))}
          </select>

          {/* Direction filter */}
          <select
            value={direction}
            onChange={(e) => setParam('direction', e.target.value)}
            className={cn('month-btn appearance-none normal-case font-medium pr-6', direction && 'active')}
            aria-label={t('analytics.filters.direction')}
          >
            <option value="">{t('analytics.filters.direction')}</option>
            {(directionsQ.data ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          {tab === 'sotuv' && dimension === 'manager' && (
            <button
              type="button"
              onClick={() => setParam('with_plan', withPlan ? '' : '1')}
              className={cn('month-btn inline-flex items-center gap-1.5 normal-case', withPlan && 'active')}
            >
              <span className={cn('w-2 h-2 rounded-full border transition-colors', withPlan ? 'bg-[#D4A843] border-[#9E7B2F]' : 'border-muted-foreground/40')} />
              {t('analytics.comparison.withPlan')}
            </button>
          )}
        </div>
      </header>

      {/* Matrix */}
      <section className="animate-fade-up animate-fade-up-delay-3">
        {matrixQ.isLoading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer-skeleton h-8 w-full" />)}
          </div>
        ) : data && data.rows.length > 0 ? (
          <MatrixTable
            rowLabels={data.rows.map((r) => r.label)}
            colLabels={data.columns}
            values={data.rows.map((r) => r.values)}
            onCellClick={(rowLabel, colLabel) => setDrill({ rowLabel, bucket: colLabel })}
            format="currency"
            accentColor={tab === 'sotuv' ? '#9E7B2F' : '#1E8A5E'}
          />
        ) : (
          <p className="text-sm italic text-muted-foreground py-12 text-center" style={{ fontFamily: PLAYFAIR }}>
            {t('analytics.comparison.empty')}
          </p>
        )}
      </section>

      {drill && (
        <DrillModal
          params={params}
          dimensionValue={drill.rowLabel}
          bucket={drill.bucket}
          onClose={() => setDrill(null)}
          lang={i18n.language}
        />
      )}
    </div>
  )
}

function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-2 px-3 py-2 text-sm transition-colors',
        active ? 'text-[#9E7B2F] font-semibold' : 'text-muted-foreground hover:text-foreground',
      )}
      style={{ fontFamily: DM_SANS }}
    >
      {children}
      {active && <span aria-hidden className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4A843]" />}
    </button>
  )
}

function DrillModal({
  params,
  dimensionValue,
  bucket,
  onClose,
  lang,
}: {
  params: ComparisonParams
  dimensionValue: string
  bucket: string
  onClose: () => void
  lang: string
}) {
  const { t } = useTranslation()
  const q = useComparisonDrill({ ...params, dimension_value: dimensionValue, bucket })
  const rows = q.data?.rows ?? []
  const total = q.data?.total ?? 0

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-40 w-full sm:w-120 bg-card border-l border-border flex flex-col"
        style={{ fontFamily: DM_SANS }}
      >
        <div className="flex items-center justify-between px-6 lg:px-8 pt-6 pb-3 border-b border-border/40 shrink-0">
          <span className="section-title flex-1">{t('analytics.comparison.drillTitle')}</span>
          <button type="button" onClick={onClose} className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors" aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-5">
          <h2 className="text-2xl font-semibold leading-tight mb-1" style={{ fontFamily: PLAYFAIR }}>
            {dimensionValue}
          </h2>
          <p className="text-xs text-muted-foreground mb-5" style={{ fontFamily: PLEX_MONO }}>
            {bucket} · {total.toLocaleString()} {t('analytics.comparison.lines')}
          </p>

          {q.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer-skeleton h-8 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
              {t('analytics.comparison.drillEmpty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li key={i} className="grid grid-cols-[80px_1fr_auto] gap-3 items-baseline border-b border-border/30 pb-2">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {(r.delivery_date || r.payment_date) ? formatShortDate((r.delivery_date || r.payment_date) as string, lang) : '—'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm truncate">{r.client ?? r.label}</p>
                    {(r.brand || r.region || r.manager) && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {[r.brand, r.region, r.manager].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="text-sm tabular-nums font-medium" style={{ fontFamily: PLAYFAIR }}>
                    {formatNumber(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
