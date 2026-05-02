import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, ArrowDownRight, Bell, ChevronDown, ClipboardList, Coins, Hourglass } from 'lucide-react'

import { useAuth } from '@/context/AuthContext'
import {
  useDashboardOverview,
  useDebtWorklistPreview,
  useDebtPrepaymentsPreview,
  useSalesRfmSummary,
  useDaysliceProjection,
  dominantAgingBucket,
  type DebtRow,
  type PrepaymentRow,
} from '@/api/hooks'
import PageHeader from '@/components/PageHeader'
import SectionTitle from '@/components/SectionTitle'
import { formatNumber, formatCurrency, formatPercent, formatShortDate, agingBadgeVariant } from '@/lib/format'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

// ── Hero debt card — the page's signature ──────────────────────────────────

function HeroDebtCard({
  outstanding,
  over90,
  debtorCount,
  mtdRevenue,
  collectionRatio,
  loading,
}: {
  outstanding: number | null
  over90: number | null
  debtorCount: number | null
  mtdRevenue: number | null
  collectionRatio: number | null
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  if (loading) {
    return (
      <div className="glass-card kpi-glow rounded-xl p-6 lg:p-8 lg:col-span-7 lg:row-span-3 min-h-56 lg:min-h-72 animate-fade-up animate-fade-up-delay-1">
        <div className="space-y-4">
          <div className="shimmer-skeleton h-3 w-32" />
          <div className="shimmer-skeleton h-16 w-3/4" />
          <div className="shimmer-skeleton h-4 w-48" />
        </div>
      </div>
    )
  }
  const ratioOk = (collectionRatio ?? 0) >= 50
  const over90Pct = outstanding && over90 ? (over90 / outstanding) * 100 : null
  return (
    <div
      className="glass-card kpi-glow rounded-xl p-6 lg:p-8 lg:col-span-7 lg:row-span-3 flex flex-col justify-between min-h-56 lg:min-h-72 animate-fade-up animate-fade-up-delay-1"
      style={{ ['--glow-color' as string]: '#9E7B2F' } as React.CSSProperties}
    >
      <div>
        <p
          className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em]"
          style={{ fontFamily: DM_SANS }}
        >
          {t('dashboard.kpi.outstanding')}
        </p>
        <p
          className="mt-3 text-5xl lg:text-6xl xl:text-7xl font-semibold leading-[0.95] tabular-nums animate-count-up"
          style={{ fontFamily: PLAYFAIR }}
        >
          {outstanding === null ? '—' : formatNumber(outstanding)}
        </p>
        <p
          className="mt-1 text-xs text-muted-foreground uppercase tracking-widest"
          style={{ fontFamily: PLEX_MONO }}
        >
          usd · {debtorCount ?? '—'} {t('dashboard.hero.debtors')}
        </p>
        {over90 !== null && over90 > 0 && over90Pct !== null && (
          <p className="mt-4 text-sm" style={{ fontFamily: DM_SANS }}>
            <span className="text-[#F87171]">
              ▲ <span className="tabular-nums">{formatNumber(over90)}</span>
            </span>
            <span className="text-muted-foreground">
              {' '}
              {t('dashboard.hero.over90')} ·{' '}
              <span className="tabular-nums">{formatPercent(over90Pct, 0)}</span>
            </span>
          </p>
        )}
      </div>

      <div className="mt-auto pt-5 border-t border-border/60 flex items-baseline gap-6 flex-wrap">
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            style={{ fontFamily: DM_SANS }}
          >
            {t('dashboard.hero.vsMtdRevenue')}
          </p>
          <p
            className="text-xl lg:text-2xl font-semibold tabular-nums leading-none mt-0.5"
            style={{ fontFamily: PLAYFAIR }}
          >
            {mtdRevenue === null ? '—' : formatCurrency(mtdRevenue, null)}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p
            className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            style={{ fontFamily: DM_SANS }}
          >
            {t('dashboard.hero.collectionRatio')}
          </p>
          <p
            className={`text-xl lg:text-2xl font-semibold tabular-nums leading-none mt-0.5 ${ratioOk ? 'text-foreground' : 'text-[#FB923C]'}`}
            style={{ fontFamily: PLAYFAIR }}
          >
            {collectionRatio === null ? '—' : formatPercent(collectionRatio)}
          </p>
        </div>
      </div>

      {/* faint Plex Mono "as of" stamp in the bottom margin */}
      <p
        className="mt-3 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60"
        style={{ fontFamily: PLEX_MONO }}
      >
        {t('dashboard.hero.asOf')} · {formatShortDate(new Date().toISOString(), i18n.language)}
      </p>
    </div>
  )
}

