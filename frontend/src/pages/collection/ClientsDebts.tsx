import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, X, Search } from 'lucide-react'

import {
  useDebtClientsAging,
  useRooms,
  useSnapshotsDirections,
  type ClientGroup,
  type ClientsAgingRow,
  type DealStatus,
} from '@/api/hooks'
import PageHeader from '@/components/PageHeader'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

const ROWS_PER_FOLIO = [25, 50, 100, 200] as const

// 5-token enum, mirrors backend ALLOWED_GROUPS. Filter pill order chosen
// so the most actionable groups come first (problem-deadline blacklist
// then problem-monthly partial-payers).
const CLIENT_GROUPS: ClientGroup[] = [
  'NORMAL',
  'PROBLEM_DEADLINE',
  'PROBLEM_MONTHLY',
  'PROBLEM_UNDEFINED',
  'CLOSED',
]

/** Map a deal_status to one of the existing .action-badge variants from
 *  index.css (critical / urgent / markdown / monitor / plan). */
function dealStatusVariant(s: DealStatus): string {
  switch (s) {
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

/**
 * Mijoz qarzlari — Excel-`Data` sheet equivalent.
 *
 * One dense table per client with full aging breakdown:
 *   client | term days | total debt | undue | overdue | 1-30 | 31-60 |
 *   61-90 | 90+ | manager | region | direction | group | category
 *
 * The existing /collection/worklist?tab=aging shows a slimmer version of
 * the same data (8 columns); this page is the audit-grade view for
 * managers who need to see the full row at a glance — every column you'd
 * have in the spreadsheet equivalent.
 *
 * Backend: GET /api/debt/clients-aging — already serves all columns plus
 * a top-level summary for the KPI strip. URL is the source of truth via
 * useSearchParams so filters survive reload + can be shared.
 */
export default function ClientsDebts() {
  const { t, i18n } = useTranslation()
  void i18n
  const [searchParams, setSearchParams] = useSearchParams()

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 50), 1), 500)
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0)
  const search = searchParams.get('q') ?? ''
  const roomId = searchParams.get('room') ?? ''
  const direction = searchParams.get('direction') ?? ''
  const region = searchParams.get('region') ?? ''
  const clientGroup = searchParams.get('group') ?? ''
  const overdueOnly = searchParams.get('overdue_only') === '1'

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

  const setOverdue = (v: boolean) =>
    setParam((p) => {
      if (v) p.set('overdue_only', '1')
      else p.delete('overdue_only')
      p.set('offset', '0')
    })

  const setOffset = (n: number) =>
    setParam((p) => {
      p.set('offset', String(Math.max(n, 0)))
    })

  const setLimit = (n: number) =>
    setParam((p) => {
      p.set('limit', String(n))
      p.set('offset', '0')
    })

  const filters = useMemo(
    () => ({
      limit,
      offset,
      search,
      sales_manager_room_id: roomId,
      direction,
      region,
      client_group: clientGroup,
      overdue_only: overdueOnly,
    }),
    [limit, offset, search, roomId, direction, region, clientGroup, overdueOnly],
  )

  const agingQ = useDebtClientsAging(filters)
  const roomsQ = useRooms()
  const directionsQ = useSnapshotsDirections()

  const rows = agingQ.data?.rows ?? []
  const total = agingQ.data?.total ?? 0
  const summary = agingQ.data?.summary ?? {}
  const isLoading = agingQ.isLoading && !agingQ.data

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.floor(offset / limit) + 1
  const showingFrom = total === 0 ? 0 : offset + 1
  const showingTo = Math.min(offset + limit, total)

  const activeFiltersCount =
    [roomId, direction, region, clientGroup, search].filter(Boolean).length + (overdueOnly ? 1 : 0)

  const clearAll = () =>
    setParam((p) => {
      p.delete('q')
      p.delete('room')
      p.delete('direction')
      p.delete('region')
      p.delete('group')
      p.delete('overdue_only')
      p.set('offset', '0')
    })

  return (
    <div>
      <PageHeader />

      <header className="mb-6 animate-fade-up">
        <span className="section-title">{t('debt.section')}</span>
        <h1
          className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight mt-3"
          style={{ fontFamily: PLAYFAIR }}
        >
          {t('debt.clientsDebts.title')}
        </h1>
        <p className="text-xs text-muted-foreground italic mt-2" style={{ fontFamily: DM_SANS }}>
          {t('debt.clientsDebts.subtitle')}
        </p>
      </header>

      {/* KPI strip — pulled from the endpoint's `summary` aggregate */}
      <section
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 animate-fade-up animate-fade-up-delay-1"
        style={{ fontFamily: DM_SANS }}
      >
        <Stat
          label={t('debt.stats.totalDebt')}
          value={formatNumber(summary.total_qarz ?? 0)}
          unit="USD"
          tone="default"
        />
        <Stat
          label={t('debt.stats.over90')}
          value={formatNumber(summary.total_over_90 ?? 0)}
          unit="USD"
          tone="critical"
        />
        <Stat
          label={t('debt.stats.debtors')}
          value={String(summary.debtor_count ?? 0)}
          sub={`${summary.debtor_over_90_count ?? 0} ${t('debt.stats.over90Short')}`}
          tone="default"
        />
        <Stat
          label={t('debt.clientsDebts.overdueTotal')}
          value={formatNumber(summary.total_overdue ?? 0)}
          unit="USD"
          tone={(summary.total_overdue ?? 0) > 0 ? 'urgent' : 'default'}
        />
      </section>

      {/* Filter strip */}
      <section
        className="flex flex-wrap items-center gap-2 mb-4 animate-fade-up animate-fade-up-delay-2"
        style={{ fontFamily: DM_SANS }}
      >
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 mr-1" style={{ fontFamily: PLEX_MONO }}>
          {t('data.filters.label')}
        </span>

        {/* Search — explicit padding rather than the .month-btn class because
            .month-btn ships `padding: 4px 8px` (shorthand), which overrides
            any utility padding-left we'd want to add for the leading icon.
            Style mimics .month-btn so the row stays visually consistent. */}
        <div className="relative">
          <Search
            size={12}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSimple('q', e.target.value)}
            placeholder={t('debt.searchPlaceholder')}
            aria-label={t('debt.searchPlaceholder')}
            className={cn(
              'rounded-md border border-transparent text-[11px] font-medium',
              'bg-[#EDE7DC] text-[#2C2418] placeholder:text-muted-foreground/50 placeholder:italic',
              'focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#D4A843]/15',
              'dark:bg-[#1A1A28] dark:text-foreground dark:placeholder:text-muted-foreground/40',
            )}
            style={{ minWidth: '240px', padding: '4px 12px 4px 32px' }}
          />
        </div>

        <SelectPill
          label={t('debt.filters.manager')}
          value={roomId}
          onChange={(v) => setSimple('room', v)}
          options={(roomsQ.data ?? []).map((r) => ({ value: r.room_id, label: r.room_name }))}
        />
        <SelectPill
          label={t('debt.filters.direction')}
          value={direction}
          onChange={(v) => setSimple('direction', v)}
          options={(directionsQ.data ?? []).map((d) => ({ value: d, label: d }))}
        />
        <SelectPill
          label={t('debt.filters.group')}
          value={clientGroup}
          onChange={(v) => setSimple('group', v)}
          options={CLIENT_GROUPS.map((g) => ({
            value: g,
            label: t(`debt.clientGroups.${g}`),
          }))}
        />
        <button
          type="button"
          onClick={() => setOverdue(!overdueOnly)}
          className={cn('month-btn normal-case', overdueOnly && 'active')}
        >
          {t('debt.clientsDebts.overdueOnly')}
        </button>

        {activeFiltersCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#9E7B2F] transition-colors ml-auto"
          >
            {t('data.clearAll')} ({activeFiltersCount})
          </button>
        )}
      </section>

      {/* Table */}
      <div className="overflow-x-auto -mx-2 animate-fade-up animate-fade-up-delay-3">
        <table className="premium-table w-full text-sm" style={{ fontFamily: DM_SANS }}>
          <thead>
            <tr>
              <Th label={t('debt.cols.client')} sticky />
              <Th label={t('debt.clientsDebts.cols.status')} />
              <Th label={t('debt.clientsDebts.cols.termDays')} align="right" />
              <Th label={t('debt.clientsDebts.cols.qarz')} align="right" />
              <Th label={t('debt.clientsDebts.cols.notDue')} align="right" />
              <Th label={t('debt.clientsDebts.cols.overdue')} align="right" />
              <Th label={t('debt.cols.bucket1')} align="right" />
              <Th label={t('debt.cols.bucket2')} align="right" />
              <Th label={t('debt.cols.bucket3')} align="right" />
              <Th label={t('debt.cols.bucket4')} align="right" />
              <Th label={t('debt.cols.manager')} />
              <Th label={t('debt.clientsDebts.cols.region')} />
              <Th label={t('debt.clientsDebts.cols.direction')} />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 13 }).map((__, j) => (
                      <td key={j} className="px-3 py-2.5 border-b border-border/40">
                        <div className="shimmer-skeleton h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => <Row key={row.person_id} row={row} />)}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {!isLoading && total === 0 && (
        <div className="py-16 text-center animate-fade-up">
          <div className="text-3xl text-[#D4A843] mb-3 tracking-[0.5em]" aria-hidden>
            ※
          </div>
          <p className="text-lg italic mb-1" style={{ fontFamily: PLAYFAIR }}>
            {t('debt.empty.line1')}
          </p>
          <p className="text-sm text-muted-foreground italic" style={{ fontFamily: DM_SANS }}>
            {activeFiltersCount > 0 ? t('debt.empty.line2withFilters') : t('debt.empty.line2')}
          </p>
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="mt-4 text-xs uppercase tracking-[0.14em] text-[#9E7B2F] hover:text-[#7A5E20] transition-colors"
            >
              {t('debt.empty.clearAll')}
            </button>
          )}
        </div>
      )}

      {/* Folio footer — pagination */}
      {total > 0 && (
        <footer
          className="mt-6 pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 text-xs animate-fade-up animate-fade-up-delay-4"
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
              {ROWS_PER_FOLIO.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLimit(n)}
                  className={cn('month-btn', limit === n && 'active')}
                >
                  {n}
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
    </div>
  )
}

