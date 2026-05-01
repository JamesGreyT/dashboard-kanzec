/**
 * 0-100 horizontal risk bar with the score on top. Color graded:
 *   0–24   safe        → emerald
 *   25–49  watch       → amber
 *   50–74  high        → orange
 *   75-100 critical    → red
 *
 * Compact (24px wide score + 60px bar) so multiple rows feel scannable.
 * Renders a `shadow-sm` chip on the score cell so the eye lands on it
 * before the surrounding row content — risk is the default sort signal.
 */
function tone(score: number): { fill: string; text: string } {
  if (score < 25)  return { fill: "bg-emerald-500/80", text: "text-emerald-700 dark:text-emerald-400" };
  if (score < 50)  return { fill: "bg-amber-500/80",   text: "text-amber-700 dark:text-amber-400" };
  if (score < 75)  return { fill: "bg-orange-500/85",  text: "text-orange-700 dark:text-orange-400" };
  return                  { fill: "bg-red-600/90",     text: "text-red-700 dark:text-red-400" };
}

export default function RiskScoreBar({
  score,
  width = 60,
}: {
  score: number | null | undefined;
  width?: number;
}) {
  if (score == null || !Number.isFinite(score)) {
    return <span className="text-muted-foreground/60 text-[12px]">—</span>;
  }
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const { fill, text } = tone(s);
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span
        className={"font-mono font-medium tabular-nums text-[12px] shadow-sm rounded-sm px-1 bg-card border " + text}
        title={`Risk ${s}/100`}
      >
        {s}
      </span>
      <span
        className="rounded-full bg-muted/40 overflow-hidden"
        style={{ width, height: 4 }}
        aria-hidden
      >
        <span
          className={"block h-full transition-all " + fill}
          style={{ width: `${s}%` }}
        />
      </span>
    </span>
  );
}
