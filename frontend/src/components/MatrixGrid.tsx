import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fmtNum } from "./MetricCard";
import Sparkline from "./Sparkline";
import { columnMax, tintBackground } from "../lib/heatmap";

export interface MatrixRow {
  label: string;
  values: number[];
  share_pct: number[];
  trend_delta_pct: number | null;
  rank_now: number | null;
  rank_prev: number | null;
  plan: Array<number | null>;
  plan_index_pct: Array<number | null>;
}

interface Props {
  columns: string[];
  rows: MatrixRow[];
  totals: MatrixRow;
  /** Cell rendering: absolute amount or column-share %. */
  view: "amount" | "share";
  /** When true, render plan vs. fakt under each cell (managers only). */
  showPlan: boolean;
  /** Trend column heading — "YoY" / "MoM" / "DoD" depending on mode. */
  trendLabel: string;
  /** Optional click handler for drill. Receives (row.label, column.label). */
  onCellClick?: (rowLabel: string, columnLabel: string) => void;
  /** Optional sticky-bottom offset in px (e.g. for a footer above). Defaults 0. */
  bottomOffset?: number;
}

/**
 * Generic dimension × time-bucket pivot grid for the Comparison page.
 *
 * - Sticky header and Jami footer so totals stay in view on long lists.
 * - Per-column heatmap tint (column-relative, not global) — the eye scans
 *   each period independently.
 * - Inline 24×8 sparkline per row showing trajectory across columns.
 * - Rank-shift chip (↑n / ↓n / NEW / =) next to the row label.
 * - Plan overlay (when `showPlan`): two stacked numbers + colored index%.
 * - Share toggle (`view="share"`): cells render `12.4%`, trend renders `+3.1pp`.
 * - Cells are buttons only when `onCellClick` is provided — no needless
 *   pointer cursor on the totals row.
 */
