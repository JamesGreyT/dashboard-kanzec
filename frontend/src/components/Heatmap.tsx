import { ReactNode } from "react";

/**
 * Editorial CSS-grid heatmap. Renders row × col values with an
 * intensity-proportional umber tint. Used for seasonality (month×FY),
 * region×aging, manager×brand, etc.
 *
 * - Cells default to an em-dash when value is 0/null/undefined.
 * - `formatValue` controls the cell display (compact toggle lives at
 *   page level and passes a formatter).
 */
export default function Heatmap({
  rowLabels,
  colLabels,
  values,
  formatValue,
  colHeader,
  rowHeader,
  maxHeight = 480,
}: {
  rowLabels: string[];
  colLabels: string[];
  values: number[][];        // values[rowIdx][colIdx]
  formatValue: (v: number) => string;
  colHeader?: ReactNode;     // optional axis label above the col headers
  rowHeader?: ReactNode;     // optional axis label left of the row labels
  maxHeight?: number;
}) {
  // compute the global max for the colour ramp; ignores signs so negative
  // cells also get tint proportional to magnitude (marker in the negative
  // palette)
  const max = Math.max(
    1,
    ...values.flatMap((row) => row.map((v) => Math.abs(v ?? 0))),
  );

  return (
    <div className="min-w-0 overflow-x-auto" style={{ maxHeight }}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="text-left font-medium text-muted-foreground text-[10px] uppercase tracking-[0.12em] pb-2 pr-3">
              {rowHeader ?? ""}
            </th>
            {colLabels.map((c, i) => (
              <th
                key={c + i}
                className="text-right px-2 pb-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium"
              >
                {c}
              </th>
            ))}
          </tr>
          {colHeader && (
            <tr>
              <th />
              <th
                colSpan={colLabels.length}
                className="pb-1 text-[10px] text-muted-foreground italic text-right"
              >
                {colHeader}
              </th>
            </tr>
          )}
        </thead>
        <tbody>
          {rowLabels.map((rl, r) => (
            <tr key={rl + r} className="border-t border-border/40">
              <td className="pr-3 py-1 text-foreground text-[13px] whitespace-nowrap">
                {rl}
              </td>
              {colLabels.map((_, c) => {
                const v = values[r]?.[c] ?? 0;
                const intensity = Math.abs(v) / max;
                const alpha = Math.min(0.42, intensity * 0.42);
                return (
                  <td
                    key={c}
                    className="px-2 py-1 text-right font-mono tabular-nums text-[12px]"
                    style={{
                      backgroundColor:
                        v === 0
                          ? undefined
                          : `color-mix(in oklab, ${v < 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))"} ${(alpha * 100).toFixed(1)}%, transparent)`,
                    }}
                  >
                    <span
                      className={
                        v === 0
                          ? "text-muted-foreground/60"
                          : v < 0
                          ? "text-destructive"
                          : "text-foreground"
                      }
                    >
                      {formatValue(v)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
