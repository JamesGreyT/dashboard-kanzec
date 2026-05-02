import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, X, SlidersHorizontal } from 'lucide-react'
import MonthPicker from '@/components/MonthPicker'
import { defaultDayPresets } from '@/components/datePresets'

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
  // Delegate the dropdown UI entirely to MonthPicker so this filter chip
  // matches the picker style used everywhere else on the SPA (Dayslice
  // section header, analytics filter strip, etc.). The chip's job is just
  // to translate between the >= / <= filter triple shape this component
  // operates on and the union DateRangeValue the picker expects.
  const fromFilter = filters.find((f) => f.op === '>=')
  const toFilter = filters.find((f) => f.op === '<=')
  const from = fromFilter?.value ?? ''
  const to = toFilter?.value ?? ''
  return (
    <MonthPicker
      value={
        from || to
          ? { kind: 'range', from: from || to, to: to || from }
          : { kind: 'month', month: '' }
      }
      onChange={(v) => {
        if (v.kind === 'range') onApply(v.from || null, v.to || null)
        else if (v.month) {
          const [y, m] = v.month.split('-').map(Number)
          const f = `${y}-${String(m).padStart(2, '0')}-01`
          const last = new Date(y, m, 0)
          const tt = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
          onApply(f, tt)
        } else {
          onApply(null, null)
        }
      }}
      label={col.label}
      presets={defaultDayPresets()}
    />
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