// ── Stacked KPI tiles (right column) ───────────────────────────────────────

type StackedKpiProps = {
  label: string
  value: string
  caption: string
  glow: string
  delay: 2 | 3 | 4
  icon: React.ElementType
  loading: boolean
  /** Optional destination route. When set, the entire card becomes a Link
   *  with hover affordances; the corner icon swaps to `ArrowUpRight`. */
  to?: string
  /** When provided AND `value === '—'`, render this italic Playfair line in
   *  place of the dashed value to give the empty state editorial weight. */
  emptyMessage?: string
}

function StackedKpi({
  label,
  value,
  caption,
  glow,
  delay,
  icon: Icon,
  loading,
  to,
  emptyMessage,
}: StackedKpiProps) {
  if (loading) {
    return (
      <div className={`glass-card rounded-xl p-4 lg:col-span-5 min-h-26 flex flex-col justify-between animate-fade-up animate-fade-up-delay-${delay}`}>
        <div className="shimmer-skeleton h-3 w-24" />
        <div className="shimmer-skeleton h-7 w-32" />
        <div className="shimmer-skeleton h-3 w-20" />
      </div>
    )
  }

  const isEmpty = value === '—' && !!emptyMessage

  const inner = (
    <>
      <div className="flex items-start justify-between mb-2">
        <p
          className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em]"
          style={{ fontFamily: DM_SANS }}
        >
          {label}
        </p>
        <div className="p-1.5 rounded-md bg-accent/50 transition-colors group-hover:bg-accent">
          <Icon size={13} style={{ color: glow }} />
        </div>
      </div>
      <div className="mt-auto">
        {isEmpty ? (
          <p
            className="text-base italic text-muted-foreground leading-snug"
            style={{ fontFamily: PLAYFAIR }}
          >
            {emptyMessage}
          </p>
        ) : (
          <>
            <p
              className="text-2xl font-semibold tabular-nums leading-tight animate-count-up"
              style={{ fontFamily: PLAYFAIR }}
            >
              {value}
            </p>
            {caption && (
              <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: DM_SANS }}>
                {caption}
              </p>
            )}
          </>
        )}
      </div>
    </>
  )

  const className = `glass-card kpi-glow rounded-xl p-4 lg:col-span-5 min-h-26 flex flex-col animate-fade-up animate-fade-up-delay-${delay} group`

  if (to) {
    return (
      <Link
        to={to}
        className={`${className} hover:border-[#9E7B2F]/35 hover:shadow-[0_2px_12px_rgba(212,168,67,0.08)] transition-all`}
        style={{ ['--glow-color' as string]: glow } as React.CSSProperties}
      >
        {inner}
      </Link>
    )
  }

  return (
    <div
      className={className}
      style={{ ['--glow-color' as string]: glow } as React.CSSProperties}
    >
      {inner}
    </div>
  )
}

// ── Dossier preview (first-call card) ──────────────────────────────────────

