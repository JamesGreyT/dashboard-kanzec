import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import AnalyticsShell from '@/components/analytics/AnalyticsShell'
import KpiDelta from '@/components/analytics/KpiDelta'
import RankedTable, { type Column } from '@/components/analytics/RankedTable'
import PlotlyChart, { ALMANAC_PALETTE } from '@/charts/PlotlyChart'
import { useTheme } from '@/context/ThemeContext'
import {
  usePaymentsOverview,
  usePaymentsTimeseries,
  usePaymentsMethodSplit,
  usePaymentsWeekday,
  usePaymentsVelocity,
  usePaymentsCollectionRatio,
  usePaymentsPayers,
  usePaymentsPrepayers,
  usePaymentsRegularity,
  usePaymentsChurned,
  paymentsExportHref,
  type AnalyticsFilters,
  type PaymentsRankRow,
} from '@/api/hooks'
import { formatNumber, formatPercent, formatShortDate } from '@/lib/format'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"

export default function Payments() {
  const { t } = useTranslation()
  return (
    <AnalyticsShell sectionLabel={t('analytics.section')} title={t('analytics.payments.title')}>
      {(filters) => <PaymentsContent filters={filters} />}
    </AnalyticsShell>
  )
}

function PaymentsContent({ filters }: { filters: AnalyticsFilters }) {
  const { t, i18n } = useTranslation()
  const overviewQ = usePaymentsOverview(filters)
  const o = overviewQ.data
  const isLoading = overviewQ.isLoading && !o

  return (
    <div className="space-y-10 mt-2">
      {/* KPI strip */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
        <KpiDelta label={t('analytics.payments.receipts')} block={o?.receipts ?? { current: 0 }} unit="USD" delay={1} loading={isLoading} />
        <KpiDelta label={t('analytics.payments.payments')} block={o?.payments ?? { current: 0 }} delay={2} loading={isLoading} />
        <KpiDelta label={t('analytics.payments.payers')} block={o?.payers ?? { current: 0 }} delay={3} loading={isLoading} />
        <KpiDelta
          label={t('analytics.payments.dso')}
          block={{ current: o?.dso?.current ?? 0 }}
          unit={t('analytics.payments.days')}
          inverse
          delay={4}
          loading={isLoading}
        />
        <KpiDelta
          label={t('analytics.payments.collectionRatio')}
          block={{ current: (o?.collection_ratio?.current ?? 0) * 100 }}
          valueOverride={o?.collection_ratio?.current != null ? formatPercent(o.collection_ratio.current * 100, 1) : '—'}
          delay={5}
          loading={isLoading}
        />
      </section>

      <Section title={t('analytics.payments.timeseries')}>
        <TimeseriesPanel filters={filters} />
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section title={t('analytics.payments.methodSplit')}>
          <MethodSplit filters={filters} />
        </Section>
        <Section title={t('analytics.payments.weekday')}>
          <Weekday filters={filters} />
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section title={t('analytics.payments.velocity')}>
          <Velocity filters={filters} />
        </Section>
        <Section title={t('analytics.payments.collectionRatioTrend')}>
          <CollectionRatioTrend filters={filters} />
        </Section>
      </div>

      <Section title={t('analytics.payments.topPayers')}>
        <PayersTable filters={filters} lang={i18n.language} />
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section title={t('analytics.payments.prepayers')}>
          <PrepayersTable filters={filters} />
        </Section>
        <Section title={t('analytics.payments.regularity')}>
          <RegularityTable filters={filters} />
        </Section>
      </div>

      <Section title={t('analytics.payments.churned')}>
        <ChurnedTable filters={filters} lang={i18n.language} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade-up animate-fade-up-delay-3">
      <h2 className="section-title mb-4" style={{ fontFamily: DM_SANS }}>{title}</h2>
      {children}
    </section>
  )
}

// ── Charts ───────────────────────────────────────────────────────────────

function TimeseriesPanel({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month' | 'quarter'>('month')
  const q = usePaymentsTimeseries({ ...filters, granularity })
  const ctx = useTheme()
  const palette = ctx.isDark ? ALMANAC_PALETTE.dark : ALMANAC_PALETTE.light

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        {(['day', 'week', 'month', 'quarter'] as const).map((g) => (
          <button key={g} type="button" onClick={() => setGranularity(g)} className={`month-btn ${granularity === g ? 'active' : ''}`}>
            {t(`analytics.granularity.${g}`)}
          </button>
        ))}
      </div>
      <div className="glass-card rounded-xl p-3 h-72">
        {q.isLoading && !q.data ? (
          <div className="shimmer-skeleton h-full w-full rounded-md" />
        ) : (
          <PlotlyChart
            data={[{
              x: (q.data?.series ?? []).map((p) => p.date),
              y: (q.data?.series ?? []).map((p) => p.value),
              type: 'scatter',
              mode: 'lines+markers',
              line: { color: palette[1], width: 2 },
              marker: { size: 5 },
              name: t('analytics.payments.receipts'),
            }]}
          />
        )}
      </div>
    </div>
  )
}

function MethodSplit({ filters }: { filters: AnalyticsFilters }) {
  const q = usePaymentsMethodSplit(filters)
  const ctx = useTheme()
  const palette = ctx.isDark ? ALMANAC_PALETTE.dark : ALMANAC_PALETTE.light
  if (q.isLoading && !q.data) return <div className="glass-card rounded-xl h-64 p-3"><div className="shimmer-skeleton h-full w-full rounded-md" /></div>
  const split = q.data?.split ?? []
  return (
    <div className="glass-card rounded-xl p-3 h-64">
      <PlotlyChart
        data={[{
          type: 'pie',
          labels: split.map((s) => s.method),
          values: split.map((s) => s.amount),
          hole: 0.55,
          textinfo: 'label+percent',
          marker: { colors: [...palette] },
        }]}
        layout={{ margin: { t: 8, r: 8, b: 8, l: 8 }, showlegend: false }}
      />
    </div>
  )
}

function Weekday({ filters }: { filters: AnalyticsFilters }) {
  const q = usePaymentsWeekday(filters)
  const ctx = useTheme()
  const palette = ctx.isDark ? ALMANAC_PALETTE.dark : ALMANAC_PALETTE.light
  if (q.isLoading && !q.data) return <div className="glass-card rounded-xl h-64 p-3"><div className="shimmer-skeleton h-full w-full rounded-md" /></div>
  const pat = q.data?.pattern ?? []
  return (
    <div className="glass-card rounded-xl p-3 h-64">
      <PlotlyChart
        data={[{
          type: 'bar',
          x: pat.map((p) => p.label),
          y: pat.map((p) => p.amount),
          marker: { color: palette[0] },
          hovertemplate: '%{x}<br>%{y:,.0f}<extra></extra>',
        }]}
      />
    </div>
  )
}

function Velocity({ filters }: { filters: AnalyticsFilters }) {
  const q = usePaymentsVelocity(filters)
  const ctx = useTheme()
  const palette = ctx.isDark ? ALMANAC_PALETTE.dark : ALMANAC_PALETTE.light
  if (q.isLoading && !q.data) return <div className="glass-card rounded-xl h-64 p-3"><div className="shimmer-skeleton h-full w-full rounded-md" /></div>
  const h = q.data?.histogram ?? []
  return (
    <div className="glass-card rounded-xl p-3 h-64">
      <PlotlyChart
        data={[{
          type: 'bar',
          x: h.map((b) => b.bucket),
          y: h.map((b) => b.count),
          marker: { color: palette[2] },
          hovertemplate: '%{x}<br>%{y:,.0f}<extra></extra>',
        }]}
      />
    </div>
  )
}

function CollectionRatioTrend({ filters }: { filters: AnalyticsFilters }) {
  const q = usePaymentsCollectionRatio(filters)
  const ctx = useTheme()
  const palette = ctx.isDark ? ALMANAC_PALETTE.dark : ALMANAC_PALETTE.light
  if (q.isLoading && !q.data) return <div className="glass-card rounded-xl h-64 p-3"><div className="shimmer-skeleton h-full w-full rounded-md" /></div>
  const series = q.data?.series ?? []
  return (
    <div className="glass-card rounded-xl p-3 h-64">
      <PlotlyChart
        data={[{
          type: 'scatter',
          mode: 'lines+markers',
          x: series.map((s) => s.month),
          y: series.map((s) => (s.ratio == null ? null : s.ratio * 100)),
          line: { color: palette[3], width: 2 },
        }]}
        layout={{ yaxis: { ticksuffix: '%' } }}
      />
    </div>
  )
}

// ── Tables ───────────────────────────────────────────────────────────────

function makeRankColumns(t: (k: string) => string): Column<PaymentsRankRow>[] {
  return [
    { key: 'name', label: t('analytics.cols.client'), sortKey: 'name',
      render: (row) => <span style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}>{row.name}</span> },
    { key: 'region', label: t('analytics.cols.region'),
      render: (row) => row.region ?? <span className="cell-empty">—</span> },
    { key: 'amount', label: t('analytics.payments.receipts'), sortKey: 'amount', align: 'right',
      render: (row) => <span style={{ fontFamily: PLAYFAIR }}>{formatNumber(row.amount ?? row.receipts ?? 0)}</span> },
    { key: 'count', label: t('analytics.cols.count'), align: 'right',
      render: (row) => formatNumber(row.count ?? row.payments ?? 0) },
  ]
}

