import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"

interface Props {
  rowLabels: string[]
  colLabels: string[]
  values: number[][]
  /**
   * Click handler: receives (rowLabel, colLabel, value). Used to open
   * a drill modal when the user clicks a cell.
   */
  onCellClick?: (rowLabel: string, colLabel: string, value: number) => void
  /**
   * Display values as currency (no decimals) or raw integers. Pass
   * 'percent' to format as a percentage with one decimal.
   */
  format?: 'currency' | 'integer' | 'percent'
  /**
   * Color tint for non-zero cells. The cell background is
   * `accentColor + alpha`, where alpha ∈ [0.08, 0.4] proportional to
   * value/max. Use a single hue per matrix.
   */
  accentColor?: string
  /** Small label shown above the matrix (e.g., "RFM segments"). */
  caption?: string
  /** Row-totals column on the right (default true). */
  showRowTotals?: boolean
  /** Column-totals row at the bottom (default true). */
  showColTotals?: boolean
  loading?: boolean
}

const ACCENT_DEFAULT = '#9E7B2F'

export default function MatrixTable({
  rowLabels,
  colLabels,
  values,
  onCellClick,
  format = 'currency',
  accentColor = ACCENT_DEFAULT,
  caption,
  showRowTotals = true,
  showColTotals = true,
  loading,
}: Props) {
  const max = useMemo(() => {
    let m = 0
    for (const r of values) for (const v of r) if (Number.isFinite(v) && v > m) m = v
    return m
  }, [values])

  const rowTotals = useMemo(() => values.map((r) => r.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)), [values])
  const colTotals = useMemo(() => {
    const out: number[] = []
    for (let c = 0; c < colLabels.length; c++) {
      let sum = 0
      for (let r = 0; r < rowLabels.length; r++) {
        const v = values[r]?.[c]
        if (Number.isFinite(v)) sum += v
      }
      out.push(sum)
    }
    return out
  }, [values, rowLabels.length, colLabels.length])

  function fmt(v: number): string {
    if (!Number.isFinite(v) || v === 0) return ''
    if (format === 'percent') return `${(v * 100).toFixed(1)}%`
    if (format === 'integer') return formatNumber(v, { decimals: 0 })
    return formatNumber(v, { decimals: 0 })
  }

  function alpha(v: number): number {
    if (!Number.isFinite(v) || v <= 0 || max <= 0) return 0
    const ratio = v / max
    return 0.08 + ratio * 0.32 // → 0.08 .. 0.40
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shimmer-skeleton h-8 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto -mx-2">
      {caption && (
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 mb-2 px-2" style={{ fontFamily: DM_SANS }}>
          {caption}
        </p>
      )}
      <table className="w-full text-sm border-collapse" style={{ fontFamily: DM_SANS }}>
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-b border-border" />
            {colLabels.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-b border-border whitespace-nowrap"
              >
                {c}
              </th>
            ))}
            {showRowTotals && (
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-b border-border">
                Σ
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((rowLabel, r) => (
            <tr key={rowLabel}>
              <td
                className="px-3 py-2 text-sm font-medium text-foreground/90 border-b border-border/40 whitespace-nowrap"
                style={{ fontFamily: DM_SANS }}
              >
                {rowLabel}
              </td>
              {colLabels.map((colLabel, c) => {
                const v = values[r]?.[c] ?? 0
                const a = alpha(v)
                return (
                  <td
                    key={colLabel}
                    onClick={() => onCellClick && v > 0 && onCellClick(rowLabel, colLabel, v)}
                    className={cn(
                      'px-3 py-2 text-right text-sm tabular-nums border-b border-border/40 transition-colors',
                      onCellClick && v > 0 ? 'cursor-pointer hover:ring-2 hover:ring-[#D4A843]/50 hover:ring-inset' : '',
                    )}
                    style={{
                      fontFamily: PLAYFAIR,
                      backgroundColor: a > 0 ? `${accentColor}${alphaToHex(a)}` : undefined,
                    }}
                  >
                    {fmt(v) || <span className="text-muted-foreground/30">·</span>}
                  </td>
                )
              })}
              {showRowTotals && (
                <td
                  className="px-3 py-2 text-right text-sm tabular-nums border-b border-border/40 font-semibold text-foreground"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  {fmt(rowTotals[r])}
                </td>
              )}
            </tr>
          ))}
          {showColTotals && (
            <tr>
              <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-t border-border">
                Σ
              </td>
              {colLabels.map((c, ci) => (
                <td
                  key={c}
                  className="px-3 py-2.5 text-right text-sm tabular-nums border-t border-border font-semibold text-foreground/80"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  {fmt(colTotals[ci])}
                </td>
              ))}
              {showRowTotals && (
                <td
                  className="px-3 py-2.5 text-right text-sm tabular-nums border-t border-border font-semibold text-foreground"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  {fmt(colTotals.reduce((s, v) => s + v, 0))}
                </td>
              )}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// alpha (0..1) → hex pair "00".."FF"
function alphaToHex(a: number): string {
  const n = Math.max(0, Math.min(255, Math.round(a * 255)))
  return n.toString(16).padStart(2, '0')
}
