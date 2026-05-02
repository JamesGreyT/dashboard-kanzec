import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import AnalyticsShell from '@/components/analytics/AnalyticsShell'
import KpiDelta from '@/components/analytics/KpiDelta'
import RankedTable, { Sparkline, Delta, type Column } from '@/components/analytics/RankedTable'
import PlotlyChart, { ALMANAC_PALETTE } from '@/charts/PlotlyChart'
import { useTheme } from '@/context/ThemeContext'
import {
  useSalesOverview,
  useSalesTimeseries,
  useSalesClients,
  useSalesManagers,
  useSalesBrands,
  useSalesRegions,
  useSalesCrossSell,
  useSalesRfm,
  useSalesSeasonality,
  salesExportHref,
  type AnalyticsFilters,
  type SalesClientRow,
  type SalesManagerRow,
  type SalesBrandRow,
  type SalesRegionRow,
} from '@/api/hooks'
import { formatNumber, formatShortDate } from '@/lib/format'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"

export default function Sales() {
  const { t } = useTranslation()
  return (
    <AnalyticsShell sectionLabel={t('analytics.section')} title={t('analytics.sales.title')}>
      {(filters) => <SalesContent filters={filters} />}
    </AnalyticsShell>
  )
}

function SalesContent({ filters }: { filters: AnalyticsFilters }) {
  const { t, i18n } = useTranslation()

  const overviewQ = useSalesOverview(filters)
  const o = overviewQ.data
  const isLoading = overviewQ.isLoading && !o

  return (
    <div className="space-y-10 mt-2">
      {/* KPI strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KpiDelta
          label={t('analytics.sales.revenue')}
          block={o?.revenue ?? { current: 0 }}
          unit="UZS"
          delay={1}
          loading={isLoading}
        />
        <KpiDelta
          label={t('analytics.sales.deals')}
          block={o?.deals ?? { current: 0 }}
          delay={2}
          loading={isLoading}
        />
        <KpiDelta
          label={t('analytics.sales.uniqueClients')}
          block={o?.unique_clients ?? { current: 0 }}
          delay={3}
          loading={isLoading}
        />
        <KpiDelta
          label={t('analytics.sales.avgDeal')}
          block={o?.avg_deal ?? { current: 0 }}
          unit="UZS"
          delay={4}
          loading={isLoading}
        />
      </section>

      {/* Time series */}
      <Section title={t('analytics.sales.timeseries')}>
        <TimeseriesPanel filters={filters} />
      </Section>

      {/* Top clients (with sparkline + Excel export) */}
      <Section title={t('analytics.sales.topClients')}>
        <ClientsTable filters={filters} lang={i18n.language} />
      </Section>

      {/* Top managers / brands / regions in a 3-col grid on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section title={t('analytics.sales.topManagers')}>
          <ManagersTable filters={filters} />
        </Section>
        <Section title={t('analytics.sales.topBrands')}>
          <BrandsTable filters={filters} />
        </Section>
      </div>

      <Section title={t('analytics.sales.topRegions')}>
        <RegionsTable filters={filters} />
      </Section>

      {/* Cross-sell + RFM in side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section title={t('analytics.sales.crossSell')}>
          <CrossSellList filters={filters} />
        </Section>
        <Section title={t('analytics.sales.rfm')}>
          <RfmPanel filters={filters} />
        </Section>
      </div>

      {/* Seasonality heatmap */}
      <Section title={t('analytics.sales.seasonality')}>
        <SeasonalityHeatmap filters={filters} />
      </Section>
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade-up animate-fade-up-delay-3">
      <h2
        className="section-title mb-4"
        style={{ fontFamily: DM_SANS }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

// ── Sub-panels ────────────────────────────────────────────────────────────

function TimeseriesPanel({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month' | 'quarter'>('month')
  const q = useSalesTimeseries({ ...filters, granularity })
  const ctx = useTheme()
  const palette = ctx.isDark ? ALMANAC_PALETTE.dark : ALMANAC_PALETTE.light

  const series = q.data?.series ?? []
  const x = series.map((p) => p.date)
  const y = series.map((p) => p.value)
  const yoy = series.map((p) => p.yoy ?? null)

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        {(['day', 'week', 'month', 'quarter'] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGranularity(g)}
            className={`month-btn ${granularity === g ? 'active' : ''}`}
          >
            {t(`analytics.granularity.${g}`)}
          </button>
        ))}
      </div>
      <div className="glass-card rounded-xl p-3 h-72">
        {q.isLoading && !q.data ? (
          <div className="shimmer-skeleton h-full w-full rounded-md" />
        ) : (
          <PlotlyChart
            data={[
              {
                x,
                y,
                type: 'scatter',
                mode: 'lines+markers',
                name: t('analytics.sales.revenue'),
                line: { color: palette[0], width: 2 },
                marker: { size: 5 },
              },
              {
                x,
                y: yoy,
                type: 'scatter',
                mode: 'lines',
                name: t('analytics.sales.yoy'),
                line: { color: palette[2], width: 1, dash: 'dot' },
              },
            ]}
            layout={{ showlegend: true }}
          />
        )}
      </div>
    </div>
  )
}

function ClientsTable({ filters, lang }: { filters: AnalyticsFilters; lang: string }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [size] = useState(25)
  const [sort, setSort] = useState('revenue:desc')
  const params = { ...filters, page, size, sort, with_sparkline: true }
  const q = useSalesClients(params)

  const columns: Column<SalesClientRow>[] = [
    {
      key: 'name',
      label: t('analytics.cols.client'),
      sortKey: 'name',
      render: (row) => (
        <Link
          to={`/collection/debt/client/${row.person_id}`}
          className="hover:text-[#9E7B2F] transition-colors"
          style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: 'region',
      label: t('analytics.cols.region'),
      render: (row) => row.region ?? <span className="cell-empty">—</span>,
    },
    {
      key: 'revenue',
      label: t('analytics.sales.revenue'),
      sortKey: 'revenue',
      align: 'right',
      render: (row) => (
        <span style={{ fontFamily: PLAYFAIR }} className="font-medium">
          {formatNumber(row.revenue)}
        </span>
      ),
    },
    {
      key: 'deals',
      label: t('analytics.sales.deals'),
      sortKey: 'deals',
      align: 'right',
      render: (row) => formatNumber(row.deals),
    },
    {
      key: 'avg',
      label: t('analytics.sales.avgDeal'),
      sortKey: 'avg_deal',
      align: 'right',
      render: (row) => formatNumber(row.avg_deal, { decimals: 0 }),
    },
    {
      key: 'yoy',
      label: t('analytics.cols.yoy'),
      align: 'right',
      render: (row) => <Delta value={row.yoy_pct} />,
    },
    {
      key: 'spark',
      label: '12mo',
      render: (row) => row.sparkline ? <Sparkline values={row.sparkline} /> : <span className="cell-empty">—</span>,
    },
    {
      key: 'last',
      label: t('analytics.cols.lastOrder'),
      render: (row) => row.last_order ? formatShortDate(row.last_order, lang) : <span className="cell-empty">—</span>,
    },
  ]

  return (
    <RankedTable
      rows={q.data?.rows ?? []}
      total={q.data?.total ?? 0}
      columns={columns}
      sort={sort}
      onSortChange={setSort}
      page={page}
      size={size}
      onPage={setPage}
      loading={q.isLoading && !q.data}
      exportHref={salesExportHref('clients', params)}
    />
  )
}

function ManagersTable({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [size] = useState(25)
  const [sort, setSort] = useState('revenue:desc')
  const params = { ...filters, page, size, sort }
  const q = useSalesManagers(params)

  const columns: Column<SalesManagerRow & { person_id?: number }>[] = [
    {
      key: 'manager',
      label: t('analytics.cols.manager'),
      sortKey: 'manager',
      render: (row) => <span style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}>{row.manager}</span>,
    },
    { key: 'rev', label: t('analytics.sales.revenue'), sortKey: 'revenue', align: 'right',
      render: (row) => <span style={{ fontFamily: PLAYFAIR }}>{formatNumber(row.revenue)}</span> },
    { key: 'deals', label: t('analytics.sales.deals'), sortKey: 'deals', align: 'right',
      render: (row) => formatNumber(row.deals) },
    { key: 'clients', label: t('analytics.sales.uniqueClientsShort'), align: 'right',
      render: (row) => formatNumber(row.unique_clients) },
    { key: 'yoy', label: t('analytics.cols.yoy'), align: 'right',
      render: (row) => <Delta value={row.yoy_pct} /> },
  ]

  return (
    <RankedTable
      rows={q.data?.rows ?? []}
      total={q.data?.total ?? 0}
      columns={columns}
      sort={sort}
      onSortChange={setSort}
      page={page}
      size={size}
      onPage={setPage}
      loading={q.isLoading && !q.data}
      exportHref={salesExportHref('managers', params)}
    />
  )
}

function BrandsTable({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [size] = useState(25)
  const [sort, setSort] = useState('revenue:desc')
  const params = { ...filters, page, size, sort }
  const q = useSalesBrands(params)

  const columns: Column<SalesBrandRow & { person_id?: number }>[] = [
    { key: 'brand', label: t('analytics.cols.brand'), sortKey: 'brand',
      render: (row) => <span style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}>{row.brand}</span> },
    { key: 'rev', label: t('analytics.sales.revenue'), sortKey: 'revenue', align: 'right',
      render: (row) => <span style={{ fontFamily: PLAYFAIR }}>{formatNumber(row.revenue)}</span> },
    { key: 'deals', label: t('analytics.sales.deals'), sortKey: 'deals', align: 'right',
      render: (row) => formatNumber(row.deals) },
    { key: 'qty', label: t('analytics.cols.qty'), align: 'right',
      render: (row) => formatNumber(row.qty) },
  ]

  return (
    <RankedTable
      rows={q.data?.rows ?? []}
      total={q.data?.total ?? 0}
      columns={columns}
      sort={sort}
      onSortChange={setSort}
      page={page}
      size={size}
      onPage={setPage}
      loading={q.isLoading && !q.data}
      exportHref={salesExportHref('brands', params)}
    />
  )
}

function RegionsTable({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [size] = useState(50)
  const [sort, setSort] = useState('revenue:desc')
  const params = { ...filters, page, size, sort }
  const q = useSalesRegions(params)

  const columns: Column<SalesRegionRow & { person_id?: number }>[] = [
    { key: 'region', label: t('analytics.cols.region'), sortKey: 'region',
      render: (row) => <span style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}>{row.region}</span> },
    { key: 'rev', label: t('analytics.sales.revenue'), sortKey: 'revenue', align: 'right',
      render: (row) => <span style={{ fontFamily: PLAYFAIR }}>{formatNumber(row.revenue)}</span> },
    { key: 'deals', label: t('analytics.sales.deals'), sortKey: 'deals', align: 'right',
      render: (row) => formatNumber(row.deals) },
    { key: 'clients', label: t('analytics.sales.uniqueClientsShort'), align: 'right',
      render: (row) => formatNumber(row.unique_clients) },
  ]

  return (
    <RankedTable
      rows={q.data?.rows ?? []}
      total={q.data?.total ?? 0}
      columns={columns}
      sort={sort}
      onSortChange={setSort}
      page={page}
      size={size}
      onPage={setPage}
      loading={q.isLoading && !q.data}
      exportHref={salesExportHref('regions', params)}
    />
  )
}

function CrossSellList({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const q = useSalesCrossSell({ ...filters, limit: 20 })
  const rows = q.data?.pairs ?? q.data?.rows ?? []
  if (q.isLoading && !q.data) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer-skeleton h-7 w-full" />)}
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
        {t('analytics.sales.noCrossSell')}
      </p>
    )
  }
  return (
    <ul className="space-y-1.5" style={{ fontFamily: DM_SANS }}>
      {rows.map((p, i) => (
        <li
          key={`${p.left}-${p.right}-${i}`}
          className="flex items-baseline justify-between gap-3 text-sm py-1.5 border-b border-border/30"
        >
          <span className="flex-1 min-w-0 truncate">
            <span className="font-medium">{p.left}</span>
            <span className="text-muted-foreground/60 mx-2">↔</span>
            <span className="font-medium">{p.right}</span>
          </span>
          <span className="text-muted-foreground tabular-nums shrink-0">{p.pair_count}</span>
          <span className="text-[#9E7B2F] tabular-nums shrink-0" style={{ fontFamily: PLAYFAIR }}>
            ×{p.lift?.toFixed(2) ?? '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}

function RfmPanel({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const q = useSalesRfm({ ...filters, page: 0, size: 1 })
  const dist = q.data?.segment_distribution ?? []
  if (q.isLoading && !q.data) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer-skeleton h-6 w-full" />)}
      </div>
    )
  }
  if (dist.length === 0) {
    return <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>{t('analytics.sales.noRfm')}</p>
  }
  const sorted = [...dist].sort((a, b) => b.revenue - a.revenue)
  const totalRev = sorted.reduce((s, x) => s + x.revenue, 0) || 1
  const totalClients = sorted.reduce((s, x) => s + x.clients, 0) || 1
  return (
    <ul className="space-y-2" style={{ fontFamily: DM_SANS }}>
      {sorted.map((s) => {
        const revPct = (s.revenue / totalRev) * 100
        const cliPct = (s.clients / totalClients) * 100
        return (
          <li key={s.segment} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex-1 truncate">{s.segment}</span>
            <span className="text-muted-foreground tabular-nums text-xs">
              {s.clients} ({cliPct.toFixed(0)}%)
            </span>
            <span className="font-medium tabular-nums" style={{ fontFamily: PLAYFAIR }}>
              {formatNumber(s.revenue)}
            </span>
            <span className="text-muted-foreground tabular-nums text-xs w-12 text-right">
              {revPct.toFixed(1)}%
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function SeasonalityHeatmap({ filters }: { filters: AnalyticsFilters }) {
  const q = useSalesSeasonality({ ...filters, years: 4 })
  const ctx = useTheme()
  if (q.isLoading && !q.data) return <div className="shimmer-skeleton h-72 w-full rounded-md" />
  if (!q.data || q.data.values.length === 0) return null
  return (
    <div className="glass-card rounded-xl p-3 h-72">
      <PlotlyChart
        data={[{
          type: 'heatmap',
          x: q.data.col_labels,
          y: q.data.row_labels,
          z: q.data.values,
          colorscale: ctx.isDark
            ? [[0, '#0F0F17'], [0.4, '#3a2d12'], [0.8, '#9E7B2F'], [1, '#D4A843']]
            : [[0, '#FAF8F5'], [0.4, '#F0E9DD'], [0.8, '#9E7B2F'], [1, '#D4A843']],
          showscale: true,
          hovertemplate: '%{y} · %{x}<br>%{z:,.0f}<extra></extra>',
        }]}
        layout={{ margin: { t: 10, r: 10, b: 30, l: 110 } }}
      />
    </div>
  )
}
