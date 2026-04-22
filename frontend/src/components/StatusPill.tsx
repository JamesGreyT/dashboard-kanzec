export type StatusTone = "live" | "staged" | "failed" | "quiet";

/**
 * Status pill — Folio vocabulary.
 *
 *   live   → filled good-bg wash + good text + leading 6px dot (pulses
 *            at ~1.4Hz only when `pulse=true`)
 *   staged → filled warn wash
 *   failed → filled risk wash
 *   quiet  → filled quiet wash
 *
 * Labels render in uppercase mono with 0.05em tracking (matches the Folio
 * preview).  Dot always leads and uses currentColor so tone reads as one.
 *
 * Only one pulsing dot should exist globally at a time — the Dashboard's
 * worker panel sets `pulse`; Ops shows multiple `live` report cards, so
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
  const toneClass = {
    live:   "bg-good-bg text-good",
    staged: "bg-warn-bg text-warn",
    failed: "bg-risk-bg text-risk",
    quiet:  "bg-quiet-bg text-quiet",
  }[tone];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 h-[22px] px-3 rounded-chip font-mono text-[11px] font-semibold uppercase tracking-[0.05em] whitespace-nowrap",
        toneClass,
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "block w-[6px] h-[6px] rounded-full bg-current shrink-0",
          tone === "live" && pulse ? "animate-live-pulse" : "",
        ].join(" ")}
      />
      {children}
    </span>
  );
}
