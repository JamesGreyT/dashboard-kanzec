import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toRomanLower } from '@/lib/format'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"

export type Column<T> = {
  key: string
  label: string
  align?: 'left' | 'right'
  /** sort key on the backend (`sort=field:dir`). Omit if not sortable. */
  sortKey?: string
  render: (row: T) => React.ReactNode
  /** Width hint for visual rhythm (Tailwind class). */
  width?: string
}

interface Props<T> {
  rows: T[]
  total: number
  columns: Column<T>[]
  /** "field:dir" — must match the backend's `sort` param. */
  sort: string
  onSortChange: (sort: string) => void
  page: number
  size: number
  onPage: (n: number) => void
  loading?: boolean
  exportHref?: string
  emptyHint?: string
}

const PAGE_SIZES = [25, 50, 100, 200] as const

export default function RankedTable<T extends { person_id?: number | string }>({
  rows,
  total,
  columns,
  sort,
  onSortChange,
  page,
  size,
  onPage,
  loading,
  exportHref,
  emptyHint,
}: Props<T>) {
  const { t } = useTranslation()
  const [pageSize, setPageSize] = useState(size)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = page + 1
  const showingFrom = total ? page * pageSize + 1 : 0
  const showingTo = Math.min((page + 1) * pageSize, total)

  function toggleSort(col: Column<T>) {
    if (!col.sortKey) return
    const [field, dir] = sort.split(':')
    const next = field === col.sortKey && dir === 'desc' ? `${col.sortKey}:asc` : `${col.sortKey}:desc`
    onSortChange(next)
  }

  return (
    <div>
      <div className="overflow-x-auto -mx-2">
        <table className="premium-table w-full text-sm" style={{ fontFamily: DM_SANS }}>
          <thead>
            <tr>
              {columns.map((col) => {
                const [field, dir] = sort.split(':')
                const isActive = col.sortKey === field
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col)}
                    className={cn(
                      'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] border-b border-border select-none',
                      col.sortKey ? 'cursor-pointer hover:text-foreground' : '',
                      isActive ? 'text-[#9E7B2F]' : 'text-muted-foreground',
                      col.align === 'right' ? 'text-right' : 'text-left',
                      col.width,
                    )}
                  >
                    <span className="inline-flex items-baseline gap-1">
                      {col.label}
                      {col.sortKey && isActive && (
                        dir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-2.5 border-b border-border/40">
                        <div className="shimmer-skeleton h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.length === 0
              ? <tr><td colSpan={columns.length} className="py-12 text-center text-sm italic text-muted-foreground" style={{ fontFamily: PLAYFAIR }}>
                  {emptyHint ?? t('debt.empty.line2')}
                </td></tr>
              : rows.map((row, idx) => (
                  <tr key={(row.person_id as number | string | undefined) ?? idx}>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-3 py-2.5 border-b border-border/40',
                          col.align === 'right' ? 'text-right tabular-nums' : '',
                        )}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Footer: foliation + page size + prev/next + export */}
      {total > 0 && (
        <footer
          className="mt-4 pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 text-xs"
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
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {t('data.rowsPerFolio')}
              </span>
              {PAGE_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setPageSize(n)
                    onPage(0)
                    // The parent owns `size`; we just nudge the page back to 0.
                    // Page size itself comes from the parent's state.
                  }}
                  className={cn('month-btn', size === n && 'active')}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => onPage(Math.max(0, page - 1))}
                className="px-3 py-1.5 hover:bg-accent/60 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ‹ {t('data.prev')}
              </button>
              <button
                type="button"
                disabled={(page + 1) * pageSize >= total}
                onClick={() => onPage(page + 1)}
                className="px-3 py-1.5 hover:bg-accent/60 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                {t('data.next')} ›
              </button>
            </div>
            {exportHref && (
              <a
                href={exportHref}
                download
                className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-[#9E7B2F] transition-colors ml-2"
                style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
              >
                ↓ xlsx
              </a>
            )}
          </div>
        </footer>
      )}
    </div>
  )
}

// ── Sparkline cell ────────────────────────────────────────────────────────
// Tiny SVG sparkline for the "Top clients" ranked tables. No Plotly here —
// these need to be cheap to render in a long table.

export function Sparkline({ values, width = 60, height = 18 }: { values: number[]; width?: number; height?: number }) {
  if (!values || values.length < 2) return <span className="cell-empty">—</span>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stride = width / (values.length - 1)
  const points = values
    .map((v, i) => `${(i * stride).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline
        fill="none"
        stroke="#9E7B2F"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  )
}

// ── Delta cell ────────────────────────────────────────────────────────────

export function Delta({ value, decimals = 1 }: { value: number | null | undefined; decimals?: number }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="cell-empty">—</span>
  }
  const pct = value * 100
  const positive = pct >= 0
  return (
    <span className={cn('inline-flex items-baseline gap-0.5 tabular-nums', positive ? 'text-[#34D399]' : 'text-[#F87171]')}>
      {positive ? '▲' : '▼'} {formatNumber(Math.abs(pct), { decimals })}%
    </span>
  )
}
