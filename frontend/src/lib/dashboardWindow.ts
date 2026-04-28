/**
 * Date-window helpers used by the Boshqaruv panel tiles.
 *
 * Keeping these isolated from `WindowPicker.defaultWindow()` so the
 * dashboard's window choices don't accidentally drift with the Sales /
 * Payments page defaults if those change later. Today's defaults match,
 * but the dashboard's "last 90 days" headline is fixed by design.
 */

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** {from: today-89d, to: today} as ISO YYYY-MM-DD strings (inclusive). */
export function last90Days(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 89);
  return { from: isoDate(from), to: isoDate(to) };
}
