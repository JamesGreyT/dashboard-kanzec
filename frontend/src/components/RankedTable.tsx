import { ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, Search, Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import Sparkline from "./Sparkline";
import { cn } from "@/lib/utils";

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
          <div className="eyebrow !tracking-[0.18em] text-primary/70">{eyebrow}</div>
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

      <div className="overflow-x-auto border border-border/60 rounded-md bg-background/70">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur">
            <tr>
              {columns.map((c) => {
                const isSorted = sortKey === c.key;
                const align = c.align ?? (c.numeric ? "right" : "left");
                const clickable = c.sortable !== false;
                return (
                  <th
                    key={c.key}
                    style={{ width: c.width, textAlign: align }}
                    className={cn(
                      "px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground select-none border-b border-border/80",
                      clickable && "cursor-pointer hover:text-foreground",
                    )}
                    onClick={clickable ? () => toggleSort(c.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1" style={{ justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
                      {c.label}
                      {clickable && isSorted && (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      )}
                    </span>
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
                  className={cn(
                    "border-b border-border/40 last:border-b-0 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-muted/30",
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
        <div>
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
