import { useEffect, useMemo, useRef, useState } from "react";
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

export default function DataViewer() {
  const { t } = useTranslation();
  const tables = useQuery({
    queryKey: ["data.tables"],
    queryFn: () => api<{ tables: TableMeta[] }>("/api/data/tables"),
  });

  const [activeKey, setActiveKey] = useState<string>("deal_order");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [openRowIdx, setOpenRowIdx] = useState<number | null>(null);
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const [filtersByTable, setFiltersByTable] = useState<Record<string, Filters>>({});
  const [sortByTable, setSortByTable] = useState<Record<string, SortState>>({});
  const [density, setDensity] = useState<Density>(readDensity);
  const filterBtnRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* no-op */
    }
  }, [density]);

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
            {openFilterCol === c.name && (
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
  const activeFilterChips = activeTable
    ? activeTable.columns.flatMap((c) => {
        const v = filters[c.name];
        if (!v || !hasActive(v)) return [];
        return valueToFilterTriples(c, v).map(([col, op, val]) => ({
          col, label: c.label, op, val,
        }));
      })
    : [];

  const pkValue = (row: Row) =>
    activeTable ? activeTable.pk.map((p) => row[p]).join("~") : "";

  return (
    <div>
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

      {/* Table tabs */}
      <div className="mt-8 flex items-center gap-6 border-b border-rule">
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

      {/* Top strip — search + density toggle + CSV */}
      <div className="mt-6 flex items-center gap-4">
        <div className="flex-1">
          <Input
            placeholder={t("data.search_placeholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className="flex items-center gap-3 caption text-ink-3">
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
        <Button onClick={exportCsv}>{t("common.csv")}</Button>
      </div>

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
                  className="group inline-flex items-center gap-2 h-7 px-3 rounded-full bg-mark-bg/60 hover:bg-mark-bg transition-colors caption text-ink"
                  title="Click to remove"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-mark" />
                  <span className="text-ink-2">{colMeta.label}</span>
                  <span className="mono text-mono-xs text-ink-3">{chip.op}</span>
                  <span className="text-ink tabular-nums">{chip.val}</span>
                  <span className="text-ink-3 group-hover:text-mark">×</span>
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
