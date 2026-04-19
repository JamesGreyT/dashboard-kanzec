import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { api, getAccessToken } from "../lib/api";
import PageHeading from "../components/PageHeading";
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
                  ? "text-mark"
                  : "text-ink-3 hover:text-ink"
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
  }, [activeTable, filters, openFilterCol, activeKey, sort]);

  function exportCsv() {
    const token = getAccessToken();
    const url = `/api/data/${activeKey}/export?${qs}`;
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((b) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(b);
        link.download = `${activeKey}.csv`;
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
      <div className="stagger-0">
        {locked && activeTable ? (
          <div>
            <div className="caption text-ink-3">
              <span>{t("dashboard.crumb_dashboard")}</span>
              <span className="mx-2">·</span>
              <span>{t("data.crumb_data")}</span>
              <span className="mx-2">·</span>
              <span className="text-ink-2">
                {t(TABLE_LABEL_KEYS[activeTable.key] ?? activeTable.label)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-4">
              <TableGlyph kind={lockedIcon} />
              <h1 className="serif text-heading-lg text-ink leading-none">
                {lockedTitleKey ? t(lockedTitleKey) : activeTable.label}
                <span className="mark-stop">.</span>
              </h1>
            </div>
            {lockedSubtitleKey && (
              <p className="text-body text-ink-2 mt-3 max-w-2xl">
                {t(lockedSubtitleKey)}
              </p>
            )}
            {rowsQ.data && (
              <p className="caption text-ink-3 mt-2 tabular-nums">
                {t("data.subtitle_rows", {
                  n: rowsQ.data.total.toLocaleString(),
                })}
              </p>
            )}
            <div className="leader mt-6" />
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
      <div className="stagger-1 mt-8 flex items-center gap-6 border-b border-rule">
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
              "pb-3 text-label transition-colors",
              tab.key === activeKey
                ? "text-mark border-b-2 border-mark -mb-px"
                : "text-ink-2 hover:text-ink border-b-2 border-transparent",
            ].join(" ")}
          >
            {t(TABLE_LABEL_KEYS[tab.key] ?? tab.label)}
          </button>
        ))}
      </div>
      )}

      {/* Top strip — search + density toggle + CSV */}
      <div className="stagger-2 mt-6 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
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
          <div className="hidden md:flex items-center gap-3 caption text-ink-3">
            <span>{t("common.density")}</span>
            <button
              type="button"
              onClick={() => setDensity("compact")}
              className={`caption transition-colors ${
                density === "compact"
                  ? "text-mark underline decoration-mark underline-offset-[3px]"
                  : "text-ink-2 hover:text-ink"
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
                  ? "text-mark underline decoration-mark underline-offset-[3px]"
                  : "text-ink-2 hover:text-ink"
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
              className="inline-flex items-center justify-center gap-2 h-10 px-4 text-label font-medium rounded-[10px] transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 bg-transparent text-ink-2 border border-rule hover:bg-paper-2 hover:text-ink"
            >
              <span aria-hidden className="text-ink-3">+</span>
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
          <Button onClick={exportCsv}>{t("common.csv")}</Button>
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
                  className="group inline-flex items-center gap-2 h-7 pl-3 pr-2 rounded-full bg-mark-bg/60 hover:bg-mark-bg border border-mark-2/70 hover:border-mark transition-colors caption text-ink"
                  title="Click to remove"
                >
                  <span className="text-ink-2">{colMeta.label}</span>
                  <span className="mono text-mono-xs text-ink-3">{chip.op}</span>
                  <span className="text-ink tabular-nums">{chip.val}</span>
                  <span
                    aria-hidden
                    className="serif text-[16px] leading-none text-ink-3 group-hover:text-mark transition-colors ml-0.5"
                  >
                    ✕
                  </span>
                </button>
              );
            })}
            <button
              onClick={clearAllFilters}
              className="caption text-ink-2 hover:text-mark hover:underline decoration-mark underline-offset-[3px] ml-2"
            >
              {t("common.clear_all")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="stagger-3 mt-4 p-0 overflow-hidden">
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
            <div className="caption text-ink-3 tabular-nums flex items-center justify-between">
              <span>
                {t("data.drawer_row_of_page", {
                  n: openRowIdx + 1,
                  total: rows.length,
                })}
              </span>
              <span>
                <kbd className="mono text-mono-xs">←</kbd>{" "}
                <kbd className="mono text-mono-xs">→</kbd>{" "}
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
                <span className="eyebrow text-right shrink-0" style={{ width: 140 }}>
                  {c.label}
                </span>
                <span className="dotted-leader" />
                <span
                  className={[
                    "text-body shrink-0 text-right",
                    c.id_column ? "mono text-mono-sm text-ink-2" : "text-ink",
                    c.numeric ? "serif nums tabular-nums" : "",
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
  if (v == null || v === "") return <span className="text-ink-3">—</span>;
  if (typeof v === "number") {
    const s = v.toLocaleString("en-US", { maximumFractionDigits: 4 });
    return currency ? (
      <span>
        {s} <span className="caption text-ink-3 font-sans not-italic">{currency}</span>
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
  return (
    <span
      aria-hidden
      className="shrink-0 inline-flex items-center justify-center h-11 w-11 rounded-full"
      style={{ background: "var(--mark-bg)", color: "var(--mark)" }}
    >
      {kind === "orders" && (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 4h10l3 3v13H5V4z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 10h8M8 14h8M8 18h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      {kind === "payments" && (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 9v6M18 9v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      {kind === "people" && (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M4 20v-1.5a4.5 4.5 0 0 1 4.5-4.5h4a4.5 4.5 0 0 1 4.5 4.5V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="10.5" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M17 11a3 3 0 0 0 0-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M20 20v-1a3.5 3.5 0 0 0-2.5-3.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
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
      className="rounded-[10px] border border-rule bg-paper shadow-lg"
      role="menu"
    >
      <div className="p-2 border-b border-rule">
        <div className="flex items-center gap-2 h-9 bg-paper-2 px-2.5 rounded-md border border-rule transition-colors focus-within:border-mark focus-within:ring-2 focus-within:ring-mark/35">
          <span className="text-ink-3">
            <SearchIcon />
          </span>
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("data.add_filter_placeholder")}
            className="flex-1 bg-transparent text-body text-ink outline-none border-0 placeholder:italic placeholder:text-ink-3 min-w-0"
          />
        </div>
      </div>
      <div className="max-h-[360px] overflow-y-auto py-1">
        {items.length === 0 && (
          <div className="px-3 py-6 caption text-ink-3 text-center">
            {t("data.add_filter_no_matches")}
          </div>
        )}
        {items.map((c) => {
          const active = hasActive(filters[c.name]);
          return (
            <button
              key={c.name}
              onClick={() => onPick(c.name)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-body hover:bg-paper-2 transition-colors"
              role="menuitem"
            >
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                  active ? "bg-mark" : "bg-transparent"
                }`}
              />
              <span className="text-ink flex-1 truncate">{c.label}</span>
              {!c.visible && (
                <span className="caption text-ink-3 shrink-0">
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
