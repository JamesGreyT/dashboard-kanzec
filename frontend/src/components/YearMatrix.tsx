import { useTranslation } from "react-i18next";
import { fmtNum } from "./MetricCard";
import Sparkline from "./Sparkline";

export interface YearMatrixRow {
  manager: string;
  by_year: number[];
  yoy_pct: number | null;
}

/**
 * Manager × year editorial table — used twice on the day-slice page,
 * once for Sotuv and once for Kirim. Recreates the Excel `Dashborad`
 * sheet's primary scoreboard, with a current-year column tinted
 * subtly for emphasis and a sparkline+YoY chip on each row.
 *
 * Mobile (`<lg`): collapses into a card list — one card per manager,
 * year columns stacked inside the card. Same pattern as RankedTable.
 */
export default function YearMatrix({
  title,
  yearColumns,
  rows,
  totals,
  currentYear,
}: {
  title: string;
  yearColumns: number[];
  rows: YearMatrixRow[];
  totals: { by_year: number[]; yoy_pct: number | null };
  currentYear: number;
}) {
  const { t } = useTranslation();

  return (
    <section className="mb-10">
      <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground mb-3">
        {title}
        <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
      </h2>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto border border-border/60 rounded-md bg-background/70">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {t("dayslice.col_manager")}
              </th>
              {yearColumns.map((y) => (
                <th
                  key={y}
                  className={
                    "text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium " +
                    (y === currentYear ? "bg-primary/[0.04]" : "")
                  }
                >
                  {y}
                </th>
              ))}
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {t("dayslice.col_yoy")}
              </th>
              <th
                className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium"
                aria-label="trend"
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.manager} className="border-t border-border/40">
                <td className="px-3 py-1.5 text-foreground">{r.manager}</td>
                {r.by_year.map((v, i) => (
                  <td
                    key={i}
                    className={
                      "px-3 py-1.5 text-right font-mono tabular-nums " +
                      (yearColumns[i] === currentYear
                        ? "bg-primary/[0.04] text-foreground"
                        : "text-muted-foreground")
                    }
                  >
                    {v === 0 ? (
                      <span className="text-muted-foreground/60">—</span>
                    ) : (
                      "$" + fmtNum(v)
                    )}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {yoyChip(r.yoy_pct)}
                </td>
                <td className="px-3 py-1.5">
                  <Sparkline values={r.by_year} width={60} height={16} />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-muted/20">
              <td className="px-3 py-2 font-medium text-foreground">
                {t("dayslice.col_jami")}
              </td>
              {totals.by_year.map((v, i) => (
                <td
                  key={i}
                  className={
                    "px-3 py-2 text-right font-mono tabular-nums font-medium text-foreground " +
                    (yearColumns[i] === currentYear ? "bg-primary/[0.06]" : "")
                  }
                >
                  {v === 0 ? "—" : "$" + fmtNum(v)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-mono tabular-nums font-medium">
                {yoyChip(totals.yoy_pct)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="lg:hidden space-y-2">
        {rows.map((r) => (
          <div
            key={r.manager}
            className="border border-border/60 rounded-md p-3 bg-background/70"
          >
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-foreground font-medium">{r.manager}</div>
              <div className="text-[11px] font-mono">{yoyChip(r.yoy_pct)}</div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {r.by_year.map((v, i) => (
                <div
                  key={i}
                  className="flex items-baseline justify-between text-[12px]"
                >
                  <span className="text-muted-foreground uppercase tracking-[0.1em]">
                    {yearColumns[i]}
                  </span>
                  <span
                    className={
                      "font-mono tabular-nums " +
                      (yearColumns[i] === currentYear
                        ? "text-foreground font-medium"
                        : "text-muted-foreground")
                    }
                  >
                    {v === 0 ? "—" : "$" + fmtNum(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="border-t-2 border-border pt-2 flex items-baseline justify-between">
          <div className="text-foreground font-medium">
            {t("dayslice.col_jami")}
          </div>
          <div className="font-mono tabular-nums text-foreground font-medium">
            ${fmtNum(totals.by_year[totals.by_year.length - 1] ?? 0)}
          </div>
        </div>
      </div>
    </section>
  );
}

function yoyChip(v: number | null) {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return <span className="text-muted-foreground/60">—</span>;
  }
  const sign = v > 0 ? "+" : "";
  const cls =
    v > 0.005
      ? "text-emerald-700 dark:text-emerald-400"
      : v < -0.005
      ? "text-red-700 dark:text-red-400"
      : "text-muted-foreground";
  return (
    <span className={cls}>
      {sign}
      {(v * 100).toFixed(1)}%
    </span>
  );
}
