import type { Column } from '@/api/hooks'

const NBSP = ' '

export function formatNumber(n: number, opts?: { decimals?: number }): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', {
    minimumFractionDigits: opts?.decimals ?? 0,
    maximumFractionDigits: opts?.decimals ?? 0,
  })
}

export function formatCurrency(n: number, currency: string | null): string {
  if (!Number.isFinite(n)) return '—'
  // Currency codes are always uppercase in financial reports — "35 USD" not
  // "35 usd". The Smartup ETL ledger is denominated in USD (see
  // backend/app/data/catalog.py, where `product_amount` is tagged
  // currency="USD"); default to USD when the schema doesn't tag one.
  const code = (currency ?? 'USD').toUpperCase()
  return `${formatNumber(n)}${NBSP}${code}`
}

export function formatPercent(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(decimals)}%`
}

const MONTH_ABBR_UZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
const MONTH_ABBR_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_ABBR_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

function months(lang: string): string[] {
  if (lang.startsWith('ru')) return MONTH_ABBR_RU
  if (lang.startsWith('en')) return MONTH_ABBR_EN
  return MONTH_ABBR_UZ
}

export function formatShortDate(iso: string | null | undefined, lang = 'uz'): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return String(iso)
  const day = d.getDate()
  const mo = months(lang)[d.getMonth()]
  const yr = d.getFullYear()
  const thisYear = new Date().getFullYear()
  return yr === thisYear ? `${day}${NBSP}${mo}` : `${day}${NBSP}${mo}${NBSP}${yr}`
}

export function formatLongDate(iso: string | null | undefined, lang = 'uz'): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return String(iso)
  const day = d.getDate()
  const mo = months(lang)[d.getMonth()]
  const yr = d.getFullYear()
  return `${day}${NBSP}${mo}${NBSP}${yr}`
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// ── ID heuristic ──────────────────────────────────────────────────────────
// The backend's `id_column` flag isn't always set on numeric ID fields like
// `person_id` (which the schema sometimes returns as type=numeric, id_column=
// false). Fall back to a name-pattern check so the renderer treats them as
// machine identifiers (Plex Mono, no thousands separators).

const ID_NAME_PATTERN = /(^|_)(id|tin|code|sku|barcode|guid|uuid|number|hash)$/i

export function isIdLike(col: Column): boolean {
  if (col.id_column) return true
  return ID_NAME_PATTERN.test(col.name)
}

// True if the column should render in Playfair Display (currency-tagged
// numerics only — plain integers and ID-like numerics get DM Sans / Plex Mono).
export function shouldRenderAsFigure(col: Column): boolean {
  return col.type === 'numeric' && !!col.currency && !isIdLike(col)
}

// ── Cell formatter for the registry table ─────────────────────────────────

export function formatCell(value: unknown, col: Column, lang = 'uz'): string {
  if (value === null || value === undefined || value === '') return '—'

  // ID-like fields (whether numeric or text) render verbatim in monospace.
  // No thousands separators, no currency suffix.
  if (isIdLike(col)) {
    return String(value)
  }

  switch (col.type) {
    case 'date':
      return formatShortDate(String(value), lang)
    case 'timestamp': {
      const d = new Date(String(value))
      if (Number.isNaN(d.getTime())) return String(value)
      return `${formatShortDate(d.toISOString(), lang)}${NBSP}${formatTime(d.toISOString())}`
    }
    case 'numeric': {
      const n = typeof value === 'number' ? value : Number(value)
      if (col.currency) return formatCurrency(n, col.currency)
      return formatNumber(n, { decimals: 0 })
    }
    case 'int': {
      const n = typeof value === 'number' ? value : Number(value)
      return formatNumber(n, { decimals: 0 })
    }
    case 'text':
    default:
      return String(value)
  }
}

// ── Headline column heuristic for drawer / mobile card ────────────────────
// Prefer columns that semantically describe an entity ("name", "client_name",
// "person_name", "title") over generic text columns that happen to come first
// (e.g. "room_name" on an order row, where the client matters more).

const HEADLINE_PRIORITY = [
  'name',
  'client_name',
  'person_name',
  'company_name',
  'short_name',
  'title',
  'description',
]

export function pickHeadlineColumn(columns: Column[]): Column | undefined {
  for (const wanted of HEADLINE_PRIORITY) {
    const c = columns.find((col) => col.name === wanted && col.visible)
    if (c) return c
  }
  // Fallback: first visible text column that isn't an ID
  return columns.find((c) => c.visible && c.type === 'text' && !isIdLike(c))
}

// ── Composite primary key encoding for /api/data/{key}/row/{pk} ───────────

export function encodePk(row: Record<string, unknown>, pkColumns: string[]): string {
  return pkColumns
    .map((col) => {
      const v = row[col]
      return v === null || v === undefined ? '' : String(v)
    })
    .join('~')
}

// ── Aging bucket → status badge variant ───────────────────────────────────

export function agingBadgeVariant(daysOverdue: number | null | undefined, bucket?: string | null):
  | 'critical'
  | 'urgent'
  | 'markdown'
  | 'plan'
  | 'monitor' {
  if (bucket === '90+' || (typeof daysOverdue === 'number' && daysOverdue >= 90)) return 'critical'
  if (bucket === '60-90' || (typeof daysOverdue === 'number' && daysOverdue >= 60)) return 'urgent'
  if (bucket === '30-60' || (typeof daysOverdue === 'number' && daysOverdue >= 30)) return 'markdown'
  if (bucket === 'current' || (typeof daysOverdue === 'number' && daysOverdue >= 0)) return 'monitor'
  return 'plan'
}

/** Month picker value for "this month", in "YYYY-MM" form. */
export function currentMonthValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
