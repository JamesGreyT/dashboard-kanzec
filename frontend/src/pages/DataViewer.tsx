import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getAccessToken } from "../lib/api";
import PageHeading from "../components/PageHeading";
import Card from "../components/Card";
import DataTable, { Column } from "../components/DataTable";
import Drawer from "../components/Drawer";
import Button from "../components/Button";
import Input from "../components/Input";
import JsonBlock from "../components/JsonBlock";

interface TableMeta {
  key: string;
  label: string;
  pk: string[];
  default_sort: { field: string; dir: "asc" | "desc" }[];
  columns: {
    name: string;
    label: string;
    type: string;
    ops: string[];
    visible: boolean;
    numeric: boolean;
    id_column: boolean;
    currency: string | null;
  }[];
}

interface RowsResp {
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

type Row = Record<string, unknown>;

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

  const activeTable = tables.data?.tables.find((t) => t.key === activeKey);

  const rowsQ = useQuery({
    queryKey: ["data.rows", activeKey, search, offset, limit],
    queryFn: () =>
      api<RowsResp>(
        `/api/data/${activeKey}/rows?limit=${limit}&offset=${offset}` +
          (search ? `&search=${encodeURIComponent(search)}` : ""),
      ),
    enabled: !!activeTable,
  });

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
      }));
  }, [activeTable]);

  function exportCsv() {
    const token = getAccessToken();
    // Manual download since Blob/auth is a bit fiddly — use fetch+blob.
    const url = `/api/data/${activeKey}/export` + (search ? `?search=${encodeURIComponent(search)}` : "");
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
            placeholder="search…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <Button onClick={exportCsv}>CSV</Button>
      </div>

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
        {openRow && (
          <div>
            <dl className="grid grid-cols-[160px_1fr] gap-y-3 gap-x-4">
              {activeTable?.columns.map((c) => (
                <div key={c.name} className="contents">
                  <dt className="eyebrow pt-1">{c.label}</dt>
                  <dd
                    className={[
                      "text-body",
                      c.id_column ? "mono text-mono-sm text-ink-2" : "text-ink",
                      c.numeric ? "serif nums tabular-nums" : "",
                    ].join(" ")}
                  >
                    {formatDetail(openRow[c.name])}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-8">
              <div className="eyebrow mb-3">Raw row</div>
              <JsonBlock value={openRow} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function formatDetail(v: unknown) {
  if (v == null || v === "") return <span className="text-ink-3">—</span>;
  if (typeof v === "number") return v.toLocaleString("en-US");
  return String(v);
}
