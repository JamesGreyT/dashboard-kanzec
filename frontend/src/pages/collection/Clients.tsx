import type { ReactNode } from 'react'
import type { Data } from 'plotly.js'
import type { TFunction } from 'i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ExternalLink,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react'

import {
  useClientIntelligenceDetail,
  useClientsIntelligenceList,
  useRooms,
  useSnapshotsDirections,
  type AttentionState,
  type ClientGroup,
  type ClientsIntelligenceRow,
  type DealStatus,
} from '@/api/hooks'
import PageHeader from '@/components/PageHeader'
import PlotlyChart, { ALMANAC_PALETTE } from '@/charts/PlotlyChart'
import { formatNumber, formatPercent, formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

const ROWS_PER_PAGE = [25, 50, 100, 200] as const
const CLIENT_GROUPS: ClientGroup[] = [
  'NORMAL',
  'PROBLEM_DEADLINE',
  'PROBLEM_MONTHLY',
  'PROBLEM_UNDEFINED',
  'CLOSED',
]
const ATTENTION_STATES: AttentionState[] = [
  'recover_now',
  'collect_fast',
  'promise_watch',
  'dormant',
  'monitor',
  'grow',
]
const DEAL_STATUSES: DealStatus[] = [
  'ON_TRACK',
  'OVERDUE',
  'DEFAULT',
  'BEHIND',
  'FULFILLED',
  'CLOSED',
  'UNKNOWN',
]
const DORMANT_BUCKETS = [30, 60, 90, 180] as const

function dealStatusVariant(status: DealStatus): string {
  switch (status) {
    case 'ON_TRACK':
      return 'monitor'
    case 'OVERDUE':
    case 'BEHIND':
      return 'urgent'
    case 'DEFAULT':
      return 'critical'
    case 'FULFILLED':
    case 'CLOSED':
      return 'markdown'
    case 'UNKNOWN':
    default:
      return 'plan'
  }
}

function attentionVariant(state: AttentionState): string {
  switch (state) {
    case 'recover_now':
      return 'critical'
    case 'collect_fast':
      return 'urgent'
    case 'promise_watch':
      return 'plan'
    case 'dormant':
      return 'markdown'
    case 'grow':
      return 'monitor'
    case 'monitor':
    default:
      return 'plan'
  }
}

function attentionReasonLabel(
  t: TFunction,
  reason: string,
  lastPurchaseDays: number | null,
): string {
  if (reason.startsWith('No purchase in ')) {
    return t('debt.clientsIntelligence.reasons.noPurchase', { days: lastPurchaseDays ?? 0 })
  }
  const map: Record<string, string> = {
    '90+ overdue debt': 'debt.clientsIntelligence.reasons.over90',
    'Deal in default': 'debt.clientsIntelligence.reasons.default',
    'Behind monthly plan': 'debt.clientsIntelligence.reasons.behindPlan',
    'Overdue debt': 'debt.clientsIntelligence.reasons.overdueDebt',
    'Promise overdue': 'debt.clientsIntelligence.reasons.promiseOverdue',
    'Healthy payer, high RFM': 'debt.clientsIntelligence.reasons.healthyRfm',
    'No recent payment': 'debt.clientsIntelligence.reasons.noRecentPayment',
    'Weak payments recently': 'debt.clientsIntelligence.reasons.weakPayments',
    'Monitor account': 'debt.clientsIntelligence.reasons.monitorAccount',
  }
  const key = map[reason]
  return key ? t(key) : reason
}

function formatMoney(value: number): string {
  return `${formatNumber(value)} USD`
}

function formatDays(value: number | null): string {
  return value == null ? '—' : `${formatNumber(value)}d`
}

function exactDateTitle(value: string | null | undefined, lang: string): string | undefined {
  return value ? formatShortDate(value, lang) : undefined
}

export default function Clients() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 50), 1), 500)
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0)
  const search = searchParams.get('q') ?? ''
  const roomId = searchParams.get('room') ?? ''
  const direction = searchParams.get('direction') ?? ''
  const region = searchParams.get('region') ?? ''
  const view = (searchParams.get('view') as 'all' | 'problem' | 'normal' | 'closed' | null) ?? 'all'
  const attention = (searchParams.get('attention') as AttentionState | null) ?? ''
  const dealStatus = (searchParams.get('status') as DealStatus | null) ?? ''
  const clientGroup = (searchParams.get('group') as ClientGroup | null) ?? ''
  const rfmSegment = searchParams.get('rfm') ?? ''
  const dormantBucket = Number(searchParams.get('dormant') ?? 0) || undefined
  const clientParam = searchParams.get('client')
  const selectedClientId = clientParam && /^\d+$/.test(clientParam) ? Number(clientParam) : null

  const setParam = (mutate: (next: URLSearchParams) => void) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      mutate(next)
      return next
    })

  const setSimple = (key: string, value: string) =>
    setParam((p) => {
      if (value) p.set(key, value)
      else p.delete(key)
      p.set('offset', '0')
    })

  const setNumeric = (key: string, value: number | undefined) =>
    setParam((p) => {
      if (value != null) p.set(key, String(value))
      else p.delete(key)
      p.set('offset', '0')
    })

  const setOffset = (nextOffset: number) =>
    setParam((p) => {
      p.set('offset', String(Math.max(nextOffset, 0)))
    })

  const setLimit = (nextLimit: number) =>
    setParam((p) => {
      p.set('limit', String(nextLimit))
      p.set('offset', '0')
    })

  const openClient = (personId: number) =>
    setParam((p) => {
      p.set('client', String(personId))
    })

  const closeClient = () =>
    setParam((p) => {
      p.delete('client')
    })

  const clearFilters = () =>
    setParam((p) => {
      for (const key of ['q', 'room', 'direction', 'region', 'view', 'attention', 'status', 'group', 'rfm', 'dormant']) {
        p.delete(key)
      }
      p.set('offset', '0')
    })

  const listQ = useClientsIntelligenceList({
    limit,
    offset,
    search,
    room_id: roomId,
    direction,
    region,
    view,
    attention,
    deal_status: dealStatus,
    client_group: clientGroup,
    rfm_segment: rfmSegment,
    last_purchase_bucket: dormantBucket,
  })
  const detailQ = useClientIntelligenceDetail(selectedClientId)
  const roomsQ = useRooms()
  const directionsQ = useSnapshotsDirections()

  const rows = listQ.data?.rows ?? []
  const summary = listQ.data?.summary
  const total = listQ.data?.total ?? 0
  const showingFrom = total === 0 ? 0 : offset + 1
  const showingTo = Math.min(offset + limit, total)
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.floor(offset / limit) + 1
  const activeFiltersCount =
    [search, roomId, direction, region, view !== 'all' ? view : '', attention, dealStatus, clientGroup, rfmSegment, dormantBucket ? String(dormantBucket) : ''].filter(Boolean).length
  const rfmSegments = Array.from(
    new Set((listQ.data?.rows ?? []).map((row) => row.rfm_segment).filter((value): value is string => !!value)),
  ).sort((a, b) => a.localeCompare(b))

  const analystLine = summary
    ? t('debt.clientsIntelligence.analystLine', {
        recover: summary.attention_recovery,
        dormant: summary.attention_dormant,
        grow: summary.attention_growth,
      })
    : t('common.loading')

  return (
    <div>
      <PageHeader />

      <header className="mb-6 animate-fade-up">
        <span className="section-title">{t('debt.section')}</span>
        <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <h1
              className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight"
              style={{ fontFamily: PLAYFAIR }}
            >
              {t('debt.clientsIntelligence.title')}
            </h1>
            <p className="mt-2 text-xs italic text-muted-foreground" style={{ fontFamily: DM_SANS }}>
              {t('debt.clientsIntelligence.subtitle')}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
              {t('debt.clientsIntelligence.analystView')}
            </p>
            <p className="mt-1 text-sm text-foreground" style={{ fontFamily: DM_SANS }}>
              {analystLine}
            </p>
          </div>
        </div>
      </header>

      <section className="animate-fade-up animate-fade-up-delay-1 overflow-hidden rounded-2xl border border-border/70 bg-border/60">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-border/70">
          <SummaryCell
            label={t('debt.clientsIntelligence.summary.recoverNow')}
            value={formatNumber(summary?.attention_recovery ?? 0)}
            tone="critical"
          />
          <SummaryCell
            label={t('debt.clientsIntelligence.summary.dormant')}
            value={formatNumber(summary?.attention_dormant ?? 0)}
            tone="markdown"
          />
          <SummaryCell
            label={t('debt.clientsIntelligence.summary.grow')}
            value={formatNumber(summary?.attention_growth ?? 0)}
            tone="monitor"
          />
          <SummaryCell
            label={t('debt.clientsIntelligence.summary.sales90d')}
            value={formatMoney(summary?.sales_90d_total ?? 0)}
            tone="default"
          />
          <SummaryCell
            label={t('debt.clientsIntelligence.summary.payments90d')}
            value={formatMoney(summary?.payments_90d_total ?? 0)}
            tone="plan"
          />
          <SummaryCell
            label={t('debt.clientsIntelligence.summary.overdueDebt')}
            value={formatMoney(summary?.overdue_debt_total ?? 0)}
            tone="urgent"
          />
        </div>
      </section>

      <section className="mt-5 animate-fade-up animate-fade-up-delay-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', 'problem', 'normal', 'closed'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSimple('view', value === 'all' ? '' : value)}
              className={cn('month-btn normal-case', view === value && 'active')}
            >
              {t(`debt.clientsIntelligence.views.${value}`)}
            </button>
          ))}
        </div>
      </section>

      <section
        className="mt-4 flex flex-wrap items-center gap-2 animate-fade-up animate-fade-up-delay-3"
        style={{ fontFamily: DM_SANS }}
      >
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 mr-1" style={{ fontFamily: PLEX_MONO }}>
          {t('data.filters.label')}
        </span>

        <SearchField
          value={search}
          placeholder={t('debt.clientsIntelligence.filters.search')}
          onChange={(value) => setSimple('q', value)}
        />
        <SelectPill
          label={t('debt.filters.manager')}
          value={roomId}
          onChange={(value) => setSimple('room', value)}
          options={(roomsQ.data ?? []).map((room) => ({ value: room.room_id, label: room.room_name }))}
        />
        <SelectPill
          label={t('debt.filters.direction')}
          value={direction}
          onChange={(value) => setSimple('direction', value)}
          options={(directionsQ.data ?? []).map((item) => ({ value: item, label: item }))}
        />
        <TextPill
          label={t('debt.clientsIntelligence.filters.region')}
          value={region}
          onChange={(value) => setSimple('region', value)}
        />
        <SelectPill
          label={t('debt.clientsIntelligence.filters.attention')}
          value={attention}
          onChange={(value) => setSimple('attention', value)}
          options={ATTENTION_STATES.map((state) => ({
            value: state,
            label: t(`debt.clientsIntelligence.attention.${state}`),
          }))}
        />
        <SelectPill
          label={t('debt.clientsIntelligence.filters.dealStatus')}
          value={dealStatus}
          onChange={(value) => setSimple('status', value)}
          options={DEAL_STATUSES.map((status) => ({
            value: status,
            label: t(`debt.dealStatus.${status}`),
          }))}
        />
        <SelectPill
          label={t('debt.clientsIntelligence.filters.group')}
          value={clientGroup}
          onChange={(value) => setSimple('group', value)}
          options={CLIENT_GROUPS.map((group) => ({
            value: group,
            label: t(`debt.clientGroups.${group}`),
          }))}
        />
        <SelectPill
          label={t('debt.clientsIntelligence.filters.rfm')}
          value={rfmSegment}
          onChange={(value) => setSimple('rfm', value)}
          options={rfmSegments.map((segment) => ({ value: segment, label: segment }))}
        />
        <SelectPill
          label={t('debt.clientsIntelligence.filters.dormant')}
          value={dormantBucket ? String(dormantBucket) : ''}
          onChange={(value) => setNumeric('dormant', value ? Number(value) : undefined)}
          options={DORMANT_BUCKETS.map((days) => ({
            value: String(days),
            label: t('debt.clientsIntelligence.filters.daysDormant', { days }),
          }))}
        />

        {activeFiltersCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#9E7B2F] transition-colors"
          >
            {t('data.clearAll')} ({activeFiltersCount})
          </button>
        )}
      </section>

      <section className="mt-5 animate-fade-up animate-fade-up-delay-4">
        <div className="rounded-2xl border border-border/70 bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                {t('debt.clientsIntelligence.tableTitle')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground" style={{ fontFamily: DM_SANS }}>
                {t('debt.clientsIntelligence.tableCaption', {
                  from: showingFrom,
                  to: showingTo,
                  total,
                })}
              </p>
            </div>
            <div className="hidden md:flex items-baseline gap-2 text-xs text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
              <span>{t('debt.clientsIntelligence.sortLabel')}</span>
              <span className="text-foreground">{t('debt.clientsIntelligence.sortValue')}</span>
            </div>
          </div>

          {listQ.isError ? (
            <InlineState
              icon={<TriangleAlert size={16} />}
              title={t('debt.clientsIntelligence.error.title')}
              description={t('debt.clientsIntelligence.error.description')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="premium-table min-w-[1280px] w-full text-sm" style={{ fontFamily: DM_SANS }}>
                <thead>
                  <tr>
                    <Th label={t('debt.clientsIntelligence.cols.client')} sticky />
                    <Th label={t('debt.clientsIntelligence.cols.attention')} />
                    <Th label={t('debt.clientsIntelligence.cols.dealStatus')} />
                    <Th label={t('debt.clientsIntelligence.cols.rfm')} />
                    <Th label={t('debt.clientsIntelligence.cols.lastPurchase')} align="right" />
                    <Th label={t('debt.clientsIntelligence.cols.lastPayment')} align="right" />
                    <Th label={t('debt.clientsIntelligence.cols.sales90d')} align="right" />
                    <Th label={t('debt.clientsIntelligence.cols.payments90d')} align="right" />
                    <Th label={t('debt.clientsIntelligence.cols.currentDebt')} align="right" />
                    <Th label={t('debt.clientsIntelligence.cols.debt90Plus')} align="right" />
                    <Th label={t('debt.cols.manager')} />
                    <Th label={t('debt.cols.region')} />
                  </tr>
                </thead>
                <tbody>
                  {listQ.isLoading && !listQ.data
                    ? Array.from({ length: 8 }).map((_, index) => (
                        <tr key={index}>
                          {Array.from({ length: 12 }).map((__, cellIndex) => (
                            <td key={cellIndex} className="px-3 py-3 border-b border-border/40">
                              <div className="shimmer-skeleton h-3 w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : rows.map((row) => (
                        <ClientRow
                          key={row.person_id}
                          row={row}
                          lang={i18n.language}
                          onOpen={openClient}
                          t={t}
                        />
                      ))}
                </tbody>
              </table>
            </div>
          )}

          {!listQ.isLoading && !listQ.isError && total === 0 && (
            <InlineState
              title={t('debt.clientsIntelligence.empty.title')}
              description={
                activeFiltersCount > 0
                  ? t('debt.clientsIntelligence.empty.filtered')
                  : t('debt.clientsIntelligence.empty.description')
              }
            />
          )}
        </div>
      </section>

      {total > 0 && (
        <footer
          className="mt-5 border-t border-border/60 pt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up animate-fade-up-delay-5"
          style={{ fontFamily: DM_SANS }}
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-medium text-foreground tabular-nums" style={{ fontFamily: PLAYFAIR }}>
              {formatNumber(currentPage)}
              <span className="text-muted-foreground"> {t('data.of')} </span>
              {formatNumber(totalPages)}
            </span>
            <span className="text-muted-foreground italic">
              · {t('data.showing')} {showingFrom.toLocaleString()}–{showingTo.toLocaleString()} {t('data.of')}{' '}
              {total.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {t('data.rowsPerFolio')}
              </span>
              {ROWS_PER_PAGE.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLimit(value)}
                  className={cn('month-btn', limit === value && 'active')}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(offset - limit)}
                className="px-3 py-1.5 text-xs hover:bg-accent/60 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ‹ {t('data.prev')}
              </button>
              <button
                type="button"
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-3 py-1.5 text-xs hover:bg-accent/60 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                {t('data.next')} ›
              </button>
            </div>
          </div>
        </footer>
      )}

      {selectedClientId !== null && (
        <ClientDecisionModal
          personId={selectedClientId}
          query={detailQ}
          lang={i18n.language}
          onClose={closeClient}
        />
      )}
    </div>
  )
}

function ClientRow({
  row,
  lang,
  onOpen,
  t,
}: {
  row: ClientsIntelligenceRow
  lang: string
  onOpen: (personId: number) => void
  t: TFunction
}) {
  return (
    <tr className="cursor-pointer transition-colors" onClick={() => onOpen(row.person_id)}>
      <td className="px-3 py-3 border-b border-border/40 sticky left-0 bg-card z-10 min-w-[220px]">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpen(row.person_id)
          }}
          className="text-left hover:text-[#9E7B2F] transition-colors"
        >
          <p className="font-semibold tracking-tight" style={{ fontFamily: PLAYFAIR }}>
            {row.client_name ?? '—'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {row.tin ?? '—'}
          </p>
        </button>
      </td>
      <td className="px-3 py-3 border-b border-border/40 min-w-[220px]">
        <div className="flex flex-col gap-1">
          <span className={`action-badge ${attentionVariant(row.attention_state)}`}>
            {t(`debt.clientsIntelligence.attention.${row.attention_state}`)}
          </span>
          <p className="text-xs text-foreground/80">
            {attentionReasonLabel(t, row.attention_reason, row.last_purchase_days)}
          </p>
          <p className="text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {row.has_overdue_promise
              ? t('debt.clientsIntelligence.micro.promiseOverdue')
              : row.last_payment_days == null
                ? t('debt.clientsIntelligence.micro.noPayment')
                : t('debt.clientsIntelligence.micro.lastPayment', { days: row.last_payment_days })}
          </p>
        </div>
      </td>
      <td className="px-3 py-3 border-b border-border/40 whitespace-nowrap">
        <span className={`action-badge ${dealStatusVariant(row.deal_status)}`}>
          {t(`debt.dealStatus.${row.deal_status}`)}
        </span>
      </td>
      <td className="px-3 py-3 border-b border-border/40 min-w-[160px]">
        <p className="font-medium">{row.rfm_segment ?? '—'}</p>
        <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
          {row.rfm_score ? `Score ${row.rfm_score}` : t('debt.clientsIntelligence.noRfm')}
        </p>
      </td>
      <DaysCell value={row.last_purchase_days} title={exactDateTitle(row.last_purchase_date, lang)} />
      <DaysCell value={row.last_payment_days} title={exactDateTitle(row.last_payment_date, lang)} />
      <MoneyCell value={row.sales_90d} />
      <MoneyCell value={row.payments_90d} accent={row.payments_90d < row.sales_90d ? 'soft' : undefined} />
      <MoneyCell value={row.current_debt} accent={row.current_debt > 0 ? 'strong' : undefined} />
      <MoneyCell value={row.bucket_90_plus} accent={row.bucket_90_plus > 0 ? 'critical' : undefined} />
      <TextCell value={row.manager} />
      <TextCell value={row.region_name} />
    </tr>
  )
}

