import { ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, Search, Loader2, ArrowLeft, ArrowRight, Download } from "lucide-react";
import Sparkline from "./Sparkline";
import { cn } from "@/lib/utils";
import { getAccessToken } from "../lib/api";

// Fallback formatter for mobile-card value cells where the column def
// hasn't provided a render fn. Keeps zero as 0 (count-safe default —
// the page-level formatters still override this for money cells).
function fmtNumFallback(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    return Math.round(v).toLocaleString("en-US");
  }
  return String(v);
}

export type SortDir = "asc" | "desc";

export interface ColumnDef<R> {
  /** Identifier sent back to the server on sort changes. */
  key: string;
  /** Header label (already translated by the caller). */
  label: string;
  /** Left | right | center. Money + numeric default to `right`. */
  align?: "left" | "right" | "center";
  /** Fixed/desired width, CSS value. */
  width?: string;
  /** Not sortable = sort chevron hidden. Default true. */
  sortable?: boolean;
  /** How to render the cell. If omitted we fall back to r[key] as text. */
  render?: (row: R) => ReactNode;
  /** Column-footer — shown on the total row. String or null. */
  footer?: (totals: Record<string, number>) => ReactNode;
  /** If true, rendered in JBM mono tabular-nums with right alignment (auto). */
  numeric?: boolean;
}

export interface Page<R> {
  rows: R[];
  total: number;
  page: number;
  size: number;
  sort: string;                       // "revenue:desc"
  totals?: Record<string, number>;    // column totals for the sticky footer
}

/**
 * Server-paginated, server-sorted ranked table. The core primitive for
 * every "All X, ranked by Y" view across the three dashboards.
 *
 * - Controlled: the caller holds `page / size / sort / search` state
 *   and fires `onChange` when any of them change. The caller is
 *   responsible for refetching.
 * - Sticky header & total footer. Pagination strip below.
 * - Free-text search debounced upstream.
 * - Row click-through via `onRowClick`.
 * - Per-row sparkline column supported via a ColumnDef whose render
 *   returns <Sparkline/>.
 */
