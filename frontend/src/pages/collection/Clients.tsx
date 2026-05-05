import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Data } from 'plotly.js'
import type { TFunction } from 'i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  ExternalLink,
  Filter,
  Minus,
  Search,
  SlidersHorizontal,
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

type SortKey =
  | 'expected_recovery'
  | 'pay_probability'
  | 'exposure_ratio'
  | 'bucket_90_plus'
  | 'sales_90d'
  | 'current_debt'
  | 'last_purchase_days'
type SortDir = 'asc' | 'desc'
type Density = 'compact' | 'comfortable'
const DENSITY_KEY = 'kanzec.clients.density'

const HIGH_RFM_SCORES = new Set([
  '555',
  '554',
  '545',
  '544',
  '455',
  '454',
  '445',
])

function isHighRfm(score: string | null | undefined): boolean {
  if (!score) return false
  return HIGH_RFM_SCORES.has(String(score))
}

function payProbColor(p: number): string {
  if (p >= 0.7) return '#1E8A5E' // emerald-700
  if (p >= 0.4) return '#B8742B' // amber/gold
  return '#C95656'
}

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
  const promiseOverdueOnly = searchParams.get('promise') === '1'
  const aging60Plus = searchParams.get('aging60') === '1'
  const sortRaw = searchParams.get('sort') ?? ''
  const sortPieces = sortRaw.split(':')
  const sortKey = (sortPieces[0] || '') as SortKey | ''
  const sortDir: SortDir = sortPieces[1] === 'asc' ? 'asc' : 'desc'
  const clientParam = searchParams.get('client')
  const selectedClientId = clientParam && /^\d+$/.test(clientParam) ? Number(clientParam) : null

  const [density, setDensity] = useState<Density>(() => {
    if (typeof window === 'undefined') return 'compact'
    return (window.localStorage.getItem(DENSITY_KEY) as Density | null) ?? 'compact'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DENSITY_KEY, density)
  }, [density])

  const [slicersOpen, setSlicersOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

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

  const toggleBool = (key: string) =>
    setParam((p) => {
      if (p.get(key) === '1') p.delete(key)
      else p.set(key, '1')
      p.set('offset', '0')
    })

  const setMulti = (entries: Record<string, string>) =>
    setParam((p) => {
      for (const [k, v] of Object.entries(entries)) {
        if (v) p.set(k, v)
        else p.delete(k)
      }
      p.set('offset', '0')
    })

  // Click cycle: desc → asc → off (default sort restored).
  const cycleSort = (key: SortKey) =>
    setParam((p) => {
      const current = p.get('sort') ?? ''
      if (current === `${key}:desc`) p.set('sort', `${key}:asc`)
      else if (current === `${key}:asc`) p.delete('sort')
      else p.set('sort', `${key}:desc`)
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
      for (const key of ['q', 'room', 'direction', 'region', 'view', 'attention', 'status', 'group', 'rfm', 'dormant', 'promise', 'aging60', 'sort']) {
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
    sort: sortRaw || undefined,
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

  const triageFilters = [
    search,
    attention,
    dealStatus,
    promiseOverdueOnly ? '1' : '',
    aging60Plus ? '1' : '',
  ].filter(Boolean).length
  const slicerFilters = [
    roomId,
    direction,
    region,
    clientGroup,
    rfmSegment,
    dormantBucket ? String(dormantBucket) : '',
  ].filter(Boolean).length
  const activeFiltersCount = triageFilters + slicerFilters + (view !== 'all' ? 1 : 0)
  const rfmSegments = Array.from(
    new Set((listQ.data?.rows ?? []).map((row) => row.rfm_segment).filter((value): value is string => !!value)),
  ).sort((a, b) => a.localeCompare(b))

  // Per-page manager portfolio approximation: count + past-due rate.
  // Backend-global stats deferred to a follow-up endpoint.
  const managerStats: Record<string, { count: number; pastDue: number }> = {}
  for (const row of rows) {
    if (!row.manager) continue
    const m = (managerStats[row.manager] ??= { count: 0, pastDue: 0 })
    m.count += 1
    if (row.attention_state === 'recover_now' || row.attention_state === 'collect_fast') m.pastDue += 1
  }

  const summaryActionNeeded =
    summary?.action_needed_count ??
    rows.filter((r) => r.attention_state === 'recover_now' || r.attention_state === 'collect_fast').length
  const summaryLeakage =
    summary?.leakage_count ??
    rows.filter((r) => isHighRfm(r.rfm_score) && (r.last_purchase_days ?? 0) >= 60).length

  return (
    <div>
      <PageHeader />

      <header className="mb-5 animate-fade-up">
        <span className="section-title">{t('debt.section')}</span>
        <div className="mt-3 max-w-4xl">
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
      </header>

      {/* Phase 3.1 — KPI strip cut to 4 clickable cells.
          Color reduced to two accents (red action / gold default). */}
      <section className="animate-fade-up animate-fade-up-delay-1 overflow-hidden rounded-2xl border border-border/70 bg-border/60">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/70">
          <KpiCell
            label={t('debt.clientsIntelligence.summary.actionNeeded')}
            hint={t('debt.clientsIntelligence.kpi.actionNeededHint')}
            value={formatNumber(summaryActionNeeded)}
            tone="critical"
            onClick={() =>
              setMulti({ attention: 'recover_now', view: '', promise: '', aging60: '' })
            }
            active={attention === 'recover_now' || attention === 'collect_fast'}
          />
          <KpiCell
            label={t('debt.clientsIntelligence.summary.expectedRecovery')}
            value={formatMoney(summary?.expected_recovery_total ?? 0)}
            tone="default"
          />
          <KpiCell
            label={t('debt.clientsIntelligence.summary.leakage')}
            hint={t('debt.clientsIntelligence.summary.leakageHint')}
            value={formatNumber(summaryLeakage)}
            tone="urgent"
            onClick={() =>
              setMulti({ attention: 'dormant', view: '', promise: '', aging60: '' })
            }
            active={attention === 'dormant'}
          />
          <KpiCell
            label={t('debt.clientsIntelligence.summary.overdueDebt')}
            value={formatMoney(summary?.overdue_debt_total ?? 0)}
            tone="markdown"
            onClick={() => setMulti({ aging60: '1', view: '', promise: '' })}
            active={aging60Plus}
          />
        </div>
      </section>

      {/* Phase 3.2 — Three-tier filter row.
          Top: View segmented control (top-level mode).
          Middle: Triage row (high-signal pills).
          Bottom: Slicers popover for secondary cuts. */}
      <section className="mt-5 animate-fade-up animate-fade-up-delay-2 hidden lg:block">
        <div className="rounded-2xl border border-border/70 bg-card/70 p-3 space-y-3">
          {/* View tier */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground" style={{ fontFamily: PLEX_MONO, minWidth: 80 }}>
              {t('debt.clientsIntelligence.filters.tier.view')}
            </span>
            <div className="inline-flex rounded-full border border-border bg-background/60 p-0.5" role="tablist">
              {(['all', 'problem', 'normal', 'closed'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={view === value}
                  onClick={() => setSimple('view', value === 'all' ? '' : value)}
                  className={cn(
                    'px-3.5 py-1.5 text-xs font-medium rounded-full transition-all',
                    view === value
                      ? 'bg-[#D4A843] text-[#2C2418] shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                  )}
                  style={{ fontFamily: DM_SANS }}
                >
                  {t(`debt.clientsIntelligence.views.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border/60" />

          {/* Triage tier */}
          <div className="flex flex-wrap items-center gap-2" style={{ fontFamily: DM_SANS }}>
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground" style={{ fontFamily: PLEX_MONO, minWidth: 80 }}>
              {t('debt.clientsIntelligence.filters.tier.triage')}
            </span>
            <SearchField
              value={search}
              placeholder={t('debt.clientsIntelligence.filters.search')}
              onChange={(value) => setSimple('q', value)}
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
            <ToggleChip
              label={t('debt.clientsIntelligence.filters.promiseOverdue')}
              active={promiseOverdueOnly}
              onClick={() => toggleBool('promise')}
            />
            <ToggleChip
              label={t('debt.clientsIntelligence.filters.aging60Plus')}
              active={aging60Plus}
              onClick={() => toggleBool('aging60')}
            />
          </div>

          <div className="h-px bg-border/60" />

          {/* Slicers tier */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground" style={{ fontFamily: PLEX_MONO, minWidth: 80 }}>
              {t('debt.clientsIntelligence.filters.tier.slicers')}
            </span>
            <button
              type="button"
              onClick={() => setSlicersOpen((s) => !s)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
                slicerFilters > 0
                  ? 'border-[#D4A843]/60 bg-[#D4A843]/12 text-[#7A5E20]'
                  : 'border-border bg-background/60 text-muted-foreground hover:text-foreground',
              )}
              style={{ fontFamily: DM_SANS }}
              aria-expanded={slicersOpen}
            >
              <SlidersHorizontal size={11} />
              {t('debt.clientsIntelligence.filters.slicersButton')}
              {slicerFilters > 0 && (
                <span className="rounded-full bg-[#D4A843]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[#7A5E20]">
                  {slicerFilters}
                </span>
              )}
            </button>

            {slicersOpen && (
              <SlicersPopover
                onClose={() => setSlicersOpen(false)}
                t={t}
                roomId={roomId}
                direction={direction}
                region={region}
                clientGroup={clientGroup}
                rfmSegment={rfmSegment}
                dormantBucket={dormantBucket}
                rooms={(roomsQ.data ?? []).map((r) => ({ value: r.room_id, label: r.room_name }))}
                directions={(directionsQ.data ?? []).map((d) => ({ value: d, label: d }))}
                rfmSegments={rfmSegments}
                onChange={(key, value) => setSimple(key, value)}
                onChangeNumeric={(key, value) => setNumeric(key, value)}
              />
            )}

            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#9E7B2F] transition-colors"
                style={{ fontFamily: PLEX_MONO }}
              >
                {t('data.clearAll')} ({activeFiltersCount})
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Mobile (<lg) — single button opens a slide-up sheet. */}
      <section className="mt-5 lg:hidden animate-fade-up animate-fade-up-delay-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm"
          style={{ fontFamily: DM_SANS }}
        >
          <Filter size={14} />
          {t('debt.clientsIntelligence.filters.openMobileSheet')}
          {activeFiltersCount > 0 && (
            <span className="rounded-full bg-[#D4A843]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[#7A5E20]">
              {activeFiltersCount}
            </span>
          )}
        </button>
        {activeFiltersCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
            style={{ fontFamily: PLEX_MONO }}
          >
            {t('data.clearAll')}
          </button>
        )}
      </section>

      <section className="mt-5 animate-fade-up animate-fade-up-delay-4">
        <div className="rounded-2xl border border-border/70 bg-card overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
            <div className="flex items-center gap-3">
              {sortKey ? (
                <span className="hidden md:inline text-[10px] uppercase tracking-[0.14em] text-[#9E7B2F]" style={{ fontFamily: PLEX_MONO }}>
                  {t('debt.clientsIntelligence.sort.active', {
                    column: t(`debt.clientsIntelligence.cols.${sortKey === 'expected_recovery' ? 'expectedRec' : sortKey === 'pay_probability' ? 'payProb' : sortKey === 'exposure_ratio' ? 'exposure' : sortKey === 'bucket_90_plus' ? 'aging' : sortKey === 'sales_90d' ? 'salesPay90d' : sortKey === 'current_debt' ? 'currentDebt' : 'lastPurchase'}`),
                  })}{' '}
                  ({t(`debt.clientsIntelligence.sort.${sortDir}`)})
                </span>
              ) : (
                <span className="hidden md:inline text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                  {t('debt.clientsIntelligence.sort.by')}: {t('debt.clientsIntelligence.sort.default')}
                </span>
              )}
              <DensityToggle density={density} setDensity={setDensity} t={t} />
            </div>
          </div>

          {listQ.isError ? (
            <InlineState
              icon={<TriangleAlert size={16} />}
              title={t('debt.clientsIntelligence.error.title')}
              description={t('debt.clientsIntelligence.error.description')}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="premium-table min-w-[1280px] w-full text-sm" style={{ fontFamily: DM_SANS }}>
                  <thead>
                    <tr>
                      <Th label={t('debt.clientsIntelligence.cols.client')} sticky />
                      <Th label={t('debt.clientsIntelligence.cols.attention')} />
                      <SortTh
                        label={t('debt.clientsIntelligence.cols.payProb')}
                        sortKey="pay_probability"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onCycle={cycleSort}
                        align="right"
                      />
                      <SortTh
                        label={t('debt.clientsIntelligence.cols.expectedRec')}
                        sortKey="expected_recovery"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onCycle={cycleSort}
                        align="right"
                      />
                      <SortTh
                        label={t('debt.clientsIntelligence.cols.aging')}
                        sortKey="bucket_90_plus"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onCycle={cycleSort}
                      />
                      <Th label={t('debt.clientsIntelligence.cols.trend')} align="center" />
                      <SortTh
                        label={t('debt.clientsIntelligence.cols.exposure')}
                        sortKey="exposure_ratio"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onCycle={cycleSort}
                        align="right"
                      />
                      <SortTh
                        label={t('debt.clientsIntelligence.cols.salesPay90d')}
                        sortKey="sales_90d"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onCycle={cycleSort}
                        align="right"
                      />
                      <Th label={t('debt.clientsIntelligence.cols.dealAndGroup')} />
                      <Th label={t('debt.cols.manager')} />
                      <Th label={t('debt.cols.region')} />
                    </tr>
                  </thead>
                  <tbody>
                    {listQ.isLoading && !listQ.data
                      ? Array.from({ length: 8 }).map((_, index) => (
                          <tr key={index}>
                            {Array.from({ length: 11 }).map((__, cellIndex) => (
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
                            density={density}
                            managerStat={row.manager ? managerStats[row.manager] : undefined}
                            onOpen={openClient}
                            t={t}
                          />
                        ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden">
                {listQ.isLoading && !listQ.data ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="shimmer-skeleton h-24 w-full rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {rows.map((row) => (
                      <li key={row.person_id}>
                        <MobileClientCard row={row} lang={i18n.language} onOpen={openClient} t={t} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
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
          <span className="text-foreground tabular-nums" style={{ fontFamily: PLAYFAIR }}>
            {t('debt.clientsIntelligence.footer.summary', {
              from: showingFrom.toLocaleString(),
              to: showingTo.toLocaleString(),
              total: total.toLocaleString(),
            })}
          </span>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                {t('debt.clientsIntelligence.footer.rowsPer')}
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
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground tabular-nums px-1" style={{ fontFamily: PLEX_MONO }}>
                {currentPage} / {totalPages}
              </span>
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

      {mobileFiltersOpen && (
        <MobileFilterSheet
          t={t}
          onClose={() => setMobileFiltersOpen(false)}
          view={view}
          attention={attention}
          dealStatus={dealStatus}
          search={search}
          promiseOverdueOnly={promiseOverdueOnly}
          aging60Plus={aging60Plus}
          roomId={roomId}
          direction={direction}
          region={region}
          clientGroup={clientGroup}
          rfmSegment={rfmSegment}
          dormantBucket={dormantBucket}
          rooms={(roomsQ.data ?? []).map((r) => ({ value: r.room_id, label: r.room_name }))}
          directions={(directionsQ.data ?? []).map((d) => ({ value: d, label: d }))}
          rfmSegments={rfmSegments}
          setSimple={setSimple}
          setNumeric={setNumeric}
          toggleBool={toggleBool}
          activeFiltersCount={activeFiltersCount}
          clearFilters={clearFilters}
        />
      )}

      {selectedClientId !== null && (
        <ClientDecisionModal
          personId={selectedClientId}
          query={detailQ}
          lang={i18n.language}
          onClose={closeClient}
          onApplyFilter={(entries) => setMulti({ ...entries, client: '' })}
        />
      )}
    </div>
  )
}

function ClientRow({
  row,
  density,
  managerStat,
  onOpen,
  t,
}: {
  row: ClientsIntelligenceRow
  density: Density
  managerStat?: { count: number; pastDue: number }
  onOpen: (personId: number) => void
  t: TFunction
}) {
  const compact = density === 'compact'
  const cellPadding = compact ? 'py-1.5' : 'py-3'
  const collectionPct = row.sales_90d > 0 ? (row.payments_90d / row.sales_90d) * 100 : null

  return (
    <tr className="cursor-pointer transition-colors" onClick={() => onOpen(row.person_id)}>
      <td className={cn('px-3 border-b border-border/40 sticky left-0 bg-card z-10 min-w-[220px]', cellPadding)}>
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
          {!compact && (
            <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
              {row.tin ?? '—'}
            </p>
          )}
        </button>
      </td>

      <td className={cn('px-3 border-b border-border/40 min-w-[220px]', cellPadding)}>
        <div className="flex flex-col gap-1">
          <span className={`action-badge ${attentionVariant(row.attention_state)}`}>
            {t(`debt.clientsIntelligence.attention.${row.attention_state}`)}
          </span>
          {!compact && (
            <>
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
            </>
          )}
        </div>
      </td>

      <td
        className={cn('px-3 border-b border-border/40 text-right tabular-nums whitespace-nowrap', cellPadding)}
        style={{ fontFamily: PLAYFAIR, color: payProbColor(row.pay_probability) }}
      >
        <span className="text-base font-semibold">
          {Math.round((row.pay_probability ?? 0) * 100)}%
        </span>
      </td>

      <td className={cn('px-3 border-b border-border/40 text-right whitespace-nowrap', cellPadding)} style={{ fontFamily: PLAYFAIR }}>
        <span className="text-base font-semibold tabular-nums text-foreground">
          {formatMoney(row.expected_recovery ?? 0)}
        </span>
      </td>

      <td className={cn('px-3 border-b border-border/40 min-w-[160px]', cellPadding)}>
        <AgingBar
          b1={row.bucket_1_30 ?? 0}
          b2={row.bucket_31_60 ?? 0}
          b3={row.bucket_61_90 ?? 0}
          b4={row.bucket_90_plus ?? 0}
        />
        {!compact && (
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums" style={{ fontFamily: PLEX_MONO }}>
            {row.current_debt > 0 ? formatMoney(row.current_debt) : t('debt.clientsIntelligence.aging.noDebt')}
          </p>
        )}
      </td>

      <td className={cn('px-3 border-b border-border/40 text-center', cellPadding)}>
        <TrendGlyph ratio={row.velocity_ratio} t={t} />
      </td>

      <td className={cn('px-3 border-b border-border/40 text-right whitespace-nowrap', cellPadding)}>
        <ExposureCell ratio={row.exposure_ratio ?? 0} t={t} compact={compact} />
      </td>

      <td className={cn('px-3 border-b border-border/40 text-right whitespace-nowrap', cellPadding)} style={{ fontFamily: PLAYFAIR }}>
        <p className="tabular-nums text-foreground">
          {formatMoney(row.sales_90d)} <span className="text-muted-foreground">→</span>{' '}
          <span className={cn(row.payments_90d < row.sales_90d && 'text-[#B8742B]')}>
            {formatMoney(row.payments_90d)}
          </span>
        </p>
        {!compact && (
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums" style={{ fontFamily: PLEX_MONO }}>
            {collectionPct == null ? '—' : formatPercent(collectionPct, 0)} recovered
          </p>
        )}
      </td>

      <td className={cn('px-3 border-b border-border/40 whitespace-nowrap', cellPadding)}>
        <span className={`action-badge ${dealStatusVariant(row.deal_status)}`}>
          {t(`debt.dealStatus.${row.deal_status}`)}
        </span>
        {row.client_group && !compact && (
          <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {t(`debt.clientGroups.${row.client_group}`)}
          </p>
        )}
      </td>

      <td className={cn('px-3 border-b border-border/40 whitespace-nowrap', cellPadding)}>
        <p className="text-foreground">{row.manager ?? '—'}</p>
        {row.manager && managerStat && !compact && (
          <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {t('debt.clientsIntelligence.managerStat', {
              count: managerStat.count,
              rate: managerStat.count ? Math.round((managerStat.pastDue / managerStat.count) * 100) : 0,
            })}
          </p>
        )}
      </td>

      <td className={cn('px-3 border-b border-border/40 text-muted-foreground whitespace-nowrap', cellPadding)}>
        {row.region_name ?? '—'}
      </td>
    </tr>
  )
}

function ClientDecisionModal({
  personId,
  query,
  lang,
  onClose,
  onApplyFilter,
}: {
  personId: number
  query: ReturnType<typeof useClientIntelligenceDetail>
  lang: string
  onClose: () => void
  onApplyFilter: (entries: Record<string, string>) => void
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

            {/* Phase 5 — drill-out: navigate to peers without leaving the URL state of the list. */}
            {detail && (
              <div className="mt-3 flex flex-wrap gap-2">
                {detail.client.manager && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyFilter({
                        room: '',
                        attention: detail.client.attention_state,
                      })
                      onClose()
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:border-[#D4A843]/50 hover:text-[#9E7B2F]"
                    style={{ fontFamily: DM_SANS }}
                    title={`${detail.client.manager} · ${t('debt.clientsIntelligence.modalDrillout.withSameAttention')}`}
                  >
                    <ArrowUpRight size={12} />
                    {t('debt.clientsIntelligence.modalDrillout.managerPeers')}
                  </button>
                )}
                {detail.client.rfm_segment && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyFilter({ rfm: detail.client.rfm_segment ?? '' })
                      onClose()
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:border-[#D4A843]/50 hover:text-[#9E7B2F]"
                    style={{ fontFamily: DM_SANS }}
                  >
                    <ArrowUpRight size={12} />
                    {t('debt.clientsIntelligence.modalDrillout.segmentPeers')} ({detail.client.rfm_segment})
                  </button>
                )}
              </div>
            )}
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

                <Panel
                  title={`${t('debt.clientsIntelligence.modal.behavior90d')}${
                    detail.signals_90d.collection_ratio_90d != null
                      ? ` · ${t('debt.clientsIntelligence.modal.collectionRatio')} ${formatPercent(detail.signals_90d.collection_ratio_90d, 0)}`
                      : ''
                  }`}
                >
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

function Th({
  label,
  align = 'left',
  sticky,
}: {
  label: string
  align?: 'left' | 'right' | 'center'
  sticky?: boolean
}) {
  return (
    <th
      className={cn(
        'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-b border-border whitespace-nowrap',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        sticky && 'sticky left-0 bg-card z-20',
      )}
    >
      {label}
    </th>
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

// ─────────────────────────────────────────────────────────────────
// New helpers for the 10/10 rebuild
// ─────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  hint,
  value,
  tone,
  onClick,
  active,
}: {
  label: string
  hint?: string
  value: string
  tone: 'default' | 'critical' | 'urgent' | 'markdown'
  onClick?: () => void
  active?: boolean
}) {
  const accent =
    tone === 'critical'
      ? '#C95656'
      : tone === 'urgent'
        ? '#B8742B'
        : tone === 'markdown'
          ? '#8A7D6B'
          : '#D4A843'
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative bg-card px-4 py-4 text-left w-full transition-colors',
        onClick && 'cursor-pointer hover:bg-accent/30',
        active && 'bg-[#D4A843]/8',
      )}
      aria-pressed={onClick ? !!active : undefined}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-0.5 opacity-80"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
          {label}
        </p>
        {onClick && (
          <ArrowUpRight size={12} className="text-muted-foreground/50 group-hover:text-[#9E7B2F] transition-colors" />
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums" style={{ fontFamily: PLAYFAIR }}>
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[10px] text-muted-foreground/80 italic" style={{ fontFamily: DM_SANS }}>
          {hint}
        </p>
      )}
    </Comp>
  )
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
        active
          ? 'border-[#D4A843]/60 bg-[#D4A843]/15 text-[#7A5E20]'
          : 'border-border bg-background/60 text-muted-foreground hover:text-foreground',
      )}
      style={{ fontFamily: DM_SANS }}
      aria-pressed={active}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-2.5 w-2.5 rounded-sm border',
          active ? 'border-[#9E7B2F] bg-[#9E7B2F]' : 'border-muted-foreground/40',
        )}
      />
      {label}
    </button>
  )
}

function SortTh({
  label,
  sortKey,
  currentKey,
  currentDir,
  onCycle,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey | ''
  currentDir: SortDir
  onCycle: (key: SortKey) => void
  align?: 'left' | 'right' | 'center'
}) {
  const active = currentKey === sortKey
  return (
    <th
      className={cn(
        'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] border-b border-border whitespace-nowrap',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        active ? 'text-[#9E7B2F]' : 'text-muted-foreground',
      )}
    >
      <button
        type="button"
        onClick={() => onCycle(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 rounded transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        <span>{label}</span>
        {active ? (
          currentDir === 'desc' ? (
            <ArrowDown size={10} aria-hidden />
          ) : (
            <ArrowUp size={10} aria-hidden />
          )
        ) : (
          <span className="opacity-30 text-[8px]" aria-hidden>↕</span>
        )}
      </button>
    </th>
  )
}

function AgingBar({ b1, b2, b3, b4 }: { b1: number; b2: number; b3: number; b4: number }) {
  const total = b1 + b2 + b3 + b4
  if (total <= 0) {
    return (
      <div className="h-2 rounded-full bg-border/50" aria-hidden />
    )
  }
  const pct = (n: number) => `${Math.max(2, Math.round((n / total) * 100))}%`
  // Cream → amber → orange → red, gold-family for the first three buckets
  // and a definitive red for 90+ which is the only "always alarming" slice.
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-border/40">
      {b1 > 0 && <div style={{ width: pct(b1), background: '#D4A843' }} title={`1–30: ${formatMoney(b1)}`} />}
      {b2 > 0 && <div style={{ width: pct(b2), background: '#C49833' }} title={`31–60: ${formatMoney(b2)}`} />}
      {b3 > 0 && <div style={{ width: pct(b3), background: '#B8742B' }} title={`61–90: ${formatMoney(b3)}`} />}
      {b4 > 0 && <div style={{ width: pct(b4), background: '#C95656' }} title={`90+: ${formatMoney(b4)}`} />}
    </div>
  )
}

function TrendGlyph({ ratio, t }: { ratio: number | null; t: TFunction }) {
  if (ratio == null) {
    return (
      <span className="text-muted-foreground/40" title={t('debt.clientsIntelligence.trend.noData')}>
        <Minus size={14} aria-hidden />
      </span>
    )
  }
  if (ratio >= 1.3) {
    return (
      <span className="text-[#1E8A5E]" title={`${t('debt.clientsIntelligence.trend.up')} (${ratio.toFixed(2)}×)`}>
        <ArrowUp size={14} aria-hidden />
      </span>
    )
  }
  if (ratio < 0.7) {
    return (
      <span className="text-[#C95656]" title={`${t('debt.clientsIntelligence.trend.down')} (${ratio.toFixed(2)}×)`}>
        <ArrowDown size={14} aria-hidden />
      </span>
    )
  }
  return (
    <span className="text-muted-foreground" title={`${t('debt.clientsIntelligence.trend.flat')} (${ratio.toFixed(2)}×)`}>
      <Minus size={14} aria-hidden />
    </span>
  )
}

function ExposureCell({
  ratio,
  t,
  compact,
}: {
  ratio: number
  t: TFunction
  compact: boolean
}) {
  if (ratio <= 0) return <span className="text-muted-foreground tabular-nums">—</span>
  const danger = ratio > 1.0
  return (
    <div>
      <span
        className={cn('tabular-nums font-semibold', danger ? 'text-[#C95656]' : 'text-foreground')}
        style={{ fontFamily: PLAYFAIR }}
        title={t('debt.clientsIntelligence.exposureHint')}
      >
        {ratio.toFixed(2)}×
      </span>
      {danger && !compact && (
        <p className="text-[9px] uppercase tracking-[0.12em] text-[#C95656]" style={{ fontFamily: PLEX_MONO }}>
          {t('debt.clientsIntelligence.stopSelling')}
        </p>
      )}
    </div>
  )
}

function DensityToggle({
  density,
  setDensity,
  t,
}: {
  density: Density
  setDensity: (d: Density) => void
  t: TFunction
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-background/60 p-0.5">
      {(['compact', 'comfortable'] as Density[]).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setDensity(value)}
          className={cn(
            'px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors',
            density === value ? 'bg-[#D4A843] text-[#2C2418]' : 'text-muted-foreground hover:text-foreground',
          )}
          style={{ fontFamily: DM_SANS }}
        >
          {t(`debt.clientsIntelligence.density.${value}`)}
        </button>
      ))}
    </div>
  )
}

function MobileClientCard({
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
    <button
      type="button"
      onClick={() => onOpen(row.person_id)}
      className="w-full px-4 py-3 text-left hover:bg-accent/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold tracking-tight" style={{ fontFamily: PLAYFAIR }}>
            {row.client_name ?? '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {row.tin ?? '—'}
            {row.last_purchase_date && (
              <span className="ml-2 text-muted-foreground/70">
                · {exactDateTitle(row.last_purchase_date, lang)}
              </span>
            )}
          </p>
        </div>
        <span className={`action-badge ${attentionVariant(row.attention_state)}`}>
          {t(`debt.clientsIntelligence.attention.${row.attention_state}`)}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {t('debt.clientsIntelligence.cols.payProb')}
          </p>
          <p className="mt-0.5 font-semibold tabular-nums" style={{ fontFamily: PLAYFAIR, color: payProbColor(row.pay_probability) }}>
            {Math.round((row.pay_probability ?? 0) * 100)}%
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {t('debt.clientsIntelligence.cols.expectedRec')}
          </p>
          <p className="mt-0.5 font-semibold tabular-nums" style={{ fontFamily: PLAYFAIR }}>
            {formatMoney(row.expected_recovery ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
            {t('debt.clientsIntelligence.cols.exposure')}
          </p>
          <p className={cn('mt-0.5 font-semibold tabular-nums', row.exposure_ratio > 1 && 'text-[#C95656]')} style={{ fontFamily: PLAYFAIR }}>
            {row.exposure_ratio > 0 ? `${row.exposure_ratio.toFixed(2)}×` : '—'}
          </p>
        </div>
      </div>

      <div className="mt-2">
        <AgingBar
          b1={row.bucket_1_30 ?? 0}
          b2={row.bucket_31_60 ?? 0}
          b3={row.bucket_61_90 ?? 0}
          b4={row.bucket_90_plus ?? 0}
        />
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
        {row.manager ?? '—'}
        {row.region_name && <span> · {row.region_name}</span>}
      </p>
    </button>
  )
}

function SlicersPopover({
  onClose,
  t,
  roomId,
  direction,
  region,
  clientGroup,
  rfmSegment,
  dormantBucket,
  rooms,
  directions,
  rfmSegments,
  onChange,
  onChangeNumeric,
}: {
  onClose: () => void
  t: TFunction
  roomId: string
  direction: string
  region: string
  clientGroup: string
  rfmSegment: string
  dormantBucket?: number
  rooms: { value: string; label: string }[]
  directions: { value: string; label: string }[]
  rfmSegments: string[]
  onChange: (key: string, value: string) => void
  onChangeNumeric: (key: string, value: number | undefined) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])
  return (
    <div
      ref={ref}
      className="absolute z-30 mt-2 w-[min(540px,90vw)] rounded-2xl border border-border bg-card p-4 shadow-2xl"
      style={{ left: 92, top: '100%' }}
      role="dialog"
    >
      <div className="grid grid-cols-2 gap-3">
        <SelectPill
          label={t('debt.filters.manager')}
          value={roomId}
          onChange={(v) => onChange('room', v)}
          options={rooms}
        />
        <SelectPill
          label={t('debt.filters.direction')}
          value={direction}
          onChange={(v) => onChange('direction', v)}
          options={directions}
        />
        <TextPill
          label={t('debt.clientsIntelligence.filters.region')}
          value={region}
          onChange={(v) => onChange('region', v)}
        />
        <SelectPill
          label={t('debt.clientsIntelligence.filters.group')}
          value={clientGroup}
          onChange={(v) => onChange('group', v)}
          options={CLIENT_GROUPS.map((g) => ({ value: g, label: t(`debt.clientGroups.${g}`) }))}
        />
        <SelectPill
          label={t('debt.clientsIntelligence.filters.rfm')}
          value={rfmSegment}
          onChange={(v) => onChange('rfm', v)}
          options={rfmSegments.map((s) => ({ value: s, label: s }))}
        />
        <SelectPill
          label={t('debt.clientsIntelligence.filters.dormant')}
          value={dormantBucket ? String(dormantBucket) : ''}
          onChange={(v) => onChangeNumeric('dormant', v ? Number(v) : undefined)}
          options={DORMANT_BUCKETS.map((days) => ({
            value: String(days),
            label: t('debt.clientsIntelligence.filters.daysDormant', { days }),
          }))}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          style={{ fontFamily: PLEX_MONO }}
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}

function MobileFilterSheet({
  t,
  onClose,
  view,
  attention,
  dealStatus,
  search,
  promiseOverdueOnly,
  aging60Plus,
  roomId,
  direction,
  region,
  clientGroup,
  rfmSegment,
  dormantBucket,
  rooms,
  directions,
  rfmSegments,
  setSimple,
  setNumeric,
  toggleBool,
  activeFiltersCount,
  clearFilters,
}: {
  t: TFunction
  onClose: () => void
  view: string
  attention: string
  dealStatus: string
  search: string
  promiseOverdueOnly: boolean
  aging60Plus: boolean
  roomId: string
  direction: string
  region: string
  clientGroup: string
  rfmSegment: string
  dormantBucket?: number
  rooms: { value: string; label: string }[]
  directions: { value: string; label: string }[]
  rfmSegments: string[]
  setSimple: (key: string, value: string) => void
  setNumeric: (key: string, value: number | undefined) => void
  toggleBool: (key: string) => void
  activeFiltersCount: number
  clearFilters: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ fontFamily: PLAYFAIR }}>
            {t('debt.clientsIntelligence.filters.mobileSheetTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border p-1.5 text-muted-foreground"
            aria-label={t('common.close')}
          >
            <X size={14} />
          </button>
        </div>

        <div className="mt-4 space-y-4" style={{ fontFamily: DM_SANS }}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2" style={{ fontFamily: PLEX_MONO }}>
              {t('debt.clientsIntelligence.filters.tier.view')}
            </p>
            <div className="flex flex-wrap gap-1.5">
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
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2" style={{ fontFamily: PLEX_MONO }}>
              {t('debt.clientsIntelligence.filters.tier.triage')}
            </p>
            <div className="space-y-2">
              <SearchField
                value={search}
                placeholder={t('debt.clientsIntelligence.filters.search')}
                onChange={(value) => setSimple('q', value)}
              />
              <div className="flex flex-wrap gap-2">
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
                <ToggleChip
                  label={t('debt.clientsIntelligence.filters.promiseOverdue')}
                  active={promiseOverdueOnly}
                  onClick={() => toggleBool('promise')}
                />
                <ToggleChip
                  label={t('debt.clientsIntelligence.filters.aging60Plus')}
                  active={aging60Plus}
                  onClick={() => toggleBool('aging60')}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2" style={{ fontFamily: PLEX_MONO }}>
              {t('debt.clientsIntelligence.filters.tier.slicers')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <SelectPill
                label={t('debt.filters.manager')}
                value={roomId}
                onChange={(v) => setSimple('room', v)}
                options={rooms}
              />
              <SelectPill
                label={t('debt.filters.direction')}
                value={direction}
                onChange={(v) => setSimple('direction', v)}
                options={directions}
              />
              <TextPill
                label={t('debt.clientsIntelligence.filters.region')}
                value={region}
                onChange={(v) => setSimple('region', v)}
              />
              <SelectPill
                label={t('debt.clientsIntelligence.filters.group')}
                value={clientGroup}
                onChange={(v) => setSimple('group', v)}
                options={CLIENT_GROUPS.map((g) => ({ value: g, label: t(`debt.clientGroups.${g}`) }))}
              />
              <SelectPill
                label={t('debt.clientsIntelligence.filters.rfm')}
                value={rfmSegment}
                onChange={(v) => setSimple('rfm', v)}
                options={rfmSegments.map((s) => ({ value: s, label: s }))}
              />
              <SelectPill
                label={t('debt.clientsIntelligence.filters.dormant')}
                value={dormantBucket ? String(dormantBucket) : ''}
                onChange={(v) => setNumeric('dormant', v ? Number(v) : undefined)}
                options={DORMANT_BUCKETS.map((days) => ({
                  value: String(days),
                  label: t('debt.clientsIntelligence.filters.daysDormant', { days }),
                }))}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
          {activeFiltersCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                clearFilters()
              }}
              className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              style={{ fontFamily: PLEX_MONO }}
            >
              {t('data.clearAll')} ({activeFiltersCount})
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[#D4A843] px-4 py-2 text-sm font-semibold text-[#2C2418]"
            style={{ fontFamily: DM_SANS }}
          >
            {t('common.apply') || 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
