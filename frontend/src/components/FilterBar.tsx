import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronDown, X, SlidersHorizontal } from 'lucide-react'

import {
  useDataDistinct,
  type Column,
  type FilterTriple,
  type TableSchema,
} from '@/api/hooks'
import { isIdLike } from '@/lib/format'
import { cn } from '@/lib/utils'

const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

interface Props {
  schema: TableSchema
  filters: FilterTriple[]
  onUpsert: (col: string, filter: FilterTriple | null) => void
  onUpsertRange: (col: string, fromIso: string | null, toIso: string | null) => void
  onRemove: (idx: number) => void
  onClearAll: () => void
}

/**
 * Picks which columns get a top-level featured filter chip in the bar.
 *
 * Rules:
 *  - The first date / timestamp column always gets a date-range chip
 *    (rendered as one calendar trigger that writes two filter triples).
 *  - Any text column that has the `in` operator AND lacks `ilike` is treated
 *    as enum-like (limited cardinality, e.g. `payment_method`, `direction`,
 *    `client_group`, `currency`) — gets a select chip with /distinct values.
 *  - Up to 3 enum chips total, ranked by likelihood of being load-bearing
 *    (a hardcoded priority list: direction, client_group, payment_method,
 *    currency, region_name, brand, then any other enum-like column).
 */
