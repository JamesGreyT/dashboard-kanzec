import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtNum } from "./MetricCard";

interface SotuvRow {
  date: string;
  deal_id: string;
  client: string;
  region: string | null;
  direction: string | null;
  brand: string | null;
  product: string | null;
  qty: number;
  amount: number;
}

interface KirimRow {
  date: string;
  payment_id: number;
  client: string;
  region: string | null;
  direction: string | null;
  method: string | null;
  amount: number;
  attributed_manager: string | null;
}

interface DrillResp<R> {
  measure: "sotuv" | "kirim";
  manager: string;
  year: number;
  slice: { from: string; to: string };
  total: number;             // NET for Sotuv (sales − returns)
  row_count: number;
  returns_count?: number;    // Sotuv only
  returns_total?: number;    // Sotuv only — negative number
  rows: R[];
  limit: number;
}

/**
 * Drill panel — fetches the line items behind one (manager, year) cell
 * of a YearMatrix and renders them as a compact verification table.
 *
 * The QS encodes the as-of slice (so the "year" param shifts back in
 * time but the (start_month, start_day, end_month, end_day) shape is
 * preserved by the backend's Slice helper).
 */
export default function DrillPanel({
  measure,
  manager,
  year,
  baseQs,
}: {
  measure: "sotuv" | "kirim";
  manager: string;
  year: number;
  /** The same query string DaySlice uses for scoreboard, with `year` */
  baseQs: URLSearchParams;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || "uz").split("-")[0];

  const qs = new URLSearchParams(baseQs);
  qs.set("measure", measure);
  qs.set("manager", manager);
  qs.set("year", String(year));

  const q = useQuery({
    queryKey: ["dayslice.drill", measure, manager, year, qs.toString()],
    queryFn: () => api<DrillResp<SotuvRow | KirimRow>>(`/api/dayslice/drill?${qs.toString()}`),
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return (
      <div className="text-[12px] italic text-muted-foreground py-4">
        {t("dayslice.drill_loading", { defaultValue: "Loading line items…" })}
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="text-[12px] text-red-700 dark:text-red-400 py-4">
        {t("dayslice.drill_error", { defaultValue: "Failed to load line items." })}
      </div>
    );
  }

  const { total, row_count, slice, rows, limit, returns_count, returns_total } = q.data;
  const truncated = row_count > rows.length;
  const hasReturns = (returns_count ?? 0) > 0;
  const fmtDate = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(lang === "uz" ? "uz-UZ" : lang === "ru" ? "ru-RU" : "en-US", {
      day: "numeric", month: "short", year: "numeric",
    });
  };

  return (
    <div>
      {/* Header strip */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          {measure === "sotuv"
            ? t("dayslice.drill_sotuv_title", { defaultValue: "Sotuv line items" })
            : t("dayslice.drill_kirim_title", { defaultValue: "Kirim line items" })}
          {" · "}
          <span className="text-foreground">{manager}</span>
          {" · "}
          <span className="text-foreground font-mono">{year}</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {t("dayslice.drill_window", { defaultValue: "Window" })}: {fmtDate(slice.from)} → {fmtDate(slice.to)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground ml-auto">
          {t("dayslice.drill_total_net", { defaultValue: "Net total" })}:{" "}
          <span className="text-foreground font-mono tabular-nums">${fmtNum(total)}</span>
          {" · "}
          {t("dayslice.drill_count", { defaultValue: "{{n}} rows", n: row_count })}
          {hasReturns && (
            <>
              {" · "}
              <span className="text-red-700 dark:text-red-400">
                {t("dayslice.drill_returns", {
                  defaultValue: "{{n}} returns: −${{amt}}",
                  n: returns_count,
                  amt: fmtNum(Math.abs(returns_total ?? 0)),
                })}
              </span>
            </>
          )}
          {truncated && (
            <span className="text-amber-700 dark:text-amber-400 italic ml-1">
              ({t("dayslice.drill_truncated", {
                defaultValue: "showing first {{shown}} of {{total}} — narrow your slice",
                shown: rows.length, total: row_count,
              })})
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border/60 rounded bg-background/70">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/40">
            {measure === "sotuv" ? (
              <tr>
                <Th>{t("dayslice.drill_col_date")}</Th>
                <Th>{t("dayslice.drill_col_deal")}</Th>
                <Th>{t("dayslice.drill_col_client")}</Th>
                <Th>{t("dayslice.drill_col_region")}</Th>
                <Th>{t("dayslice.drill_col_direction")}</Th>
                <Th>{t("dayslice.drill_col_brand")}</Th>
                <Th>{t("dayslice.drill_col_product")}</Th>
                <Th align="right">{t("dayslice.drill_col_qty")}</Th>
                <Th align="right">{t("dayslice.drill_col_amount")}</Th>
              </tr>
            ) : (
              <tr>
                <Th>{t("dayslice.drill_col_date")}</Th>
                <Th>{t("dayslice.drill_col_pay_id", { defaultValue: "Pay ID" })}</Th>
                <Th>{t("dayslice.drill_col_client")}</Th>
                <Th>{t("dayslice.drill_col_region")}</Th>
                <Th>{t("dayslice.drill_col_direction")}</Th>
                <Th>{t("dayslice.drill_col_method", { defaultValue: "Method" })}</Th>
                <Th>{t("dayslice.drill_col_attributed", { defaultValue: "Manager (attributed)" })}</Th>
                <Th align="right">{t("dayslice.drill_col_amount")}</Th>
              </tr>
            )}
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-muted-foreground italic">
                  {t("dayslice.drill_empty", { defaultValue: "No line items in this slice." })}
                </td>
              </tr>
            )}
            {measure === "sotuv" &&
              (rows as SotuvRow[]).map((r, i) => {
                const isReturn = r.amount < 0;
                return (
                  <tr
                    key={`${r.deal_id}-${i}`}
                    className={
                      "border-t border-border/30 " +
                      (isReturn ? "bg-red-50/40 dark:bg-red-950/10" : "")
                    }
                  >
                    <td className="px-3 py-1 font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                      {fmtDate(r.date)}
                    </td>
                    <td className="px-3 py-1 font-mono text-muted-foreground">{r.deal_id}</td>
                    <td className="px-3 py-1 text-foreground">{r.client}</td>
                    <td className="px-3 py-1 text-muted-foreground">{r.region ?? "—"}</td>
                    <td className="px-3 py-1 text-muted-foreground">{r.direction ?? "—"}</td>
                    <td className="px-3 py-1 text-muted-foreground">{r.brand ?? "—"}</td>
                    <td className="px-3 py-1 text-muted-foreground truncate max-w-[260px]" title={r.product ?? undefined}>
                      {r.product ?? "—"}
                      {isReturn && (
                        <span className="ml-1 text-[9px] uppercase tracking-[0.14em] text-red-700 dark:text-red-400 font-medium">
                          {t("dayslice.drill_return_tag", { defaultValue: "RETURN" })}
                        </span>
                      )}
                    </td>
                    <td className={"px-3 py-1 text-right font-mono tabular-nums " + (isReturn ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
                      {fmtNum(r.qty)}
                    </td>
                    <td className={"px-3 py-1 text-right font-mono tabular-nums " + (isReturn ? "text-red-700 dark:text-red-400" : "text-foreground")}>
                      {r.amount < 0 ? "−$" + fmtNum(Math.abs(r.amount)) : "$" + fmtNum(r.amount)}
                    </td>
                  </tr>
                );
              })}
            {measure === "kirim" &&
              (rows as KirimRow[]).map((r, i) => (
                <tr key={`${r.payment_id}-${i}`} className="border-t border-border/30">
                  <td className="px-3 py-1 font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                    {fmtDate(r.date)}
                  </td>
                  <td className="px-3 py-1 font-mono text-muted-foreground">{r.payment_id}</td>
                  <td className="px-3 py-1 text-foreground">{r.client}</td>
                  <td className="px-3 py-1 text-muted-foreground">{r.region ?? "—"}</td>
                  <td className="px-3 py-1 text-muted-foreground">{r.direction ?? "—"}</td>
                  <td className="px-3 py-1 text-muted-foreground">{r.method ?? "—"}</td>
                  <td className="px-3 py-1 text-muted-foreground">{r.attributed_manager ?? "—"}</td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-foreground">
                    ${fmtNum(r.amount)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {limit < row_count && (
        <div className="text-[10px] italic text-muted-foreground mt-2">
          {t("dayslice.drill_limit_note", {
            defaultValue: "Showing top {{limit}} rows by date. Tighten the slice to see fewer.",
            limit,
          })}
        </div>
      )}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" | "left" }) {
  return (
    <th
      className={
        "px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}
