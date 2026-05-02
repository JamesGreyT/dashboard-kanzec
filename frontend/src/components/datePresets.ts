import { currentMonthValue } from '@/lib/format'

/** Picker value: either an entire month ("YYYY-MM") or a custom date
 *  range (`{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`). */
export type DateRangeValue =
  | { kind: 'month'; month: string }
  | { kind: 'range'; from: string; to: string }

export type DateRangePreset = { labelKey: string; value: DateRangeValue }

function shiftMonthValue(value: string, delta: number): string {
  const [y, m] = value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function shiftDays(iso: string, delta: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

function monthRangeIso(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const last = new Date(year, month, 0)
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  return { from, to }
}

/** Default month-grain presets — "Joriy oy" / "O'tgan oy". Used when the
 *  picker's caller doesn't pass a custom `presets` prop. */
export function defaultMonthPresets(): DateRangePreset[] {
  return [
    { labelKey: 'thisMonth', value: { kind: 'month', month: currentMonthValue() } },
    { labelKey: 'lastMonth', value: { kind: 'month', month: shiftMonthValue(currentMonthValue(), -1) } },
  ]
}

/** Day-grain presets for sections that need richer time-window options:
 *  Today, Yesterday, Last 7 / 30 days, This month, Last month, This year.
 *  All emit `kind: 'range'` so consumers always get explicit `from`/`to`. */
export function defaultDayPresets(): DateRangePreset[] {
  const now = new Date()
  const today = todayIso()
  const yesterday = shiftDays(today, -1)
  const last7 = shiftDays(today, -6)
  const last30 = shiftDays(today, -29)
  const thisMonth = monthRangeIso(now.getFullYear(), now.getMonth() + 1)
  const lastMonthY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const lastMonthM = now.getMonth() === 0 ? 12 : now.getMonth()
  const lastMonth = monthRangeIso(lastMonthY, lastMonthM)
  const thisYearFrom = `${now.getFullYear()}-01-01`
  return [
    { labelKey: 'today', value: { kind: 'range', from: today, to: today } },
    { labelKey: 'yesterday', value: { kind: 'range', from: yesterday, to: yesterday } },
    { labelKey: 'last7', value: { kind: 'range', from: last7, to: today } },
    { labelKey: 'last30', value: { kind: 'range', from: last30, to: today } },
    { labelKey: 'thisMonth', value: { kind: 'range', ...thisMonth } },
    { labelKey: 'lastMonth', value: { kind: 'range', ...lastMonth } },
    { labelKey: 'thisYear', value: { kind: 'range', from: thisYearFrom, to: today } },
  ]
}
