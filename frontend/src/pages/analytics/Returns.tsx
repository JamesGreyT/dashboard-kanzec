import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import AnalyticsShell from '@/components/analytics/AnalyticsShell'
import KpiDelta from '@/components/analytics/KpiDelta'
import RankedTable, { type Column } from '@/components/analytics/RankedTable'
import MatrixTable from '@/components/analytics/MatrixTable'
import PlotlyChart, { ALMANAC_PALETTE } from '@/charts/PlotlyChart'
import { useTheme } from '@/context/ThemeContext'
import {
  useReturnsOverview,
  useReturnsTimeline,
  useReturnsBrandHeatmap,
  useReturnsClients,
  useReturnsRegions,
  returnsExportHref,
  type AnalyticsFilters,
  type ReturnsClientRow,
  type ReturnsRegionRow,
} from '@/api/hooks'
import { formatNumber, formatPercent } from '@/lib/format'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"

export default function Returns() {
  const { t } = useTranslation()
  return (
    <AnalyticsShell sectionLabel={t('analytics.section')} title={t('analytics.returns.title')}>
      {(filters) => <Content filters={filters} />}
    </AnalyticsShell>
  )
}

function Content({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const overviewQ = useReturnsOverview(filters)
  const o = overviewQ.data
  const isLoading = overviewQ.isLoading && !o
  return (
    <div className="space-y-10 mt-2">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KpiDelta label={t('analytics.returns.amount')} block={o?.returns ?? { current: 0 }} unit="UZS" inverse delay={1} loading={isLoading} />
        <KpiDelta
          label={t('analytics.returns.rate')}
          block={{ current: (o?.rate?.current ?? 0) * 100 }}
          valueOverride={o?.rate?.current != null ? formatPercent(o.rate.current * 100, 2) : '—'}
          inverse
          delay={2}
          loading={isLoading}
        />
        <KpiDelta label={t('analytics.returns.lines')} block={o?.return_lines ?? { current: 0 }} inverse delay={3} loading={isLoading} />
        <KpiDelta label={t('analytics.returns.avgTicket')} block={{ current: o?.avg_ticket?.current ?? 0 }} unit="UZS" delay={4} loading={isLoading} />
      </section>

      <Section title={t('analytics.returns.timeline')}>
        <Timeline filters={filters} />
      </Section>

      <Section title={t('analytics.returns.brandHeatmap')}>
        <BrandHeatmap filters={filters} />
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section title={t('analytics.returns.topClients')}>
          <ClientsTable filters={filters} />
        </Section>
        <Section title={t('analytics.returns.topRegions')}>
          <RegionsTable filters={filters} />
        </Section>
      </div>
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

function Timeline({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const q = useReturnsTimeline({ ...filters, granularity: 'month' })
  const ctx = useTheme()
  const palette = ctx.isDark ? ALMANAC_PALETTE.dark : ALMANAC_PALETTE.light
  if (q.isLoading && !q.data) return <div className="glass-card rounded-xl h-72 p-3"><div className="shimmer-skeleton h-full w-full rounded-md" /></div>
  const s = q.data?.series ?? []
  return (
    <div className="glass-card rounded-xl p-3 h-72">
      <PlotlyChart
        data={[
          {
            x: s.map((p) => p.date),
            y: s.map((p) => p.forward),
            type: 'bar',
            name: t('analytics.returns.forward'),
            marker: { color: palette[1] + '88' },
          },
          {
            x: s.map((p) => p.date),
            y: s.map((p) => p.returns),
            type: 'bar',
            name: t('analytics.returns.returns'),
            marker: { color: '#F87171' },
          },
        ]}
        layout={{ barmode: 'stack', showlegend: true }}
      />
    </div>
  )
}

function BrandHeatmap({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const q = useReturnsBrandHeatmap({ ...filters, months: 12 })
  if (q.isLoading && !q.data) return <div className="shimmer-skeleton h-72 w-full rounded-md" />
  const data = q.data
  if (!data || data.row_labels.length === 0) {
    return <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>{t('analytics.returns.noBrandData')}</p>
  }
  return (
    <MatrixTable
      rowLabels={data.row_labels}
      colLabels={data.col_labels}
      values={data.values_amount}
      format="currency"
      accentColor="#F87171"
      caption={t('analytics.returns.amountByBrandMonth')}
    />
  )
}

function ClientsTable({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [size] = useState(25)
  const [sort, setSort] = useState('returns:desc')
  const params = { ...filters, page, size, sort }
  const q = useReturnsClients(params)
  const columns: Column<ReturnsClientRow>[] = [
    { key: 'name', label: t('analytics.cols.client'), sortKey: 'name',
      render: (row) => <span style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}>{row.name}</span> },
    { key: 'returns', label: t('analytics.returns.amount'), sortKey: 'returns', align: 'right',
      render: (row) => <span className="text-[#F87171]" style={{ fontFamily: PLAYFAIR }}>{formatNumber(row.returns)}</span> },
    { key: 'lines', label: t('analytics.returns.lines'), align: 'right',
      render: (row) => formatNumber(row.return_lines) },
    { key: 'rate', label: t('analytics.returns.rate'), align: 'right',
      render: (row) => row.rate != null ? formatPercent(row.rate * 100, 2) : <span className="cell-empty">—</span> },
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
      exportHref={returnsExportHref('clients', params)}
    />
  )
}

function RegionsTable({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [size] = useState(25)
  const [sort, setSort] = useState('returns:desc')
  const params = { ...filters, page, size, sort }
  const q = useReturnsRegions(params)
  const columns: Column<ReturnsRegionRow & { person_id?: number }>[] = [
    { key: 'region', label: t('analytics.cols.region'), sortKey: 'region',
      render: (row) => <span style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}>{row.region}</span> },
    { key: 'returns', label: t('analytics.returns.amount'), sortKey: 'returns', align: 'right',
      render: (row) => <span className="text-[#F87171]" style={{ fontFamily: PLAYFAIR }}>{formatNumber(row.returns)}</span> },
    { key: 'lines', label: t('analytics.returns.lines'), align: 'right',
      render: (row) => formatNumber(row.return_lines) },
    { key: 'rate', label: t('analytics.returns.rate'), align: 'right',
      render: (row) => row.rate != null ? formatPercent(row.rate * 100, 2) : <span className="cell-empty">—</span> },
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
      exportHref={returnsExportHref('regions', params)}
    />
  )
}
