import { ReactNode } from "react";
import { RuledLoader, Phrase } from "./Loader";

export type Density = "compact" | "comfortable";

export interface Column<R> {
  name: string;
  label: string;
  numeric?: boolean;
  idColumn?: boolean;
  currency?: string | null;
  render?: (row: R) => ReactNode;
  width?: string;
  filter?: ReactNode;
  hasActiveFilter?: boolean;
  /** If set, header label is a clickable sort toggle. */
  sort?: "asc" | "desc" | null;
}

export default function DataTable<R extends Record<string, unknown>>({
  columns,
  rows,
  onRowClick,
  onSort,
  activeKey,
  rowKey,
  density = "compact",
  emptyPhrase = "empty",
  loading,
}: {
  columns: Column<R>[];
  rows: R[];
  onRowClick?: (row: R) => void;
  onSort?: (col: string) => void;
  /** Key of the currently-selected row (e.g. the one whose drawer is open). */
  activeKey?: string | number | null;
  /** Function to derive the row's key for matching activeKey. Falls back to index. */
  rowKey?: (row: R, index: number) => string | number;
  density?: Density;
  emptyPhrase?: "empty" | "filtered";
  loading?: boolean;
}) {
  const rowH = density === "compact" ? 36 : 44;
  const showChevron = !!onRowClick;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.name}
                className={[
                  "h-11 px-4 border-b border-rule sticky top-0 bg-card z-10 whitespace-nowrap",
                  "text-eyebrow font-semibold uppercase tracking-[0.16em] text-ink-3",
                  c.numeric ? "text-right" : "text-left",
                ].join(" ")}
                style={c.width ? { width: c.width, minWidth: c.width } : undefined}
              >
                <div
                  className={[
                    "inline-flex items-center gap-1.5 relative",
                    c.numeric ? "flex-row-reverse" : "",
                  ].join(" ")}
                >
                  {c.filter}
                  <button
                    type="button"
                    onClick={() => onSort?.(c.name)}
                    className={`inline-flex items-center gap-1 ${onSort ? "hover:text-ink" : "cursor-default"}`}
                    disabled={!onSort}
                  >
                    <span>{c.label}</span>
                    {c.sort && (
                      <span className="text-[9px] leading-none text-mark">
                        {c.sort === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </button>
                  {c.hasActiveFilter && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-mark"
                      aria-label="filter active"
                    />
                  )}
                </div>
              </th>
            ))}
            {showChevron && (
              <th
                className="h-11 border-b border-rule sticky top-0 bg-card z-10"
                style={{ width: 36 }}
                aria-hidden
              />
            )}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length + (showChevron ? 1 : 0)} className="p-0">
                <RuledLoader />
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (showChevron ? 1 : 0)}>
                <Phrase
                  kind={emptyPhrase === "filtered" ? "filtered" : "empty"}
                  className="py-14"
                />
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((r, i) => {
              const key = rowKey ? rowKey(r, i) : i;
              const isActive = activeKey !== undefined && activeKey !== null && key === activeKey;
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(r)}
                  className={[
                    "group transition-colors relative",
                    onRowClick ? "cursor-pointer hover:bg-paper-2" : "",
                    isActive ? "bg-paper-2" : "",
                  ].join(" ")}
                  style={{ height: rowH }}
                >
                  {columns.map((c, colIdx) => (
                    <td
                      key={c.name}
                      className={[
                        "px-4 border-b border-rule whitespace-nowrap relative",
                        c.numeric ? "text-right" : "overflow-hidden text-ellipsis",
                        c.idColumn ? "mono text-mono-sm text-ink-2" : "text-body text-ink",
                        c.numeric ? "serif nums" : "",
                      ].join(" ")}
                      style={{
                        width: c.width ?? undefined,
                        maxWidth: c.width ?? undefined,
                        height: rowH,
                      }}
                      title={c.numeric ? undefined : stringify(r[c.name])}
                    >
                      {isActive && colIdx === 0 && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-0 bottom-0 w-[2px] bg-mark"
                        />
                      )}
                      {c.render ? c.render(r) : formatCell(r[c.name], c)}
                    </td>
                  ))}
                  {showChevron && (
                    <td
                      className="px-2 border-b border-rule text-center"
                      style={{ width: 36, height: rowH }}
                    >
                      <span
                        aria-hidden
                        className="serif text-[16px] text-ink-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-mark transition-[opacity,transform] duration-150 inline-block"
                      >
                        ›
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function formatCell<R>(value: unknown, col: Column<R>): ReactNode {
  if (value == null || value === "") return <span className="text-ink-3">—</span>;
  if (col.numeric) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(n)) return String(value);
    const formatted = n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    if (col.currency) {
      return (
        <div className="flex flex-col items-end leading-tight">
          <span>{formatted}</span>
          <span className="caption text-ink-3 not-italic font-sans font-normal">
            {col.currency}
          </span>
        </div>
      );
    }
    return formatted;
  }
  if (col.idColumn) {
    return <span>│ {String(value)}</span>;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      if (value.includes("T")) {
        return (
          <span className="tabular-nums">
            {d.toLocaleString("en-GB", {
              timeZone: "Asia/Tashkent",
              year: "2-digit",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        );
      }
      return <span className="tabular-nums">{value}</span>;
    }
  }
  return String(value);
}
