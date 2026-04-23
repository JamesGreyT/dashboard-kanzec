import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { api, ApiError, getAccessToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import PageHeading from "../components/PageHeading";
import { Package, Wallet, Building2 } from "lucide-react";
import Card from "../components/Card";
import DataTable, { Column, Density } from "../components/DataTable";
import Drawer from "../components/Drawer";
import Button from "../components/Button";
import Input from "../components/Input";
import Pagination from "../components/Pagination";
import ColumnFilter, {
  ColumnFilterValue,
  ColumnMeta,
  hasActive,
  initialFilterFor,
  valueToFilterTriples,
} from "../components/ColumnFilter";

interface TableMeta {
  key: string;
  label: string;
  pk: string[];
  default_sort: { field: string; dir: "asc" | "desc" }[];
  columns: (ColumnMeta & {
    visible: boolean;
    currency: string | null;
    id_column: boolean;
  })[];
}

interface RowsResp {
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

type Row = Record<string, unknown>;
type Filters = Record<string, ColumnFilterValue>;
type SortState = { field: string; dir: "asc" | "desc" } | null;

const DENSITY_KEY = "kanzec.density";

// Keep in sync with ALLOWED_DIRECTIONS in backend/app/data/router.py.
const LEGAL_PERSON_DIRECTIONS: string[] = [
  "B2B",
  "Yangi",
  "MATERIAL",
  "Export",
  "Цех",
  "Marketplace",
  "Online",
  "Doʻkon",
  "BAZA",
  "Sergeli 6/4/1 D",
  "Farxod bozori D",
  "Sergeli 3/3/13 D",
];

function readDensity(): Density {
  if (typeof localStorage === "undefined") return "compact";
  const v = localStorage.getItem(DENSITY_KEY);
  return v === "comfortable" ? "comfortable" : "compact";
}

const TABLE_LABEL_KEYS: Record<string, string> = {
  deal_order: "data.orders",
  payment: "data.payments",
  legal_person: "data.legal_persons",
};

const TABLE_ICON: Record<string, "orders" | "payments" | "people"> = {
  deal_order: "orders",
  payment: "payments",
  legal_person: "people",
};

const TABLE_SUBTITLE_KEYS: Record<string, string> = {
  deal_order: "data.orders_blurb",
  payment: "data.payments_blurb",
  legal_person: "data.legal_persons_blurb",
};

/**
 * Data viewer page. Two modes:
 *   - hub mode (default): shows a tab strip covering all tables
 *   - locked mode: lockedTable set → hides tabs, renders a focused header
 * Locked mode powers /data/orders, /data/payments, /data/legal-persons so
 * each table has its own sidebar entry.
 */
export default function DataViewer({ lockedTable }: { lockedTable?: string } = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEditDirection =
    user?.role === "admin" || user?.role === "operator";
  const tables = useQuery({
    queryKey: ["data.tables"],
    queryFn: () => api<{ tables: TableMeta[] }>("/api/data/tables"),
  });

  const [activeKey, setActiveKey] = useState<string>(lockedTable ?? "deal_order");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [openRowIdx, setOpenRowIdx] = useState<number | null>(null);
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  // When ColumnFilter is opened, we remember where from so the popover
  // anchors to the correct element. Headers anchor to the per-column icon;
  // the "Add filter" menu anchors to its own button (for hidden columns).
  const [filterSource, setFilterSource] = useState<"header" | "add-button">("header");
  const [filtersByTable, setFiltersByTable] = useState<Record<string, Filters>>({});
  const [sortByTable, setSortByTable] = useState<Record<string, SortState>>({});
  const [density, setDensity] = useState<Density>(readDensity);
  const filterBtnRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const addFilterBtnRef = useRef<HTMLButtonElement | null>(null);
  const [addFilterMenuOpen, setAddFilterMenuOpen] = useState(false);
  const [addFilterSearch, setAddFilterSearch] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* no-op */
    }
  }, [density]);

  // URL-driven lockedTable can change as the user switches sidebar entries;
  // keep the internal active-key + popovers in sync with the route.
  useEffect(() => {
    if (lockedTable && lockedTable !== activeKey) {
      setActiveKey(lockedTable);
      setOffset(0);
      setOpenFilterCol(null);
      setOpenRowIdx(null);
      setAddFilterMenuOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedTable]);

  const activeTable = tables.data?.tables.find((t) => t.key === activeKey);
  const filters = filtersByTable[activeKey] ?? {};
  const sort = sortByTable[activeKey] ?? null;

  const filterTriples = useMemo<Array<[string, string, string]>>(() => {
    if (!activeTable) return [];
    const out: Array<[string, string, string]> = [];
    for (const col of activeTable.columns) {
      const v = filters[col.name];
      if (v && hasActive(v)) out.push(...valueToFilterTriples(col, v));
    }
    return out;
  }, [activeTable, filters]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    if (search) p.set("search", search);
    if (sort) p.set("sort", `${sort.field}:${sort.dir}`);
    for (const [col, op, val] of filterTriples) {
      p.append("f", `${col}:${op}:${val}`);
    }
    return p.toString();
  }, [limit, offset, search, filterTriples, sort]);

  const rowsQ = useQuery({
    queryKey: ["data.rows", activeKey, qs],
    queryFn: () => api<RowsResp>(`/api/data/${activeKey}/rows?${qs}`),
    enabled: !!activeTable,
  });

  const updateFilter = (colName: string, v: ColumnFilterValue | undefined) => {
    setOffset(0);
    setFiltersByTable((prev) => {
      const cur = { ...(prev[activeKey] ?? {}) };
      if (v === undefined) delete cur[colName];
      else cur[colName] = v;
      return { ...prev, [activeKey]: cur };
    });
  };

  const clearAllFilters = () => {
    setOffset(0);
    setFiltersByTable((prev) => ({ ...prev, [activeKey]: {} }));
  };

  const toggleSort = (colName: string) => {
    setOffset(0);
    setSortByTable((prev) => {
      const cur = prev[activeKey] ?? null;
      let next: SortState;
      if (!cur || cur.field !== colName) next = { field: colName, dir: "desc" };
      else if (cur.dir === "desc") next = { field: colName, dir: "asc" };
      else next = null; // third click clears
      return { ...prev, [activeKey]: next };
    });
  };

  const rows = rowsQ.data?.rows ?? [];
  const openRow = openRowIdx != null ? rows[openRowIdx] ?? null : null;

  // Keyboard ← / → while drawer is open — jump prev / next row.
  useEffect(() => {
    if (openRowIdx == null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && openRowIdx > 0) {
        e.preventDefault();
        setOpenRowIdx(openRowIdx - 1);
      } else if (e.key === "ArrowRight" && openRowIdx < rows.length - 1) {
        e.preventDefault();
        setOpenRowIdx(openRowIdx + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openRowIdx, rows.length]);

  const columns = useMemo<Column<Row>[]>(() => {
    if (!activeTable) return [];
    return activeTable.columns
      .filter((c) => c.visible)
      .map((c) => ({
        name: c.name,
        label: c.label,
        numeric: c.numeric,
        idColumn: c.id_column,
        currency: c.currency,
        width: widthFor(c),
        sort: sort?.field === c.name ? sort.dir : null,
        hasActiveFilter: hasActive(filters[c.name]),
        render:
          activeKey === "legal_person" && c.name === "direction"
            ? (r: Row) => (
                <DirectionCell
                  personId={Number(r.person_id)}
                  current={(r.direction as string) ?? null}
                  source={(r.direction_source as string) ?? null}
                  updatedAt={(r.direction_updated_at as string) ?? null}
                  editable={canEditDirection}
                  onSaved={() => {
                    queryClient.invalidateQueries({
                      queryKey: ["data.rows", "legal_person"],
                    });
                  }}
                />
              )
            : undefined,
        filter: (
          <>
            <button
              ref={(el) => {
                filterBtnRefs.current.set(c.name, el);
              }}
              onClick={(e) => {
                e.stopPropagation();
                setFilterSource("header");
                setOpenFilterCol((cur) => (cur === c.name ? null : c.name));
              }}
              className={`h-5 w-5 grid place-items-center rounded-sm transition-colors ${
                openFilterCol === c.name || hasActive(filters[c.name])
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={`Filter ${c.label}`}
            >
              <FilterIcon />
            </button>
            {openFilterCol === c.name && filterSource === "header" && (
              <ColumnFilter
                col={c}
                tableKey={activeKey}
                value={filters[c.name] ?? initialFilterFor(c)}
                anchorEl={filterBtnRefs.current.get(c.name) ?? null}
                onChange={(v) => updateFilter(c.name, v)}
                onClose={() => setOpenFilterCol(null)}
              />
            )}
          </>
        ),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTable, filters, openFilterCol, activeKey, sort, canEditDirection]);

  function exportData(format: "xlsx" | "csv" = "xlsx") {
    const token = getAccessToken();
    // Strip the page's limit/offset — the export pulls the full filtered set.
    const exportQs = new URLSearchParams(qs);
    exportQs.delete("limit");
    exportQs.delete("offset");
    exportQs.set("format", format);
    const url = `/api/data/${activeKey}/export?${exportQs.toString()}`;
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((b) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(b);
        link.download = `${activeKey}.${format}`;
        link.click();
        URL.revokeObjectURL(link.href);
      });
  }

  const tablesList = tables.data?.tables ?? [];
  /**
   * One chip per column — multi-value `in` ops collapse into a single
   * chip with a value count instead of N individual chips. Cleaner
   * visual rhythm at the expense of chip-level click-to-remove for one
   * value; the whole filter clears in one click, which is fine.
   */
  interface Chip {
    col: string;
    label: string;
    op: string;
    val: string;
  }
  const activeFilterChips: Chip[] = activeTable
    ? activeTable.columns.flatMap((c): Chip[] => {
        const v = filters[c.name];
        if (!v || !hasActive(v)) return [];
        const triples = valueToFilterTriples(c, v);
        if (triples.length === 0) return [];
        // Collapse if every triple is an `in` op and there's more than one.
        const allIn =
          triples.length > 1 && triples.every(([, op]) => op === "in");
        if (allIn) {
          return [
            {
              col: c.name,
              label: c.label,
              op: "in",
              val: `${triples.length} values`,
            },
          ];
        }
        return triples.map(([col, op, val]) => ({
          col,
          label: c.label,
          op,
          val,
        }));
      })
    : [];

  const pkValue = (row: Row) =>
    activeTable ? activeTable.pk.map((p) => row[p]).join("~") : "";

  const locked = Boolean(lockedTable);
  const lockedTitleKey = activeTable ? TABLE_LABEL_KEYS[activeTable.key] : undefined;
  const lockedSubtitleKey = activeTable ? TABLE_SUBTITLE_KEYS[activeTable.key] : undefined;
  const lockedIcon = activeTable ? TABLE_ICON[activeTable.key] : undefined;

  return (
    <div>
      <div className="">
        {locked && activeTable ? (
          <div>
            <div className="caption text-muted-foreground">
              <span>{t("dashboard.crumb_dashboard")}</span>
              <span className="mx-2">·</span>
              <span>{t("data.crumb_data")}</span>
              <span className="mx-2">·</span>
              <span className="text-foreground/80">
                {t(TABLE_LABEL_KEYS[activeTable.key] ?? activeTable.label)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-4">
              <TableGlyph kind={lockedIcon} />
              <h1 className="text-4xl font-semibold tracking-tight text-foreground leading-none">
                {lockedTitleKey ? t(lockedTitleKey) : activeTable.label}
                <span className="">.</span>
              </h1>
            </div>
            {lockedSubtitleKey && (
              <p className="text-sm text-foreground/80 mt-3 max-w-2xl">
                {t(lockedSubtitleKey)}
              </p>
            )}
            {rowsQ.data && (
              <p className="caption text-muted-foreground mt-2 tabular-nums">
                {t("data.subtitle_rows", {
                  n: rowsQ.data.total.toLocaleString(),
                })}
              </p>
            )}
            <div className="border-t border-border my-3 mt-6" />
          </div>
        ) : (
          <PageHeading
            crumb={[
              t("dashboard.crumb_dashboard"),
              t("data.crumb_data"),
              activeTable ? t(TABLE_LABEL_KEYS[activeTable.key] ?? activeTable.label) : "—",
            ]}
            title={t("data.title")}
            subtitle={
              activeTable && rowsQ.data
                ? t("data.subtitle_rows", {
                    n: rowsQ.data.total.toLocaleString(),
                  })
                : undefined
            }
          />
        )}
      </div>

      {/* Table tabs — hidden in locked mode where the page is dedicated to
          a single table (each has its own sidebar entry + URL). */}
      {!locked && (
      <div className="mt-8 flex items-center gap-6 border-b border-border">
        {tablesList.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveKey(tab.key);
              setOffset(0);
              setOpenFilterCol(null);
              setOpenRowIdx(null);
            }}
            className={[
              "pb-3 text-sm transition-colors",
              tab.key === activeKey
                ? "text-primary border-b-2 border-primary -mb-px"
                : "text-foreground/80 hover:text-foreground border-b-2 border-transparent",
            ].join(" ")}
          >
            {t(TABLE_LABEL_KEYS[tab.key] ?? tab.label)}
          </button>
        ))}
      </div>
      )}

      {/* Top strip — search + density toggle + CSV */}
      <div className="mt-6 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <div className="flex-1">
          <Input
            placeholder={t("data.search_placeholder")}
            value={search}
            leading={<SearchIcon />}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className="flex items-center justify-between md:justify-end gap-4">
          {/* Density toggle is meaningless in card view — hide on mobile. */}
          <div className="hidden md:flex items-center gap-3 caption text-muted-foreground">
            <span>{t("common.density")}</span>
            <button
              type="button"
              onClick={() => setDensity("compact")}
              className={`caption transition-colors ${
                density === "compact"
                  ? "text-primary underline decoration-primary underline-offset-[3px]"
                  : "text-foreground/80 hover:text-foreground"
              }`}
            >
              {t("common.compact")}
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => setDensity("comfortable")}
              className={`caption transition-colors ${
                density === "comfortable"
                  ? "text-primary underline decoration-primary underline-offset-[3px]"
                  : "text-foreground/80 hover:text-foreground"
              }`}
            >
              {t("common.comfortable")}
            </button>
          </div>
          <div className="relative">
            <button
              ref={addFilterBtnRef}
              type="button"
              onClick={() => setAddFilterMenuOpen((o) => !o)}
              disabled={!activeTable}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium rounded-[10px] transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 bg-transparent text-foreground/80 border border-border hover:bg-muted hover:text-foreground"
            >
              <span aria-hidden className="text-muted-foreground">+</span>
              {t("data.add_filter")}
            </button>
            {addFilterMenuOpen && activeTable && (
              <AddFilterMenu
                anchorEl={addFilterBtnRef.current}
                columns={activeTable.columns}
                filters={filters}
                search={addFilterSearch}
                onSearch={setAddFilterSearch}
                onClose={() => {
                  setAddFilterMenuOpen(false);
                  setAddFilterSearch("");
                }}
                onPick={(colName) => {
                  setAddFilterMenuOpen(false);
                  setAddFilterSearch("");
                  setFilterSource("add-button");
                  setOpenFilterCol(colName);
                }}
              />
            )}
          </div>
          <Button onClick={() => exportData("xlsx")}>{t("common.excel")}</Button>
          <Button variant="ghost" onClick={() => exportData("csv")}>{t("common.csv")}</Button>
        </div>
      </div>

      {/* ColumnFilter popover opened via the "Add filter" menu — anchored to
          the Add filter button so hidden-column filters have a place to land. */}
      {filterSource === "add-button" && openFilterCol && activeTable && (() => {
        const col = activeTable.columns.find((c) => c.name === openFilterCol);
        if (!col) return null;
        return (
          <ColumnFilter
            col={col}
            tableKey={activeKey}
            value={filters[openFilterCol] ?? initialFilterFor(col)}
            anchorEl={addFilterBtnRef.current}
            onChange={(v) => updateFilter(openFilterCol, v)}
            onClose={() => {
              setOpenFilterCol(null);
              setFilterSource("header");
            }}
          />
        );
      })()}

      {/* Active filter chips — slides in when count goes 0 → ≥1 */}
      <AnimatePresence initial={false}>
        {activeFilterChips.length > 0 && (
          <motion.div
            key="chips"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            {activeFilterChips.map((chip, i) => {
              const colMeta = activeTable!.columns.find((c) => c.name === chip.col)!;
              return (
                <button
                  key={`${chip.col}-${chip.op}-${i}`}
                  onClick={() => updateFilter(chip.col, undefined)}
                  className="group inline-flex items-center gap-2 h-7 pl-3 pr-2 rounded-full bg-primary/10/60 hover:bg-primary/10 border border-primary-2/70 hover:border-primary transition-colors caption text-foreground"
                  title="Click to remove"
                >
                  <span className="text-foreground/80">{colMeta.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{chip.op}</span>
                  <span className="text-foreground tabular-nums">{chip.val}</span>
                  <span
                    aria-hidden
                    className="text-[16px] leading-none text-muted-foreground group-hover:text-primary transition-colors ml-0.5"
                  >
                    ✕
                  </span>
                </button>
              );
            })}
            <button
              onClick={clearAllFilters}
              className="caption text-foreground/80 hover:text-primary hover:underline decoration-primary underline-offset-[3px] ml-2"
            >
              {t("common.clear_all")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="mt-4 p-0 overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          density={density}
          onRowClick={(r) => {
            const idx = rows.indexOf(r);
            if (idx >= 0) setOpenRowIdx(idx);
          }}
          onSort={toggleSort}
          activeKey={openRow ? pkValue(openRow) : null}
          rowKey={(r) => pkValue(r)}
          loading={rowsQ.isLoading}
          emptyPhrase={activeFilterChips.length > 0 || search ? "filtered" : "empty"}
        />
        {rowsQ.data && (
          <Pagination
            offset={offset}
            limit={limit}
            total={rowsQ.data.total}
            onOffset={setOffset}
          />
        )}
      </Card>

      <Drawer
        open={!!openRow}
        onClose={() => setOpenRowIdx(null)}
        title={
          activeTable
            ? t(TABLE_LABEL_KEYS[activeTable.key] ?? activeTable.label)
            : ""
        }
        pk={openRow && activeTable ? activeTable.pk.map((p) => String(openRow[p] ?? "—")).join(" · ") : undefined}
        onPrev={openRowIdx != null && openRowIdx > 0 ? () => setOpenRowIdx(openRowIdx - 1) : undefined}
        onNext={openRowIdx != null && openRowIdx < rows.length - 1 ? () => setOpenRowIdx(openRowIdx + 1) : undefined}
        footer={
          openRowIdx != null && rows.length > 0 ? (
            <div className="caption text-muted-foreground tabular-nums flex items-center justify-between">
              <span>
                {t("data.drawer_row_of_page", {
                  n: openRowIdx + 1,
                  total: rows.length,
                })}
              </span>
              <span>
                <kbd className="font-mono text-xs">←</kbd>{" "}
                <kbd className="font-mono text-xs">→</kbd>{" "}
                {t("data.drawer_nav_hint")}
              </span>
            </div>
          ) : undefined
        }
      >
        {openRow && activeTable && (
          <div className="flex flex-col gap-2">
            {activeTable.columns.map((c) => (
              <div
                key={c.name}
                className="flex items-baseline gap-2 py-1.5"
              >
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium text-right shrink-0" style={{ width: 140 }}>
                  {c.label}
                </span>
                <span className="border-b border-dotted border-border flex-1 mx-2" />
                <span
                  className={[
                    "text-sm shrink-0 text-right",
                    c.id_column ? "font-mono text-xs text-foreground/80" : "text-foreground",
                    c.numeric ? " nums tabular-nums" : "",
                  ].join(" ")}
                  style={{ maxWidth: "60%" }}
                >
                  {formatDetail(openRow[c.name], c.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function widthFor(c: {
  type: string;
  numeric: boolean;
  id_column: boolean;
  name: string;
}): string {
  if (c.type === "date") return "118px";
  if (c.type === "timestamp") return "156px";
  if (c.numeric) return c.name === "amount" || c.name === "product_amount" ? "124px" : "96px";
  if (c.id_column) return "140px";
  if (c.name === "product_name" || c.name === "client_name") return "280px";
  if (c.name === "name") return "280px";
  return "160px";
}

function formatDetail(v: unknown, currency: string | null) {
  if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
  if (typeof v === "number") {
    const s = v.toLocaleString("en-US", { maximumFractionDigits: 4 });
    return currency ? (
      <span>
        {s} <span className="caption text-muted-foreground font-sans not-italic">{currency}</span>
      </span>
    ) : (
      s
    );
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime()) && v.includes("T")) {
      return (
        <span className="tabular-nums">
          {d.toLocaleString("en-GB", { timeZone: "Asia/Tashkent" })}
        </span>
      );
    }
  }
  return String(v);
}

/**
 * Legal-page Yoʻnalish cell. Renders the direction as a sectional-label
 * tag (uppercase, letter-spaced, baseline rule) and — for admins/operators
 * — opens an editorial popover on click. The popover mirrors the
 * ColumnFilter architecture: portal-into-body, fixed positioning, auto-flip,
 * dismiss on click-outside/Escape. Keyboard support (↑/↓/Enter).
 *
 * Source taxonomy drives subtle typographic tells:
 *   · "default" — italic muted, dotted underline (provisional / not yet set)
 *   · "excel"   — uppercase ink, solid thin underline
 *   · "manual"  — uppercase mark color, solid underline + leading "●" bullet
 *                 (an editorial footnote mark signalling hand-edited)
 */
function DirectionCell({
  personId,
  current,
  source,
  updatedAt,
  editable,
  onSaved,
}: {
  personId: number;
  current: string | null;
  source: string | null;
  updatedAt: string | null;
  editable: boolean;
  onSaved: () => void;
}) {
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [optimisticSource, setOptimisticSource] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<"saved" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const displayed = optimistic ?? current;
  const displayedSource = optimisticSource ?? source;

  useEffect(() => {
    setOptimistic(null);
    setOptimisticSource(null);
  }, [current, source]);

  const mutation = useMutation({
    mutationFn: (d: string) =>
      api<{ direction: string; direction_source: string; direction_updated_at: string }>(
        `/api/data/legal-persons/${personId}/direction`,
        { method: "PATCH", body: JSON.stringify({ direction: d }) },
      ),
    onMutate: (d) => {
      setError(null);
      setOptimistic(d);
      setOptimisticSource("manual");
    },
    onError: (err) => {
      setOptimistic(null);
      setOptimisticSource(null);
      const msg =
        err instanceof ApiError
          ? (typeof err.body === "object" && err.body && "detail" in err.body
              ? String((err.body as { detail: unknown }).detail)
              : err.message)
          : (err as Error).message;
      setError(msg);
      setTimeout(() => setError(null), 4000);
    },
    onSuccess: () => {
      setFlash("saved");
      setTimeout(() => setFlash(null), 1400);
      onSaved();
    },
  });

  const pending = mutation.isPending;

  return (
    <span
      className="relative inline-flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <DirectionTag
        ref={btnRef}
        value={displayed}
        source={displayedSource}
        editable={editable}
        pending={pending}
        active={open}
        onClick={(e) => {
          if (!editable) return;
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      />
      <AnimatePresence>
        {flash === "saved" && (
          <motion.span
            key="saved"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.18 }}
            className="font-semibold italic caption text-emerald-700 dark:text-emerald-400 pointer-events-none"
          >
            ✓
          </motion.span>
        )}
        {error && (
          <motion.span
            key="err"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="font-semibold italic caption text-red-700 dark:text-red-400 pointer-events-none max-w-[200px] truncate"
            title={error}
          >
            ! {error}
          </motion.span>
        )}
      </AnimatePresence>
      {open && editable && (
        <DirectionMenu
          anchorEl={btnRef.current}
          current={displayed}
          source={displayedSource}
          updatedAt={updatedAt}
          pending={pending}
          onConfirm={(d) => {
            setOpen(false);
            if (d !== displayed) mutation.mutate(d);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

/**
 * The visible classification-tag element. Forwarded ref so the popover can
 * anchor off it. Buttonized when editable, static <span> when not.
 */
const DirectionTag = ({
  ref,
  value,
  source,
  editable,
  pending,
  active,
  onClick,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  value: string | null;
  source: string | null;
  editable: boolean;
  pending: boolean;
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}) => {
  const isUnset = !value;
  const isManual = source === "manual";

  // Readable tag: normal case, body-size, with a clear chevron so it's
  // obviously a dropdown trigger (not a tiny obscure font-mono label).
  const base =
    "inline-flex items-center gap-1.5 rounded-[7px] whitespace-nowrap text-[13px] leading-none transition-colors";
  const idle = isUnset
    ? "text-muted-foreground font- italic border border-dashed border-border px-2.5 py-[5px]"
    : "text-foreground bg-muted border border-border px-2.5 py-[5px]";

  const content = (
    <>
      {isManual && !isUnset && (
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
          title="manually set"
        />
      )}
      <span className={pending ? "opacity-50" : ""}>
        {pending ? "…" : (value ?? "tanlash")}
      </span>
      {editable && (
        <svg
          aria-hidden
          width="9"
          height="9"
          viewBox="0 0 10 10"
          fill="none"
          className="text-muted-foreground shrink-0"
        >
          <path
            d="M2 3.5 5 6.5 8 3.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  );

  if (!editable) {
    return <span className={[base, idle].join(" ")}>{content}</span>;
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={[
        base,
        idle,
        "hover:border-ink-3 hover:text-foreground",
        active ? "border-primary text-primary ring-1 ring-ring/$1" : "",
      ].join(" ")}
      title={
        source === "excel"
          ? "Excel dan (Clients)"
          : source === "manual"
            ? "qoʻlda sozlangan"
            : "hali tanlanmagan"
      }
    >
      {content}
    </button>
  );
};

function DirectionMenu({
  anchorEl,
  current,
  source,
  updatedAt,
  pending,
  onConfirm,
  onClose,
}: {
  anchorEl: HTMLElement | null;
  current: string | null;
  source: string | null;
  updatedAt: string | null;
  pending: boolean;
  onConfirm: (d: string) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const initialIdx = (() => {
    const i = LEGAL_PERSON_DIRECTIONS.indexOf(current ?? "");
    return i >= 0 ? i : 0;
  })();
  const [focusIdx, setFocusIdx] = useState<number>(initialIdx);
  // Staged selection — nothing is persisted until the user clicks Saqlash.
  const [staged, setStaged] = useState<string | null>(current);
  const dirty = staged !== current;

  // Portal-pin in viewport coordinates, auto-flip when near edges.
  useLayoutEffect(() => {
    if (!anchorEl || !menuRef.current) return;
    const place = () => {
      if (!anchorEl || !menuRef.current) return;
      const btn = anchorEl.getBoundingClientRect();
      const pop = menuRef.current.getBoundingClientRect();
      const margin = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = btn.left;
      if (left + pop.width > vw - margin) left = btn.right - pop.width;
      if (left < margin) left = margin;
      let top = btn.bottom + 4;
      if (top + pop.height > vh - margin) {
        top = Math.max(margin, btn.top - pop.height - 4);
      }
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorEl]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target as Node)) return;
      if (anchorEl && anchorEl.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => (i + 1) % LEGAL_PERSON_DIRECTIONS.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) =>
          (i - 1 + LEGAL_PERSON_DIRECTIONS.length) % LEGAL_PERSON_DIRECTIONS.length,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const picked = LEGAL_PERSON_DIRECTIONS[focusIdx];
        if (staged === picked && dirty) {
          // Second Enter on the already-staged option confirms + saves.
          onConfirm(picked);
        } else {
          setStaged(picked);
        }
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchorEl, onClose, onConfirm, focusIdx, staged, dirty]);

  const renderUpdated = useCallback(() => {
    if (!updatedAt) return null;
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return null;
    // Manual format — Intl's `uz` short-month output is "M01"/"M02"/… on
    // many ICU builds, so we bypass the locale machinery entirely and emit
    // a clean "12 Apr 2026" string regardless of i18n state.
    const MONTHS = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const day = String(d.getDate()).padStart(2, "0");
    return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }, [updatedAt]);

  const sourceCopy =
    source === "excel"
      ? "Excel · Clients sheet"
      : source === "manual"
        ? "manual · dashboard edit"
        : "not yet set";

  return createPortal(
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: 264,
        visibility: pos ? "visible" : "hidden",
        zIndex: 60,
      }}
      role="dialog"
      aria-label="Yoʻnalish tanlash"
      className="rounded-[10px] border border-border bg-card shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)] overflow-hidden"
    >
      <div className="px-3.5 pt-3 pb-2.5 border-b border-border bg-background">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
          Yoʻnalish
        </div>
        <div className="mt-1 flex items-center gap-2 text-[13.5px] leading-tight text-foreground">
          <span className={current ? "" : "text-muted-foreground italic"}>
            {current ?? "tanlanmagan"}
          </span>
          {dirty && (
            <>
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
              <span className="font-semibold text-primary">
                {staged ?? "tanlanmagan"}
              </span>
            </>
          )}
          {pending && (
            <span className="ml-auto text-[11px] text-muted-foreground">saqlanmoqda…</span>
          )}
        </div>
      </div>
      <ul
        className="py-1 max-h-[280px] overflow-y-auto"
        role="listbox"
        aria-label="Yoʻnalishlar"
      >
        {LEGAL_PERSON_DIRECTIONS.map((d, i) => {
          const isStaged = d === staged;
          const isCurrent = d === current;
          const isFocused = i === focusIdx;
          return (
            <li key={d}>
              <button
                type="button"
                role="option"
                aria-selected={isStaged}
                disabled={pending}
                onMouseEnter={() => setFocusIdx(i)}
                onClick={(e) => {
                  e.stopPropagation();
                  setStaged(d);
                  setFocusIdx(i);
                }}
                className={[
                  "w-full text-left px-3.5 py-2 flex items-center gap-2.5 text-[13.5px] transition-colors",
                  isStaged
                    ? "bg-primary/10 text-primary font-medium"
                    : isFocused
                      ? "bg-muted text-foreground"
                      : "text-foreground",
                  pending ? "cursor-wait opacity-60" : "cursor-pointer",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className={[
                    "w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0",
                    isStaged
                      ? "border-primary bg-primary"
                      : "border-border bg-card",
                  ].join(" ")}
                >
                  {isStaged && (
                    <span className="w-1.5 h-1.5 rounded-full bg-card" />
                  )}
                </span>
                <span className="flex-1">{d}</span>
                {isCurrent && !isStaged && (
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    joriy
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="px-3.5 py-2.5 border-t border-border bg-background flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 flex flex-col text-[11px] leading-tight text-muted-foreground">
          <span className="truncate">{sourceCopy}</span>
          {renderUpdated() && (
            <span className="truncate">{renderUpdated()}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="text-[12.5px] px-3 py-1.5 rounded-[6px] text-foreground/80 hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          Bekor
        </button>
        <button
          type="button"
          onClick={() => staged && onConfirm(staged)}
          disabled={!dirty || !staged || pending}
          className={[
            "text-[12.5px] px-3 py-1.5 rounded-[6px] font-medium transition-colors",
            dirty && staged && !pending
              ? "bg-primary text-card hover:brightness-110"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          ].join(" ")}
        >
          Saqlash
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}

function FilterIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M1 2h10l-4 5v3l-2 1V7L1 2z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.3 9.3 12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Per-table heading glyph — tinted disc containing a minimal outline icon.
 * Rendered in locked-mode page headers so each of the three dedicated data
 * routes has its own visual identity without resorting to emoji.
 */
function TableGlyph({ kind }: { kind: "orders" | "payments" | "people" | undefined }) {
  if (!kind) return null;
  const Icon = kind === "orders" ? Package : kind === "payments" ? Wallet : Building2;
  return (
    <span
      aria-hidden
      className="shrink-0 inline-flex items-center justify-center h-11 w-11 rounded-full bg-muted text-foreground"
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

/**
 * Column-picker dropdown anchored to the "Add filter" button.
 * Lists every column in the active table's catalog (visible + hidden),
 * with a search box and a dot for columns that already have an active filter.
 * Picking a column hands control off to ColumnFilter.
 */
function AddFilterMenu({
  anchorEl,
  columns,
  filters,
  search,
  onSearch,
  onPick,
  onClose,
}: {
  anchorEl: HTMLElement | null;
  columns: (ColumnMeta & { visible: boolean })[];
  filters: Filters;
  search: string;
  onSearch: (s: string) => void;
  onPick: (colName: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Portal-to-body + fixed positioning so the dropdown can escape the page's
  // stacking contexts (the Card below creates its own). Matches the pattern
  // used by ColumnFilter.
  useLayoutEffect(() => {
    if (!anchorEl || !menuRef.current) return;
    const place = () => {
      if (!anchorEl || !menuRef.current) return;
      const btn = anchorEl.getBoundingClientRect();
      const pop = menuRef.current.getBoundingClientRect();
      const margin = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.max(pop.width, 300);
      let left = btn.right - width; // right-align to the button
      if (left < margin) left = margin;
      if (left + width > vw - margin) left = vw - margin - width;
      let top = btn.bottom + 6;
      if (top + pop.height > vh - margin) {
        // Flip above if there's no room below.
        top = Math.max(margin, btn.top - pop.height - 6);
      }
      setPos({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorEl]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      const target = e.target as Node;
      if (menuRef.current.contains(target)) return;
      if (anchorEl && anchorEl.contains(target)) return; // clicks on the toggle are handled by the toggle itself
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorEl]);

  const q = search.trim().toLowerCase();
  const items = columns.filter((c) => {
    if (!q) return true;
    return (
      c.label.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  });

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: pos?.width ?? 300,
        visibility: pos ? "visible" : "hidden",
        zIndex: 50,
      }}
      className="rounded-[10px] border border-border bg-background shadow-lg"
      role="menu"
    >
      <div className="p-2 border-b border-border">
        <div className="flex items-center gap-2 h-9 bg-muted px-2.5 rounded-md border border-border transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/$1">
          <span className="text-muted-foreground">
            <SearchIcon />
          </span>
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("data.add_filter_placeholder")}
            className="flex-1 bg-transparent text-sm text-foreground outline-none border-0 placeholder:italic placeholder:text-muted-foreground min-w-0"
          />
        </div>
      </div>
      <div className="max-h-[360px] overflow-y-auto py-1">
        {items.length === 0 && (
          <div className="px-3 py-6 caption text-muted-foreground text-center">
            {t("data.add_filter_no_matches")}
          </div>
        )}
        {items.map((c) => {
          const active = hasActive(filters[c.name]);
          return (
            <button
              key={c.name}
              onClick={() => onPick(c.name)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
              role="menuitem"
            >
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                  active ? "bg-primary" : "bg-transparent"
                }`}
              />
              <span className="text-foreground flex-1 truncate">{c.label}</span>
              {!c.visible && (
                <span className="caption text-muted-foreground shrink-0">
                  {t("data.add_filter_hidden")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
