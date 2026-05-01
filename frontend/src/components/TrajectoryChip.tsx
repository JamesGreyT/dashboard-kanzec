/**
 * Compact trajectory pill for "is this customer growing?". Shows
 * `+18%` (emerald, ▲), `−32%` (red, ▼), or `flat` (muted) given a
 * fractional delta. NULL → em-dash. Used per row in Client 360°.
 */
export default function TrajectoryChip({
  pct,
  flatBand = 0.05,
}: {
  pct: number | null | undefined;
  /** ±5% counts as "flat" by default — purely directional noise. */
  flatBand?: number;
}) {
  if (pct == null || !Number.isFinite(pct)) {
    return <span className="text-muted-foreground/60 text-[12px]">—</span>;
  }
  if (Math.abs(pct) < flatBand) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground tabular-nums">
        <span aria-hidden>·</span>
        <span>flat</span>
      </span>
    );
  }
  const up = pct > 0;
  const sign = up ? "+" : "";
  const cls = up
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-red-700 dark:text-red-400";
  const arrow = up ? "▲" : "▼";
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-[11px] font-mono font-medium tabular-nums " +
        cls
      }
    >
      <span aria-hidden>{arrow}</span>
      <span>{sign}{(pct * 100).toFixed(0)}%</span>
    </span>
  );
}