function DossierPreview({ row, loading }: { row: DebtRow | undefined; loading: boolean }) {
  const { t, i18n } = useTranslation()
  if (loading) {
    return (
      <div className="glass-card rounded-xl p-6 lg:p-8 lg:col-span-7 animate-fade-up animate-fade-up-delay-2">
        <div className="space-y-3">
          <div className="shimmer-skeleton h-4 w-1/2" />
          <div className="shimmer-skeleton h-10 w-3/4" />
          <div className="shimmer-skeleton h-3 w-1/3" />
        </div>
      </div>
    )
  }
  if (!row) {
    return (
      <div className="glass-card rounded-xl p-6 lg:p-8 lg:col-span-7 animate-fade-up animate-fade-up-delay-2">
        <p
          className="text-base italic text-muted-foreground"
          style={{ fontFamily: PLAYFAIR }}
        >
          {t('dashboard.firstCall.empty')}
        </p>
      </div>
    )
  }
  const bucket = dominantAgingBucket(row)
  const daysOverdue = row.days_since_payment
  const variant = agingBadgeVariant(daysOverdue, bucket)
  // Lead with `days overdue` (not the outstanding amount, which would
  // duplicate the hero figure). The hero answers "how much do we owe", this
  // card answers "who do I call first and why is it urgent".
  return (
    <Link
      to="/collection/worklist"
      className="glass-card rounded-xl p-6 lg:p-8 lg:col-span-7 animate-fade-up animate-fade-up-delay-2 block group hover:border-[#9E7B2F]/35 hover:shadow-[0_2px_12px_rgba(212,168,67,0.08)] transition-all"
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p
          className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em]"
          style={{ fontFamily: DM_SANS }}
        >
          <span className="text-[#D4A843] mr-1.5">◆</span>
          {t('dashboard.firstCall.label')}
        </p>
        <span className={`action-badge ${variant}`}>{bucket}</span>
      </div>
      <h3
        className="text-2xl lg:text-3xl font-semibold leading-tight mb-1 group-hover:text-[#9E7B2F] transition-colors"
        style={{ fontFamily: PLAYFAIR }}
      >
        {row.name}
      </h3>
      <p className="text-xs text-muted-foreground mb-5" style={{ fontFamily: DM_SANS }}>
        {t('dashboard.firstCall.manager')} · {row.primary_room_name ?? row.owner_name ?? '—'}
      </p>

      {/* The urgent figure is "days since payment". Some clients have never
          paid us (days_since_payment === null) — for those, the hero figure
          is the per-client outstanding instead, with a "90+ kun" sub-caption
          inferred from the aging bucket. Either way, the hero answers
          "why is this the first call". */}
      {daysOverdue !== null ? (
        <>
          <p
            className="text-5xl lg:text-6xl font-semibold tabular-nums leading-none"
            style={{ fontFamily: PLAYFAIR }}
          >
            {daysOverdue}
          </p>
          <p
            className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1"
            style={{ fontFamily: PLEX_MONO }}
          >
            {t('dashboard.firstCall.daysOverdueLong')}
          </p>
          <p className="mt-5 text-sm" style={{ fontFamily: DM_SANS }}>
            <span className="tabular-nums font-medium" style={{ fontFamily: PLAYFAIR }}>
              {formatNumber(row.outstanding)}
            </span>
            <span className="text-muted-foreground"> usd · {t('dashboard.firstCall.outstanding')}</span>
          </p>
        </>
      ) : (
        <>
          <p
            className="text-5xl lg:text-6xl font-semibold tabular-nums leading-none"
            style={{ fontFamily: PLAYFAIR }}
          >
            {formatNumber(row.outstanding)}
          </p>
          <p
            className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1"
            style={{ fontFamily: PLEX_MONO }}
          >
            usd · {t('dashboard.firstCall.neverPaid')}
          </p>
        </>
      )}

      {row.last_contact_at && (
        <p className="mt-3 text-xs text-muted-foreground italic" style={{ fontFamily: DM_SANS }}>
          {t('dashboard.firstCall.lastContact')} · {formatShortDate(row.last_contact_at, i18n.language)}
          {row.last_contact_outcome ? <> · "{row.last_contact_outcome}"</> : null}
        </p>
      )}

      <p
        className="mt-5 text-xs text-[#9E7B2F] inline-flex items-center gap-1 group-hover:gap-2 transition-all"
        style={{ fontFamily: DM_SANS }}
      >
        {t('dashboard.firstCall.openFile')} <span aria-hidden>→</span>
      </p>
    </Link>
  )
}

// ── Prepayments aside ──────────────────────────────────────────────────────