// ── One row ──────────────────────────────────────────────────────────────

function Row({ row }: { row: ClientsAgingRow }) {
  return (
    <tr
      className="cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={() => {
        window.location.href = `/collection/debt/client/${row.person_id}`
      }}
    >
      <td className="px-3 py-2.5 border-b border-border/40 sticky left-0 bg-card">
        <Link
          to={`/collection/debt/client/${row.person_id}`}
          className="hover:text-[#9E7B2F] transition-colors"
          style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}
          onClick={(e) => e.stopPropagation()}
        >
          {row.client_name}
        </Link>
      </td>
      <td className="px-3 py-2.5 border-b border-border/40 whitespace-nowrap">
        <StatusBadge status={row.deal_status} />
      </td>
      <NumCell value={row.term_days ?? '—'} mono />
      <NumCell value={row.qarz} bold />
      <NumCell value={row.not_due} muted={row.not_due === 0} />
      <NumCell value={row.overdue} muted={row.overdue === 0} accent={row.overdue > 0 ? 'critical' : undefined} />
      <NumCell value={row.bucket_1_30} muted={row.bucket_1_30 === 0} />
      <NumCell value={row.bucket_31_60} muted={row.bucket_31_60 === 0} />
      <NumCell value={row.bucket_61_90} muted={row.bucket_61_90 === 0} />
      <NumCell value={row.bucket_90_plus} muted={row.bucket_90_plus === 0} accent={row.bucket_90_plus > 0 ? 'critical' : undefined} />
      <td className="px-3 py-2.5 border-b border-border/40 text-muted-foreground whitespace-nowrap">
        {row.manager ?? '—'}
      </td>
      <td className="px-3 py-2.5 border-b border-border/40 text-muted-foreground whitespace-nowrap">
        {row.region_name ?? '—'}
      </td>
      <td className="px-3 py-2.5 border-b border-border/40 text-muted-foreground whitespace-nowrap">
        {row.direction ?? '—'}
      </td>
    </tr>
  )
}

