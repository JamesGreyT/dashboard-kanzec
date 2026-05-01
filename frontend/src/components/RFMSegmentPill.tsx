/**
 * Color-coded RFM segment pill. Maps each of the 11 standard segments
 * to a tone:
 *   Champions / Loyal           → emerald     (the asset)
 *   New customers / Promising   → primary     (early signal)
 *   Potential loyalists         → muted       (default)
 *   Need attention / About to sleep → muted-warm
 *   At risk / Cannot lose them  → amber       (act now)
 *   Hibernating                 → warm        (declining)
 *   Lost                        → red         (inactive)
 *
 * Compact (10px label, 1px border) so it fits inside a table row
 * without dominating the cell.
 */
type Tone = "emerald" | "primary" | "amber" | "warm" | "red" | "muted";

const SEGMENT_TONE: Record<string, Tone> = {
  "Champions": "emerald",
  "Loyal": "emerald",
  "New customers": "primary",
  "Promising": "primary",
  "Potential loyalists": "muted",
  "Need attention": "warm",
  "About to sleep": "warm",
  "At risk": "amber",
  "Cannot lose them": "amber",
  "Hibernating": "warm",
  "Lost": "red",
};

const TONE_CLASSES: Record<Tone, string> = {
  emerald:
    "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  primary:
    "bg-primary/10 text-primary border-primary/30",
  amber:
    "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  warm:
    "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900",
  red:
    "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  muted:
    "bg-muted text-muted-foreground border-border",
};

export default function RFMSegmentPill({
  segment,
  score,
}: {
  segment: string | null | undefined;
  /** Optional R/F/M concat to surface in the title attribute. */
  score?: string | null;
}) {
  if (!segment) {
    return <span className="text-muted-foreground/60 text-[11px]">—</span>;
  }
  const tone = SEGMENT_TONE[segment] ?? "muted";
  const cls = TONE_CLASSES[tone];
  return (
    <span
      title={score ? `RFM ${score}` : undefined}
      className={
        "inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase tracking-[0.06em] whitespace-nowrap " +
        cls
      }
    >
      {segment}
    </span>
  );
}
