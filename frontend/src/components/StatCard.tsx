import { ReactNode } from "react";
import Card from "./Card";

/**
 * Almanac stat card. Asymmetric: eyebrow top-left, number right-aligned and
 * larger, trend phrase under the number. No pill chips.
 */
export default function StatCard({
  label,
  value,
  unit,
  trend,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  trend?: { tone: "good" | "risk" | "quiet"; text: string };
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
        <div className="serif nums text-stat-xl text-ink leading-none">
          {value}
        </div>
        {unit && <div className="caption text-ink-3 mt-1">{unit}</div>}
        {trend && (
          <div className={`serif-italic text-body mt-2 ${toneClass}`}>
            {trend.text}
          </div>
        )}
      </div>
    </Card>
  );
}