function PayersTable({ filters, lang }: { filters: AnalyticsFilters; lang: string }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [size] = useState(50)
  const [sort, setSort] = useState('amount:desc')
  const params = { ...filters, page, size, sort }
  const q = usePaymentsPayers(params)
  const cols = makeRankColumns(t).concat([
    { key: 'last', label: t('analytics.cols.lastPayment'),
      render: (row) => row.last_payment ? formatShortDate(row.last_payment, lang) : <span className="cell-empty">—</span> },
  ])
  return (
    <RankedTable
      rows={q.data?.rows ?? []}
      total={q.data?.total ?? 0}
      columns={cols}
      sort={sort}
      onSortChange={setSort}
      page={page}
      size={size}
      onPage={setPage}
      loading={q.isLoading && !q.data}
      exportHref={paymentsExportHref('payers', params)}
    />
  )
}

function PrepayersTable({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [size] = useState(25)
  const [sort, setSort] = useState('amount:desc')
  const params = { ...filters, page, size, sort }
  const q = usePaymentsPrepayers(params)
  return (
    <RankedTable
      rows={q.data?.rows ?? []}
      total={q.data?.total ?? 0}
      columns={makeRankColumns(t)}
      sort={sort}
      onSortChange={setSort}
      page={page}
      size={size}
      onPage={setPage}
      loading={q.isLoading && !q.data}
      exportHref={paymentsExportHref('prepayers', params)}
    />
  )
}

function RegularityTable({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [size] = useState(25)
  const [sort, setSort] = useState('amount:desc')
  const params = { ...filters, page, size, sort }
  const q = usePaymentsRegularity(params)
  return (
    <RankedTable
      rows={q.data?.rows ?? []}
      total={q.data?.total ?? 0}
      columns={makeRankColumns(t)}
      sort={sort}
      onSortChange={setSort}
      page={page}
      size={size}
      onPage={setPage}
      loading={q.isLoading && !q.data}
      exportHref={paymentsExportHref('regularity', params)}
    />
  )
}

function ChurnedTable({ filters, lang }: { filters: AnalyticsFilters; lang: string }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [size] = useState(50)
  const [sort, setSort] = useState('amount:desc')
  const params = { ...filters, page, size, sort }
  const q = usePaymentsChurned(params)
  const cols = makeRankColumns(t).concat([
    { key: 'last', label: t('analytics.cols.lastPayment'),
      render: (row) => row.last_payment ? formatShortDate(row.last_payment, lang) : <span className="cell-empty">—</span> },
  ])
  return (
    <RankedTable
      rows={q.data?.rows ?? []}
      total={q.data?.total ?? 0}
      columns={cols}
      sort={sort}
      onSortChange={setSort}
      page={page}
      size={size}
      onPage={setPage}
      loading={q.isLoading && !q.data}
      exportHref={paymentsExportHref('churned', params)}
    />
  )
}
