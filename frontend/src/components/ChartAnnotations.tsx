import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ReferenceLine } from "recharts";

import { api } from "../lib/api";

export interface Annotation {
  id: number;
  chart_key: string;
  x_date: string;
  note: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
}

/** Hook that exposes an annotations list + CRUD mutators for a chart. */
export function useChartAnnotations(chartKey: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["annotations", chartKey],
    queryFn: () => api<{ rows: Annotation[] }>(`/api/annotations?chart_key=${encodeURIComponent(chartKey)}`),
    staleTime: 60_000,
  });
  const add = useMutation({
    mutationFn: ({ x_date, note }: { x_date: string; note: string }) =>
      api("/api/annotations", {
        method: "POST",
        body: JSON.stringify({ chart_key: chartKey, x_date, note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations", chartKey] }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api(`/api/annotations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations", chartKey] }),
  });
  return { rows: q.data?.rows ?? [], add, del, loading: q.isLoading };
}

/** Render recharts ReferenceLine markers for every annotation. The
 * `xMatcher` function receives the annotation's ISO date and should
 * return the value that matches the chart's X-axis dataKey (e.g. a
 * slice like "05-15" when the chart's X-axis truncates to month-day). */
export function AnnotationMarkers({
  rows,
  xMatcher,
}: {
  rows: Annotation[];
  xMatcher: (isoDate: string) => string;
}) {
  return (
    <>
      {rows.map((a) => (
        <ReferenceLine
          key={a.id}
          x={xMatcher(a.x_date)}
          stroke="hsl(var(--primary))"
          strokeDasharray="3 3"
          strokeWidth={1}
          label={{
            value: "•",
            position: "top",
            fill: "hsl(var(--primary))",
            fontSize: 16,
          }}
        />
      ))}
    </>
  );
}

/** List of annotations below the chart with author + delete affordance.
 * `xLabel(iso)` formats the x_date for display. */
export function AnnotationList({
  rows,
  onDelete,
  xLabel,
}: {
  rows: Annotation[];
  onDelete: (id: number) => void;
  xLabel?: (iso: string) => string;
}) {
  const { t } = useTranslation();
  if (!rows.length) return null;
  const fmt = xLabel ?? ((iso: string) => iso);
  return (
    <div className="mt-3 space-y-1 max-h-[120px] overflow-y-auto">
      {rows.map((a) => (
        <div
          key={a.id}
          className="group flex items-start gap-2 text-[11.5px] leading-snug text-foreground/80"
        >
          <span className="font-mono tabular-nums text-primary shrink-0 w-[72px]">
            {fmt(a.x_date)}
          </span>
          <span className="flex-1">{a.note}</span>
          <span className="text-[10px] text-muted-foreground italic shrink-0">
            {a.created_by_name}
          </span>
          <button
            type="button"
            onClick={() => onDelete(a.id)}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label={t("chart_ann.delete", { defaultValue: "Delete" }) as string}
          >
            <Trash2 className="h-3 w-3" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

/** "Add note to latest bucket" button. Prompts for text. */
export function AddAnnotationButton({
  latestDate,
  onAdd,
}: {
  latestDate: string | undefined;
  onAdd: (x_date: string, note: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => {
        if (!latestDate) return;
        const note = window.prompt(
          t("chart_ann.prompt", { defaultValue: "Note for this bucket?" }) as string,
        );
        if (note) onAdd(latestDate, note);
      }}
      className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-primary hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
      aria-label={t("chart_ann.add", { defaultValue: "Add note" }) as string}
    >
      <Plus className="h-3 w-3" aria-hidden />
      {t("chart_ann.add", { defaultValue: "Add note" })}
    </button>
  );
}
