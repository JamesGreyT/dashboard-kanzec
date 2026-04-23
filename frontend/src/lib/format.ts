// Locale-safe date formatters.
//
// Intl.DateTimeFormat under the "uz" locale emits month tokens like
// "M01", "M02", … on several ICU builds (browsers shipping CLDR data
// where Uzbek lacks short-month names), producing strings like
// "2026 M14 12". We bypass the locale machinery entirely for month
// names and always emit readable Latin short months.

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDate(d: Date | string | number | null | undefined): string {
  if (d == null || d === "") return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  return `${day} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTime(d: Date | string | number | null | undefined): string {
  if (d == null || d === "") return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}, ${hh}:${mm}`;
}

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Monday, 23 April 2026, 18:42" — Tashkent wall-clock, locale-safe. */
export function formatTashkentNow(): string {
  // Build the Tashkent wall clock explicitly so we don't trust the host TZ.
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const mo = Number(get("month"));
  const d = get("day");
  const hh = get("hour").padStart(2, "0");
  const mm = get("minute").padStart(2, "0");
  const weekdayIdx = new Date(
    Date.UTC(Number(y), mo - 1, Number(d)),
  ).getUTCDay();
  return `${WEEKDAYS[weekdayIdx]}, ${d} ${MONTHS_LONG[mo - 1]} ${y}, ${hh}:${mm}`;
}

/** Parse "YYYY-MM-DD" as a calendar date (no TZ shift). */
export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d} ${MONTHS_SHORT[+mo - 1]} ${y}`;
}
