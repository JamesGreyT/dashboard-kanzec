import { ReactNode } from "react";

export interface Column<R> {
  name: string;
  label: string;
  numeric?: boolean;
  idColumn?: boolean;
  currency?: string | null;
  render?: (row: R) => ReactNode;
  width?: string;
}

export default function DataTable<R extends Record<string, unknown>>({
  columns,
  rows,
  onRowClick,
  empty,
  loading,
}: {
  columns: Column<R>[];
  rows: R[];
  onRowClick?: (row: R) => void;
  empty?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.name}
                className={[
                  "h-10 px-4 border-b border-rule sticky top-0 bg-card",
                  "text-eyebrow font-semibold uppercase tracking-[0.16em] text-ink-3",
                  c.numeric ? "text-right" : "text-left",
                ].join(" ")}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td
                colSpan={columns.length}
                className="py-10 text-center caption text-ink-3"
              >
                reading…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="py-14 text-center caption text-ink-3"
              >
                {empty ?? "no rows for the current filter."}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((r, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(r)}
                className={`transition-colors ${onRowClick ? "cursor-pointer hover:bg-paper-2" : ""}`}
              >
                {columns.map((c) => (
                  <td
                    key={c.name}
                    className={[
                      "h-[52px] px-4 border-b border-rule",
                      c.numeric ? "text-right" : "",
                      c.idColumn ? "mono text-mono-sm text-ink-2" : "text-body text-ink",
                      c.numeric ? "serif nums" : "",
                    ].join(" ")}
                  >
                    {c.render ? c.render(r) : formatCell(r[c.name], c)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
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
        <div className="flex flex-col items-end">
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
  // Dates — if it parses, render as YYYY-MM-DD / short time.
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
