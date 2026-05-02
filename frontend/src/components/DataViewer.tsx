import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X, ChevronDown } from 'lucide-react'

import {
  useDataTables,
  useDataRows,
  useDataDistinct,
  useDataRow,
  useUpdateLegalPersonField,
  useLegalPersonsDirections,
  useLegalPersonsGroups,
  dataExportHref,
  type Column,
  type FilterTriple,
  type TableSchema,
} from '@/api/hooks'
import { useAuth } from '@/context/AuthContext'
import {
  formatCell,
  encodePk,
  formatNumber,
  isIdLike,
  shouldRenderAsFigure,
  pickHeadlineColumn,
} from '@/lib/format'
import PageHeader from '@/components/PageHeader'
import FilterBar from '@/components/FilterBar'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

const ROWS_PER_FOLIO_OPTIONS = [25, 50, 100, 200] as const

interface Props {
  tableKey: string
  title?: string
  editable?: boolean
}

// ── URL <-> filter state plumbing ─────────────────────────────────────────

function parseFilters(searchParams: URLSearchParams): FilterTriple[] {
  return searchParams.getAll('f').flatMap((s) => {
    const idx1 = s.indexOf(':')
    if (idx1 < 0) return []
    const idx2 = s.indexOf(':', idx1 + 1)
    if (idx2 < 0) return []
    const col = s.slice(0, idx1)
    const op = s.slice(idx1 + 1, idx2)
    const value = s.slice(idx2 + 1)
    if (!col || !op) return []
    return [{ col, op, value }]
  })
}

function writeFilters(filters: FilterTriple[], base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base)
  next.delete('f')
  for (const f of filters) next.append('f', `${f.col}:${f.op}:${f.value}`)
  return next
}

function typographyFor(col: Column): string {
  if (isIdLike(col)) return PLEX_MONO
  if (shouldRenderAsFigure(col)) return PLAYFAIR
  return DM_SANS
}

// ── The page ──────────────────────────────────────────────────────────────

