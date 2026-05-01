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
  const max = Math.max(
    1,
    ...values.flatMap((row) => row.map((v) => Math.abs(v ?? 0))),
  );

  return (
    <div className="min-w-0 overflow-x-auto" style={{ maxHeight }}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="text-left eyebrow !text-[10px] !tracking-[0.12em] pb-2 pr-3">
              {rowHeader ?? ""}
            </th>
            {colLabels.map((c, i) => (
              <th
                key={c + i}
                className="text-right px-2 pb-2 eyebrow !text-[10px] !tracking-[0.12em]"
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
                className="pb-1 text-[10px] text-ink3 text-right"
              >
                {colHeader}
              </th>
            </tr>
          )}
        </thead>
        <tbody>
          {rowLabels.map((rl, r) => (
            <tr key={rl + r} className="border-t border-line">
              <td className="pr-3 py-1.5 text-ink text-[13px] whitespace-nowrap">
                {rl}
              </td>
              {colLabels.map((_, c) => {
                const v = values[r]?.[c] ?? 0;
                const intensity = Math.abs(v) / max;
                // Mobile Card Stream heatmap: 0.06 → 0.85 mint scale
                const alpha = v === 0 ? 0 : 0.06 + Math.min(0.79, intensity * 0.79);
                return (
                  <td
                    key={c}
                    className="px-2 py-1.5 text-right font-mono tabular-nums text-[12px] transition-colors hover:ring-2 hover:ring-mint/40 hover:ring-inset"
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
                          ? "text-ink4"
                          : v < 0
                          ? "text-coraldk"
                          : "text-ink"
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
