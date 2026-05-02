import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X, Plus } from 'lucide-react'

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
import { formatCell, encodePk, toRomanLower } from '@/lib/format'
import PageHeader from '@/components/PageHeader'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

const ROWS_PER_FOLIO_OPTIONS = [25, 50, 100, 200] as const

interface Props {
  /**
   * The data table key. Must match a `key` from /api/data/tables. The
   * three known viewers correspond to:
   *   'deal_order' (Orders), 'payment' (Payments), 'legal_person' (LegalPersons)
   * but we keep this generic so the schema endpoint stays the source of truth.
   */
  tableKey: string
  /** Heading shown in the registry mast. Falls back to schema's `label`. */
  title?: string
  /**
   * If the editable drawer (direction / instalment-days / group) should be
   * available. Only legal_person supports it server-side.
   */
  editable?: boolean
}

// ── URL <-> filter state plumbing ─────────────────────────────────────────

function parseFilters(searchParams: URLSearchParams): FilterTriple[] {
  return searchParams.getAll('f').flatMap((s) => {
    // We re-encode with single colons; values can contain colons, so split max=3.
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
  const sort = searchParams.get('sort') ?? schema?.default_sort?.[0]
    ? `${schema!.default_sort[0].field}:${schema!.default_sort[0].dir}`
    : undefined
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
  const removeFilter = (i: number) => {
    const remaining = filters.filter((_, idx) => idx !== i)
    setSearchParams(writeFilters(remaining, searchParams), { replace: false })
    setOffset(0)
  }
  const addFilter = (f: FilterTriple) => {
    const next = writeFilters([...filters, f], searchParams)
    next.set('offset', '0')
    setSearchParams(next, { replace: false })
  }
  const clearAll = () => {
    setSearchParams({}, { replace: false })
  }

  const rowsQ = useDataRows(
    tableKey,
    { limit, offset, sort, search, filters },
    { enabled: !!schema },
  )

  // Drawer state
  const [drawerPk, setDrawerPk] = useState<string | null>(null)

  // Reset offset when total drops below the current page
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

      {/* ── Filter citation ─────────────────────────────────────────────── */}
      {schema && (
        <FilterCitation
          schema={schema}
          filters={filters}
          folioNumber={currentPage}
          onRemove={removeFilter}
          onAdd={addFilter}
        />
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-2 mt-6 animate-fade-up animate-fade-up-delay-3 hidden md:block">
        {schema && (
          <table className="premium-table w-full text-sm" style={{ fontFamily: DM_SANS }}>
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.name}
                    className={cn(
                      'px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-b border-border',
                      col.numeric && 'text-right',
                      col.id_column && 'text-right',
                    )}
                  >
                    {col.label}
                  </th>
                ))}
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
                rowsQ.data?.rows.map((row, idx) => (
                  <RegistryRow
                    key={`${idx}-${encodePk(row, schema.pk)}`}
                    row={row}
                    columns={visibleColumns}
                    onClick={() => setDrawerPk(encodePk(row, schema.pk))}
                  />
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Mobile card view ────────────────────────────────────────────── */}
      <div className="md:hidden mt-6 space-y-2 animate-fade-up animate-fade-up-delay-3">
        {schema && rowsQ.isLoading && !rowsQ.data
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass-card rounded-xl p-3 space-y-2">
                <div className="shimmer-skeleton h-3 w-1/3" />
                <div className="shimmer-skeleton h-4 w-3/4" />
                <div className="shimmer-skeleton h-3 w-1/2" />
              </div>
            ))
          : rowsQ.data?.rows.length === 0
          ? (
            <EmptyRegistry filters={filters} onClear={clearAll} />
          )
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
              {toRomanLower(currentPage)}
              <span className="text-muted-foreground"> {t('data.of')} </span>
              {toRomanLower(totalPages)}
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

// ── Filter citation (chips as a printed bibliography line) ────────────────

function FilterCitation({
  schema,
  filters,
  folioNumber,
  onRemove,
  onAdd,
}: {
  schema: TableSchema
  filters: FilterTriple[]
  folioNumber: number
  onRemove: (idx: number) => void
  onAdd: (f: FilterTriple) => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  return (
    <div
      className="text-xs leading-relaxed flex flex-wrap items-baseline gap-x-1 gap-y-1.5 animate-fade-up animate-fade-up-delay-2"
      style={{ fontFamily: DM_SANS }}
    >
      <span className="text-muted-foreground italic mr-1.5">
        {t('data.folio')} {toRomanLower(folioNumber)} —
      </span>

      {filters.length === 0 && (
        <span className="text-muted-foreground/70 italic">
          {t('data.noFilters')}
        </span>
      )}

      {filters.map((f, i) => {
        const colMeta = schema.columns.find((c) => c.name === f.col)
        return (
          <span key={`${f.col}-${f.op}-${i}`} className="inline-flex items-baseline gap-0.5">
            {i > 0 && <span className="text-muted-foreground/40 mx-0.5">·</span>}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="group inline-flex items-baseline gap-1 text-foreground hover:text-[#9E7B2F] transition-colors"
            >
              <span className="font-medium">{colMeta?.label ?? f.col}</span>
              <span className="text-muted-foreground">{f.op}</span>
              <span className="font-medium">{f.value}</span>
              <X
                size={10}
                className="text-muted-foreground group-hover:text-red-500 transition-colors"
                aria-hidden
              />
            </button>
          </span>
        )
      })}

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="ml-2 inline-flex items-baseline gap-1 text-[#9E7B2F] hover:text-[#7A5E20] underline decoration-dotted underline-offset-2 transition-colors"
      >
        <Plus size={10} />
        {t('data.addFilter')}
      </button>

      {adding && (
        <AddFilterPopover
          schema={schema}
          onAdd={(f) => {
            onAdd(f)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function AddFilterPopover({
  schema,
  onAdd,
  onCancel,
}: {
  schema: TableSchema
  onAdd: (f: FilterTriple) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [col, setCol] = useState<string>(() => schema.columns.find((c) => c.visible)?.name ?? '')
  const [op, setOp] = useState<string>('=')
  const [value, setValue] = useState<string>('')
  const colMeta = schema.columns.find((c) => c.name === col)
  const ops = colMeta?.ops ?? ['=']

  // Autocomplete via /distinct for text columns
  const distinct = useDataDistinct(schema.key, col, value, {
    enabled: !!colMeta && colMeta.type === 'text' && !colMeta.id_column,
  })

  useEffect(() => {
    // When column changes, re-pick a sensible default operator
    if (!colMeta) return
    if (!colMeta.ops.includes(op)) setOp(colMeta.ops[0] ?? '=')
    setValue('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col])

  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  return (
    <div ref={ref} className="absolute z-30 mt-2 ml-0 glass-card rounded-xl p-4 shadow-xl w-[320px]" style={{ fontFamily: DM_SANS }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {t('data.addFilter')}
      </p>
      <div className="space-y-2">
        <select
          value={col}
          onChange={(e) => setCol(e.target.value)}
          className="inv-filter w-full"
        >
          {schema.columns
            .filter((c) => c.visible)
            .map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
        </select>

        <select value={op} onChange={(e) => setOp(e.target.value)} className="inv-filter w-full">
          {ops.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <input
          type={colMeta?.type === 'date' ? 'date' : colMeta?.numeric ? 'number' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('data.filterValueHint')}
          list={colMeta?.type === 'text' && !colMeta.id_column ? `distinct-${col}` : undefined}
          className="w-full text-xs bg-input border border-border rounded-md px-2 py-1.5 focus:outline-none focus:border-[#9E7B2F]/40 focus:ring-2 focus:ring-[#9E7B2F]/10"
          autoFocus
        />
        {colMeta?.type === 'text' && !colMeta.id_column && distinct.data && (
          <datalist id={`distinct-${col}`}>
            {distinct.data.values.map((v) => (
              <option key={v.value} value={v.value}>
                {v.count}
              </option>
            ))}
          </datalist>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!col || !value}
            onClick={() => {
              if (!col || !value) return
              onAdd({ col, op, value })
            }}
            className="text-xs px-3 py-1.5 rounded bg-[#D4A843] hover:bg-[#C49833] disabled:bg-[#D4A843]/30 disabled:cursor-not-allowed text-black font-semibold transition-colors"
          >
            {t('common.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row renderers ─────────────────────────────────────────────────────────

function typographyFor(col: Column): string {
  if (col.id_column) return PLEX_MONO
  if (col.numeric) return PLAYFAIR
  return DM_SANS
}

function RegistryRow({
  row,
  columns,
  onClick,
}: {
  row: Record<string, unknown>
  columns: Column[]
  onClick: () => void
}) {
  return (
    <tr onClick={onClick} className="cursor-pointer">
      {columns.map((col) => (
        <td
          key={col.name}
          className={cn(
            'px-3 py-2.5 border-b border-border/40',
            col.numeric && 'text-right tabular-nums',
            col.id_column && 'text-right text-muted-foreground',
          )}
          style={{ fontFamily: typographyFor(col) }}
        >
          {formatCell(row[col.name], col)}
        </td>
      ))}
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
  const headlineCol = columns.find((c) => c.type === 'text' && !c.id_column) ?? columns[0]
  const dateCol = columns.find((c) => c.type === 'date' || c.type === 'timestamp')
  const idCol = columns.find((c) => c.id_column)
  const numericCol = columns.find((c) => c.numeric)
  const secondaryTextCol = columns.find(
    (c) => c.type === 'text' && !c.id_column && c.name !== headlineCol?.name,
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
        {numericCol && (
          <span className="tabular-nums font-medium text-foreground" style={{ fontFamily: PLAYFAIR }}>
            {formatCell(row[numericCol.name], numericCol)}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Empty registry (asterism, italic line, dotted-undertline actions) ────

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

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  // Close on Escape
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
  const headlineCol = visibleColumns.find((c) => c.type === 'text' && !c.id_column) ?? visibleColumns[0]
  const idCol = visibleColumns.find((c) => c.id_column)
  const dateCol = visibleColumns.find((c) => c.type === 'date' || c.type === 'timestamp')

  return (
    <>
      {/* dim overlay */}
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
          'fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] bg-card border-l border-border',
          'transform transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
        style={{
          transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div className="h-full overflow-y-auto p-6 lg:p-8">
          <span className="section-title">{t('data.drawer.folioEntry')}</span>

          {!row ? (
            <div className="mt-4 space-y-3">
              <div className="shimmer-skeleton h-7 w-2/3" />
              <div className="shimmer-skeleton h-3 w-1/2" />
              <div className="shimmer-skeleton h-3 w-full mt-6" />
              <div className="shimmer-skeleton h-3 w-full" />
              <div className="shimmer-skeleton h-3 w-3/4" />
            </div>
          ) : (
            <>
              <h2
                className="text-2xl font-semibold leading-tight mt-3 mb-1"
                style={{ fontFamily: PLAYFAIR }}
              >
                {headlineCol ? String(row[headlineCol.name] ?? '—') : t('data.drawer.entry')}
              </h2>

              <div
                className="flex items-baseline justify-between text-xs text-muted-foreground mt-3 pb-4 border-b border-border/60"
                style={{ fontFamily: DM_SANS }}
              >
                {idCol && (
                  <span style={{ fontFamily: PLEX_MONO }}>
                    ⌘ {formatCell(row[idCol.name], idCol)}
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
                      className={cn('text-sm', col.numeric && 'tabular-nums font-medium')}
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

          <button
            type="button"
            onClick={onClose}
            className="absolute bottom-6 right-6 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontFamily: DM_SANS }}
          >
            {t('common.close')} ✕
          </button>
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

  return (
    <section className="mt-8">
      <span className="section-title">{t('data.drawer.editable')}</span>
      <div className="mt-4 space-y-3">
        <EditableRow label={t('data.drawer.direction')}>
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

        <EditableRow label={t('data.drawer.instalment')}>
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

        <EditableRow label={t('data.drawer.group')}>
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

function EditableRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline">
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        style={{ fontFamily: DM_SANS }}
      >
        {label}
      </span>
      <div>{children}</div>
    </div>
  )
}
