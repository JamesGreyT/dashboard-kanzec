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
  const code = (currency ?? 'uzs').toLowerCase()
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

// ── Cell formatter for the registry table ─────────────────────────────────

export function formatCell(value: unknown, col: Column, lang = 'uz'): string {
  if (value === null || value === undefined || value === '') return '—'

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

// ── Roman numerals (lower-case for the folio footer) ──────────────────────

const ROMAN_PAIRS: [number, string][] = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
  [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
]

export function toRomanLower(n: number): string {
  if (n <= 0) return '—'
  let out = ''
  let rem = Math.floor(n)
  for (const [v, s] of ROMAN_PAIRS) {
    while (rem >= v) {
      out += s
      rem -= v
    }
  }
  return out
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