function pickFeatured(schema: TableSchema): {
  dateCol: Column | null
  enumCols: Column[]
} {
  const visible = schema.columns.filter((c) => c.visible)
  const dateCol = visible.find((c) => c.type === 'date' || c.type === 'timestamp') ?? null

  const PRIORITY = [
    'direction',
    'client_group',
    'payment_method',
    'currency',
    'region_name',
    'region',
    'brand',
    'category',
    'aging_bucket',
    'room_name',
    'group_name2',
    'person_as_name',
  ]
  // Pure enums (`in`-only, no `ilike`): payment_method, currency, direction,
  // client_group. These ALWAYS get a chip.
  const pureEnums = visible.filter(
    (c) =>
      c.type === 'text' &&
      !isIdLike(c) &&
      c.ops.includes('in') &&
      !c.ops.includes('ilike'),
  )
  // Text columns with `ilike` BUT named on the PRIORITY list still get a
  // chip (with an `=` op), because they're load-bearing per-table:
  // room_name on orders, brand on orders, region_name on legal-persons, etc.
  const featuredText = visible.filter(
    (c) =>
      c.type === 'text' &&
      !isIdLike(c) &&
      PRIORITY.includes(c.name) &&
      !pureEnums.includes(c),
  )
  const ranked = [...pureEnums, ...featuredText].sort((a, b) => {
    const ai = PRIORITY.indexOf(a.name)
    const bi = PRIORITY.indexOf(b.name)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  return { dateCol, enumCols: ranked.slice(0, 3) }
}

export default function FilterBar({
  schema,
  filters,
  onUpsert,
  onUpsertRange,
  onRemove,
  onClearAll,
}: Props) {
  const { t } = useTranslation()
  const { dateCol, enumCols } = useMemo(() => pickFeatured(schema), [schema])

  // Active filters keyed by column for fast lookup in chip rendering
  const filtersByCol = useMemo(() => {
    const m = new Map<string, FilterTriple[]>()
    for (const f of filters) {
      const list = m.get(f.col) ?? []
      list.push(f)
      m.set(f.col, list)
    }
    return m
  }, [filters])

  const featuredCols = new Set(
    [dateCol?.name, ...enumCols.map((c) => c.name)].filter(Boolean) as string[],
  )
  // Filters not covered by a featured chip — render as removable chips at end
  const otherFilters = filters
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => !featuredCols.has(f.col))

  const totalActive = filters.length
  const featuredHasAny =
    (dateCol && filtersByCol.get(dateCol.name)?.length) ||
    enumCols.some((c) => filtersByCol.get(c.name)?.length)

  return (
    <div
      className="mt-4 mb-2 animate-fade-up animate-fade-up-delay-2"
      style={{ fontFamily: DM_SANS }}
    >
      {/* Featured filter row */}
      <div className="flex items-center flex-wrap gap-2">
        <span
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 mr-1"
          style={{ fontFamily: PLEX_MONO }}
        >
          <SlidersHorizontal size={10} aria-hidden />
          {t('data.filters.label')}
        </span>

        {dateCol && (
          <DateRangeFilter
            col={dateCol}
            filters={filtersByCol.get(dateCol.name) ?? []}
            onApply={(from, to) => onUpsertRange(dateCol.name, from, to)}
          />
        )}

        {enumCols.map((col) => (
          <EnumSelectFilter
            key={col.name}
            tableKey={schema.key}
            col={col}
            active={filtersByCol.get(col.name)?.[0] ?? null}
            onApply={(f) => onUpsert(col.name, f)}
          />
        ))}

        {/* Filters in URL state that aren't featured render as chips here too */}
        {otherFilters.map(({ f, idx }) => {
          const colMeta = schema.columns.find((c) => c.name === f.col)
          return (
            <button
              key={`other-${idx}`}
              type="button"
              onClick={() => onRemove(idx)}
              className="month-btn active inline-flex items-center gap-1.5 group"
              title={t('data.clickToRemove')}
            >
              <span>{colMeta?.label ?? f.col}</span>
              <span className="text-muted-foreground/80">{f.op}</span>
              <span className="font-semibold">{f.value}</span>
              <X
                size={10}
                className="text-muted-foreground/60 group-hover:text-red-500 transition-colors"
                aria-hidden
              />
            </button>
          )
        })}

        {totalActive > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#9E7B2F] transition-colors ml-auto"
          >
            {t('data.clearAll')} ({totalActive})
          </button>
        )}
        {totalActive === 0 && !featuredHasAny && (
          <span className="text-[10px] italic text-muted-foreground/60 ml-auto">
            {t('data.filters.hint')}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Date range chip ──────────────────────────────────────────────────────

function DateRangeFilter({
  col,
  filters,
  onApply,
}: {
  col: Column
  filters: FilterTriple[]
  onApply: (fromIso: string | null, toIso: string | null) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fromFilter = filters.find((f) => f.op === '>=')
  const toFilter = filters.find((f) => f.op === '<=')
  const from = fromFilter?.value ?? ''
  const to = toFilter?.value ?? ''

  const isActive = !!(from || to)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const todayIso = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const presets: { labelKey: string; range: () => [string, string] }[] = useMemo(() => {
    function iso(d: Date) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return [
      {
        labelKey: 'data.filters.presets.today',
        range: () => [todayIso, todayIso],
      },
      {
        labelKey: 'data.filters.presets.last7',
        range: () => {
          const from = new Date()
          from.setDate(from.getDate() - 6)
          return [iso(from), todayIso]
        },
      },
      {
        labelKey: 'data.filters.presets.thisMonth',
        range: () => {
          const now = new Date()
          const from = new Date(now.getFullYear(), now.getMonth(), 1)
          return [iso(from), todayIso]
        },
      },
      {
        labelKey: 'data.filters.presets.lastMonth',
        range: () => {
          const now = new Date()
          const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          const to = new Date(now.getFullYear(), now.getMonth(), 0)
          return [iso(from), iso(to)]
        },
      },
      {
        labelKey: 'data.filters.presets.ytd',
        range: () => {
          const now = new Date()
          const from = new Date(now.getFullYear(), 0, 1)
          return [iso(from), todayIso]
        },
      },
    ]
  }, [todayIso])

  function shortLabel() {
    if (!from && !to) return col.label
    if (from && to && from === to) return `${col.label} · ${from}`
    if (from && to) return `${col.label} · ${from} → ${to}`
    if (from) return `${col.label} · ≥ ${from}`
    return `${col.label} · ≤ ${to}`
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'month-btn inline-flex items-center gap-1.5',
          isActive && 'active',
        )}
      >
        <Calendar size={11} aria-hidden />
        <span>{shortLabel()}</span>
        <ChevronDown
          size={10}
          className={cn('transition-transform', open && 'rotate-180', isActive ? 'opacity-100' : 'opacity-40')}
        />
      </button>
      {open && (
        <div
          className="absolute left-0 z-30 mt-2 bg-card border border-border rounded-lg p-3 w-72"
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
            {t('data.filters.dateRange')}
          </p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-[9px] text-muted-foreground mb-0.5">
                {t('data.filters.from')}
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => onApply(e.target.value || null, to || null)}
                className="w-full text-xs bg-input border border-border rounded-md px-2 py-1.5 focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#9E7B2F]/10"
              />
            </div>
            <div>
              <label className="block text-[9px] text-muted-foreground mb-0.5">
                {t('data.filters.to')}
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => onApply(from || null, e.target.value || null)}
                className="w-full text-xs bg-input border border-border rounded-md px-2 py-1.5 focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#9E7B2F]/10"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/60">
            {presets.map((p) => (
              <button
                key={p.labelKey}
                type="button"
                onClick={() => {
                  const [f, tt] = p.range()
                  onApply(f, tt)
                }}
                className="month-btn"
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>

          {isActive && (
            <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-border/60 text-[10px] uppercase tracking-[0.14em]">
              <button
                type="button"
                onClick={() => onApply(null, null)}
                className="text-red-500/80 hover:text-red-500 transition-colors normal-case font-medium"
              >
                {t('data.clearFilter')}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors normal-case font-medium"
              >
                {t('common.close')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Enum select chip ─────────────────────────────────────────────────────

function EnumSelectFilter({
  tableKey,
  col,
  active,
  onApply,
}: {
  tableKey: string
  col: Column
  active: FilterTriple | null
  onApply: (f: FilterTriple | null) => void
}) {
  const distinct = useDataDistinct(tableKey, col.name, '', { enabled: true })

  const value = active?.value ?? ''
  const options = distinct.data?.values ?? []

  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value
          onApply(v ? { col: col.name, op: '=', value: v } : null)
        }}
        className={cn(
          'month-btn appearance-none pr-6 cursor-pointer normal-case font-medium',
          active && 'active',
        )}
        style={{ minWidth: '120px' }}
        aria-label={col.label}
      >
        <option value="">{col.label}</option>
        {options.map((v) => (
          <option key={v.value} value={v.value}>
            {v.value}
          </option>
        ))}
      </select>
      <ChevronDown
        size={10}
        className={cn(
          'absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none',
          active ? 'opacity-100 text-[#9E7B2F]' : 'opacity-40',
        )}
        aria-hidden
      />
    </div>
  )
}
