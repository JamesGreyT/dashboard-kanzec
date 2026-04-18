import { useTranslation } from "react-i18next";

export type PhraseKind = "loading" | "empty" | "filtered" | "error" | "no_dispatches" | "awaiting_wire";

/**
 * Editorial loading / empty phrases. No spinners, no shimmer — just type.
 * All four base phrases are translated per-locale (see i18n/locales/*.json).
 */
export function Phrase({
  kind = "loading",
  className = "",
}: {
  kind?: PhraseKind;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`py-10 text-center caption italic text-ink-3 ${
        kind === "error" ? "border-l-2 border-risk pl-3 text-risk" : ""
      } ${className}`}
    >
      {t(`common.${kind}`)}
    </div>
  );
}

/**
 * Ruled-paper loader — 7 1px rules that redraw left-to-right in sequence.
 * Each row carries a `--d` CSS var that offsets its wave animation by 80ms
 * so the rules cascade like a line being struck.
 */
export function RuledLoader({ rows = 7 }: { rows?: number }) {
  const { t } = useTranslation();
  const widths = ["72%", "54%", "86%", "46%", "62%", "78%", "40%"];
  return (
    <div>
      <div className="px-6 py-6 space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-[1px] bg-rule rule-wave"
            style={{
              width: widths[i % widths.length],
              // @ts-expect-error — CSS custom property
              "--d": `${i * 80}ms`,
            }}
          />
        ))}
      </div>
      <div className="pb-6 text-center caption italic text-ink-3">
        {t("common.loading")}
      </div>
    </div>
  );
}
