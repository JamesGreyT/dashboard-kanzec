import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getAccessToken } from "../lib/api";
import PageHeading from "../components/PageHeading";
import Card from "../components/Card";
import DataTable, { Column } from "../components/DataTable";
import Drawer from "../components/Drawer";
import Button from "../components/Button";
import Input from "../components/Input";
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

export default function DataViewer() {
  const tables = useQuery({
    queryKey: ["data.tables"],
    queryFn: () => api<{ tables: TableMeta[] }>("/api/data/tables"),
  });

  const [activeKey, setActiveKey] = useState<string>("deal_order");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const [filtersByTable, setFiltersByTable] = useState<Record<string, Filters>>({});

  const activeTable = tables.data?.tables.find((t) => t.key === activeKey);
  const filters = filtersByTable[activeKey] ?? {};

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
    for (const [col, op, val] of filterTriples) {
      p.append("f", `${col}:${op}:${val}`);
    }
    return p.toString();
  }, [limit, offset, search, filterTriples]);

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
        hasActiveFilter: hasActive(filters[c.name]),
        filter: (
          <div className="relative">
            <button
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
                onChange={(v) => updateFilter(c.name, v)}
                onClose={() => setOpenFilterCol(null)}
              />
            )}
          </div>
        ),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTable, filters, openFilterCol, activeKey]);

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
          col,
          label: c.label,
          op,
          val,
        }));
      })
    : [];

  return (
    <div>
      <PageHeading
        crumb={["Dashboard", "Data", activeTable?.label ?? "—"]}
        title="Data"
        subtitle={
          activeTable && rowsQ.data
            ? `${rowsQ.data.total.toLocaleString()} rows · latest first`
            : undefined
        }
      />

      {/* Table tabs */}
      <div className="mt-8 flex items-center gap-6 border-b border-rule">
        {tablesList.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActiveKey(t.key);
              setOffset(0);
              setOpenFilterCol(null);
            }}
            className={[
              "pb-3 text-label transition-colors",
              t.key === activeKey
                ? "text-mark border-b-2 border-mark -mb-px"
                : "text-ink-2 hover:text-ink border-b-2 border-transparent",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Top strip */}
      <div className="mt-6 flex items-center gap-4">
        <div className="flex-1">
          <Input
            placeholder="search across all columns…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <Button onClick={exportCsv}>CSV</Button>
      </div>

      {/* Active filter chips */}
      {activeFilterChips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
            className="caption text-ink-2 hover:text-mark hover:underline decoration-mark ml-2"
          >
            clear all
          </button>
        </div>
      )}

      <Card className="mt-4 p-0 overflow-hidden">
        <DataTable
          columns={columns}
          rows={rowsQ.data?.rows ?? []}
          onRowClick={(r) => setOpenRow(r)}
          loading={rowsQ.isLoading}
        />
        {rowsQ.data && (
          <div className="h-14 px-6 flex items-center justify-between border-t border-rule">
            <div className="caption text-ink-3 tabular-nums">
              showing {rowsQ.data.total === 0 ? 0 : offset + 1}–
              {Math.min(offset + limit, rowsQ.data.total)} of{" "}
              {rowsQ.data.total.toLocaleString()}
            </div>
            <div className="flex items-center gap-6 text-label">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="text-ink hover:text-mark hover:underline decoration-mark disabled:text-ink-3 disabled:no-underline disabled:cursor-not-allowed"
              >
                ← prev
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= rowsQ.data.total}
                className="text-ink hover:text-mark hover:underline decoration-mark disabled:text-ink-3 disabled:no-underline disabled:cursor-not-allowed"
              >
                next →
              </button>
            </div>
          </div>
        )}
      </Card>

      <Drawer
        open={!!openRow}
        onClose={() => setOpenRow(null)}
        title={activeTable?.label ?? ""}
      >
        {openRow && activeTable && (
          <dl className="grid grid-cols-[160px_1fr] gap-y-3 gap-x-4">
            {activeTable.columns.map((c) => (
              <div key={c.name} className="contents">
                <dt className="eyebrow pt-1">{c.label}</dt>
                <dd
                  className={[
                    "text-body",
                    c.id_column ? "mono text-mono-sm text-ink-2" : "text-ink",
                    c.numeric ? "serif nums tabular-nums" : "",
                  ].join(" ")}
                >
                  {formatDetail(openRow[c.name], c.currency)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Drawer>
    </div>
  );
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
    if (!Number.isNaN(d.getTime())) {
      if (v.includes("T")) {
        return (
          <span className="tabular-nums">
            {d.toLocaleString("en-GB", { timeZone: "Asia/Tashkent" })}
          </span>
        );
      }
    }
  }
  return String(v);
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
  // Long-text columns — give them room but truncate if overflowing.
  if (c.name === "product_name" || c.name === "client_name") return "280px";
  if (c.name === "name") return "280px";
  return "160px";
}

function FilterIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M1 2h10l-4 5v3l-2 1V7L1 2z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
