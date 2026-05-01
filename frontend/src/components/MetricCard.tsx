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
 * Editorial KPI card — the primary KPI unit on every dashboard page.
 * Eyebrow label, Fraunces serif value via .kpi-num, optional delta chip
 * (mint / coral / ink3) and sparkline strip.
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
      ? "text-mintdk"
      : deltaTone === "down"
      ? "text-coraldk"
      : "text-ink3";

  const Wrapper: any = href ? Link : "div";
  const baseCard =
    "flex flex-col gap-1.5 min-w-0 bg-card border border-line rounded-2xl shadow-card p-6";
  const wrapperProps: any = href
    ? {
        to: href,
        title: title ?? "",
        "aria-label": `${label} — open detail`,
        className:
          baseCard +
          " group transition-shadow hover:shadow-cardlg " +
          "outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2",
      }
    : { role: "group", "aria-label": label, className: baseCard };

  return (
    <Wrapper {...wrapperProps}>
      <div className="eyebrow flex items-center gap-1">
        <span>{label}</span>
        {href && (
          <ExternalLink
            className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
            aria-hidden
          />
        )}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="kpi-num text-[36px] md:text-[44px] text-ink">
          {value}
        </div>
        {unit && (
          <div className="text-[13px] text-ink3 leading-none pb-1">{unit}</div>
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
              <span className="text-ink3 text-[11px] ml-1">{deltaLabel}</span>
            )}
          </div>
        )}
        {sparkline && sparkline.length > 0 && (
          <div className="ml-auto">
            <Sparkline values={sparkline} width={72} height={22} />
          </div>
        )}
      </div>
      {hint && <div className="text-[11px] text-ink3">{hint}</div>}
    </Wrapper>
  );
}
