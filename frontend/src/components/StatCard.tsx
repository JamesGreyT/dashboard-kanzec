import { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import Card from "./Card";

/**
 * Almanac stat card. Asymmetric: eyebrow top-left, number right-aligned and
 * larger, leader, trend phrase under the number in small italic caption.
 * The trend's arrow glyph carries the tone; the phrase stays in ink-2 so
 * the only colored element in the card is the number's eyebrow.
 *
 * Number crossfades when the value changes (TanStack Query refetch).
 */
export default function StatCard({
  label,
  value,
  unit,
  trend,
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  trend?: { tone: "good" | "risk" | "quiet"; arrow?: string; text: string };
  children?: ReactNode;
}) {
  const chipClass = trend
    ? {
        good: "bg-good-bg text-good",
        risk: "bg-risk-bg text-risk",
        quiet: "bg-quiet-bg text-quiet",
      }[trend.tone]
    : "";
  return (
    <Card className="min-h-[168px] flex flex-col">
      {/* .eyebrow-mono + leading 5px orange dot — Folio's KPI label voice. */}
      <div className="eyebrow-mono flex items-center gap-2 before:content-[''] before:w-[5px] before:h-[5px] before:bg-mark before:rounded-full">
        {label}
      </div>
      <div className="flex-1 flex flex-col justify-end items-end">
        <div
          className="serif nums text-stat-xl text-ink leading-none font-medium"
          style={{ fontVariantNumeric: "tabular-nums lining-nums" }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={String(value)}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.26, ease: [0.2, 0.85, 0.25, 1] }}
              className="inline-block"
            >
              {value}
            </motion.span>
          </AnimatePresence>
        </div>
        {unit && <div className="caption text-ink-3 mt-1 font-serif italic">{unit}</div>}
        {trend && (
          <div
            className={`mt-3 inline-flex items-center gap-1.5 px-[11px] py-1 rounded-chip font-semibold text-caption tabular-nums ${chipClass}`}
          >
            {trend.arrow && (
              <span className="text-[13px] leading-none">{trend.arrow}</span>
            )}
            <span>{trend.text}</span>
          </div>
        )}
        {children}
      </div>
    </Card>
  );
}