export default function DataViewer({ tableKey, title, editable = false }: Props) {
  const { t } = useTranslation()
  const tablesQ = useDataTables()
  const schema = useMemo<TableSchema | undefined>(
    () => tablesQ.data?.find((t) => t.key === tableKey),
    [tablesQ.data, tableKey],
  )

  const [searchParams, setSearchParams] = useSearchParams()
  const limit = Math.min(
    Math.max(Number(searchParams.get('limit') ?? 50), 1),
    500,
  )
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0)
  const search = searchParams.get('q') ?? ''
  const sort =
    searchParams.get('sort') ??
    (schema?.default_sort?.[0]
      ? `${schema.default_sort[0].field}:${schema.default_sort[0].dir}`
      : undefined)
  const filters = parseFilters(searchParams)

  const setParam = (mutate: (next: URLSearchParams) => void) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        mutate(next)
        return next
      },
      { replace: false },
    )
  }

  const setOffset = (newOffset: number) =>
    setParam((next) => {
      next.set('offset', String(Math.max(newOffset, 0)))
    })
  const setLimit = (newLimit: number) =>
    setParam((next) => {
      next.set('limit', String(newLimit))
      next.set('offset', '0')
    })
  const setSearch = (q: string) =>
    setParam((next) => {
      if (q) next.set('q', q)
      else next.delete('q')
      next.set('offset', '0')
    })
  const removeFilter = (idx: number) => {
    const remaining = filters.filter((_, i) => i !== idx)
    setSearchParams(writeFilters(remaining, searchParams), { replace: false })
    setOffset(0)
  }
  const upsertFilter = (col: string, f: FilterTriple | null) => {
    // Replace any existing filter on this column; if `f` is null, just remove.
    const others = filters.filter((existing) => existing.col !== col)
    const next = f ? [...others, f] : others
    const params = writeFilters(next, searchParams)
    params.set('offset', '0')
    setSearchParams(params, { replace: false })
  }
  const upsertRange = (col: string, fromIso: string | null, toIso: string | null) => {
    // Replace BOTH `>=` and `<=` filter triples on `col` with the given range.
    // Either side can be null (meaning "no lower/upper bound").
    const others = filters.filter(
      (existing) => existing.col !== col || (existing.op !== '>=' && existing.op !== '<='),
    )
    const next = [...others]
    if (fromIso) next.push({ col, op: '>=', value: fromIso })
    if (toIso) next.push({ col, op: '<=', value: toIso })
    const params = writeFilters(next, searchParams)
    params.set('offset', '0')
    setSearchParams(params, { replace: false })
  }
  const clearAll = () => {
    setSearchParams({}, { replace: false })
  }

  const rowsQ = useDataRows(
    tableKey,
    { limit, offset, sort, search, filters },
    { enabled: !!schema },
  )

  const [drawerPk, setDrawerPk] = useState<string | null>(null)

  useEffect(() => {
    if (rowsQ.data && offset >= rowsQ.data.total && rowsQ.data.total > 0) {
      setOffset(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsQ.data?.total])

  const visibleColumns = (schema?.columns ?? []).filter((c) => c.visible)

  const totalPages = rowsQ.data ? Math.max(1, Math.ceil(rowsQ.data.total / limit)) : 1
  const currentPage = Math.floor(offset / limit) + 1
  const showingFrom = rowsQ.data?.rows.length ? offset + 1 : 0
  const showingTo = offset + (rowsQ.data?.rows.length ?? 0)
  const total = rowsQ.data?.total ?? 0

  const exportHref = dataExportHref(tableKey, { sort, search, filters })

  // Keyboard navigation in the drawer: ↑/↓ moves between rows. At the edges
  // of the current page, jump to the next/prev page if available. The drawer
  // itself only consumes the keys when it has focus; the listener is on
  // window so keyboard scrolling works even when the cursor isn't in the
  // drawer.
  useEffect(() => {
    if (!drawerPk || !schema) return
    const rows = rowsQ.data?.rows ?? []
    const idx = rows.findIndex((r) => encodePk(r, schema.pk) === drawerPk)
    if (idx < 0) return

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (idx < rows.length - 1) {
          setDrawerPk(encodePk(rows[idx + 1], schema!.pk))
        } else if (offset + limit < total) {
          // Jump to first row of next page
          setOffset(offset + limit)
          // The drawer pk will be updated when the next page's rows arrive;
          // we set a marker so the next `useEffect` run can re-anchor.
          setDrawerPk(null)
        }
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (idx > 0) {
          setDrawerPk(encodePk(rows[idx - 1], schema!.pk))
        } else if (offset > 0) {
          setOffset(Math.max(0, offset - limit))
          setDrawerPk(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerPk, schema, rowsQ.data, offset, limit, total])

  return (
    <div>
      <PageHeader />

      {/* ── Mast ─────────────────────────────────────────────────────────── */}
      <header className="mb-6">
        <div className="animate-fade-up">
          <span className="section-title">{t('data.meta.registryOf')}</span>
        </div>

        <div className="flex items-end justify-between gap-6 mt-3 mb-2 animate-fade-up animate-fade-up-delay-1">
          <h1
            className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight"
            style={{ fontFamily: PLAYFAIR }}
          >
            {title ?? schema?.label ?? '—'}
          </h1>
          <a
            href={exportHref}
            download
            className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-[#9E7B2F] transition-colors shrink-0 pb-2"
            style={{ fontFamily: PLEX_MONO }}
            aria-label={t('data.exportXlsx')}
          >
            ↓ xlsx
          </a>
        </div>

        {/* The search input IS the running rule of the page. */}
        <div className="relative border-b border-border/80 focus-within:border-[#9E7B2F]/60 transition-colors animate-fade-up animate-fade-up-delay-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('data.searchHint')}
            className="w-full bg-transparent border-0 outline-none py-2.5 text-base placeholder:text-muted-foreground/50 placeholder:italic"
            style={{ fontFamily: DM_SANS }}
          />
        </div>
      </header>

      {/* ── Filter bar — featured filters + active chips ──────────────────
          Always visible; surfaces the highest-value filters per table
          (date range + 1-3 enum-like columns) as discoverable controls,
          plus chips for any non-featured filter set via column-header
          chevrons. */}
      {schema && (
        <FilterBar
          schema={schema}
          filters={filters}
          onUpsert={upsertFilter}
          onUpsertRange={upsertRange}
          onRemove={removeFilter}
          onClearAll={clearAll}
        />
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-2 mt-4 animate-fade-up animate-fade-up-delay-2 hidden md:block">
        {schema && (
          <table className="premium-table w-full text-sm" style={{ fontFamily: DM_SANS }}>
            <thead>
              <tr>
                {visibleColumns.map((col) => {
                  const activeFilter = filters.find((f) => f.col === col.name) ?? null
                  return (
                    <th
                      key={col.name}
                      className={cn(
                        'px-3 py-2.5 border-b border-border',
                        shouldRenderAsFigure(col) || isIdLike(col) ? 'text-right' : 'text-left',
                      )}
                    >
                      <FilterableHeader
                        col={col}
                        tableKey={tableKey}
                        activeFilter={activeFilter}
                        onApply={(f) => upsertFilter(col.name, f)}
                      />
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rowsQ.isLoading && !rowsQ.data ? (
                <ShimmerRows columns={visibleColumns} count={Math.min(limit, 8)} />
              ) : rowsQ.data?.rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-0">
                    <EmptyRegistry filters={filters} onClear={clearAll} />
                  </td>
                </tr>
              ) : (
                rowsQ.data?.rows.map((row, idx) => {
                  const rowPk = encodePk(row, schema.pk)
                  return (
                    <RegistryRow
                      key={`${idx}-${rowPk}`}
                      rowIndex={idx}
                      row={row}
                      columns={visibleColumns}
                      onClick={() => setDrawerPk(rowPk)}
                      isFocused={drawerPk === rowPk}
                    />
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Mobile card view ────────────────────────────────────────────── */}
      <div className="md:hidden mt-4 space-y-2 animate-fade-up animate-fade-up-delay-2">
        {schema && rowsQ.isLoading && !rowsQ.data
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass-card rounded-xl p-3 space-y-2">
                <div className="shimmer-skeleton h-3 w-1/3" />
                <div className="shimmer-skeleton h-4 w-3/4" />
                <div className="shimmer-skeleton h-3 w-1/2" />
              </div>
            ))
          : rowsQ.data?.rows.length === 0
          ? <EmptyRegistry filters={filters} onClear={clearAll} />
          : rowsQ.data?.rows.map((row, idx) => schema && (
              <RegistryCard
                key={`m-${idx}`}
                row={row}
                columns={visibleColumns}
                onClick={() => setDrawerPk(encodePk(row, schema.pk))}
              />
            ))}
      </div>

      {/* ── Folio footer ────────────────────────────────────────────────── */}
      {schema && (rowsQ.data?.total ?? 0) > 0 && (
        <footer
          className="mt-6 pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 text-xs animate-fade-up animate-fade-up-delay-4"
          style={{ fontFamily: DM_SANS }}
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="font-medium text-foreground tabular-nums"
              style={{ fontFamily: PLAYFAIR }}
              aria-label={`${currentPage} of ${totalPages}`}
            >
              {formatNumber(currentPage)}
              <span className="text-muted-foreground"> {t('data.of')} </span>
              {formatNumber(totalPages)}
            </span>
            <span className="text-muted-foreground italic">
              · {t('data.showing')} {showingFrom.toLocaleString()}–{showingTo.toLocaleString()}{' '}
              {t('data.of')} {total.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {t('data.rowsPerFolio')}
              </span>
              {ROWS_PER_FOLIO_OPTIONS.map((n) => (
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

      {/* ── Drawer ──────────────────────────────────────────────────────── */}
      {schema && (
        <RegistryDrawer
          tableKey={tableKey}
          schema={schema}
          pk={drawerPk}
          editable={editable}
          onClose={() => setDrawerPk(null)}
        />
      )}
    </div>
  )
}

// ── Filterable header cell ───────────────────────────────────────────────
// Click the header → opens an inline anchored menu (NOT a popover) with op +
// value. The menu sits absolutely positioned beneath the header; click-outside
// closes it.

function FilterableHeader({
  col,
  tableKey,
  activeFilter,
  onApply,
}: {
  col: Column
  tableKey: string
  activeFilter: FilterTriple | null
  onApply: (f: FilterTriple | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors',
          activeFilter ? 'text-[#9E7B2F]' : 'text-muted-foreground hover:text-foreground',
        )}
        aria-expanded={open}
        aria-label={`Filter ${col.label}`}
      >
        <span>{col.label}</span>
        <ChevronDown
          size={10}
          className={cn(
            'transition-transform',
            open ? 'rotate-180' : '',
            activeFilter ? 'opacity-100' : 'opacity-30',
          )}
        />
      </button>
      {open && (
        <HeaderFilterMenu
          col={col}
          tableKey={tableKey}
          activeFilter={activeFilter}
          onApply={(f) => {
            onApply(f)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function HeaderFilterMenu({
  col,
  tableKey,
  activeFilter,
  onApply,
  onClose,
}: {
  col: Column
  tableKey: string
  activeFilter: FilterTriple | null
  onApply: (f: FilterTriple | null) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [op, setOp] = useState<string>(activeFilter?.op ?? col.ops[0] ?? '=')
  const [value, setValue] = useState<string>(activeFilter?.value ?? '')
  const distinct = useDataDistinct(tableKey, col.name, value, {
    enabled: col.type === 'text' && !isIdLike(col),
  })

  const inputType = col.type === 'date' ? 'date' : (col.type === 'numeric' || col.type === 'int') ? 'number' : 'text'

  function commit() {
    if (!value) return
    onApply({ col: col.name, op, value })
  }

  function clear() {
    onApply(null)
  }

  // Side of header to anchor — right-aligned columns flow the menu to the right
  const anchorRight = shouldRenderAsFigure(col) || isIdLike(col)

  return (
    <div
      className={cn(
        'absolute z-30 mt-1 bg-card border border-border rounded-lg shadow-lg p-3 w-64',
        anchorRight ? 'right-0' : 'left-0',
      )}
      style={{ fontFamily: DM_SANS, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
    >
      <div className="flex items-center gap-2">
        <select
          value={op}
          onChange={(e) => setOp(e.target.value)}
          className="inv-filter shrink-0 normal-case font-normal"
          style={{ minWidth: '60px' }}
        >
          {col.ops.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <input
          type={inputType}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
          placeholder={t('data.filterValueHint')}
          list={col.type === 'text' && !isIdLike(col) ? `distinct-${col.name}` : undefined}
          className="flex-1 text-xs bg-input border border-border rounded-md px-2 py-1.5 focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#9E7B2F]/10 normal-case font-normal"
          autoFocus
        />
        {col.type === 'text' && !isIdLike(col) && distinct.data && (
          <datalist id={`distinct-${col.name}`}>
            {distinct.data.values.map((v) => (
              <option key={v.value} value={v.value} />
            ))}
          </datalist>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 text-[10px] uppercase tracking-[0.14em]">
        {activeFilter ? (
          <button
            type="button"
            onClick={clear}
            className="text-red-500/80 hover:text-red-500 transition-colors normal-case font-medium"
          >
            {t('data.clearFilter')}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors normal-case font-medium"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!value}
            onClick={commit}
            className="px-2.5 py-1 rounded bg-[#D4A843] hover:bg-[#C49833] disabled:bg-[#D4A843]/30 disabled:cursor-not-allowed text-black font-semibold normal-case"
          >
            {t('common.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row renderers ─────────────────────────────────────────────────────────

function CellValue({ value, col, lang }: { value: unknown; col: Column; lang?: string }) {
  const formatted = formatCell(value, col, lang)
  if (formatted === '—') {
    return <span className="cell-empty">—</span>
  }
  return <>{formatted}</>
}

function RegistryRow({
  row,
  columns,
  onClick,
  isFocused,
  rowIndex,
}: {
  row: Record<string, unknown>
  columns: Column[]
  onClick: () => void
  isFocused?: boolean
  rowIndex: number
}) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer"
      data-row-index={rowIndex}
      aria-current={isFocused ? 'true' : undefined}
    >
      {columns.map((col) => {
        const figure = shouldRenderAsFigure(col)
        const idLike = isIdLike(col)
        return (
          <td
            key={col.name}
            className={cn(
              'px-3 py-2.5 border-b border-border/40',
              (figure || idLike) && 'text-right',
              figure && 'tabular-nums',
              idLike && 'text-muted-foreground',
            )}
            style={{ fontFamily: typographyFor(col) }}
          >
            <CellValue value={row[col.name]} col={col} />
          </td>
        )
      })}
    </tr>
  )
}

function RegistryCard({
  row,
  columns,
  onClick,
}: {
  row: Record<string, unknown>
  columns: Column[]
  onClick: () => void
}) {
  const headlineCol = pickHeadlineColumn(columns) ?? columns[0]
  const dateCol = columns.find((c) => c.type === 'date' || c.type === 'timestamp')
  const idCol = columns.find((c) => isIdLike(c))
  const figureCol = columns.find((c) => shouldRenderAsFigure(c))
  const secondaryTextCol = columns.find(
    (c) =>
      c.type === 'text' &&
      !isIdLike(c) &&
      c.name !== headlineCol?.name,
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card rounded-xl p-3 w-full text-left hover:border-[#9E7B2F]/25 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground mb-1">
        {dateCol && (
          <span style={{ fontFamily: DM_SANS }}>
            {formatCell(row[dateCol.name], dateCol)}
          </span>
        )}
        {idCol && (
          <span style={{ fontFamily: PLEX_MONO }}>
            {formatCell(row[idCol.name], idCol)}
          </span>
        )}
      </div>
      {headlineCol && (
        <p className="text-base font-semibold leading-tight" style={{ fontFamily: PLAYFAIR }}>
          {formatCell(row[headlineCol.name], headlineCol)}
        </p>
      )}
      <div className="flex items-baseline justify-between gap-2 mt-1.5 text-xs text-muted-foreground">
        {secondaryTextCol && (
          <span style={{ fontFamily: DM_SANS }}>
            {formatCell(row[secondaryTextCol.name], secondaryTextCol)}
          </span>
        )}
        {figureCol && (
          <span className="tabular-nums font-medium text-foreground" style={{ fontFamily: PLAYFAIR }}>
            {formatCell(row[figureCol.name], figureCol)}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Empty registry ────────────────────────────────────────────────────────

function EmptyRegistry({
  filters,
  onClear,
}: {
  filters: FilterTriple[]
  onClear: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="py-20 text-center animate-fade-up">
      <div className="text-3xl text-[#D4A843] mb-3 tracking-[0.5em]" aria-hidden>
        ※
      </div>
      <p className="text-lg italic mb-1" style={{ fontFamily: PLAYFAIR }}>
        {t('data.empty.line1')}
      </p>
      <p className="text-sm text-muted-foreground italic mb-6" style={{ fontFamily: DM_SANS }}>
        {filters.length > 0 ? t('data.empty.line2withFilters') : t('data.empty.line2')}
      </p>
      {filters.length > 0 && (
        <p className="text-xs" style={{ fontFamily: DM_SANS }}>
          <button
            type="button"
            onClick={onClear}
            className="text-[#9E7B2F] hover:text-[#7A5E20] underline decoration-dotted underline-offset-2"
          >
            {t('data.empty.clearAll')}
          </button>
        </p>
      )}
    </div>
  )
}

// ── Loading shimmer rows ──────────────────────────────────────────────────

function ShimmerRows({ columns, count }: { columns: Column[]; count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          {columns.map((col) => (
            <td key={col.name} className="px-3 py-2.5 border-b border-border/40">
              <div className="shimmer-skeleton h-3 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ── Drawer ────────────────────────────────────────────────────────────────

function RegistryDrawer({
  tableKey,
  schema,
  pk,
  editable,
  onClose,
}: {
  tableKey: string
  schema: TableSchema
  pk: string | null
  editable: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const open = !!pk
  const rowQ = useDataRow(tableKey, pk)

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const row = rowQ.data
  const visibleColumns = schema.columns.filter((c) => c.visible)
  const headlineCol = pickHeadlineColumn(visibleColumns) ?? visibleColumns[0]
  const idCol = visibleColumns.find((c) => isIdLike(c))
  const dateCol = visibleColumns.find((c) => c.type === 'date' || c.type === 'timestamp')

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/30 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('data.drawer.folioEntry')}
        className={cn(
          'fixed inset-y-0 right-0 z-40 w-full sm:w-120 bg-card border-l border-border flex flex-col',
          'transform transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      >
        {/* Header — close button lives here, top-right */}
        <div className="flex items-center justify-between gap-3 px-6 lg:px-8 pt-6 pb-3 border-b border-border/40 shrink-0">
          <span className="section-title flex-1">{t('data.drawer.folioEntry')}</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors shrink-0"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-5">
          {!row ? (
            <div className="space-y-3">
              <div className="shimmer-skeleton h-7 w-2/3" />
              <div className="shimmer-skeleton h-3 w-1/2" />
              <div className="shimmer-skeleton h-3 w-full mt-6" />
              <div className="shimmer-skeleton h-3 w-full" />
              <div className="shimmer-skeleton h-3 w-3/4" />
            </div>
          ) : (
            <>
              <h2
                className="text-2xl font-semibold leading-tight mb-1"
                style={{ fontFamily: PLAYFAIR }}
              >
                {headlineCol ? formatCell(row[headlineCol.name], headlineCol, i18n.language) : t('data.drawer.entry')}
              </h2>

              <div
                className="flex items-baseline justify-between text-xs text-muted-foreground mt-3 pb-4 border-b border-border/60"
                style={{ fontFamily: DM_SANS }}
              >
                {idCol && (
                  <span style={{ fontFamily: PLEX_MONO }}>
                    № {formatCell(row[idCol.name], idCol)}
                  </span>
                )}
                {dateCol && <span>{formatCell(row[dateCol.name], dateCol, i18n.language)}</span>}
              </div>

              <dl className="mt-5 space-y-3">
                {visibleColumns.map((col) => (
                  <div key={col.name} className="grid grid-cols-[110px_1fr] gap-3 items-baseline">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {col.label}
                    </dt>
                    <dd
                      className={cn(
                        'text-sm wrap-break-word',
                        shouldRenderAsFigure(col) && 'tabular-nums font-medium',
                      )}
                      style={{ fontFamily: typographyFor(col) }}
                    >
                      {formatCell(row[col.name], col, i18n.language)}
                    </dd>
                  </div>
                ))}
              </dl>

              {editable && row.person_id !== undefined && (
                <EditableSection personId={Number(row.person_id)} initial={row} />
              )}
            </>
          )}
        </div>
      </aside>
    </>
  )
}

// ── Editable section (legal-persons only) ─────────────────────────────────

function EditableSection({
  personId,
  initial,
}: {
  personId: number
  initial: Record<string, unknown>
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'operator'
  const directionsQ = useLegalPersonsDirections()
  const groupsQ = useLegalPersonsGroups()

  const directionMut = useUpdateLegalPersonField('direction')
  const instalmentMut = useUpdateLegalPersonField('instalment-days')
  const groupMut = useUpdateLegalPersonField('group')

  const [direction, setDirection] = useState<string>(String(initial.direction ?? ''))
  const [instalment, setInstalment] = useState<string>(String(initial.instalment_days ?? ''))
  const [groupVal, setGroupVal] = useState<string>(String(initial.client_group ?? ''))

  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  function flash(msg: string) {
    setStatusMsg(msg)
    window.setTimeout(() => setStatusMsg(null), 2000)
  }

  function commitDirection(next: string) {
    if (!canEdit || next === String(initial.direction ?? '')) return
    directionMut.mutate(
      { personId, value: next },
      {
        onSuccess: () => flash(t('data.drawer.saved')),
        onError: () => flash(t('data.drawer.saveFailed')),
      },
    )
  }
  function commitInstalment(next: string) {
    if (!canEdit) return
    const n = Number(next)
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      flash(t('data.drawer.instalmentInvalid'))
      return
    }
    if (n === Number(initial.instalment_days ?? -1)) return
    instalmentMut.mutate(
      { personId, value: n },
      {
        onSuccess: () => flash(t('data.drawer.saved')),
        onError: () => flash(t('data.drawer.saveFailed')),
      },
    )
  }
  function commitGroup(next: string) {
    if (!canEdit || next === String(initial.client_group ?? '')) return
    groupMut.mutate(
      { personId, value: next },
      {
        onSuccess: () => flash(t('data.drawer.saved')),
        onError: () => flash(t('data.drawer.saveFailed')),
      },
    )
  }

  // Highlight the editable section so it visually distinguishes itself from
  // the read-only definition list above. Gold left rail (same vocabulary as
  // .nav-active and .perf-section.is-open) + slightly warmer paper tint.
  return (
    <section className="relative mt-8 -mx-6 lg:-mx-8 px-6 lg:px-8 py-5 bg-[#9E7B2F]/4 border-t border-[#9E7B2F]/15">
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1 bg-linear-to-b from-[#D4A843] to-[#B8922E]"
      />
      <div className="flex items-baseline gap-2 mb-1">
        <span className="section-title flex-1">{t('data.drawer.editable')}</span>
        {!canEdit && (
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {t('data.drawer.readOnlyShort')}
          </span>
        )}
      </div>
      <div className="mt-4 space-y-3">
        <EditableRow
          label={t('data.drawer.direction')}
          updatedAt={initial.direction_updated_at}
        >
          <select
            disabled={!canEdit || directionsQ.isLoading}
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            onBlur={(e) => commitDirection(e.target.value)}
            className="inv-filter w-full"
          >
            <option value="">—</option>
            {directionsQ.data?.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </EditableRow>

        <EditableRow
          label={t('data.drawer.instalment')}
          updatedAt={initial.instalment_days_updated_at}
        >
          <input
            type="number"
            min={0}
            max={365}
            disabled={!canEdit}
            value={instalment}
            onChange={(e) => setInstalment(e.target.value)}
            onBlur={(e) => commitInstalment(e.target.value)}
            className="inv-filter w-full"
          />
        </EditableRow>

        <EditableRow
          label={t('data.drawer.group')}
          updatedAt={initial.client_group_updated_at}
        >
          <select
            disabled={!canEdit || groupsQ.isLoading}
            value={groupVal}
            onChange={(e) => setGroupVal(e.target.value)}
            onBlur={(e) => commitGroup(e.target.value)}
            className="inv-filter w-full"
          >
            <option value="">—</option>
            {groupsQ.data?.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </EditableRow>
      </div>

      <p
        className="mt-4 text-[11px] italic min-h-[1em] transition-colors"
        style={{ fontFamily: DM_SANS }}
      >
        <span className={statusMsg ? 'text-[#9E7B2F]' : 'text-muted-foreground'}>
          {statusMsg ?? (canEdit ? t('data.drawer.autosaved') : t('data.drawer.readOnly'))}
        </span>
      </p>
    </section>
  )
}

function EditableRow({
  label,
  children,
  updatedAt,
}: {
  label: string
  children: React.ReactNode
  updatedAt?: unknown
}) {
  const { t, i18n } = useTranslation()
  const stamp = typeof updatedAt === 'string' && updatedAt ? formatRelativeTime(updatedAt, t, i18n.language) : null
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline">
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        style={{ fontFamily: DM_SANS }}
      >
        {label}
      </span>
      <div>
        {children}
        {stamp && (
          <p
            className="mt-1 text-[10px] italic text-muted-foreground"
            style={{ fontFamily: DM_SANS }}
          >
            {stamp}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Relative time helper ──────────────────────────────────────────────────
// "saved 3 minutes ago / 2 days ago / 17 Apr". Uses Intl.RelativeTimeFormat
// when the gap is ≤ 30 days, falls back to short date for older edits.

const RELATIVE_KEY: Record<string, string> = {
  uz: 'uz',
  ru: 'ru',
  en: 'en',
}

function formatRelativeTime(iso: string, t: (k: string) => string, lang: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const diffMs = d.getTime() - now
  const diffSec = diffMs / 1000
  const absSec = Math.abs(diffSec)
  const absDays = absSec / 86400

  // Format-of-record: anything older than 30 days falls back to short date.
  if (absDays > 30) {
    return `${t('data.drawer.savedAt')} ${formatShortDateForRelative(iso, lang)}`
  }

  const rtf = new Intl.RelativeTimeFormat(RELATIVE_KEY[lang] ?? 'uz', { numeric: 'auto' })
  let value: number
  let unit: Intl.RelativeTimeFormatUnit
  if (absSec < 60) {
    value = Math.round(diffSec)
    unit = 'second'
  } else if (absSec < 3600) {
    value = Math.round(diffSec / 60)
    unit = 'minute'
  } else if (absSec < 86400) {
    value = Math.round(diffSec / 3600)
    unit = 'hour'
  } else {
    value = Math.round(diffSec / 86400)
    unit = 'day'
  }
  return `${t('data.drawer.savedAt')} ${rtf.format(value, unit)}`
}

function formatShortDateForRelative(iso: string, lang: string): string {
  const d = new Date(iso)
  const months: Record<string, string[]> = {
    uz: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
    ru: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  }
  const m = (months[lang] ?? months.uz)[d.getMonth()]
  return `${d.getDate()} ${m} ${d.getFullYear()}`
}
