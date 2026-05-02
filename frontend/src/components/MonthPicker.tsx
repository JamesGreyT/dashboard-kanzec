import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { currentMonthValue } from '@/lib/format'

const DM_SANS = "'DM Sans', system-ui"

const MONTH_ABBRS_UZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
const MONTH_ABBRS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_ABBRS_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

function monthLabels(lang: string): string[] {
  if (lang.startsWith('ru')) return MONTH_ABBRS_RU
  if (lang.startsWith('uz')) return MONTH_ABBRS_UZ
  return MONTH_ABBRS_EN
}

function shiftMonth(value: string, delta: number): string {
  const [y, m] = value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Picker value: either an entire month ("YYYY-MM") or a custom date
 *  range (`{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`). */
export type DateRangeValue =
  | { kind: 'month'; month: string }
  | { kind: 'range'; from: string; to: string }

interface Props {
  value: DateRangeValue
  onChange: (v: DateRangeValue) => void
  /** Optional kicker label rendered inside the trigger button. */
  label?: string
}

/**
 * DashboardVPS-style date picker. Surfaces:
 *   - Preset chips (Joriy oy, O'tgan oy)
 *   - 12-month grid for the visible year, with prev/next year arrows
 *   - Custom from/to range expander for arbitrary windows
 *
 * Emits a `DateRangeValue` discriminated union — callers can branch on
 * `kind` to decide whether to send the backend an `as_of` anchor (month
 * mode) or `slice_start` + `slice_end` (range mode).
 */
export default function MonthPicker({ value, onChange, label }: Props) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(value.kind === 'range')
  const [error, setError] = useState<string | null>(null)
  const months = monthLabels(i18n.language)

  const close = useCallback(() => setOpen(false), [])

  // Escape closes the dropdown.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  const now = new Date()
  const currentY = now.getFullYear()
  const currentM = now.getMonth() + 1

  const monthValue = value.kind === 'month' ? value.month : ''
  const [valueY, valueM] = monthValue.split('-').map((s) => Number(s) || 0)

  // Year shown in the month grid. Initialized to the current value's year
  // so the grid lands on the selected month, then driven by ‹/› arrows.
  const [viewYear, setViewYear] = useState<number>(valueY || currentY)

  // Custom-range working state — drafts that only emit on Apply, so a
  // half-typed date doesn't fire useless backend requests.
  const [draftFrom, setDraftFrom] = useState<string>(
    value.kind === 'range' ? value.from : '',
  )
  const [draftTo, setDraftTo] = useState<string>(
    value.kind === 'range' ? value.to : '',
  )

  const presets: { labelKey: string; value: DateRangeValue }[] = [
    { labelKey: 'thisMonth', value: { kind: 'month', month: currentMonthValue() } },
    { labelKey: 'lastMonth', value: { kind: 'month', month: shiftMonth(currentMonthValue(), -1) } },
  ]

  const triggerLabel = (() => {
    if (value.kind === 'range') {
      // "Apr 15 → May 10" — month-day register, year is implied
      const formatRangePart = (iso: string) => {
        const [, m, d] = iso.split('-').map(Number)
        return `${months[m - 1]} ${d}`
      }
      return `${formatRangePart(value.from)} → ${formatRangePart(value.to)}`
    }
    if (value.month === currentMonthValue()) return t('dateRange.thisMonth')
    if (value.month === shiftMonth(currentMonthValue(), -1)) return t('dateRange.lastMonth')
    if (!valueY || !valueM) return t('dateRange.pickMonth')
    return `${months[valueM - 1]} ${valueY}`
  })()

  const sameValue = (a: DateRangeValue, b: DateRangeValue) => {
    if (a.kind !== b.kind) return false
    if (a.kind === 'month' && b.kind === 'month') return a.month === b.month
    if (a.kind === 'range' && b.kind === 'range') return a.from === b.from && a.to === b.to
    return false
  }

  function applyCustom() {
    if (!draftFrom || !draftTo) {
      setError(t('dateRange.invalidRange'))
      return
    }
    if (draftFrom > draftTo) {
      setError(t('dateRange.invalidRange'))
      return
    }
    setError(null)
    onChange({ kind: 'range', from: draftFrom, to: draftTo })
    close()
  }

  return (
    <div className="relative" style={{ fontFamily: DM_SANS }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-input border border-border text-foreground hover:border-[#D4A843] transition-colors shrink-0"
      >
        <CalendarDays size={13} className="text-[#D4A843] shrink-0" aria-hidden />
        {label && (
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
            {label}
          </span>
        )}
        <span className="text-muted-foreground whitespace-nowrap">{triggerLabel}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent" onClick={close} role="presentation" />

          {/* Anchor to the trigger's left edge so the panel opens rightward.
              On <sm we still pin to viewport edges so it doesn't fly off
              the screen. */}
          <div
            role="dialog"
            aria-label={t('dateRange.pickMonth')}
            className="fixed left-4 right-4 bottom-4 sm:absolute sm:left-0 sm:right-auto sm:bottom-auto sm:top-full sm:mt-2 sm:w-72 z-50 glass-card rounded-xl p-4 shadow-2xl border border-border animate-fade-up space-y-3"
          >
            {/* Presets */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {t('dateRange.presets')}
              </p>
              <div className="flex flex-wrap gap-1">
                {presets.map((p) => (
                  <button
                    key={p.labelKey}
                    type="button"
                    onClick={() => {
                      onChange(p.value)
                      close()
                    }}
                    className={cn('month-btn', sameValue(value, p.value) && 'active')}
                  >
                    {t(`dateRange.${p.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Year scrubber */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewYear((y) => y - 1)}
                className="month-btn px-2"
                aria-label={t('dateRange.prevYear')}
              >
                ‹
              </button>
              <span
                className="text-xs font-semibold tracking-wider tabular-nums"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {viewYear}
              </span>
              <button
                type="button"
                onClick={() => setViewYear((y) => Math.min(y + 1, currentY))}
                disabled={viewYear >= currentY}
                className="month-btn px-2 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('dateRange.nextYear')}
              >
                ›
              </button>
            </div>

            {/* Month grid for the visible year */}
            <div className="grid grid-cols-4 gap-1">
              {months.map((monthLabel, i) => {
                const m = i + 1
                const isFuture = viewYear === currentY && m > currentM
                const isFutureYear = viewYear > currentY
                const disabled = isFuture || isFutureYear
                const cellMonth = `${viewYear}-${String(m).padStart(2, '0')}`
                const isActive = value.kind === 'month' && value.month === cellMonth
                return (
                  <button
                    key={monthLabel}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange({ kind: 'month', month: cellMonth })
                      close()
                    }}
                    className={cn(
                      'month-btn text-center',
                      isActive && 'active',
                      disabled && 'opacity-30 cursor-not-allowed',
                    )}
                  >
                    {monthLabel}
                  </button>
                )
              })}
            </div>

            {/* Custom from/to range — collapsed by default, expanded if the
                current value is already a custom range. The inputs are
                drafts; the value only emits on Apply. */}
            <div className="border-t border-border/40 pt-3">
              <button
                type="button"
                onClick={() => setShowCustom((s) => !s)}
                className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCustom ? '▾' : '▸'} {t('dateRange.customRange')}
              </button>
              {showCustom && (
                <div className="mt-2 space-y-2 animate-fade-up">
                  <div>
                    <label htmlFor="dr-from" className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      {t('dateRange.from')}
                    </label>
                    <input
                      id="dr-from"
                      type="date"
                      value={draftFrom}
                      max={todayIso()}
                      onChange={(e) => {
                        setError(null)
                        setDraftFrom(e.target.value)
                      }}
                      className="w-full text-xs bg-input border border-border rounded-md px-2 py-1.5 text-foreground mt-0.5"
                    />
                  </div>
                  <div>
                    <label htmlFor="dr-to" className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      {t('dateRange.to')}
                    </label>
                    <input
                      id="dr-to"
                      type="date"
                      value={draftTo}
                      max={todayIso()}
                      onChange={(e) => {
                        setError(null)
                        setDraftTo(e.target.value)
                      }}
                      className="w-full text-xs bg-input border border-border rounded-md px-2 py-1.5 text-foreground mt-0.5"
                    />
                  </div>
                  {error && (
                    <p className="text-[10px] text-red-500 font-medium">{error}</p>
                  )}
                  <button
                    type="button"
                    onClick={applyCustom}
                    className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-[#D4A843] text-black hover:bg-[#C49833] transition-colors"
                  >
                    {t('dateRange.apply')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
