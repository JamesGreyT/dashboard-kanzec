import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { ReactNode, useMemo } from "react";

export interface SeriesPoint {
  /** ISO date for the bucket start */
  date: string;
  /** Primary value (e.g. revenue) */
  value: number;
  /** Optional: value for the same bucket last year */
  yoy?: number;
  /** Optional: 7-day or 30-day moving average */
  ma?: number;
}

/** Format axis tick — compact for large numbers. */
function fmtTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1000) return Math.round(v / 1000) + "k";
  return String(Math.round(v));
}

/** Short date label: "22 Mar". */
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const mon = ["Yan","Fev","Mar","Apr","May","Iyun","Iyul","Avg","Sen","Okt","Noy","Dek"][d.getUTCMonth()];
  return `${d.getUTCDate()} ${mon}`;
}

/** Quarto-style tooltip (paper card, vermilion rail).
 * When `annotations` is passed, any notes whose x_date matches the
 * hovered label are rendered below the value lines. */
function ChartTooltip({ active, payload, label, annotations }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
  annotations?: Array<{ id: number; x_date: string; note: string; created_by_name?: string }>;
}) {
  if (!active || !payload?.length) return null;
  // Match annotations for this bucket's x-value. The X axis in our charts
  // uses ISO date strings directly (e.g. "2026-04-10"), so a straight
  // string compare works.
  const notes = (annotations ?? []).filter((a) => a.x_date === label);
  return (
    <div className="bg-card border border-line rounded-2xl p-3 shadow-cardlg text-[12px] relative overflow-hidden max-w-[320px]">
      <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-mint" />
      <div className="font-mono text-ink3 mb-1.5 pl-2">{label ? fmtDate(label) : ""}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 pl-2 tabular-nums">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-ink capitalize">{p.name}</span>
          <span className="ml-auto font-mono">{(p.value ?? 0).toLocaleString("en-US")}</span>
        </div>
      ))}
      {notes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-line pl-2">
          {notes.map((n) => (
            <div key={n.id} className="leading-snug mb-1 last:mb-0">
              <div className="eyebrow text-mintdk">
                Note{n.created_by_name ? ` · ${n.created_by_name}` : ""}
              </div>
              <div className="text-[12px] text-ink">{n.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Editorial time-series chart.
 * - Default: single line of `value`.
 * - Optional: overlay YoY (dashed) + moving average (dotted) via props.
 * - Optional: render anomaly dots where `|value - ma| > 2σ`.
 */
export default function TimeSeriesChart({
  data,
  height = 260,
  showArea = true,
  showYoY = false,
  showMA = false,
  highlightAnomalies = false,
  primaryLabel = "value",
  yoyLabel = "yoy",
  maLabel = "7d MA",
  primaryColor = "hsl(var(--primary))",
  yoyColor = "hsl(var(--muted-foreground))",
  maColor = "hsl(var(--foreground))",
  overlays,
  annotations,
}: {
  data: SeriesPoint[];
  height?: number;
  showArea?: boolean;
  showYoY?: boolean;
  showMA?: boolean;
  highlightAnomalies?: boolean;
  primaryLabel?: string;
  yoyLabel?: string;
  maLabel?: string;
  primaryColor?: string;
  yoyColor?: string;
  maColor?: string;
  /** Additional recharts children (e.g. AnnotationMarkers). */
  overlays?: ReactNode;
  /** Annotations matched to x-axis buckets and shown in the hover tooltip. */
  annotations?: Array<{ id: number; x_date: string; note: string; created_by_name?: string }>;
}) {
  const { anomalies } = useMemo(() => {
    if (!highlightAnomalies) return { anomalies: [] as SeriesPoint[] };
    const vals = data.map((d) => d.value);
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
    const sd = Math.sqrt(
      vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / Math.max(vals.length - 1, 1),
    );
    return {
      anomalies: data.filter((d) => Math.abs(d.value - mean) > 2 * sd),
    };
  }, [data, highlightAnomalies]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-muted-foreground italic text-sm" style={{ height }}>
        —
      </div>
    );
  }
  const Component = showArea ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Component data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={{ stroke: "hsl(var(--border))" }}
          tickFormatter={fmtDate}
          minTickGap={32}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtTick}
          width={48}
        />
        <Tooltip content={<ChartTooltip annotations={annotations} />} />
        {showYoY && (
          <Line
            type="monotone"
            dataKey="yoy"
            name={yoyLabel}
            stroke={yoyColor}
            strokeWidth={1.25}
            strokeDasharray="4 3"
            dot={false}
          />
        )}
        {showArea ? (
          <Area
            type="monotone"
            dataKey="value"
            name={primaryLabel}
            stroke={primaryColor}
            fill={primaryColor}
            fillOpacity={0.16}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
          />
        ) : (
          <Line
            type="monotone"
            dataKey="value"
            name={primaryLabel}
            stroke={primaryColor}
            strokeWidth={1.75}
            dot={false}
          />
        )}
        {showMA && (
          <Line
            type="monotone"
            dataKey="ma"
            name={maLabel}
            stroke={maColor}
            strokeWidth={1.25}
            strokeDasharray="6 3"
            dot={false}
          />
        )}
        {highlightAnomalies &&
          anomalies.map((a) => (
            <ReferenceLine
              key={a.date}
              x={a.date}
              stroke="hsl(var(--destructive))"
              strokeDasharray="2 2"
              strokeOpacity={0.5}
            />
          ))}
        {overlays}
      </Component>
    </ResponsiveContainer>
  );
}
