import { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import Sparkline from "./Sparkline";

/** Format a number in Quarto house style: zero → em-dash, optional compact.
 *  Best for in-table money/qty cells where "—" visually dedupes zero rows. */
export function fmtNum(n: number | null | undefined, compact = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n === 0) return "—";
  if (compact && Math.abs(n) >= 1000) {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    return Math.round(n / 1000).toLocaleString("en-US") + "k";
  }
  return Math.round(n).toLocaleString("en-US");
}

/** Format a count for a KPI card. Unlike `fmtNum`, zero is rendered as
 *  "0" because for a count metric 0 is a valid answer, not "no data". */
export function fmtCount(n: number | null | undefined, compact = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (compact && Math.abs(n) >= 1000) {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    return Math.round(n / 1000).toLocaleString("en-US") + "k";
  }
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

/**
 * Bigger, more editorial sibling of StatCard — the primary KPI unit on
 * the three new dashboards. No card chrome; sits directly on the page
 * with an eyebrow label above and an optional sparkline / delta chip.
 */
export default function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  sparkline,
  hint,
  href,
  title,
}: {
  label: string;
  value: string | ReactNode;
  unit?: string;
  /** -1..+1 fractional change vs comparison period. Color + arrow derived. */
  delta?: number | null;
  /** Label shown next to the delta, e.g. "vs prior 90 days" */
  deltaLabel?: string;
  sparkline?: number[];
  hint?: string;
  /** If present, the entire card becomes an anchor → deep-link to a
   *  filtered detail view (e.g. `/data/orders?person=123`). */
  href?: string;
  title?: string;
}) {
  const deltaTone =
    delta == null || !Number.isFinite(delta)
      ? "neutral"
      : delta > 0.005 ? "up"
      : delta < -0.005 ? "down"
      : "neutral";
  const DeltaIcon = deltaTone === "up" ? TrendingUp : deltaTone === "down" ? TrendingDown : Minus;
  const deltaClass =
    deltaTone === "up"
      ? "text-emerald-700 dark:text-emerald-400"
      : deltaTone === "down"
      ? "text-red-700 dark:text-red-400"
      : "text-muted-foreground";

  const Wrapper: any = href ? Link : "div";
  const wrapperProps: any = href
    ? {
        to: href,
        title: title ?? "",
        "aria-label": `${label} — open detail`,
        className:
          "flex flex-col gap-1.5 min-w-0 group -mx-2 px-2 py-1 rounded-md transition-colors " +
          "hover:bg-muted/40 focus-visible:bg-muted/50 " +
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
      }
    : { role: "group", "aria-label": label, className: "flex flex-col gap-1.5 min-w-0" };

  return (
    <Wrapper {...wrapperProps}>
      <div className="eyebrow !tracking-[0.18em] flex items-center gap-1">
        <span>{label}</span>
        {href && (
          <ExternalLink
            className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
            aria-hidden
          />
        )}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-display text-[36px] md:text-[40px] font-medium leading-[1] tracking-tight text-foreground tabular-nums">
          {value}
        </div>
        {unit && (
          <div className="text-[13px] text-muted-foreground leading-none pb-1">{unit}</div>
        )}
      </div>
      <div className="flex items-center gap-3 min-h-[18px]">
        {delta !== undefined && delta !== null && (
          <div
            className={`flex items-center gap-1 text-[12px] font-mono tabular-nums ${deltaClass}`}
            aria-label={`${deltaTone === "up" ? "Increased" : deltaTone === "down" ? "Decreased" : "Unchanged"} by ${fmtPct(delta)} ${deltaLabel ?? ""}`.trim()}
          >
            <DeltaIcon className="h-3 w-3" aria-hidden />
            <span>{fmtPct(delta)}</span>
            {deltaLabel && (
              <span className="text-muted-foreground italic text-[11px] ml-1">{deltaLabel}</span>
            )}
          </div>
        )}
        {sparkline && sparkline.length > 0 && (
          <div className="ml-auto">
            <Sparkline values={sparkline} width={72} height={22} />
          </div>
        )}
      </div>
      {hint && (
        <div className="text-[11px] text-muted-foreground italic">{hint}</div>
      )}
    </Wrapper>
  );
}
