export type StatusTone = "live" | "staged" | "failed" | "quiet";

/**
 * Status glyph.
 *
 *   live   → 6px vermilion dot (pulses at 1.4Hz only when `pulse`) +
 *            "live" text in good
 *   staged → soft mustard pill
 *   failed → soft brick pill
 *   quiet  → soft olive pill
 *
 * Only one pulsing dot should exist globally at a time — the Dashboard's
 * worker panel sets `pulse`; Ops shows multiple `live` report cards so
 * pulse is omitted there to keep the eye from fidgeting.
 */
export default function StatusPill({
  tone,
  children,
  pulse = false,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  pulse?: boolean;
}) {
  if (tone === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption font-medium text-good whitespace-nowrap leading-none">
        <span
          aria-hidden
          className={[
            "block w-[6px] h-[6px] rounded-full bg-mark shrink-0",
            pulse ? "animate-live-pulse" : "",
          ].join(" ")}
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
