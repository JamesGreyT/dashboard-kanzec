/**
 * Excel-style per-column filter popover.
 *
 * Text / id-text columns that support `in` get a "Values" section: fetch
 * distinct values from the API, show them with counts in a scrollable
 * checkbox list (searchable, capped at 500 server-side). Picking ≥1
 * value produces an `in` filter on the wire.
 *
 * Numeric / date / timestamp columns get From / To range inputs
 * (`>=` + `<=`). Text columns also keep a "Contains" input for partial match.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
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

/**
 * Filter value for one column. We store a superset of possible inputs —
 * whichever fields the column's mode uses become live.
 */
export interface ColumnFilterValue {
  contains?: string; // text
  equals?: string;   // text / id / states
  from?: string;     // range (numeric / date / timestamp)
  to?: string;       // range
  values?: string[]; // in  (checkbox-selected values)
}

export function hasActive(v: ColumnFilterValue | undefined): boolean {
  if (!v) return false;
  return !!(v.contains || v.equals || v.from || v.to || (v.values && v.values.length));
}

export function valueToFilterTriples(
  col: ColumnMeta,
  v: ColumnFilterValue | undefined,
): Array<[string, string, string]> {
  if (!v) return [];
  const out: Array<[string, string, string]> = [];
  if (v.values && v.values.length) {
    out.push([col.name, "in", v.values.join("|")]);
    // When values are picked, treat other fields as complementary AND filters.
  }
  if (v.contains) out.push([col.name, "ilike", v.contains]);
  if (v.equals) out.push([col.name, "=", v.equals]);
  if (v.from) out.push([col.name, ">=", v.from]);
  if (v.to) out.push([col.name, "<=", v.to]);
  return out;
}

export function initialFilterFor(_col: ColumnMeta): ColumnFilterValue {
  return {};
}

interface DistinctResp {
  values: { value: string; count: number }[];
  limited: boolean;
}

export default function ColumnFilter({
  col,
  tableKey,
  value,
  onChange,
  onClose,
}: {
  col: ColumnMeta;
  tableKey: string;
  value: ColumnFilterValue | undefined;
  onChange: (v: ColumnFilterValue | undefined) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ColumnFilterValue>(value ?? {});
  const [valSearch, setValSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);

  // Flip the popover to right-aligned if it would overflow the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth - 12) setAlignRight(true);
  }, []);

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

  const showValues = col.ops.includes("in");
  const showRange =
    col.type === "numeric" ||
    col.type === "date" ||
    col.type === "timestamp" ||
    (col.type === "int" && !col.id_column);
  const showContains = col.type === "text" && !col.id_column && col.ops.includes("ilike");
  const showEquals = col.ops.includes("=") && !showValues && !showContains && !showRange;

  const distinctQ = useQuery({
    queryKey: ["data.distinct", tableKey, col.name, valSearch],
    queryFn: () =>
      api<DistinctResp>(
        `/api/data/${tableKey}/distinct/${col.name}?limit=300` +
          (valSearch ? `&q=${encodeURIComponent(valSearch)}` : ""),
      ),
    enabled: showValues,
    staleTime: 60_000,
  });

  const pickedSet = new Set(draft.values ?? []);
  const togglePick = (v: string) => {
    const next = new Set(pickedSet);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    const arr = Array.from(next);
    setDraft({ ...draft, values: arr.length ? arr : undefined });
  };
  const selectAllVisible = () => {
    const visible = (distinctQ.data?.values ?? []).map((v) => v.value);
    setDraft({ ...draft, values: Array.from(new Set([...(draft.values ?? []), ...visible])) });
  };

  const apply = () => {
    onChange(hasActive(draft) ? draft : undefined);
    onClose();
  };
  const clear = () => {
    onChange(undefined);
    onClose();
  };

  return (
    <div
      ref={ref}
      className={[
        "absolute top-full z-40 mt-1 w-[320px] bg-card rounded-[10px] shadow-card border border-rule p-4 animate-enter-up",
        alignRight ? "right-0" : "left-0",
      ].join(" ")}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="eyebrow mb-3">Filter · {col.label}</div>

      {/* Range inputs (numeric / date / timestamp) */}
      {showRange && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="flex flex-col gap-1.5">
            <span className="caption text-ink-3">From</span>
            <input
              type={rangeInputType(col.type)}
              value={draft.from ?? ""}
              onChange={(e) => setDraft({ ...draft, from: e.target.value || undefined })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35 tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="caption text-ink-3">To</span>
            <input
              type={rangeInputType(col.type)}
              value={draft.to ?? ""}
              onChange={(e) => setDraft({ ...draft, to: e.target.value || undefined })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35 tabular-nums"
            />
          </label>
        </div>
      )}

      {/* Contains (partial text match) */}
      {showContains && (
        <label className="flex flex-col gap-1.5 mb-4">
          <span className="caption text-ink-3">Contains</span>
          <input
            value={draft.contains ?? ""}
            onChange={(e) => setDraft({ ...draft, contains: e.target.value || undefined })}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35"
            placeholder="e.g. Maqsud"
          />
        </label>
      )}

      {/* Values (checkbox list) */}
      {showValues && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="caption text-ink-3">Values</span>
            <div className="flex items-center gap-3 text-caption">
              <button
                type="button"
                className="text-ink-2 hover:text-mark hover:underline decoration-mark"
                onClick={selectAllVisible}
              >
                select shown
              </button>
              {draft.values && draft.values.length > 0 && (
                <button
                  type="button"
                  className="text-ink-2 hover:text-mark hover:underline decoration-mark"
                  onClick={() => setDraft({ ...draft, values: undefined })}
                >
                  clear picks
                </button>
              )}
            </div>
          </div>
          <input
            value={valSearch}
            onChange={(e) => setValSearch(e.target.value)}
            className="w-full h-8 bg-paper-2 px-2.5 rounded-[6px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35 mb-2"
            placeholder="search values…"
          />
          <div className="max-h-[220px] overflow-auto border border-rule rounded-[8px]">
            {distinctQ.isLoading && (
              <div className="px-3 py-3 caption text-ink-3">reading…</div>
            )}
            {distinctQ.isError && (
              <div className="px-3 py-3 caption text-risk">couldn't read values.</div>
            )}
            {distinctQ.data?.values.map(({ value: v, count }) => (
              <label
                key={v || "<null>"}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-paper-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={pickedSet.has(v)}
                  onChange={() => togglePick(v)}
                  className="accent-[var(--mark)]"
                />
                <span className="flex-1 text-body text-ink truncate">
                  {v === "" || v == null ? (
                    <span className="italic text-ink-3">(empty)</span>
                  ) : (
                    v
                  )}
                </span>
                <span className="mono text-mono-xs text-ink-3 tabular-nums">
                  {count.toLocaleString()}
                </span>
              </label>
            ))}
            {distinctQ.data && distinctQ.data.values.length === 0 && (
              <div className="px-3 py-3 caption text-ink-3">no matches.</div>
            )}
          </div>
          {distinctQ.data?.limited && (
            <div className="mt-1 caption text-ink-3">
              showing first 300 — refine with search above.
            </div>
          )}
        </div>
      )}

      {/* Equals-only fallback */}
      {showEquals && (
        <label className="flex flex-col gap-1.5 mb-4">
          <span className="caption text-ink-3">Equals</span>
          <input
            value={draft.equals ?? ""}
            onChange={(e) => setDraft({ ...draft, equals: e.target.value || undefined })}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35"
          />
        </label>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={clear}
          type="button"
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
