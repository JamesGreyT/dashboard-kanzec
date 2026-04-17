export type StatusTone = "live" | "staged" | "failed" | "quiet";

/**
 * Status glyph.
 *
 *   live   → 2px vermilion composing-stick bar + "live" in good
 *   staged → soft mustard pill
 *   failed → soft brick pill
 *   quiet  → soft olive pill
 *
 * Only `live` gets the standout bar. Keeps the eye's attention on fresh
 * things and lets the other tones sit quietly as tinted labels.
 */
export default function StatusPill({
  tone,
  children,
}: {
  tone: StatusTone;
  children: React.ReactNode;
}) {
  if (tone === "live") {
    return (
      <span className="inline-flex items-center gap-2 text-caption font-medium text-good whitespace-nowrap">
        <span className="block w-[2px] h-[11px] bg-mark shrink-0" />
        {children}
      </span>
    );
  }
  const m = {
    staged: "bg-warn-bg text-warn",
    failed: "bg-risk-bg text-risk",
    quiet: "bg-quiet-bg text-quiet",
  }[tone];
  return (
    <span
      className={`inline-flex items-center h-[22px] px-2.5 rounded-full ${m} text-caption font-medium whitespace-nowrap`}
    >
      {children}
    </span>
  );
}
