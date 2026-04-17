/**
 * Excel-style per-column filter popover.
 *
 * Rendered through a React portal into document.body with position:fixed,
 * so it escapes the table's overflow-x-auto clipping and can auto-flip
 * horizontally / vertically when near a viewport edge.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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

export interface ColumnFilterValue {
  contains?: string;
  equals?: string;
  from?: string;
  to?: string;
  values?: string[];
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
  if (v.values && v.values.length) out.push([col.name, "in", v.values.join("|")]);
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

const POP_WIDTH = 320;

export default function ColumnFilter({
  col,
  tableKey,
  value,
  anchorEl,
  onChange,
  onClose,
}: {
  col: ColumnMeta;
  tableKey: string;
  value: ColumnFilterValue | undefined;
  anchorEl: HTMLElement | null;
  onChange: (v: ColumnFilterValue | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ColumnFilterValue>(value ?? {});
  const [valSearch, setValSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measure anchor + popover on mount, pin the popover in viewport coordinates.
  useLayoutEffect(() => {
    if (!anchorEl || !ref.current) return;
    const place = () => {
      if (!anchorEl || !ref.current) return;
      const btn = anchorEl.getBoundingClientRect();
      const pop = ref.current.getBoundingClientRect();
      const margin = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = btn.left;
      if (left + pop.width > vw - margin) {
        left = btn.right - pop.width; // flip to right-aligned
      }
      if (left < margin) left = margin;

      let top = btn.bottom + 4;
      if (top + pop.height > vh - margin) {
        top = Math.max(margin, btn.top - pop.height - 4); // flip above
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
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        // Don't close if the user clicked the trigger — they'd expect a toggle.
        if (anchorEl && anchorEl.contains(e.target as Node)) return;
        onClose();
      }
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
  }, [onClose, anchorEl]);

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

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: POP_WIDTH,
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-50 bg-card rounded-[10px] shadow-card border border-rule p-4 animate-enter-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="eyebrow">{t("data.filter", { label: col.label })}</div>
      <div className="leader" />

      {showRange && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="caption text-ink-3">{t("data.filter_range_from")}</span>
            <input
              type={rangeInputType(col.type)}
              value={draft.from ?? ""}
              onChange={(e) => setDraft({ ...draft, from: e.target.value || undefined })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35 tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="caption text-ink-3">{t("data.filter_range_to")}</span>
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

      {showRange && (showContains || showValues || showEquals) && <div className="leader" />}

      {showContains && (
        <label className="flex flex-col gap-1.5">
          <span className="caption text-ink-3">{t("data.filter_contains")}</span>
          <input
            value={draft.contains ?? ""}
            onChange={(e) => setDraft({ ...draft, contains: e.target.value || undefined })}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35"
          />
        </label>
      )}

      {showContains && showValues && <div className="leader" />}

      {showValues && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="caption text-ink-3">{t("data.filter_values")}</span>
            <div className="flex items-center gap-3 text-caption">
              <button
                type="button"
                className="text-ink-2 hover:text-mark hover:underline decoration-mark underline-offset-[3px]"
                onClick={selectAllVisible}
              >
                {t("data.filter_select_shown")}
              </button>
              {draft.values && draft.values.length > 0 && (
                <button
                  type="button"
                  className="text-ink-2 hover:text-mark hover:underline decoration-mark underline-offset-[3px]"
                  onClick={() => setDraft({ ...draft, values: undefined })}
                >
                  {t("data.filter_clear_picks")}
                </button>
              )}
            </div>
          </div>
          <input
            value={valSearch}
            onChange={(e) => setValSearch(e.target.value)}
            className="w-full h-8 bg-paper-2 px-2.5 rounded-[6px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35 mb-2"
            placeholder={t("data.filter_search_values_placeholder")}
          />
          <div className="max-h-[220px] overflow-auto border border-rule rounded-[8px]">
            {distinctQ.isLoading && (
              <div className="px-3 py-3 caption text-ink-3">{t("data.reading")}</div>
            )}
            {distinctQ.isError && (
              <div className="px-3 py-3 caption text-risk">
                {t("data.filter_cant_read")}
              </div>
            )}
            {distinctQ.data?.values.map(({ value: v, count }) => (
              <label
                key={v || "<null>"}
                className="flex items-baseline gap-2 px-3 py-1.5 hover:bg-paper-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={pickedSet.has(v)}
                  onChange={() => togglePick(v)}
                  className="accent-[var(--mark)] self-center"
                />
                <span className="text-body text-ink truncate max-w-[170px]">
                  {v === "" || v == null ? (
                    <span className="italic text-ink-3">{t("data.filter_empty")}</span>
                  ) : (
                    v
                  )}
                </span>
                <span className="dotted-leader" />
                <span className="mono text-mono-xs text-ink-3 tabular-nums shrink-0">
                  {count.toLocaleString()}
                </span>
              </label>
            ))}
            {distinctQ.data && distinctQ.data.values.length === 0 && (
              <div className="px-3 py-3 caption text-ink-3">{t("data.filter_no_matches")}</div>
            )}
          </div>
          {distinctQ.data?.limited && (
            <div className="mt-1 caption text-ink-3">
              {t("data.filter_limited_hint")}
            </div>
          )}
        </div>
      )}

      {(showRange || showContains || showValues) && showEquals && <div className="leader" />}

      {showEquals && (
        <label className="flex flex-col gap-1.5">
          <span className="caption text-ink-3">{t("data.filter_equals")}</span>
          <input
            value={draft.equals ?? ""}
            onChange={(e) => setDraft({ ...draft, equals: e.target.value || undefined })}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            className="h-9 bg-paper-2 px-3 rounded-[8px] text-body text-ink border-0 focus:outline-none focus:ring-2 focus:ring-mark/35"
          />
        </label>
      )}

      <div className="leader" />
      <div className="flex items-center justify-between">
        <button
          onClick={clear}
          type="button"
          className="text-label text-ink-2 hover:text-mark hover:underline decoration-mark underline-offset-[3px]"
        >
          {t("common.clear")}
        </button>
        <Button variant="primary" onClick={apply} className="h-8 px-3 text-caption">
          {t("common.apply")}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

function rangeInputType(t: ColumnType): string {
  if (t === "date") return "date";
  if (t === "timestamp") return "datetime-local";
  return "number";
}