export default function RankedTable<R extends Record<string, any>>({
  columns,
  data,
  loading,
  onChange,
  onRowClick,
  getRowKey,
  eyebrow,
  empty,
  pageSizes = [25, 50, 100, 250],
  exportHref,
}: {
  columns: ColumnDef<R>[];
  data: Page<R> | undefined;
  loading?: boolean;
  onChange: (next: { page: number; size: number; sort: string; search: string }) => void;
  onRowClick?: (row: R) => void;
  getRowKey: (row: R) => string | number;
  eyebrow?: string;
  empty?: string;
  pageSizes?: number[];
  /** If present, renders an "Excel" download link above the table.
   *  The caller passes a fully-qualified URL (with filters baked in). */
  exportHref?: string;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>(data?.sort ?? `${columns[0].key}:desc`);
  const [page, setPage] = useState<number>(data?.page ?? 0);
  const [size, setSize] = useState<number>(data?.size ?? 50);

  // Parse the current sort
  const [sortKey, sortDir] = useMemo(() => {
    const [k, d = "desc"] = sort.split(":");
    return [k, d as SortDir] as const;
  }, [sort]);

  const commit = (next: { page?: number; size?: number; sort?: string; search?: string }) => {
    const nPage = next.page ?? page;
    const nSize = next.size ?? size;
    const nSort = next.sort ?? sort;
    const nSearch = next.search ?? search;
    setPage(nPage);
    setSize(nSize);
    setSort(nSort);
    setSearch(nSearch);
    onChange({ page: nPage, size: nSize, sort: nSort, search: nSearch });
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      commit({ sort: `${key}:${sortDir === "asc" ? "desc" : "asc"}`, page: 0 });
    } else {
      commit({ sort: `${key}:desc`, page: 0 });
    }
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const startRow = total === 0 ? 0 : page * size + 1;
  const endRow = Math.min(total, (page + 1) * size);

  return (
    <div className="min-w-0">
      {eyebrow && (
        <div className="flex items-baseline justify-between mb-3">
          <div className="eyebrow !tracking-[0.18em] text-primary">{eyebrow}</div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {total.toLocaleString("en-US")} {t("ranked.rows")}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-[360px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => commit({ search: e.target.value, page: 0 })}
            placeholder={t("ranked.search") as string}
            className="w-full h-9 pl-8 pr-2 bg-background border border-input rounded-md text-[13px] focus-within:ring-2 focus-within:ring-ring/30 outline-none"
          />
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {exportHref && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const resp = await fetch(exportHref, {
                    headers: {
                      Authorization: `Bearer ${getAccessToken() ?? ""}`,
                    },
                  });
                  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                  // Preserve the server-provided filename
                  const cd = resp.headers.get("Content-Disposition") ?? "";
                  const fn = /filename="([^"]+)"/.exec(cd)?.[1] ?? "export.xlsx";
                  const blob = await resp.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = fn;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1500);
                } catch (e) {
                  console.error("export failed", e);
                }
              }}
              className={cn(
                "inline-flex items-center gap-1 h-8 px-2.5 rounded border border-input text-foreground hover:bg-muted/40 transition",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 outline-none",
              )}
              aria-label={t("ranked.export") as string}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              <span className="uppercase tracking-[0.08em] text-[11px]">
                {t("ranked.export")}
              </span>
            </button>
          )}
          <span className="uppercase tracking-[0.1em]">{t("ranked.page_size")}</span>
          <select
            value={size}
            onChange={(e) => commit({ size: Number(e.target.value), page: 0 })}
            className="h-8 px-2 bg-background border border-input rounded text-[12px]"
          >
            {pageSizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile: card list. Renders at <lg (1024px). */}
      <div className="lg:hidden space-y-2">
        {loading && (!data || data.rows.length === 0) ? (
          <div className="py-10 text-center text-muted-foreground italic text-sm border border-border/60 rounded-md">
            <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
            {t("ranked.loading")}
          </div>
        ) : data && data.rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground italic text-sm border border-border/60 rounded-md">
            {empty ?? t("ranked.empty")}
          </div>
        ) : (
          data?.rows.map((r) => {
            const primary = columns[0];
            const secondary = columns.slice(1).filter((c) => !c.numeric).slice(0, 1);
            const numericCols = columns.filter((c) => c.numeric);
            const [primaryNum, ...restNums] = numericCols;
            return (
              <div
                key={getRowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(r);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                className={cn(
                  "border border-border/60 rounded-md bg-background/70 p-3 outline-none",
                  onRowClick && "cursor-pointer hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] text-foreground truncate font-medium">
                      {primary.render ? primary.render(r) : String(r[primary.key] ?? "—")}
                    </div>
                    {secondary.map((c) => (
                      <div key={c.key} className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                      </div>
                    ))}
                  </div>
                  {primaryNum && (
                    <div className="text-right shrink-0">
                      <div className="eyebrow !tracking-[0.12em] !text-[9px] mb-0.5">
                        {primaryNum.label}
                      </div>
                      <div className="font-mono tabular-nums text-[15px] text-foreground">
                        {primaryNum.render ? primaryNum.render(r) : fmtNumFallback(r[primaryNum.key])}
                      </div>
                    </div>
                  )}
                </div>
                {restNums.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/40 grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1.5">
                    {restNums.slice(0, 6).map((c) => (
                      <div key={c.key} className="flex items-baseline gap-1.5 min-w-0">
                        <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground shrink-0">
                          {c.label}
                        </span>
                        <span className="font-mono tabular-nums text-[12px] text-foreground truncate ml-auto">
                          {c.render ? c.render(r) : fmtNumFallback(r[c.key])}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        {/* Mobile total strip */}
        {data?.totals && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2.5 bg-primary/[0.04] border border-primary/20 rounded-md">
            <div className="eyebrow !tracking-[0.14em] text-primary">
              {t("ranked.total", { defaultValue: "Total" })}
            </div>
            {Object.entries(data.totals).map(([k, v]) => (
              <div key={k} className="font-mono tabular-nums text-[12px] text-foreground">
                <span className="text-muted-foreground text-[11px] uppercase tracking-[0.08em] mr-1">
                  {k}
                </span>
                {typeof v === "number" ? v.toLocaleString("en-US") : String(v)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: table. */}
      <div className="hidden lg:block overflow-x-auto border border-border/60 rounded-md bg-background/70">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur">
            <tr>
              {columns.map((c) => {
                const isSorted = sortKey === c.key;
                const align = c.align ?? (c.numeric ? "right" : "left");
                const clickable = c.sortable !== false;
                const ariaSort = !clickable
                  ? undefined
                  : isSorted
                    ? (sortDir === "asc" ? "ascending" : "descending")
                    : "none";
                return (
                  <th
                    key={c.key}
                    style={{ width: c.width, textAlign: align }}
                    aria-sort={ariaSort as any}
                    scope="col"
                    className={cn(
                      "px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground select-none border-b border-border/80",
                    )}
                  >
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1 outline-none rounded px-1 -mx-1",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                          "hover:text-foreground",
                        )}
                        style={{ justifyContent: align === "right" ? "flex-end" : "flex-start" }}
                      >
                        {c.label}
                        {isSorted && (
                          sortDir === "asc" ? (
                            <ChevronUp className="h-3 w-3" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3 w-3" aria-hidden />
                          )
                        )}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1" style={{ justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
                        {c.label}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && (!data || data.rows.length === 0) ? (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                  {t("ranked.loading")}
                </td>
              </tr>
            ) : data && data.rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center text-muted-foreground italic">
                  {empty ?? t("ranked.empty")}
                </td>
              </tr>
            ) : (
              data?.rows.map((r, i) => (
                <tr
                  key={getRowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(r);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  className={cn(
                    "border-b border-border/40 last:border-b-0 transition-colors outline-none",
                    onRowClick && "cursor-pointer hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    i % 2 === 1 && "bg-muted/[0.02]",
                  )}
                >
                  {columns.map((c) => {
                    const align = c.align ?? (c.numeric ? "right" : "left");
                    const mono = c.numeric;
                    return (
                      <td
                        key={c.key}
                        style={{ textAlign: align }}
                        className={cn(
                          "px-3 py-2 align-middle",
                          mono && "font-mono tabular-nums text-[12.5px]",
                        )}
                      >
                        {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          {data?.totals && (
            <tfoot className="sticky bottom-0 bg-primary/[0.03] border-t-2 border-primary/30">
              <tr>
                {columns.map((c) => {
                  const align = c.align ?? (c.numeric ? "right" : "left");
                  return (
                    <td
                      key={c.key}
                      style={{ textAlign: align }}
                      className={cn(
                        "px-3 py-2.5 font-semibold text-foreground text-[12.5px]",
                        c.numeric && "font-mono tabular-nums",
                      )}
                    >
                      {c.footer ? c.footer(data.totals!) : ""}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-[12px] text-muted-foreground">
        <div aria-live="polite" aria-atomic="true">
          {total > 0
            ? t("ranked.showing", { start: startRow, end: endRow, total: total.toLocaleString("en-US") })
            : ""}
        </div>
        <div className="flex items-center gap-1">
          <button
            disabled={page === 0 || loading}
            onClick={() => commit({ page: Math.max(0, page - 1) })}
            className="h-8 px-2 rounded border border-input disabled:opacity-40 hover:bg-muted/50 flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> {t("ranked.prev")}
          </button>
          <span className="px-3 font-mono tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            disabled={page + 1 >= totalPages || loading}
            onClick={() => commit({ page: page + 1 })}
            className="h-8 px-2 rounded border border-input disabled:opacity-40 hover:bg-muted/50 flex items-center gap-1"
          >
            {t("ranked.next")} <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export { Sparkline };
