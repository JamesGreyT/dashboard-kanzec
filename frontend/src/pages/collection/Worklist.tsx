import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, X, ClipboardList, Wallet, Layers, Calendar } from 'lucide-react'

import {
  useDebtWorklist,
  useDebtClientsAging,
  useDebtPrepayments,
  useRooms,
  useSnapshotsDirections,
  dominantAgingBucket,
  type DebtRow,
  type ClientsAgingRow,
  type PrepaymentRow,
} from '@/api/hooks'
import PageHeader from '@/components/PageHeader'
import SectionTitle from '@/components/SectionTitle'
import { formatNumber, formatCurrency, formatPercent, formatShortDate, agingBadgeVariant, toRomanLower } from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

type Tab = 'worklist' | 'aging' | 'prepayments'

const ROWS_PER_FOLIO = [25, 50, 100, 200] as const

const AGING_BUCKETS = ['current', '30-60', '60-90', '90+'] as const

const OUTCOMES = ['promise', 'no_answer', 'wrong_number', 'partial_payment', 'dispute', 'paid'] as const

export default function Worklist() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const tab: Tab = (() => {
    const t = searchParams.get('tab')
    if (t === 'aging' || t === 'prepayments') return t
    return 'worklist'
  })()

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 50), 1), 500)
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0)
  const search = searchParams.get('q') ?? ''
  const roomId = searchParams.get('room') ?? ''
  const direction = searchParams.get('direction') ?? ''
  const region = searchParams.get('region') ?? ''
  const agingBucket = searchParams.get('aging_bucket') ?? ''
  const outcome = searchParams.get('outcome') ?? ''
  const overdueOnly = searchParams.get('overdue_only') === '1'

  const setParam = (mutate: (next: URLSearchParams) => void) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      mutate(next)
      return next
    })

  const setTab = (next: Tab) =>
    setParam((p) => {
      if (next === 'worklist') p.delete('tab')
      else p.set('tab', next)
      p.set('offset', '0')
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
      aging_bucket: agingBucket,
      outcome,
      overdue_promises_only: overdueOnly,
    }),
    [limit, offset, search, roomId, direction, region, agingBucket, outcome, overdueOnly],
  )

  const worklistQ = useDebtWorklist(tab === 'worklist' ? filters : { limit: 1, offset: 0 })
  const agingQ = useDebtClientsAging(tab === 'aging' ? filters : { limit: 1, offset: 0 })
  const prepaymentsQ = useDebtPrepayments(
    tab === 'prepayments' ? { limit, offset, search } : { limit: 1, offset: 0 },
  )

  const roomsQ = useRooms()
  const directionsQ = useSnapshotsDirections()

  // Stat strip from the worklist endpoint's `summary` (always available even
  // when on a different tab — the worklist preview from the dashboard already
  // primes this query in the cache, but we re-fetch for freshness).
  const summaryQ = useDebtWorklist({ limit: 1, offset: 0 })
  const summary = summaryQ.data?.summary

  const clearFilters = () =>
    setSearchParams(
      (() => {
        const p = new URLSearchParams()
        if (tab !== 'worklist') p.set('tab', tab)
        return p
      })(),
    )

  const activeFiltersCount =
    [search, roomId, direction, region, agingBucket, outcome].filter(Boolean).length +
    (overdueOnly ? 1 : 0)

  // Pick the row source per tab
  const total =
    tab === 'worklist'
      ? worklistQ.data?.total ?? 0
      : tab === 'aging'
      ? agingQ.data?.total ?? 0
      : prepaymentsQ.data?.total ?? 0
  const isLoading =
    tab === 'worklist'
      ? worklistQ.isLoading && !worklistQ.data
      : tab === 'aging'
      ? agingQ.isLoading && !agingQ.data
      : prepaymentsQ.isLoading && !prepaymentsQ.data

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.floor(offset / limit) + 1
  const showingFrom = total ? offset + 1 : 0
  const showingTo = offset + Math.min(limit, total - offset)

  return (
    <div>
      <PageHeader />

      <header className="mb-6">
        <div className="animate-fade-up">
          <span className="section-title">{t('debt.section')}</span>
        </div>
        <div className="flex items-end justify-between gap-6 mt-3 mb-2 animate-fade-up animate-fade-up-delay-1">
          <h1
            className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight"
            style={{ fontFamily: PLAYFAIR }}
          >
            {t('debt.worklist.title')}
          </h1>
        </div>
        {/* Tabs as editorial section markers — same vocabulary as the page section-title */}
        <div className="flex items-baseline gap-1 border-b border-border/60 mt-4 animate-fade-up animate-fade-up-delay-1">
          <TabPill icon={ClipboardList} active={tab === 'worklist'} onClick={() => setTab('worklist')}>
            {t('debt.tabs.worklist')}
          </TabPill>
          <TabPill icon={Layers} active={tab === 'aging'} onClick={() => setTab('aging')}>
            {t('debt.tabs.aging')}
          </TabPill>
          <TabPill icon={Wallet} active={tab === 'prepayments'} onClick={() => setTab('prepayments')}>
            {t('debt.tabs.prepayments')}
          </TabPill>
        </div>
      </header>

      {/* Stat strip — always shows worklist summary (the canonical numbers) */}
      {summary && (
        <section
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 animate-fade-up animate-fade-up-delay-2"
          style={{ fontFamily: DM_SANS }}
        >
          <Stat
            label={t('debt.stats.totalDebt')}
            value={formatNumber(summary.total_outstanding)}
            unit="UZS"
            tone="default"
          />
          <Stat
            label={t('debt.stats.over90')}
            value={formatNumber(summary.total_over_90)}
            unit="UZS"
            tone="critical"
            sub={
              summary.total_outstanding
                ? `${formatPercent((summary.total_over_90 / summary.total_outstanding) * 100, 0)}`
                : ''
            }
          />
          <Stat
            label={t('debt.stats.debtors')}
            value={String(summary.debtor_count)}
            sub={`${summary.debtor_over_90_count} ${t('debt.stats.over90Short')}`}
            tone="default"
          />
          <Stat
            label={t('debt.stats.overduePromises')}
            value={formatNumber(summary.total_overdue_promises)}
            unit={summary.total_overdue_promises ? 'UZS' : ''}
            tone={summary.total_overdue_promises > 0 ? 'urgent' : 'default'}
          />
        </section>
      )}

      {/* Filter strip — bespoke for worklist (not the column-driven FilterBar) */}
      <div
        className="mt-4 mb-4 flex flex-wrap items-center gap-2 animate-fade-up animate-fade-up-delay-2"
        style={{ fontFamily: DM_SANS }}
      >
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 mr-1" style={{ fontFamily: PLEX_MONO }}>
          {t('data.filters.label')}
        </span>

        <SearchPill value={search} onChange={(v) => setSimple('q', v)} placeholder={t('debt.searchHint')} />

        <SelectPill
          label={t('debt.filters.room')}
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

        {tab === 'worklist' && (
          <SelectPill
            label={t('debt.filters.aging')}
            value={agingBucket}
            onChange={(v) => setSimple('aging_bucket', v)}
            options={AGING_BUCKETS.map((b) => ({ value: b, label: t(`debt.aging.${b}`) }))}
          />
        )}

        {tab === 'worklist' && (
          <SelectPill
            label={t('debt.filters.outcome')}
            value={outcome}
            onChange={(v) => setSimple('outcome', v)}
            options={OUTCOMES.map((o) => ({ value: o, label: t(`debt.outcomes.${o}`) }))}
          />
        )}

        {tab === 'worklist' && (
          <ToggleChip checked={overdueOnly} onChange={setOverdue}>
            {t('debt.filters.overduePromisesOnly')}
          </ToggleChip>
        )}

        {activeFiltersCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#9E7B2F] transition-colors ml-auto"
          >
            {t('data.clearAll')} ({activeFiltersCount})
          </button>
        )}
      </div>

      {/* Table per tab */}
      {tab === 'worklist' && (
        <WorklistTable rows={worklistQ.data?.rows ?? []} loading={isLoading} lang={i18n.language} />
      )}
      {tab === 'aging' && (
        <AgingTable rows={agingQ.data?.rows ?? []} loading={isLoading} lang={i18n.language} />
      )}
      {tab === 'prepayments' && (
        <PrepaymentsTable rows={prepaymentsQ.data?.rows ?? []} loading={isLoading} lang={i18n.language} />
      )}

      {/* Folio footer */}
      {total > 0 && (
        <footer
          className="mt-6 pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 text-xs animate-fade-up animate-fade-up-delay-4"
          style={{ fontFamily: DM_SANS }}
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-medium text-foreground tabular-nums" style={{ fontFamily: PLAYFAIR }}>
              {toRomanLower(currentPage)}
              <span className="text-muted-foreground"> {t('data.of')} </span>
              {toRomanLower(totalPages)}
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

      {/* Empty state */}
      {!isLoading && total === 0 && (
        <div className="py-20 text-center animate-fade-up">
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
              onClick={clearFilters}
              className="mt-4 text-[#9E7B2F] hover:text-[#7A5E20] underline decoration-dotted underline-offset-2 text-xs"
              style={{ fontFamily: DM_SANS }}
            >
              {t('data.clearAll')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function TabPill({
  icon: Icon,
  active,
  onClick,
  children,
}: {
  icon: React.ElementType
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
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
      <Icon size={14} aria-hidden />
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4A843]"
        />
      )}
    </button>
  )
}

function Stat({
  label,
  value,
  unit,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  unit?: string
  sub?: string
  tone?: 'default' | 'critical' | 'urgent'
}) {
  const toneClass =
    tone === 'critical' ? 'text-[#F87171]' : tone === 'urgent' ? 'text-[#FB923C]' : 'text-foreground'
  return (
    <div className="glass-card kpi-glow rounded-xl p-4">
      <p
        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em] mb-2"
        style={{ fontFamily: DM_SANS }}
      >
        {label}
      </p>
      <p
        className={cn('text-2xl font-semibold tabular-nums leading-tight', toneClass)}
        style={{ fontFamily: PLAYFAIR }}
      >
        {value}
        {unit && <span className="text-xs text-muted-foreground ml-1.5" style={{ fontFamily: PLEX_MONO }}>{unit}</span>}
      </p>
      {sub && (
        <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: DM_SANS }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function SearchPill({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'month-btn pl-7 normal-case font-normal min-w-48 placeholder:italic placeholder:text-muted-foreground/50',
          value && 'active',
        )}
      />
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-[11px]" aria-hidden>
        🔍
      </span>
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
    </div>
  )
}

function ToggleChip({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn('month-btn inline-flex items-center gap-1.5 normal-case', checked && 'active')}
    >
      <span
        className={cn(
          'w-2 h-2 rounded-full border transition-colors',
          checked ? 'bg-[#D4A843] border-[#9E7B2F]' : 'border-muted-foreground/40',
        )}
      />
      {children}
    </button>
  )
}

// ── Tables ────────────────────────────────────────────────────────────────

function WorklistTable({
  rows,
  loading,
  lang,
}: {
  rows: DebtRow[]
  loading: boolean
  lang: string
}) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto -mx-2 mt-2 animate-fade-up animate-fade-up-delay-3">
      <table className="premium-table w-full text-sm" style={{ fontFamily: DM_SANS }}>
        <thead>
          <tr>
            <Th label={t('debt.cols.client')} />
            <Th label={t('debt.cols.manager')} />
            <Th label={t('debt.cols.region')} />
            <Th label={t('debt.cols.outstanding')} align="right" />
            <Th label={t('debt.cols.daysOverdue')} align="right" />
            <Th label={t('debt.cols.aging')} />
            <Th label={t('debt.cols.lastContact')} />
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-2.5 border-b border-border/40">
                      <div className="shimmer-skeleton h-3 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => {
                const bucket = dominantAgingBucket(row)
                const variant = agingBadgeVariant(row.days_since_payment, bucket)
                return (
                  <tr
                    key={row.person_id}
                    onClick={() => {
                      window.location.href = `/collection/debt/client/${row.person_id}`
                    }}
                    className="cursor-pointer"
                  >
                    <td className="px-3 py-2.5 border-b border-border/40">
                      <Link
                        to={`/collection/debt/client/${row.person_id}`}
                        className="hover:text-[#9E7B2F] transition-colors"
                        style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}
                      >
                        {row.name}
                      </Link>
                      {row.has_overdue_promise && (
                        <span className="ml-2 action-badge urgent">{t('debt.overduePromise')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40 text-muted-foreground">
                      {row.primary_room_name ?? row.owner_name ?? <Empty />}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40 text-muted-foreground">
                      {row.region_name ?? <Empty />}
                    </td>
                    <td
                      className="px-3 py-2.5 border-b border-border/40 text-right tabular-nums font-medium"
                      style={{ fontFamily: PLAYFAIR }}
                    >
                      {formatNumber(row.outstanding)}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40 text-right tabular-nums">
                      {row.days_since_payment !== null ? row.days_since_payment : <Empty />}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40">
                      <span className={`action-badge ${variant}`}>{bucket}</span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40 text-xs text-muted-foreground">
                      {row.last_contact_at ? (
                        <>
                          <span>{formatShortDate(row.last_contact_at, lang)}</span>
                          {row.last_contact_outcome && (
                            <span className="italic ml-1.5">"{row.last_contact_outcome}"</span>
                          )}
                        </>
                      ) : (
                        <Empty />
                      )}
                    </td>
                  </tr>
                )
              })}
        </tbody>
      </table>
    </div>
  )
}

