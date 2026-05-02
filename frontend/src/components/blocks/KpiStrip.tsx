import { useTranslation } from 'react-i18next'
import {
  DollarSign, TrendingUp, TrendingDown, Percent, Receipt, ShoppingBag, ArrowUpRight, ArrowDownRight,
  Minus, Users, Eye, UserCheck
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmt(n: any): string {
  const v = Number(n)
  if (!v && v !== 0) return '—'
  if (isNaN(v)) return '—'
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B'
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'K'
  return String(Math.round(v))
}

interface KpiCardProps {
  label: string
  value: string
  delta?: number | null
  invertDelta?: boolean
  icon: React.ElementType
  color: string
  primary?: boolean
}

function KpiCard({ label, value, delta, invertDelta, icon: Icon, color, primary }: KpiCardProps) {
  const isPositive = delta != null ? (invertDelta ? delta < 0 : delta > 0) : null
  const DeltaIcon = delta == null ? null : delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus

  if (primary) {
    return (
      <div
        className="glass-card perf-kpi perf-kpi-primary p-4 sm:p-5"
        style={{ '--kpi-accent': color } as React.CSSProperties}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}14` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <span className="text-[11px] sm:text-xs text-muted-foreground font-medium tracking-wide uppercase">{label}</span>
          {delta != null && DeltaIcon && (
            <span className={`ml-auto flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
              isPositive ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
            }`}>
              <DeltaIcon className="w-3 h-3" />
              {Math.abs(delta)}%
            </span>
          )}
        </div>
        <span className="font-bold tabular-nums kpi-value text-2xl sm:text-3xl">{value}</span>
      </div>
    )
  }

  return (
    <div className="glass-card p-3 sm:p-3.5 flex flex-col justify-between min-h-20">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
          <span className="text-[10px] sm:text-[11px] text-muted-foreground font-medium uppercase truncate">{label}</span>
        </div>
        {delta != null && DeltaIcon && (
          <span className={`flex items-center gap-0.5 text-[10px] font-semibold shrink-0 ${
            isPositive ? 'text-emerald-400' : 'text-red-400'
          }`}>
            <DeltaIcon className="w-2.5 h-2.5" />
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <span className="font-bold tabular-nums text-base sm:text-lg mt-1.5">{value}</span>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function KpiStrip({ kpis, conversion }: { kpis: any; conversion: any }) {
  const { t } = useTranslation()

  if (!kpis) return null

  const conv = conversion?.summary || {}

  const cards = [
    { label: t('performance.kpi.revenue', 'Revenue'), value: fmt(kpis.total_revenue), delta: kpis.delta_revenue, icon: DollarSign, color: '#D4A843', primary: true },
    { label: t('performance.kpi.profit', 'Profit'), value: fmt(kpis.total_profit), delta: kpis.delta_profit, icon: TrendingUp, color: '#34D399', primary: true },
    { label: t('performance.kpi.margin', 'Margin'), value: (kpis.margin_pct ?? 0) + '%', delta: kpis.delta_margin, icon: Percent, color: '#60A5FA', primary: true },
    { label: t('performance.kpi.atv', 'ATV'), value: fmt(kpis.atv), delta: kpis.delta_atv, icon: ShoppingBag, color: '#A78BFA', primary: true },
    { label: t('performance.kpi.receipts', 'Receipts'), value: fmt(kpis.receipts), delta: kpis.delta_receipts, icon: Receipt, color: '#F59E0B' },
    { label: t('performance.kpi.units', 'Units'), value: fmt(kpis.total_units), delta: kpis.delta_units, icon: ShoppingBag, color: '#818CF8' },
    { label: t('performance.kpi.discount', 'Discount'), value: (kpis.weighted_discount_pct ?? 0) + '%', delta: kpis.delta_discount, invertDelta: true, icon: TrendingDown, color: '#F87171' },
    { label: t('performance.kpi.returns', 'Returns'), value: (kpis.weighted_return_pct ?? 0) + '%', delta: kpis.delta_return, invertDelta: true, icon: TrendingDown, color: '#FB923C' },
    { label: t('performance.kpi.conversion', 'Conv.'), value: (conv.avg_conversion_pct ?? '—') + '%', icon: Eye, color: '#2DD4BF' },
    { label: t('performance.kpi.purchaseRate', 'Purchase'), value: (conv.avg_purchase_rate ?? '—') + '%', icon: UserCheck, color: '#34D399' },
    { label: t('performance.kpi.rpv', 'Rev/Visit'), value: fmt(conv.revenue_per_visitor), icon: Users, color: '#D4A843' },
    { label: t('performance.kpi.transactions', 'Txns'), value: fmt(conv.total_transactions), icon: Receipt, color: '#60A5FA' },
  ]

  return (
    <div className="space-y-3">
      {/* Primary KPIs — 4 large cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {cards.slice(0, 4).map((c, i) => (
          <KpiCard key={i} {...c} />
        ))}
      </div>
      {/* Secondary KPIs — 2 rows of 4 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {cards.slice(4).map((c, i) => (
          <KpiCard key={i + 4} {...c} />
        ))}
      </div>
    </div>
  )
}
