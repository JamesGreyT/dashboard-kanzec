export interface PivotRow {
  label: string;
  values: number[];
}

function fmt(n: number, compact: boolean): string {
  if (n === 0) return "—";
  if (compact && Math.abs(n) >= 1000) {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    return Math.round(n / 1000).toLocaleString("en-US") + "k";
  }
  return Math.round(n).toLocaleString("en-US");
}

/** Year header: editorial "31 Mart / 2026" stack. */
function YearHeader({ iso }: { iso: string }) {
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  // All columns are 31 March; print "31 Mart" on top, year under.
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
        31 Mart
      </span>
      <span className="font-display-italic text-[17px] text-foreground/85">
        {year}
      </span>
    </div>
  );
}

/**
 * One Sotuv-or-Kirim pivot table. Editorial style: no card chrome,
 * eyebrow above, monospace tabular-nums on every number, umber-tinted
 * total row.
 */
export default function PivotTable({
  eyebrow,
  rows,
  totalLabel,
  totals,
  years,
  compact = false,
  extraTotalLabel,
  extraTotals,
}: {
  eyebrow: string;
  rows: PivotRow[];
  totalLabel: string;
  totals: number[];
  years: string[];
  compact?: boolean;
  /** For brand: second total row (Jami savdo). */
  extraTotalLabel?: string;
  extraTotals?: number[];
}) {
  // Per-column totals used for the ghosted heatmap intensity
  const colMax = years.map((_, i) =>
    Math.max(...rows.map((r) => Math.abs(r.values[i] ?? 0)), 1),
  );

  return (
    <div className="min-w-0">
      <div className="eyebrow !tracking-[0.18em] mb-3 text-primary/70">
        {eyebrow}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left font-medium text-muted-foreground text-xs uppercase tracking-[0.1em] pb-3 pr-3">
                {/* dimension column header intentionally blank — eyebrow carries it */}
              </th>
              {years.map((iso) => (
                <th key={iso} className="text-right pl-4 pb-3 align-bottom">
                  <YearHeader iso={iso} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={years.length + 1}
                  className="py-6 text-center text-muted-foreground italic text-sm"
                >
                  —
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.label}
                  className="group border-b border-border/40 last:border-b-0"
                >
                  <td className="py-2 pr-3 text-foreground text-[13px] truncate max-w-[220px]">
                    {r.label}
                  </td>
                  {r.values.map((v, i) => {
                    const intensity = colMax[i] > 0 ? Math.abs(v) / colMax[i] : 0;
                    const tintAlpha = Math.min(0.055, intensity * 0.055);
                    return (
                      <td
                        key={i}
                        className="py-2 pl-4 text-right font-mono tabular-nums text-[13px]"
                        style={{
                          backgroundColor:
                            v !== 0
                              ? `color-mix(in oklab, hsl(var(--primary)) ${(tintAlpha * 100).toFixed(1)}%, transparent)`
                              : undefined,
                        }}
                      >
                        <span
                          className={
                            v === 0
                              ? "text-muted-foreground/60"
                              : v < 0
                                ? "text-primary"
                                : "text-foreground"
                          }
                        >
                          {fmt(v, compact)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}

            {/* Total row(s) */}
            <tr className="border-t-2 border-primary/30 bg-primary/[0.02]">
              <td className="py-2.5 pr-3 font-semibold text-foreground text-[13px]">
                {totalLabel}
              </td>
              {totals.map((v, i) => (
                <td
                  key={i}
                  className="py-2.5 pl-4 text-right font-mono tabular-nums font-semibold text-[13px] text-foreground"
                >
                  {fmt(v, compact)}
                </td>
              ))}
            </tr>
            {extraTotals && extraTotalLabel && (
              <tr className="border-t border-primary/20">
                <td className="py-2.5 pr-3 font-semibold text-primary text-[13px]">
                  {extraTotalLabel}
                </td>
                {extraTotals.map((v, i) => (
                  <td
                    key={i}
                    className="py-2.5 pl-4 text-right font-mono tabular-nums font-semibold text-[13px] text-primary"
                  >
                    {fmt(v, compact)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