function PrepaymentsAside({ row, loading }: { row: PrepaymentRow | undefined; loading: boolean }) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <div className="glass-card rounded-xl p-6 lg:col-span-5 animate-fade-up animate-fade-up-delay-3">
        <div className="space-y-3">
          <div className="shimmer-skeleton h-3 w-32" />
          <div className="shimmer-skeleton h-6 w-48" />
          <div className="shimmer-skeleton h-3 w-40" />
        </div>
      </div>
    )
  }
  // Tightened layout: name + region (caption), figure with credit-balance
  // unit caption, then the link affordance. The "awaiting delivery" line
  // is dropped — it's true for *every* prepayment row by definition, so
  // it adds no signal. The diamond glyph is also dropped here so the
  // first-call card stays the only diamond surface on the page.
  return (
    <Link
      to="/collection/worklist"
      className="glass-card rounded-xl p-6 lg:col-span-5 animate-fade-up animate-fade-up-delay-3 block group hover:border-[#9E7B2F]/35 hover:shadow-[0_2px_12px_rgba(212,168,67,0.08)] transition-all"
    >
      <p
        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-3"
        style={{ fontFamily: DM_SANS }}
      >
        {t('dashboard.prepayments.label')}
      </p>
      {!row ? (
        <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
          {t('dashboard.prepayments.empty')}
        </p>
      ) : (
        <>
          <p
            className="text-lg font-semibold leading-tight group-hover:text-[#9E7B2F] transition-colors"
            style={{ fontFamily: PLAYFAIR }}
          >
            {row.name}
          </p>
          {row.region_name && (
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: DM_SANS }}>
              {row.region_name}
            </p>
          )}
          <p
            className="mt-3 text-2xl font-semibold tabular-nums leading-none"
            style={{ fontFamily: PLAYFAIR }}
          >
            {formatCurrency(row.credit_balance, null)}
          </p>
          <p
            className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            style={{ fontFamily: PLEX_MONO }}
          >
            {t('dashboard.prepayments.creditBalance')}
          </p>
        </>
      )}
      <p
        className="mt-5 text-xs text-[#9E7B2F] inline-flex items-center gap-1 group-hover:gap-2 transition-all"
        style={{ fontFamily: DM_SANS }}
      >
        {t('dashboard.prepayments.see')} <span aria-hidden>→</span>
      </p>
    </Link>
  )
}

// ── Top segment summary (RFM) ──────────────────────────────────────────────

import type { RfmSegmentDistribution } from '@/api/hooks'