export default function MatrixGrid({
  columns,
  rows,
  totals,
  view,
  showPlan,
  trendLabel,
  onCellClick,
  bottomOffset = 0,
}: Props) {
  const { t } = useTranslation();

  // Per-column max for tinting. Use raw values (not share) so the
  // heatmap tracks magnitude even when the user is reading shares.
  const valuesMatrix = useMemo(
    () => rows.map((r) => r.values),
    [rows],
  );
  const colMax = useMemo(() => columnMax(valuesMatrix), [valuesMatrix]);

  const renderCell = (val: number, share: number) => {
    if (val === 0) return <span className="text-muted-foreground/60">—</span>;
    if (view === "share") return <span>{(share * 100).toFixed(1)}%</span>;
    return <span>${fmtNum(val, true)}</span>;
  };

  return (
    <div className="overflow-auto border border-border/60 rounded-md bg-background/70 max-h-[70vh]">
      <table className="w-full text-[12.5px] border-collapse">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <tr>
            <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium sticky left-0 bg-muted/80 z-20 min-w-[180px]">
              {t("comparison.col_dimension", { defaultValue: "Dimension" })}
            </th>
            {columns.map((c) => (
              <th
                key={c}
                className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium font-mono"
              >
                {c}
              </th>
            ))}
            <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              {trendLabel}
            </th>
            <th className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              {t("comparison.col_trend", { defaultValue: "Trend" })}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + 3}
                className="px-3 py-6 text-center italic text-muted-foreground"
              >
                {t("comparison.empty", {
                  defaultValue: "No data for the chosen filters.",
                })}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <Row
              key={r.label}
              row={r}
              columns={columns}
              colMax={colMax}
              view={view}
              showPlan={showPlan}
              renderCell={renderCell}
              onCellClick={onCellClick}
            />
          ))}
        </tbody>
        <tfoot
          className="sticky bg-muted/80 backdrop-blur border-t-2 border-border z-10"
          style={{ bottom: bottomOffset }}
        >
          <tr className="font-medium">
            <td className="px-3 py-2 sticky left-0 bg-muted/80 z-20">
              {t("comparison.row_total", { defaultValue: "Jami" })}
            </td>
            {columns.map((c, i) => (
              <td
                key={c}
                className="px-3 py-2 text-right font-mono tabular-nums text-foreground"
              >
                {renderCell(totals.values[i], totals.share_pct[i])}
                {showPlan && totals.plan[i] != null && (
                  <PlanCellAdjunct
                    plan={totals.plan[i]!}
                    index={totals.plan_index_pct[i]}
                  />
                )}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-mono tabular-nums">
              <TrendChip value={totals.trend_delta_pct} view={view} />
            </td>
            <td className="px-3 py-2">
              <Sparkline values={totals.values} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function Row({
  row,
  columns,
  colMax,
  view,
  showPlan,
  renderCell,
  onCellClick,
}: {
  row: MatrixRow;
  columns: string[];
  colMax: number[];
  view: "amount" | "share";
  showPlan: boolean;
  renderCell: (val: number, share: number) => React.ReactNode;
  onCellClick?: (rowLabel: string, columnLabel: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const clickable = !!onCellClick;
  return (
    <tr
      className={
        "border-t border-border/40 transition-colors " +
        (hovered ? "bg-muted/30" : "")
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td className="px-3 py-1.5 sticky left-0 bg-background z-[1]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-foreground">{row.label}</span>
          <RankChip prev={row.rank_prev} now={row.rank_now} />
        </div>
      </td>
      {columns.map((c, i) => {
        const v = row.values[i];
        const inner = (
          <>
            {renderCell(v, row.share_pct[i])}
            {showPlan && row.plan[i] != null && (
              <PlanCellAdjunct plan={row.plan[i]!} index={row.plan_index_pct[i]} />
            )}
          </>
        );
        return (
          <td
            key={c}
            className="px-3 py-1.5 text-right font-mono tabular-nums"
            style={{ backgroundColor: tintBackground(v, colMax[i] || 0) }}
          >
            {clickable && v !== 0 ? (
              <button
                type="button"
                className="w-full text-right hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
                onClick={() => onCellClick?.(row.label, c)}
              >
                {inner}
              </button>
            ) : (
              inner
            )}
          </td>
        );
      })}
      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
        <TrendChip value={row.trend_delta_pct} view={view} />
      </td>
      <td className="px-3 py-1.5">
        <Sparkline values={row.values} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Adjuncts
// ---------------------------------------------------------------------------

/** Stacked plan number + index% chip under the actual cell value. */
function PlanCellAdjunct({
  plan,
  index,
}: {
  plan: number;
  index: number | null;
}) {
  // Same thresholds as PlanGridEditable.indexChip — keeps the operator's
  // green/amber/red mental model consistent across pages.
  const cls =
    index == null
      ? "text-muted-foreground/60"
      : index >= 1
      ? "text-emerald-700 dark:text-emerald-400"
      : index >= 0.7
      ? "text-amber-700 dark:text-amber-400"
      : "text-red-700 dark:text-red-400";
  return (
    <div className="text-[10px] text-muted-foreground/80 mt-0.5">
      <span className="font-mono">${fmtNum(plan, true)}</span>
      {index != null && (
        <span className={"ml-1.5 " + cls}>{(index * 100).toFixed(0)}%</span>
      )}
    </div>
  );
}

/** ↑n (emerald) / ↓n (red) / NEW (emerald) / = (muted) chip. */
function RankChip({
  prev,
  now,
}: {
  prev: number | null;
  now: number | null;
}) {
  if (now == null) return null;
  if (prev == null) {
    return (
      <span className="text-[9px] uppercase tracking-[0.14em] font-medium text-emerald-700 dark:text-emerald-400">
        NEW
      </span>
    );
  }
  if (prev === now) {
    return (
      <span className="text-[9px] text-muted-foreground/60">=</span>
    );
  }
  const delta = prev - now; // positive → moved up
  const cls =
    delta > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-red-700 dark:text-red-400";
  const arrow = delta > 0 ? "↑" : "↓";
  return (
    <span className={"text-[10px] font-mono " + cls}>
      {arrow}
      {Math.abs(delta)}
    </span>
  );
}

/** Trend chip — % when view=amount, percentage-points when view=share.
 *  Em-dash for null; emerald for positive, red for negative. */
function TrendChip({
  value,
  view,
}: {
  value: number | null;
  view: "amount" | "share";
}) {
  if (value == null) {
    return <span className="text-muted-foreground/60">—</span>;
  }
  const cls =
    value > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : value < 0
      ? "text-red-700 dark:text-red-400"
      : "text-muted-foreground";
  const sign = value > 0 ? "+" : "";
  // For share view the trend is computed on column-share share, so the
  // unit is percentage-points, not %. Frontend leaves the math to the
  // caller and just labels the unit correctly.
  const unit = view === "share" ? "pp" : "%";
  return (
    <span className={cls}>
      {sign}
      {(value * 100).toFixed(1)}
      {unit}
    </span>
  );
}
