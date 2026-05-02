import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Search, X, SlidersHorizontal } from 'lucide-react'
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
    'model',
    'aging_bucket',
    'room_name',
    'client_name',
    'product_name',
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
  // Up to 5 featured chips so the orders viewer can surface the load-bearing
  // columns (sales manager, category, customer, product) plus the existing
  // direction/brand pickers without forcing users into the "+ Filter" dropdown
  // for each one. Beyond 5 the strip wraps awkwardly even on wide displays.
  return { dateCol, enumCols: ranked.slice(0, 5) }
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

// ── Excel-style multi-select chip ───────────────────────────────────────
//
// Click → portaled dropdown with a search box, scrollable list of distinct
// values with checkboxes, "all/none" header toggle, Apply / Clear footer.
// Backend's `in` operator takes pipe-separated values, so we serialize as
// `col:in:val1|val2|val3` in the URL.

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
  const { t } = useTranslation()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  // Drafts mutated as the user clicks checkboxes; only emitted on Apply,
  // so the table doesn't refetch on every tick.
  const [draft, setDraft] = useState<Set<string>>(() => {
    if (!active) return new Set()
    if (active.op === 'in') return new Set(active.value.split('|').filter(Boolean))
    if (active.op === '=') return new Set([active.value])
    return new Set()
  })

  // Keep draft in sync when the active filter changes from outside (URL
  // navigation, "Clear all", etc.). setState here runs once per `active`
  // change, not per render, so it doesn't cascade.
  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(new Set())
      return
    }
    if (active.op === 'in') setDraft(new Set(active.value.split('|').filter(Boolean)))
    else if (active.op === '=') setDraft(new Set([active.value]))
    else setDraft(new Set())
  }, [active])

  const distinct = useDataDistinct(tableKey, col.name, search, { enabled: open })
  const options = distinct.data?.values ?? []

  const reposition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const PANEL_W = 256
    const MARGIN = 8
    let left = rect.left
    if (left + PANEL_W > window.innerWidth - MARGIN) left = rect.right - PANEL_W
    if (left < MARGIN) left = MARGIN
    setPos({ top: rect.bottom + 8, left })
  }

  function toggle() {
    if (!open) reposition()
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const onScroll = () => reposition()
    const onResize = () => reposition()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const activeCount = active
    ? active.op === 'in'
      ? active.value.split('|').filter(Boolean).length
      : 1
    : 0

  const triggerLabel =
    activeCount === 0
      ? col.label
      : activeCount === 1 && active
        ? `${col.label}: ${active.op === 'in' ? active.value : active.value}`
        : `${col.label} · ${activeCount}`

  function toggleValue(v: string) {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  function selectAll() {
    setDraft(new Set(options.map((o) => o.value)))
  }

  function clearAll() {
    setDraft(new Set())
  }

  function apply() {
    if (draft.size === 0) {
      onApply(null)
    } else if (draft.size === 1) {
      // Single selection — use `=` if the column allows it, else `in`.
      const v = Array.from(draft)[0]
      onApply({ col: col.name, op: col.ops.includes('=') ? '=' : 'in', value: v })
    } else {
      // Multi → backend's pipe-delimited `in`.
      onApply({ col: col.name, op: 'in', value: Array.from(draft).join('|') })
    }
    setOpen(false)
  }

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'month-btn appearance-none pr-6 cursor-pointer normal-case font-medium inline-flex items-center gap-1.5',
          active && 'active',
        )}
        style={{ minWidth: '120px' }}
        aria-label={col.label}
      >
        <span className="truncate max-w-[180px]">{triggerLabel}</span>
        <ChevronDown
          size={10}
          className={cn(
            'shrink-0',
            active ? 'opacity-100 text-[#9E7B2F]' : 'opacity-40',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && createPortal(
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent"
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <div
            role="dialog"
            aria-label={col.label}
            className="fixed left-4 right-4 bottom-4 sm:bottom-auto sm:w-64 z-50 glass-card rounded-xl shadow-2xl border border-border animate-fade-up overflow-hidden"
            style={
              pos
                ? {
                    left: window.innerWidth >= 640 ? `${pos.left}px` : undefined,
                    top: window.innerWidth >= 640 ? `${pos.top}px` : undefined,
                    right: window.innerWidth >= 640 ? 'auto' : undefined,
                  }
                : undefined
            }
          >
            {/* Search box */}
            <div className="relative border-b border-border/40 p-2">
              <Search
                size={12}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60"
                aria-hidden
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('data.filters.searchValues')}
                className="w-full bg-transparent border-0 pl-7 pr-2 py-1.5 text-xs focus:outline-none placeholder:italic placeholder:text-muted-foreground/50"
                style={{ fontFamily: DM_SANS }}
                autoFocus
              />
            </div>

            {/* All / None */}
            <div
              className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 text-[10px] uppercase tracking-[0.12em]"
              style={{ fontFamily: DM_SANS }}
            >
              <button
                type="button"
                onClick={selectAll}
                className="text-muted-foreground hover:text-[#9E7B2F] transition-colors"
              >
                {t('data.filters.selectAll')}
              </button>
              <span className="text-muted-foreground/40">
                {draft.size} / {options.length}
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="text-muted-foreground hover:text-[#9E7B2F] transition-colors"
              >
                {t('data.filters.selectNone')}
              </button>
            </div>

            {/* Value list */}
            <ul
              className="max-h-64 overflow-y-auto py-1"
              style={{ fontFamily: DM_SANS }}
            >
              {distinct.isLoading && options.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="px-3 py-1.5">
                    <div className="shimmer-skeleton h-3 w-full" />
                  </li>
                ))
              ) : options.length === 0 ? (
                <li className="px-3 py-3 text-xs italic text-muted-foreground/70 text-center">
                  {t('data.filters.noValues')}
                </li>
              ) : (
                options.map((opt) => {
                  const checked = draft.has(opt.value)
                  return (
                    <li key={opt.value}>
                      <button
                        type="button"
                        onClick={() => toggleValue(opt.value)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/40 transition-colors"
                      >
                        <span
                          className={cn(
                            'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                            checked
                              ? 'bg-[#D4A843] border-[#9E7B2F]'
                              : 'border-border bg-input',
                          )}
                        >
                          {checked && <Check size={10} className="text-black" />}
                        </span>
                        <span className="flex-1 truncate text-left">{opt.value}</span>
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                          {opt.count.toLocaleString()}
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
              {distinct.data?.limited && (
                <li className="px-3 py-2 text-[10px] italic text-muted-foreground/60 text-center border-t border-border/40">
                  {t('data.filters.limitedHint')}
                </li>
              )}
            </ul>

            {/* Footer actions */}
            <div
              className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/40 text-[10px] uppercase tracking-[0.12em]"
              style={{ fontFamily: DM_SANS }}
            >
              {active && (
                <button
                  type="button"
                  onClick={() => {
                    onApply(null)
                    setDraft(new Set())
                    setOpen(false)
                  }}
                  className="text-red-500/80 hover:text-red-500 transition-colors normal-case font-medium"
                >
                  {t('data.clearFilter')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors normal-case font-medium"
              >
                {t('common.close')}
              </button>
              <button
                type="button"
                onClick={apply}
                className="px-2.5 py-1 rounded-md bg-[#D4A843] text-black hover:bg-[#C49833] transition-colors normal-case font-semibold"
              >
                {t('common.apply')}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
