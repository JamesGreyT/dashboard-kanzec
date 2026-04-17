/**
 * Excel-style per-column filter popover.
 *
 * State shape we hand back is a list of (op, value) pairs for this column.
 * Text columns get a "contains" input + optional exact-match.
 * Numeric / date / timestamp columns get from/to range inputs.
 * ID columns (mono IDs) get only exact-match since they're random-looking.
 */
import { useEffect, useRef, useState } from "react";
import Button from "./Button";

export type ColumnType = "date" | "timestamp" | "text" | "int" | "numeric";

export interface ColumnMeta {
  name: string;
  label: string;
  type: ColumnType;
  ops: string[];
  id_column: boolean;
  numeric: boolean;
}

export type ColumnFilterValue =
  | { kind: "text"; contains?: string; equals?: string }
  | { kind: "range"; from?: string; to?: string }
  | { kind: "equals"; equals?: string };

export function hasActive(v: ColumnFilterValue | undefined): boolean {
  if (!v) return false;
  if (v.kind === "text") return !!(v.contains || v.equals);
  if (v.kind === "range") return !!(v.from || v.to);
  if (v.kind === "equals") return !!v.equals;
  return false;
}

export function valueToFilterTriples(
  col: ColumnMeta,
  v: ColumnFilterValue | undefined,
): Array<[string, string, string]> {
  if (!v) return [];
  const out: Array<[string, string, string]> = [];
  if (v.kind === "text") {
    if (v.contains) out.push([col.name, "ilike", v.contains]);
    if (v.equals) out.push([col.name, "=", v.equals]);
  } else if (v.kind === "range") {
    if (v.from) out.push([col.name, ">=", v.from]);
    if (v.to) out.push([col.name, "<=", v.to]);
  } else if (v.kind === "equals") {
    if (v.equals) out.push([col.name, "=", v.equals]);
  }
  return out;
}

export function initialFilterFor(col: ColumnMeta): ColumnFilterValue {
  if (col.type === "text" && !col.id_column) return { kind: "text" };
  if (col.type === "date" || col.type === "timestamp" || col.type === "numeric" || col.type === "int") {
    // id columns (int + id_column) get equals-only, everything else range.
    if (col.id_column) return { kind: "equals" };
    return { kind: "range" };
  }
  return { kind: "equals" };
}

export default function ColumnFilter({
  col,
  value,
  onChange,
  onClose,
}: {
  col: ColumnMeta;
  value: ColumnFilterValue | undefined;
  onChange: (v: ColumnFilterValue | undefined) => void;
  onClose: () => void;
}) {
  const initial = value ?? initialFilterFor(col);
  const [draft, setDraft] = useState<ColumnFilterValue>(initial);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const apply = () => {
    if (hasActive(draft)) onChange(draft);
    else onChange(undefined);
    onClose();
  };
  const clear = () => {
    onChange(undefined);
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-40 mt-1 w-[280px] bg-card rounded-[10px] shadow-card border border-rule p-4 animate-enter-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="eyebrow mb-3">Filter · {col.label}</div>

      {draft.kind === "text" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="caption text-ink-3">Contains</span>
            <input
              autoFocus
              value={draft.contains ?? ""}
              onChange={(e) => setDraft({ ...draft, contains: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35"
              placeholder="e.g. Maqsud"
            />
          </label>
          {col.ops.includes("=") && (
            <label className="flex flex-col gap-1.5">
              <span className="caption text-ink-3">Exact match</span>
              <input
                value={draft.equals ?? ""}
                onChange={(e) => setDraft({ ...draft, equals: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && apply()}
                className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35"
              />
            </label>
          )}
        </div>
      )}

      {draft.kind === "range" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="caption text-ink-3">From</span>
            <input
              autoFocus
              type={rangeInputType(col.type)}
              value={draft.from ?? ""}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35 tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="caption text-ink-3">To</span>
            <input
              type={rangeInputType(col.type)}
              value={draft.to ?? ""}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35 tabular-nums"
            />
          </label>
        </div>
      )}

      {draft.kind === "equals" && (
        <label className="flex flex-col gap-1.5">
          <span className="caption text-ink-3">Equals</span>
          <input
            autoFocus
            value={draft.equals ?? ""}
            onChange={(e) => setDraft({ ...draft, equals: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35"
          />
        </label>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={clear}
          className="text-label text-ink-2 hover:text-mark hover:underline decoration-mark"
        >
          clear
        </button>
        <Button variant="primary" onClick={apply} className="h-8 px-3 text-caption">
          Apply
        </Button>
      </div>
    </div>
  );
}

function rangeInputType(t: ColumnType): string {
  if (t === "date") return "date";
  if (t === "timestamp") return "datetime-local";
  return "number";
}
