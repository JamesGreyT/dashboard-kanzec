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

interface Props {
  /** "YYYY-MM" month value, e.g. "2026-05". */
  value: string
  onChange: (m: string) => void
  /** Optional kicker label rendered inside the trigger button (uppercase
   *  tracked, like the DashboardVPS picker). */
  label?: string
}

/**
 * DashboardVPS-style month picker with a calendar-icon trigger and a
 * dropdown that surfaces:
 *   - presets ("Joriy oy", "O'tgan oy")
 *   - a 12-month grid for the visible year (with prev/next year arrows)
 *
 * Accepts only month-resolution values ("YYYY-MM") because the Dayslice
 * backend anchors on `as_of` rather than a range; full-range picking is
 * deliberately out of scope here.
 */
export default function MonthPicker({ value, onChange, label }: Props) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
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

  const [valueY, valueM] = value.split('-').map(Number)

  // Year shown in the month grid. Initialized to the current value's year
  // so the grid lands on the selected month, then driven by ‹/› arrows.
  // We deliberately don't sync this back to `value` changes via an effect —
  // that creates a setState-in-effect cascade. The corner case where a
  // preset jumps to a past year while the dropdown is closed is acceptable;
  // re-opening will not auto-rewind the year, but the user can arrow back.
  const [viewYear, setViewYear] = useState<number>(valueY || currentY)

  const presets: { labelKey: string; value: string }[] = [
    { labelKey: 'thisMonth', value: currentMonthValue() },
    { labelKey: 'lastMonth', value: shiftMonth(currentMonthValue(), -1) },
  ]

  const triggerLabel = (() => {
    if (value === currentMonthValue()) return t('dateRange.thisMonth')
    if (value === shiftMonth(currentMonthValue(), -1)) return t('dateRange.lastMonth')
    if (!valueY || !valueM) return t('dateRange.pickMonth')
    return `${months[valueM - 1]} ${valueY}`
  })()

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

          <div
            role="dialog"
            aria-label={t('dateRange.pickMonth')}
            className="fixed left-4 right-4 bottom-4 sm:absolute sm:left-auto sm:right-0 sm:bottom-auto sm:top-full sm:mt-2 sm:w-72 z-50 glass-card rounded-xl p-4 shadow-2xl border border-border animate-fade-up space-y-3"
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
                    className={cn('month-btn', value === p.value && 'active')}
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
              {months.map((label, i) => {
                const m = i + 1
                const isFuture = viewYear === currentY && m > currentM
                const isFutureYear = viewYear > currentY
                const disabled = isFuture || isFutureYear
                const cellValue = `${viewYear}-${String(m).padStart(2, '0')}`
                const isActive = cellValue === value
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(cellValue)
                      close()
                    }}
                    className={cn(
                      'month-btn text-center',
                      isActive && 'active',
                      disabled && 'opacity-30 cursor-not-allowed',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