function AgingTable({
  rows,
  loading,
  lang,
}: {
  rows: ClientsAgingRow[]
  loading: boolean
  lang: string
}) {
  const { t } = useTranslation()
  void lang
  return (
    <div className="overflow-x-auto -mx-2 mt-2 animate-fade-up animate-fade-up-delay-3">
      <table className="premium-table w-full text-sm" style={{ fontFamily: DM_SANS }}>
        <thead>
          <tr>
            <Th label={t('debt.cols.client')} />
            <Th label={t('debt.cols.manager')} />
            <Th label={t('debt.cols.totalDebt')} align="right" />
            <Th label={t('debt.cols.notDue')} align="right" />
            <Th label={t('debt.cols.bucket1')} align="right" />
            <Th label={t('debt.cols.bucket2')} align="right" />
            <Th label={t('debt.cols.bucket3')} align="right" />
            <Th label={t('debt.cols.bucket4')} align="right" />
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-3 py-2.5 border-b border-border/40">
                      <div className="shimmer-skeleton h-3 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={row.person_id}
                  onClick={() => {
                    window.location.href = `/collection/debt/client/${row.person_id}`
                  }}
                  className="cursor-pointer"
                >
                  <td className="px-3 py-2.5 border-b border-border/40">
                    <Link
                      to={`/collection/debt/client/${row.person_id}`}
                      className="hover:text-[#9E7B2F] transition-colors"
                      style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}
                    >
                      {row.client_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 border-b border-border/40 text-muted-foreground">
                    {row.manager ?? <Empty />}
                  </td>
                  <td
                    className="px-3 py-2.5 border-b border-border/40 text-right tabular-nums font-medium"
                    style={{ fontFamily: PLAYFAIR }}
                  >
                    {formatNumber(row.total_debt)}
                  </td>
                  <Bucket value={row.not_due} />
                  <Bucket value={row.bucket_1_30} variant="markdown" />
                  <Bucket value={row.bucket_31_60} variant="urgent" />
                  <Bucket value={row.bucket_61_90} variant="urgent" />
                  <Bucket value={row.bucket_90_plus} variant="critical" />
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}

function PrepaymentsTable({
  rows,
  loading,
  lang,
}: {
  rows: PrepaymentRow[]
  loading: boolean
  lang: string
}) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto -mx-2 mt-2 animate-fade-up animate-fade-up-delay-3">
      <table className="premium-table w-full text-sm" style={{ fontFamily: DM_SANS }}>
        <thead>
          <tr>
            <Th label={t('debt.cols.client')} />
            <Th label={t('debt.cols.region')} />
            <Th label={t('debt.cols.creditBalance')} align="right" />
            <Th label={t('debt.cols.lastPayment')} />
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 4 }).map((__, j) => (
                    <td key={j} className="px-3 py-2.5 border-b border-border/40">
                      <div className="shimmer-skeleton h-3 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr key={row.person_id}>
                  <td className="px-3 py-2.5 border-b border-border/40">
                    <Link
                      to={`/collection/debt/client/${row.person_id}`}
                      className="hover:text-[#9E7B2F] transition-colors"
                      style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}
                    >
                      <span className="text-[#D4A843] mr-1.5">◇</span>
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 border-b border-border/40 text-muted-foreground">
                    {row.region_name ?? <Empty />}
                  </td>
                  <td
                    className="px-3 py-2.5 border-b border-border/40 text-right tabular-nums font-medium"
                    style={{ fontFamily: PLAYFAIR }}
                  >
                    {formatCurrency(row.credit_balance, null)}
                  </td>
                  <td className="px-3 py-2.5 border-b border-border/40 text-xs text-muted-foreground">
                    {row.last_payment_date ? formatShortDate(row.last_payment_date, lang) : <Empty />}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ label, align = 'left' }: { label: string; align?: 'left' | 'right' }) {
  return (
    <th
      className={cn(
        'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-b border-border',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {label}
    </th>
  )
}

function Bucket({ value, variant }: { value: number; variant?: 'markdown' | 'urgent' | 'critical' }) {
  if (!value) {
    return (
      <td className="px-3 py-2.5 border-b border-border/40 text-right text-muted-foreground/40">
        —
      </td>
    )
  }
  return (
    <td
      className={cn(
        'px-3 py-2.5 border-b border-border/40 text-right tabular-nums',
        variant === 'critical' && 'text-[#F87171] font-medium',
        variant === 'urgent' && 'text-[#FB923C]',
        variant === 'markdown' && 'text-[#FBBF24]',
      )}
      style={{ fontFamily: variant ? PLAYFAIR : undefined }}
    >
      {formatNumber(value)}
    </td>
  )
}

function Empty() {
  return <span className="cell-empty">—</span>
}

// Reference unused icons to keep noUnusedLocals quiet
void SectionTitle
void X
void Calendar