/** Pill-style badge for the Holat column. Reuses the .action-badge palette
 *  defined in index.css: monitor (green) / urgent (amber) / critical (red)
 *  / markdown (muted) / plan (default). */
function StatusBadge({ status }: { status: DealStatus }) {
  const { t } = useTranslation()
  return (
    <span className={`action-badge ${dealStatusVariant(status)}`}>
      {t(`debt.dealStatus.${status}`)}
    </span>
  )
}

function NumCell({
  value,
  bold,
  muted,
  accent,
  mono,
}: {
  value: number | string
  bold?: boolean
  muted?: boolean
  accent?: 'critical'
  mono?: boolean
}) {
  return (
    <td
      className={cn(
        'px-3 py-2.5 border-b border-border/40 text-right tabular-nums whitespace-nowrap',
        bold && 'font-semibold',
        muted && 'text-muted-foreground/40',
        accent === 'critical' && !muted && 'text-[#F87171]',
      )}
      style={mono ? { fontFamily: PLEX_MONO } : { fontFamily: PLAYFAIR }}
    >
      {typeof value === 'number' ? formatNumber(value) : value}
    </td>
  )
}

// ── Th / Stat / SelectPill — local helpers ───────────────────────────────

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
        sticky && 'sticky left-0 bg-card z-10',
      )}
    >
      {label}
    </th>
  )
}

