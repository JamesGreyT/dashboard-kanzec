import { useTranslation } from 'react-i18next'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DeltaBlock } from '@/api/hooks'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

interface Props {
  label: string
  block: Pick<DeltaBlock, 'current'> & Partial<Pick<DeltaBlock, 'mom_pct' | 'yoy_pct' | 'prior'>>
  unit?: string
  decimals?: number
  /** Override current value if you need to format manually. */
  valueOverride?: string
  /** Lower-is-better (e.g. DSO, churn) — flips delta colors. */
  inverse?: boolean
  delay?: 1 | 2 | 3 | 4 | 5
  loading?: boolean
}

export default function KpiDelta({
  label,
  block,
  unit,
  decimals = 0,
  valueOverride,
  inverse = false,
  delay = 1,
  loading,
}: Props) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className={`glass-card rounded-xl p-4 min-h-26 flex flex-col justify-between animate-fade-up animate-fade-up-delay-${delay}`}>
        <div className="shimmer-skeleton h-3 w-24" />
        <div className="shimmer-skeleton h-7 w-32 my-1" />
        <div className="shimmer-skeleton h-3 w-20" />
      </div>
    )
  }

  return (
    <div
      className={`glass-card kpi-glow rounded-xl p-4 min-h-26 flex flex-col animate-fade-up animate-fade-up-delay-${delay}`}
      style={{ ['--glow-color' as string]: '#9E7B2F' } as React.CSSProperties}
    >
      <p
        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em]"
        style={{ fontFamily: DM_SANS }}
      >
        {label}
      </p>
      <p
        className="mt-auto text-2xl font-semibold tabular-nums leading-tight animate-count-up"
        style={{ fontFamily: PLAYFAIR }}
      >
        {valueOverride ?? formatNumber(block.current, { decimals })}
        {unit && (
          <span className="text-xs text-muted-foreground ml-1.5" style={{ fontFamily: PLEX_MONO }}>
            {unit}
          </span>
        )}
      </p>
      <div className="mt-1 flex items-baseline gap-2 text-[11px]" style={{ fontFamily: DM_SANS }}>
        {typeof block.mom_pct === 'number' && Number.isFinite(block.mom_pct) && (
          <Pct value={block.mom_pct} inverse={inverse} caption={t('analytics.kpi.mom')} />
        )}
        {typeof block.yoy_pct === 'number' && Number.isFinite(block.yoy_pct) && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <Pct value={block.yoy_pct} inverse={inverse} caption={t('analytics.kpi.yoy')} />
          </>
        )}
      </div>
    </div>
  )
}

function Pct({ value, inverse, caption }: { value: number; inverse: boolean; caption: string }) {
  const pct = value * 100
  const positive = pct >= 0
  // For inverse metrics (lower is better), positive=red, negative=green
  const good = inverse ? !positive : positive
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={cn('tabular-nums', good ? 'text-[#34D399]' : 'text-[#F87171]')}>
        {positive ? '▲' : '▼'} {formatNumber(Math.abs(pct), { decimals: 1 })}%
      </span>
      <span className="text-muted-foreground/70">{caption}</span>
    </span>
  )
}
