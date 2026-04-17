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
  const toneClass = trend
    ? {
        good: "text-good",
        risk: "text-risk",
        quiet: "text-ink-3",
      }[trend.tone]
    : "";
  return (
    <Card className="min-h-[168px] flex flex-col">
      <div className="eyebrow">{label}</div>
      <div className="flex-1 flex flex-col justify-end items-end">
        <div
          className="serif nums text-stat-xl text-ink leading-none"
          style={{ fontVariantNumeric: "tabular-nums lining-nums" }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={String(value)}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
              className="inline-block"
            >
              {value}
            </motion.span>
          </AnimatePresence>
        </div>
        {unit && <div className="caption text-ink-3 mt-1">{unit}</div>}
        {trend && (
          <>
            <div className="leader w-full" />
            <div className="caption italic text-ink-2 self-end">
              {trend.arrow && (
                <span className={`not-italic mr-1.5 ${toneClass}`}>
                  {trend.arrow}
                </span>
              )}
              {trend.text}
            </div>
          </>
        )}
        {children}
      </div>
    </Card>
  );
}
