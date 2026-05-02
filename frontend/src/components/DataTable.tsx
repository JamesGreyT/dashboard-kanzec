import { ReactNode } from "react";
import { ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RuledLoader, Phrase } from "./Loader";
import { useIsMobile } from "../lib/media";
import { cn } from "@/lib/utils";

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
  sort?: "asc" | "desc" | null;
  mobilePrimary?: boolean;
  mobileHidden?: boolean;
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
  activeKey?: string | number | null;
  rowKey?: (row: R, index: number) => string | number;
  density?: Density;
  emptyPhrase?: "empty" | "filtered";
  loading?: boolean;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <CardList
        columns={columns}
        rows={rows}
        onRowClick={onRowClick}
        activeKey={activeKey}
        rowKey={rowKey}
        emptyPhrase={emptyPhrase}
        loading={loading}
      />
    );
  }

  const rowH = density === "compact" ? 40 : 52;
  const showChevron = !!onRowClick;

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.name}
                className={cn(
                  "whitespace-nowrap sticky top-0 bg-secondary/60 backdrop-blur z-10",
                  c.numeric && "text-right",
                )}
                style={c.width ? { width: c.width, minWidth: c.width } : undefined}
              >
                <div
                  className={cn(
                    "inline-flex items-center gap-1.5",
                    c.numeric && "flex-row-reverse",
                  )}
                >
                  {c.filter}
                  <button
                    type="button"
                    onClick={() => onSort?.(c.name)}
                    className={cn(
                      "inline-flex items-center gap-1",
                      onSort ? "hover:text-foreground cursor-pointer" : "cursor-default",
                    )}
                    disabled={!onSort}
                  >
                    <span>{c.label}</span>
                    {c.sort === "asc" && <ArrowUp className="h-3 w-3 text-primary" />}
                    {c.sort === "desc" && <ArrowDown className="h-3 w-3 text-primary" />}
                  </button>
                  {c.hasActiveFilter && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-primary"
                      aria-label="filter active"
                    />
                  )}
                </div>
              </TableHead>
            ))}
            {showChevron && <TableHead style={{ width: 36 }} aria-hidden />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={columns.length + (showChevron ? 1 : 0)} className="p-0">
                <RuledLoader />
              </TableCell>
            </TableRow>
          )}
          {!loading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length + (showChevron ? 1 : 0)}>
                <Phrase
                  kind={emptyPhrase === "filtered" ? "filtered" : "empty"}
                  className="py-14"
                />
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            rows.map((r, i) => {
              const key = rowKey ? rowKey(r, i) : i;
              const isActive =
                activeKey !== undefined && activeKey !== null && key === activeKey;
              return (
                <TableRow
                  key={key}
                  onClick={() => onRowClick?.(r)}
                  data-state={isActive ? "selected" : undefined}
                  className={cn(
                    "group",
                    onRowClick && "cursor-pointer",
                  )}
                  style={{ height: rowH }}
                >
                  {columns.map((c) => (
                    <TableCell
                      key={c.name}
                      className={cn(
                        "whitespace-nowrap",
                        c.numeric && "text-right tabular-nums",
                        c.idColumn && "font-mono text-xs text-muted-foreground",
                      )}
                      style={{
                        width: c.width ?? undefined,
                        maxWidth: c.width ?? undefined,
                      }}
                      title={c.numeric ? undefined : stringify(r[c.name])}
                    >
                      {c.render ? c.render(r) : formatCell(r[c.name], c)}
                    </TableCell>
                  ))}
                  {showChevron && (
                    <TableCell className="w-9 text-center">
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
    </div>
  );
}

function CardList<R extends Record<string, unknown>>({
  columns,
  rows,
  onRowClick,
  activeKey,
  rowKey,
  emptyPhrase,
  loading,
}: {
  columns: Column<R>[];
  rows: R[];
  onRowClick?: (row: R) => void;
  activeKey?: string | number | null;
  rowKey?: (row: R, index: number) => string | number;
  emptyPhrase?: "empty" | "filtered";
  loading?: boolean;
}) {
  const visible = columns.filter((c) => !c.mobileHidden);
  const headlineCol = visible.find((c) => c.mobilePrimary) ?? visible[0] ?? null;
  const restCols = visible.filter((c) => c.name !== headlineCol?.name);

  if (loading) return <RuledLoader />;
  if (rows.length === 0) {
    return (
      <Phrase
        kind={emptyPhrase === "filtered" ? "filtered" : "empty"}
        className="py-14"
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {rows.map((r, i) => {
        const key = rowKey ? rowKey(r, i) : i;
        const isActive =
          activeKey !== undefined && activeKey !== null && key === activeKey;
        const Element = onRowClick ? "button" : "div";
        return (
          <li key={key} className="border-b last:border-b-0">
            <Element
              {...(onRowClick
                ? { type: "button" as const, onClick: () => onRowClick(r) }
                : {})}
              className={cn(
                "w-full text-left py-3 px-1 relative transition-colors",
                onRowClick && "cursor-pointer active:bg-muted",
                isActive && "bg-muted",
              )}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 top-2 bottom-2 w-[2px] bg-primary"
                />
              )}
              {headlineCol && (
                <div
                  className={cn(
                    "text-sm text-foreground pl-3 pr-2",
                    headlineCol.idColumn && "font-mono text-xs text-muted-foreground",
                  )}
                >
                  {headlineCol.render
                    ? headlineCol.render(r)
                    : formatCell(r[headlineCol.name], headlineCol)}
                </div>
              )}
              {restCols.length > 0 && (
                <dl className="mt-2 pl-3 pr-2 flex flex-col gap-1">
                  {restCols.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-baseline gap-2 justify-between"
                    >
                      <dt className="text-xs text-muted-foreground uppercase tracking-wider shrink-0">
                        {c.label}
                      </dt>
                      <dd
                        className={cn(
                          "shrink-0 text-right",
                          c.idColumn && "font-mono text-xs text-muted-foreground",
                          c.numeric ? "tabular-nums" : "text-sm text-foreground",
                        )}
                        style={{ maxWidth: "60%" }}
                      >
                        {c.render ? c.render(r) : formatCell(r[c.name], c)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </Element>
          </li>
        );
      })}
    </ul>
  );
}

function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function formatCell<R>(value: unknown, col: Column<R>): ReactNode {
  if (value == null || value === "")
    return <span className="text-muted-foreground">—</span>;
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
          <span className="text-xs text-muted-foreground">{col.currency}</span>
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