function ClientDecisionModal({
  personId,
  query,
  lang,
  onClose,
}: {
  personId: number
  query: ReturnType<typeof useClientIntelligenceDetail>
  lang: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const detail = query.data

  let behaviorChart: Data[] = []
  if (detail) {
    behaviorChart = [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: t('debt.clientsIntelligence.chart.sales'),
        x: detail.signals_90d.sales_weekly_12w.map((point) => point.week),
        y: detail.signals_90d.sales_weekly_12w.map((point) => point.amount),
        line: { color: ALMANAC_PALETTE.light[0], width: 2.25, shape: 'spline' },
        marker: { size: 6, color: ALMANAC_PALETTE.light[0] },
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: t('debt.clientsIntelligence.chart.payments'),
        x: detail.signals_90d.payments_weekly_12w.map((point) => point.week),
        y: detail.signals_90d.payments_weekly_12w.map((point) => point.amount),
        line: { color: ALMANAC_PALETTE.light[1], width: 2.25, shape: 'spline' },
        marker: { size: 6, color: ALMANAC_PALETTE.light[1] },
      },
    ]
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px]" onClick={onClose}>
      <div className="flex h-full justify-end">
        <div
          className="h-full w-full lg:w-[min(1080px,92vw)] bg-background border-l border-border shadow-2xl overflow-y-auto"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                  {t('debt.clientsIntelligence.modal.label')}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight" style={{ fontFamily: PLAYFAIR }}>
                  {detail?.client.client_name ?? t('debt.clientsIntelligence.modal.loadingTitle')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground" style={{ fontFamily: DM_SANS }}>
                  ID {personId}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="px-4 py-5 sm:px-6 sm:py-6">
            {query.isLoading && !detail ? (
              <ModalSkeleton />
            ) : query.isError || !detail ? (
              <InlineState
                icon={<TriangleAlert size={16} />}
                title={t('debt.clientsIntelligence.modal.errorTitle')}
                description={t('debt.clientsIntelligence.modal.errorDescription')}
              />
            ) : (
              <div className="space-y-6">
                <section className="rounded-2xl border border-border/70 bg-card p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`action-badge ${attentionVariant(detail.client.attention_state)}`}>
                          {t(`debt.clientsIntelligence.attention.${detail.client.attention_state}`)}
                        </span>
                        <span className={`action-badge ${dealStatusVariant(detail.client.deal_status)}`}>
                          {t(`debt.dealStatus.${detail.client.deal_status}`)}
                        </span>
                        {detail.client.client_group && (
                          <span className="action-badge plan">
                            {t(`debt.clientGroups.${detail.client.client_group}`)}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-4 text-2xl font-semibold tracking-tight" style={{ fontFamily: PLAYFAIR }}>
                        {detail.client.client_name}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground" style={{ fontFamily: DM_SANS }}>
                        {attentionReasonLabel(t, detail.client.attention_reason, detail.signals_90d.last_purchase_days)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm xl:min-w-[320px]">
                      <IdentityStat label={t('debt.client.tin')} value={detail.client.tin} />
                      <IdentityStat label={t('debt.cols.manager')} value={detail.client.manager} />
                      <IdentityStat label={t('debt.cols.region')} value={detail.client.region_name} />
                      <IdentityStat label={t('debt.filters.direction')} value={detail.client.direction} />
                      <IdentityStat label={t('debt.clientsIntelligence.cols.rfm')} value={detail.client.rfm_segment ?? '—'} />
                      <IdentityStat label={t('debt.clientsIntelligence.modal.rfmScore')} value={detail.client.rfm_score ?? '—'} mono />
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr]">
                  <Panel title={t('debt.clientsIntelligence.modal.decisionSnapshot')}>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                      <MiniMetric label={t('debt.clientsIntelligence.cols.sales90d')} value={formatMoney(detail.signals_90d.sales_90d)} />
                      <MiniMetric label={t('debt.clientsIntelligence.cols.payments90d')} value={formatMoney(detail.signals_90d.payments_90d)} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.collectionRatio')} value={detail.signals_90d.collection_ratio_90d == null ? '—' : formatPercent(detail.signals_90d.collection_ratio_90d)} />
                      <MiniMetric label={t('debt.clientsIntelligence.cols.lastPurchase')} value={formatDays(detail.signals_90d.last_purchase_days)} caption={formatShortDate(detail.signals_90d.last_purchase_date, lang)} />
                      <MiniMetric label={t('debt.clientsIntelligence.cols.lastPayment')} value={formatDays(detail.signals_90d.last_payment_days)} caption={formatShortDate(detail.signals_90d.last_payment_date, lang)} />
                    </div>
                  </Panel>

                  <Panel title={t('debt.clientsIntelligence.modal.contactSignal')}>
                    <div className="space-y-3 text-sm" style={{ fontFamily: DM_SANS }}>
                      <SignalRow
                        label={t('debt.client.outcome')}
                        value={detail.contact_summary.last_outcome ?? '—'}
                      />
                      <SignalRow
                        label={t('debt.cols.lastContact')}
                        value={detail.contact_summary.last_contact_at ? formatShortDate(detail.contact_summary.last_contact_at, lang) : '—'}
                      />
                      <SignalRow
                        label={t('debt.clientsIntelligence.modal.promiseStatus')}
                        value={detail.contact_summary.has_overdue_promise ? t('debt.clientsIntelligence.micro.promiseOverdue') : t('debt.clientsIntelligence.modal.promiseClear')}
                        tone={detail.contact_summary.has_overdue_promise ? 'critical' : 'default'}
                      />
                      <SignalRow
                        label={t('debt.client.promisedAmount')}
                        value={detail.contact_summary.last_promised_amount != null ? formatMoney(detail.contact_summary.last_promised_amount) : '—'}
                      />
                      <SignalRow
                        label={t('debt.client.promisedBy')}
                        value={detail.contact_summary.last_promised_by_date ? formatShortDate(detail.contact_summary.last_promised_by_date, lang) : '—'}
                      />
                    </div>
                  </Panel>
                </section>

                <Panel title={t('debt.clientsIntelligence.modal.behavior90d')}>
                  <div className="h-[320px]">
                    <PlotlyChart
                      data={behaviorChart}
                      layout={{
                        margin: { t: 18, r: 12, b: 36, l: 56 },
                        xaxis: { tickformat: '%d %b' },
                        yaxis: { title: { text: 'USD' } },
                        legend: { orientation: 'h', x: 0, y: 1.14 },
                      }}
                    />
                  </div>
                </Panel>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1fr]">
                  <Panel title={t('debt.clientsIntelligence.modal.dealAndDebt')}>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <MiniMetric label={t('debt.clientsIntelligence.cols.currentDebt')} value={formatMoney(detail.debt_all_time.current_debt)} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.overdueDebt')} value={formatMoney(detail.debt_all_time.overdue_debt)} />
                      <MiniMetric label={t('debt.clientsIntelligence.cols.debt90Plus')} value={formatMoney(detail.debt_all_time.bucket_90_plus)} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.dealMonthly')} value={detail.deal_profile.deal_monthly_amount != null ? formatMoney(detail.deal_profile.deal_monthly_amount) : '—'} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <MiniMetric label={t('debt.cols.bucket1')} value={formatMoney(detail.debt_all_time.bucket_1_30)} />
                      <MiniMetric label={t('debt.cols.bucket2')} value={formatMoney(detail.debt_all_time.bucket_31_60)} />
                      <MiniMetric label={t('debt.cols.bucket3')} value={formatMoney(detail.debt_all_time.bucket_61_90)} />
                      <MiniMetric label={t('debt.cols.bucket4')} value={formatMoney(detail.debt_all_time.bucket_90_plus)} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <MiniMetric label={t('debt.clientsIntelligence.modal.instalmentDays')} value={detail.deal_profile.instalment_days != null ? `${detail.deal_profile.instalment_days}` : '—'} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.dealStart')} value={detail.deal_profile.deal_deadline_start ? formatShortDate(detail.deal_profile.deal_deadline_start, lang) : '—'} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.grossInvoiced')} value={formatMoney(detail.debt_all_time.gross_invoiced)} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.grossPaid')} value={formatMoney(detail.debt_all_time.gross_paid)} />
                    </div>
                  </Panel>

                  <Panel title={t('debt.clientsIntelligence.modal.lifetime')}>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                      <MiniMetric label={t('debt.clientsIntelligence.modal.lifetimeSales')} value={formatMoney(detail.lifetime.lifetime_sales)} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.lifetimePayments')} value={formatMoney(detail.lifetime.lifetime_payments)} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.lifetimeOrders')} value={formatNumber(detail.lifetime.lifetime_orders)} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.firstOrder')} value={detail.lifetime.first_order_date ? formatShortDate(detail.lifetime.first_order_date, lang) : '—'} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.lastOrder')} value={detail.lifetime.last_order_date ? formatShortDate(detail.lifetime.last_order_date, lang) : '—'} />
                      <MiniMetric label={t('debt.clientsIntelligence.modal.lastPayment')} value={detail.lifetime.last_payment_date ? formatShortDate(detail.lifetime.last_payment_date, lang) : '—'} />
                    </div>
                  </Panel>
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <RecentList
                    title={t('debt.clientsIntelligence.modal.recentOrders')}
                    empty={t('debt.client.noOrders')}
                    rows={detail.recent_orders.map((order) => ({
                      primary: order.product_name,
                      secondary: [order.sales_manager, order.room_name].filter(Boolean).join(' · ') || '—',
                      meta: formatShortDate(order.delivery_date, lang),
                      value: `${formatMoney(order.product_amount)} · ${formatNumber(order.sold_quant)}`,
                    }))}
                  />
                  <RecentList
                    title={t('debt.clientsIntelligence.modal.recentPayments')}
                    empty={t('debt.client.noPayments')}
                    rows={detail.recent_payments.map((payment) => ({
                      primary: payment.payer || payment.payment_method || '—',
                      secondary: payment.payment_method || '—',
                      meta: formatShortDate(payment.payment_date, lang),
                      value: formatMoney(payment.amount),
                    }))}
                  />
                </section>

                <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                      {t('debt.clientsIntelligence.modal.nextStep')}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground" style={{ fontFamily: DM_SANS }}>
                      {t('debt.clientsIntelligence.modal.nextStepCaption')}
                    </p>
                  </div>
                  <Link
                    to={`/collection/debt/client/${personId}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D4A843] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#C49833]"
                    style={{ fontFamily: DM_SANS }}
                  >
                    {t('debt.clientsIntelligence.modal.openDossier')}
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SearchField({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <Search
        size={12}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
        aria-hidden
      />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          'rounded-md border border-transparent text-[11px] font-medium',
          'bg-[#EDE7DC] text-[#2C2418] placeholder:text-muted-foreground/50 placeholder:italic',
          'focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#D4A843]/15',
          'dark:bg-[#1A1A28] dark:text-foreground dark:placeholder:text-muted-foreground/40',
        )}
        style={{ minWidth: '240px', padding: '4px 12px 4px 32px' }}
      />
    </div>
  )
}

function TextPill({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={label}
      className={cn(
        'month-btn normal-case min-w-[120px] bg-[#EDE7DC] text-[#2C2418] placeholder:text-muted-foreground/50',
        value && 'active',
        'dark:bg-[#14141E] dark:text-foreground',
      )}
      style={{ paddingInline: 10 }}
    />
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
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'month-btn appearance-none pr-6 cursor-pointer normal-case font-medium',
          value && 'active',
        )}
        style={{ minWidth: '120px' }}
        aria-label={label}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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
      {value && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onChange('')
          }}
          className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-red-500 hover:border-red-500/40 transition-colors"
          aria-label="clear"
        >
          <X size={9} />
        </button>
      )}
    </div>
  )
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'default' | 'critical' | 'urgent' | 'monitor' | 'plan' | 'markdown'
}) {
  const colors: Record<typeof tone, string> = {
    default: '#D4A843',
    critical: '#F87171',
    urgent: '#FB923C',
    monitor: '#34D399',
    plan: '#60A5FA',
    markdown: '#FBBF24',
  }
  return (
    <div className="relative bg-card px-4 py-4">
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-0.5 opacity-70"
        style={{ backgroundColor: colors[tone] }}
      />
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight" style={{ fontFamily: PLAYFAIR }}>
        {value}
      </p>
    </div>
  )
}

function Th({
  label,
  align = 'left',
  sticky,
}: {
  label: string
  align?: 'left' | 'right'
  sticky?: boolean
}) {
  return (
    <th
      className={cn(
        'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-b border-border whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
        sticky && 'sticky left-0 bg-card z-20',
      )}
    >
      {label}
    </th>
  )
}

function DaysCell({ value, title }: { value: number | null; title?: string }) {
  return (
    <td
      className={cn(
        'px-3 py-3 border-b border-border/40 text-right tabular-nums whitespace-nowrap',
        value == null && 'text-muted-foreground/50',
      )}
      style={{ fontFamily: PLEX_MONO }}
      title={title}
    >
      {formatDays(value)}
    </td>
  )
}

function MoneyCell({
  value,
  accent,
}: {
  value: number
  accent?: 'soft' | 'strong' | 'critical'
}) {
  return (
    <td
      className={cn(
        'px-3 py-3 border-b border-border/40 text-right tabular-nums whitespace-nowrap',
        accent === 'soft' && 'text-[#B8742B]',
        accent === 'strong' && 'text-foreground font-semibold',
        accent === 'critical' && 'text-[#F87171] font-semibold',
      )}
      style={{ fontFamily: PLAYFAIR }}
    >
      {formatNumber(value)}
    </td>
  )
}

function TextCell({ value }: { value: string | null }) {
  return (
    <td className="px-3 py-3 border-b border-border/40 text-muted-foreground whitespace-nowrap">
      {value ?? '—'}
    </td>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
        {title}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function MiniMetric({
  label,
  value,
  caption,
}: {
  label: string
  value: string
  caption?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
        {label}
      </p>
      <p className="mt-2 text-base font-semibold tracking-tight" style={{ fontFamily: PLAYFAIR }}>
        {value}
      </p>
      {caption && (
        <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: DM_SANS }}>
          {caption}
        </p>
      )}
    </div>
  )
}

function IdentityStat({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-foreground" style={{ fontFamily: mono ? PLEX_MONO : DM_SANS }}>
        {value ?? '—'}
      </p>
    </div>
  )
}

function SignalRow({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'critical'
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-right font-medium', tone === 'critical' && 'text-[#F87171]')}>{value}</span>
    </div>
  )
}

function RecentList({
  title,
  empty,
  rows,
}: {
  title: string
  empty: string
  rows: { primary: string; secondary: string; meta: string; value: string }[]
}) {
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
          {empty}
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {rows.map((row, index) => (
            <div key={`${row.primary}-${row.meta}-${index}`} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{row.primary}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{row.secondary}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-foreground" style={{ fontFamily: PLAYFAIR }}>
                  {row.value}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                  {row.meta}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function InlineState({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500">
          {icon}
        </div>
      )}
      <p className="text-lg italic text-foreground" style={{ fontFamily: PLAYFAIR }}>
        {title}
      </p>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground" style={{ fontFamily: DM_SANS }}>
        {description}
      </p>
    </div>
  )
}

function ModalSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="shimmer-skeleton h-4 w-40" />
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((__, cellIndex) => (
              <div key={cellIndex} className="shimmer-skeleton h-20 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