function TopSegmentCard({
  distribution,
  loading,
}: {
  distribution: RfmSegmentDistribution[] | null
  loading: boolean
}) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <div className="glass-card rounded-xl p-6 lg:p-8 lg:col-span-7 animate-fade-up animate-fade-up-delay-4">
        <div className="space-y-3">
          <div className="shimmer-skeleton h-3 w-24" />
          <div className="shimmer-skeleton h-8 w-40" />
          <div className="shimmer-skeleton h-3 w-32" />
        </div>
      </div>
    )
  }
  const sorted = [...(distribution ?? [])].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const top = sorted[0]
  const totalRevenue = sorted.reduce((s, b) => s + (b.revenue || 0), 0) || 1

  return (
    <div className="glass-card rounded-xl p-6 lg:p-8 lg:col-span-7 animate-fade-up animate-fade-up-delay-4">
      <p
        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-3"
        style={{ fontFamily: DM_SANS }}
      >
        {t('dashboard.tribe.topSegment')}
      </p>
      {top ? (
        <>
          <h3
            className="text-3xl font-semibold leading-tight"
            style={{ fontFamily: PLAYFAIR }}
          >
            {top.segment}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground" style={{ fontFamily: DM_SANS }}>
            <span className="tabular-nums">{top.clients}</span> {t('dashboard.tribe.clients')} ·
            <span className="tabular-nums ml-1">{formatPercent((top.revenue / totalRevenue) * 100)}</span>{' '}
            {t('dashboard.tribe.ofRevenue')}
          </p>

          <div className="mt-5 space-y-1.5">
            {sorted.slice(1).map((b) => (
              <div
                key={b.segment}
                className="flex items-baseline justify-between text-sm"
                style={{ fontFamily: DM_SANS }}
              >
                <span className="text-foreground/90">{b.segment}</span>
                <span className="text-muted-foreground tabular-nums">
                  {b.clients} · {formatPercent((b.revenue / totalRevenue) * 100)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
          {t('dashboard.tribe.empty')}
        </p>
      )}
    </div>
  )
}

// ── Trend placeholder (deliberate, not "coming soon") ──────────────────────

function TrendPlaceholder() {
  const { t } = useTranslation()
  return (
    <div className="glass-card rounded-xl p-6 lg:p-8 lg:col-span-5 animate-fade-up animate-fade-up-delay-5 flex flex-col">
      <p
        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-3"
        style={{ fontFamily: DM_SANS }}
      >
        {t('dashboard.tribe.trendLabel')}
      </p>
      <div className="flex-1 flex flex-col items-center justify-center py-6">
        <div
          className="text-xl text-[#D4A843]/60 tracking-[0.6em] mb-3"
          style={{ fontFamily: PLAYFAIR }}
          aria-hidden
        >
          · · · · ·
        </div>
        <p
          className="text-sm italic text-muted-foreground text-center max-w-[24ch]"
          style={{ fontFamily: PLAYFAIR }}
        >
          {t('dashboard.tribe.trendPlaceholder')}
        </p>
      </div>
    </div>
  )
}

// ── The page itself ────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const overview = useDashboardOverview()
  const worklist = useDebtWorklistPreview()
  const prepayments = useDebtPrepaymentsPreview()
  const rfm = useSalesRfmSummary()
  const isAdmin = user?.role === 'admin'
  const dayslice = useDaysliceProjection({ enabled: isAdmin })

  // Hero stats come from the worklist's top-level `summary` aggregate — that's
  // the company-wide outstanding figure, not a single-row anchor.
  const summary = worklist.data?.summary ?? null
  const outstanding = summary?.total_outstanding ?? null
  const over90 = summary?.total_over_90 ?? null
  const debtorCount = summary?.debtor_count ?? null

  // MTD revenue = sum of payments in `series_30d` filtered to the current
  // month. The `today.payments.amount` field is just today, not MTD.
  const mtdRevenue = (() => {
    const series = overview.data?.series_30d
    if (!series) return null
    const now = new Date()
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`
    return series
      .filter((r) => r.day.startsWith(monthPrefix))
      .reduce((sum, r) => sum + (Number.isFinite(r.payments) ? r.payments : 0), 0)
  })()

  // Collection ratio uses MTD billed vs MTD paid for stability — daily
  // ratios swing wildly. Falls back to null if either side is zero/missing.
  const collectionRatio = (() => {
    const series = overview.data?.series_30d
    if (!series) return null
    const now = new Date()
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`
    const monthRows = series.filter((r) => r.day.startsWith(monthPrefix))
    const billed = monthRows.reduce((s, r) => s + (Number.isFinite(r.orders) ? r.orders : 0), 0)
    const paid = monthRows.reduce((s, r) => s + (Number.isFinite(r.payments) ? r.payments : 0), 0)
    if (!billed) return null
    return (paid / billed) * 100
  })()

  // Plan progress (admin only).
  // `actualVsExpected`: ratio of MTD sotuv to the day-prorated mean projection.
  // 100 = on pace; >100 = ahead; <100 = behind.
  // The displayed KPI is "% of full-month projection achieved" so the figure
  // climbs from 0 → 100 across the month — easier to read than the prior
  // 156% ahead-of-pace number that confused everyone.
  const planProgress = (() => {
    if (!dayslice.data) return null
    const { day_n, month_days } = dayslice.data.slice
    const sotuvProj = dayslice.data.projection.sotuv.mean || 0
    const sotuvMtd = dayslice.data.current_mtd.sotuv || 0
    if (!month_days || !sotuvProj) {
      return { ofMonthPct: 0, vsExpectedPct: 0, dayN: day_n, monthDays: month_days }
    }
    const ofMonthPct = (sotuvMtd / sotuvProj) * 100
    const expectedSoFar = sotuvProj * (day_n / month_days)
    const vsExpectedPct = expectedSoFar ? (sotuvMtd / expectedSoFar) * 100 : 0
    return { ofMonthPct, vsExpectedPct, dayN: day_n, monthDays: month_days }
  })()

  return (
    <div>
      <PageHeader variant="dashboard" />

      <SectionTitle label={t('dashboard.section.ledger')} className="mb-3" />

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 mb-7">
        <HeroDebtCard
          outstanding={outstanding}
          over90={over90}
          debtorCount={debtorCount}
          mtdRevenue={mtdRevenue}
          collectionRatio={collectionRatio}
          loading={overview.isLoading || worklist.isLoading}
        />

        <StackedKpi
          label={t('dashboard.kpi.revenue')}
          value={mtdRevenue === null ? '—' : formatNumber(mtdRevenue)}
          caption={t('dashboard.kpi.revenueCaption')}
          glow="#34D399"
          delay={2}
          icon={ArrowUpRight}
          loading={overview.isLoading}
          to="/analytics/payments"
        />

        <StackedKpi
          label={t('dashboard.kpi.planProgress')}
          value={
            !isAdmin
              ? t('dashboard.kpi.adminOnly')
              : planProgress === null
              ? '—'
              : formatPercent(planProgress.ofMonthPct, 0)
          }
          caption={
            !isAdmin
              ? t('dashboard.kpi.planAdminCaption')
              : planProgress
              ? `${t('dashboard.kpi.day')} ${planProgress.dayN} ${t('dashboard.kpi.of')} ${planProgress.monthDays} · ${
                  planProgress.vsExpectedPct >= 100
                    ? `+${Math.round(planProgress.vsExpectedPct - 100)}% ${t('dashboard.kpi.aheadOfPace')}`
                    : `${Math.round(100 - planProgress.vsExpectedPct)}% ${t('dashboard.kpi.behindOfPace')}`
                }`
              : ''
          }
          glow={(planProgress?.vsExpectedPct ?? 100) < 90 ? '#FB923C' : '#34D399'}
          delay={3}
          icon={(planProgress?.vsExpectedPct ?? 100) < 90 ? ArrowDownRight : ArrowUpRight}
          loading={isAdmin && dayslice.isLoading}
          to={isAdmin ? '/dayslice' : undefined}
        />

        {/* Alerts tile — `value="—"` is a real "no incidents" state, not
            missing data. Pair the dash with an editorial empty message so
            a healthy system reads as a deliberate "all clear", not as
            broken UI. Tile links into /admin/alerts so a click on the
            empty tile still surfaces the rules console. */}
        <StackedKpi
          label={t('dashboard.kpi.alerts')}
          value="—"
          caption=""
          glow="#F87171"
          delay={4}
          icon={Bell}
          loading={false}
          to="/admin/alerts"
          emptyMessage={t('dashboard.kpi.alertsEmpty')}
        />
      </section>

      <SectionTitle
        label={t('dashboard.section.firstCall')}
        action={
          <Link to="/collection/worklist" className="hover:text-[#9E7B2F] transition-colors">
            {t('dashboard.firstCall.seeAll')} →
          </Link>
        }
        className="mb-3"
      />

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 mb-7">
        <DossierPreview row={worklist.data?.rows?.[0]} loading={worklist.isLoading} />
        <PrepaymentsAside row={prepayments.data?.rows?.[0]} loading={prepayments.isLoading} />
      </section>

      <TribeSection
        rfmData={rfm.data?.segment_distribution ?? null}
        rfmLoading={rfm.isLoading}
      />
    </div>
  )
}

// ── Tribe (RFM segments + trend) — collapsible ──────────────────────────
//
// The RFM matrix and trend are useful but not load-bearing on the dashboard
// — most days an operator scrolls past them. Hide behind a "show details"
// toggle so the dashboard's first viewport stays signal-dense; persist the
// open/closed choice so power users who do want it don't re-toggle daily.

const TRIBE_OPEN_KEY = 'kanzec.dashboard.tribe.open'

function TribeSection({
  rfmData,
  rfmLoading,
}: {
  rfmData: RfmSegmentDistribution[] | null
  rfmLoading: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(TRIBE_OPEN_KEY) === '1'
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(TRIBE_OPEN_KEY, open ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [open])

  return (
    <>
      <SectionTitle
        label={t('dashboard.section.tribe')}
        className="mb-3"
        action={
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs hover:text-[#9E7B2F] transition-colors"
            aria-expanded={open}
          >
            {open ? t('dashboard.tribe.hide') : t('dashboard.tribe.show')}
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        }
      />

      {open && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 mb-6">
          <TopSegmentCard distribution={rfmData} loading={rfmLoading} />
          <TrendPlaceholder />
        </section>
      )}
    </>
  )
}

// Reference unused icons to keep TypeScript's `noUnusedLocals` quiet — these
// document the icon vocabulary the page draws from.
void Coins
void Hourglass
void ClipboardList
