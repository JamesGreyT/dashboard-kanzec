/**
 * Editorial loading + empty phrases. No spinners, no shimmer, no skeleton.
 * The Almanac's answer to async state is typeset copy.
 */

const PHRASE = {
  loading: "setting in type",
  empty: "no entries on record",
  filtered: "no entries match this filter",
  error: "the press is down",
} as const;

export function Phrase({
  kind = "loading",
  className = "",
}: {
  kind?: keyof typeof PHRASE;
  className?: string;
}) {
  return (
    <div
      className={`py-10 text-center caption italic text-ink-3 ${
        kind === "error" ? "border-l-2 border-risk pl-3 text-risk" : ""
      } ${className}`}
    >
      — {PHRASE[kind]} —
    </div>
  );
}

/**
 * Ruled-paper loader — draws N staggered 1px rules at the height of a
 * data row. The visual metaphor: the sheet has been laid down, the
 * type hasn't been set yet. Fades out when real rows arrive.
 */
export function RuledLoader({ rows = 7 }: { rows?: number }) {
  const widths = ["72%", "54%", "86%", "46%", "62%", "78%", "40%"];
  return (
    <div>
      <div className="px-6 py-6 space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-[1px] bg-rule"
            style={{ width: widths[i % widths.length] }}
          />
        ))}
      </div>
      <div className="pb-6 text-center caption italic text-ink-3">
        — {PHRASE.loading} —
      </div>
    </div>
  );
}
