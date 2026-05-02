import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, ArrowDownRight, Bell, ClipboardList, Coins, Hourglass } from 'lucide-react'

import { useAuth } from '@/context/AuthContext'
import {
  useDashboardOverview,
  useDebtWorklistPreview,
  useDebtPrepaymentsPreview,
  useSalesRfmSummary,
  useDaysliceProjection,
  dominantAgingBucket,
  type DebtRow,
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
  delta,
  mtdRevenue,
  collectionRatio,
  loading,
}: {
  outstanding: number | null
  delta: number | null
  mtdRevenue: number | null
  collectionRatio: number | null
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  if (loading) {
    return (
      <div className="glass-card kpi-glow rounded-xl p-6 lg:p-8 lg:col-span-7 lg:row-span-3 min-h-[240px] lg:min-h-[320px] animate-fade-up animate-fade-up-delay-1">
        <div className="space-y-4">
          <div className="shimmer-skeleton h-3 w-32" />
          <div className="shimmer-skeleton h-16 w-3/4" />
          <div className="shimmer-skeleton h-4 w-48" />
        </div>
      </div>
    )
  }
  const deltaPositive = (delta ?? 0) >= 0
  const ratioOk = (collectionRatio ?? 0) >= 50
  return (
    <div
      className="glass-card kpi-glow rounded-xl p-6 lg:p-8 lg:col-span-7 lg:row-span-3 flex flex-col justify-between min-h-[240px] lg:min-h-[320px] animate-fade-up animate-fade-up-delay-1"
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
          uzs
        </p>
        {delta !== null && (
          <p className="mt-4 text-sm" style={{ fontFamily: DM_SANS }}>
            <span className={deltaPositive ? 'text-[#F87171]' : 'text-[#34D399]'}>
              {deltaPositive ? '▲' : '▼'} <span className="tabular-nums">{formatNumber(Math.abs(delta))}</span>
            </span>
            <span className="text-muted-foreground"> {t('dashboard.hero.sinceYesterday')}</span>
          </p>
        )}
      </div>

      <div className="mt-auto pt-5 border-t border-border/60 flex items-baseline gap-6 flex-wrap">
        <div>
          <p
            className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground"
            style={{ fontFamily: DM_SANS }}
          >
            {t('dashboard.hero.vsMtdRevenue')}
          </p>
          <p
            className="text-base lg:text-lg font-semibold tabular-nums"
            style={{ fontFamily: PLAYFAIR }}
          >
            {mtdRevenue === null ? '—' : formatCurrency(mtdRevenue, null)}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p
            className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground"
            style={{ fontFamily: DM_SANS }}
          >
            {t('dashboard.hero.collectionRatio')}
          </p>
          <p
            className={`text-base lg:text-lg font-semibold tabular-nums ${ratioOk ? 'text-foreground' : 'text-[#FB923C]'}`}
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

function StackedKpi({
  label,
  value,
  caption,
  glow,
  delay,
  icon: Icon,
  loading,
}: {
  label: string
  value: string
  caption: string
  glow: string
  delay: 2 | 3 | 4
  icon: React.ElementType
  loading: boolean
}) {
  if (loading) {
    return (
      <div className={`glass-card rounded-xl p-4 lg:col-span-5 animate-fade-up animate-fade-up-delay-${delay}`}>
        <div className="space-y-2">
          <div className="shimmer-skeleton h-3 w-24" />
          <div className="shimmer-skeleton h-7 w-32" />
          <div className="shimmer-skeleton h-3 w-20" />
        </div>
      </div>
    )
  }
  return (
    <div
      className={`glass-card kpi-glow rounded-xl p-4 lg:col-span-5 animate-fade-up animate-fade-up-delay-${delay}`}
      style={{ ['--glow-color' as string]: glow } as React.CSSProperties}
    >
      <div className="flex items-start justify-between mb-2">
        <p
          className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em]"
          style={{ fontFamily: DM_SANS }}
        >
          {label}
        </p>
        <div className="p-1.5 rounded-md bg-accent/50">
          <Icon size={13} style={{ color: glow }} />
        </div>
      </div>
      <p
        className="text-2xl font-semibold tabular-nums leading-tight animate-count-up"
        style={{ fontFamily: PLAYFAIR }}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground" style={{ fontFamily: DM_SANS }}>
        {caption}
      </p>
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
  return (
    <Link
      to="/collection/worklist"
      className="glass-card rounded-xl p-6 lg:p-8 lg:col-span-7 animate-fade-up animate-fade-up-delay-2 block group"
    >
      <p
        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-2"
        style={{ fontFamily: DM_SANS }}
      >
        <span className="text-[#D4A843] mr-1.5">◆</span>
        {t('dashboard.firstCall.label')}
      </p>
      <h3
        className="text-2xl font-semibold leading-tight mb-1 group-hover:text-[#9E7B2F] transition-colors"
        style={{ fontFamily: PLAYFAIR }}
      >
        {row.name}
      </h3>
      <p className="text-xs text-muted-foreground mb-4" style={{ fontFamily: DM_SANS }}>
        {t('dashboard.firstCall.manager')} · {row.primary_room_name ?? row.owner_name ?? '—'}
      </p>

      <p
        className="text-3xl font-semibold tabular-nums leading-none"
        style={{ fontFamily: PLAYFAIR }}
      >
        {formatNumber(row.outstanding)}
      </p>
      <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1" style={{ fontFamily: PLEX_MONO }}>
        uzs · {t('dashboard.firstCall.outstanding')}
      </p>

      <div className="mt-5 flex items-baseline gap-3 flex-wrap">
        {daysOverdue !== null && (
          <span className="text-sm" style={{ fontFamily: DM_SANS }}>
            <span className="tabular-nums font-medium">{daysOverdue}</span>{' '}
            <span className="text-muted-foreground">{t('dashboard.firstCall.daysOverdue')}</span>
          </span>
        )}
        <span className={`action-badge ${variant}`}>{bucket}</span>
      </div>

      {row.last_contact_at && (
        <p className="mt-4 text-xs text-muted-foreground italic" style={{ fontFamily: DM_SANS }}>
          {t('dashboard.firstCall.lastContact')} · {formatShortDate(row.last_contact_at, i18n.language)}
          {row.last_contact_outcome ? <> · "{row.last_contact_outcome}"</> : null}
        </p>
      )}

      <p className="mt-6 text-xs text-[#9E7B2F] group-hover:text-[#7A5E20] transition-colors" style={{ fontFamily: DM_SANS }}>
        {t('dashboard.firstCall.openFile')} →
      </p>
    </Link>
  )
}

// ── Prepayments aside ──────────────────────────────────────────────────────

function PrepaymentsAside({ row, loading }: { row: DebtRow | undefined; loading: boolean }) {
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
  return (
    <Link
      to="/collection/worklist"
      className="glass-card rounded-xl p-6 lg:col-span-5 animate-fade-up animate-fade-up-delay-3 block group"
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
            className="text-lg font-semibold mb-1 group-hover:text-[#9E7B2F] transition-colors"
            style={{ fontFamily: PLAYFAIR }}
          >
            <span className="text-[#D4A843] mr-1.5">◇</span>
            {row.name}
          </p>
          <p className="text-xs text-muted-foreground mb-2" style={{ fontFamily: DM_SANS }}>
            {t('dashboard.prepayments.advance')}
          </p>
          <p
            className="text-xl font-semibold tabular-nums"
            style={{ fontFamily: PLAYFAIR }}
          >
            {formatCurrency(Math.abs(row.outstanding), null)}
          </p>
          <p className="mt-2 text-xs italic text-muted-foreground" style={{ fontFamily: DM_SANS }}>
            {t('dashboard.prepayments.awaiting')}
          </p>
        </>
      )}
      <p className="mt-4 text-xs text-[#9E7B2F] group-hover:text-[#7A5E20] transition-colors" style={{ fontFamily: DM_SANS }}>
        {t('dashboard.prepayments.see')} →
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

  // Derived values for the Hero
  const outstanding = (() => {
    // The dashboard/overview endpoint doesn't expose a single "total outstanding"
    // figure; we proxy it from the worklist preview's `total` (count) + a debt sum
    // would require another call. Until then, fall back to the worklist row's
    // outstanding figure as a "lead client" anchor when there's only the preview.
    // TODO Session 3: the worklist endpoint will give us the full sum.
    const top = worklist.data?.rows?.[0]
    return top ? top.outstanding : null
  })()
  const mtdRevenue = overview.data?.today?.payments?.amount ?? null
  // Yesterday delta in outstanding — proxy with delta in unpaid orders.
  const delta = overview.data
    ? overview.data.today.orders.amount - overview.data.yesterday.orders.amount
    : null
  const collectionRatio = (() => {
    const billed = overview.data?.today?.orders?.amount
    const paid = overview.data?.today?.payments?.amount
    if (!billed || !Number.isFinite(billed) || billed === 0) return null
    return ((paid ?? 0) / billed) * 100
  })()

  // Plan progress (admin only — falls back to '—')
  const planProgressPct = (() => {
    if (!dayslice.data) return null
    const { day_n, month_days } = dayslice.data.slice
    const expected = day_n / month_days
    if (!expected) return 0
    const sotuvProj = dayslice.data.projection.sotuv.mean || 0
    const sotuvMtd = dayslice.data.current_mtd.sotuv || 0
    if (sotuvProj === 0) return 0
    return ((sotuvMtd / (sotuvProj * expected)) * 100)
  })()

  return (
    <div>
      <PageHeader />

      <SectionTitle label={t('dashboard.section.ledger')} className="mb-3" />

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 mb-10">
        <HeroDebtCard
          outstanding={outstanding}
          delta={delta}
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
        />

        <StackedKpi
          label={t('dashboard.kpi.planProgress')}
          value={
            !isAdmin
              ? t('dashboard.kpi.adminOnly')
              : planProgressPct === null
              ? '—'
              : formatPercent(planProgressPct, 0)
          }
          caption={
            !isAdmin
              ? t('dashboard.kpi.planAdminCaption')
              : dayslice.data
              ? `${t('dashboard.kpi.day')} ${dayslice.data.slice.day_n} ${t('dashboard.kpi.of')} ${dayslice.data.slice.month_days}`
              : ''
          }
          glow={(planProgressPct ?? 100) < 90 ? '#FB923C' : '#34D399'}
          delay={3}
          icon={(planProgressPct ?? 100) < 90 ? ArrowDownRight : ArrowUpRight}
          loading={isAdmin && dayslice.isLoading}
        />

        <StackedKpi
          label={t('dashboard.kpi.alerts')}
          value="0"
          caption={t('dashboard.kpi.alertsPlaceholder')}
          glow="#F87171"
          delay={4}
          icon={Bell}
          loading={false}
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

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 mb-10">
        <DossierPreview row={worklist.data?.rows?.[0]} loading={worklist.isLoading} />
        <PrepaymentsAside row={prepayments.data?.rows?.[0]} loading={prepayments.isLoading} />
      </section>

      <SectionTitle label={t('dashboard.section.tribe')} className="mb-3" />

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 mb-6">
        <TopSegmentCard distribution={rfm.data?.segment_distribution ?? null} loading={rfm.isLoading} />
        <TrendPlaceholder />
      </section>
    </div>
  )
}

// Reference unused icons to keep TypeScript's `noUnusedLocals` quiet — these
// document the icon vocabulary the page draws from.
void Coins
void Hourglass
void ClipboardList
