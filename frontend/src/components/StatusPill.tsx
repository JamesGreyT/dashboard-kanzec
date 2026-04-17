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
      <span className="inline-flex items-center gap-1.5 text-caption font-medium text-good whitespace-nowrap leading-none">
        <span
          aria-hidden
          className="block w-[2px] h-[10px] bg-mark shrink-0 translate-y-[-0.5px]"
        />
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