function Stat({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: string
  value: string
  unit?: string
  sub?: string
  tone?: 'default' | 'critical' | 'urgent'
}) {
  // Top rail color matches the Almanac KPI vocabulary: gold for default,
  // red for critical (90+ overdue), amber for "urgent" pacing problems.
  const railColor =
    tone === 'critical' ? '#F87171' : tone === 'urgent' ? '#FB923C' : '#D4A843'
  return (
    <div
      className="glass-card kpi-glow rounded-xl p-5 relative overflow-hidden"
      style={{ ['--glow-color' as string]: railColor } as React.CSSProperties}
    >
      <span
        aria-hidden
        className="absolute top-0 left-0 right-0 h-0.5 opacity-60 rounded-t-xl"
        style={{ background: railColor }}
      />
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3"
        style={{ fontFamily: DM_SANS }}
      >
        {label}
      </p>
      <p
        className={cn(
          'text-3xl font-semibold tabular-nums leading-none',
          tone === 'critical' && 'text-[#F87171]',
          tone === 'urgent' && 'text-[#FB923C]',
        )}
        style={{ fontFamily: PLAYFAIR }}
      >
        {value}
        {unit && (
          <span
            className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 ml-1.5 font-normal"
            style={{ fontFamily: PLEX_MONO }}
          >
            {unit}
          </span>
        )}
      </p>
      {sub && (
        <p
          className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-2"
          style={{ fontFamily: DM_SANS }}
        >
          {sub}
        </p>
      )}
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
        className={cn(
          'month-btn appearance-none pr-6 cursor-pointer normal-case font-medium',
          value && 'active',
        )}
        style={{ minWidth: '120px' }}
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
      {value && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
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
