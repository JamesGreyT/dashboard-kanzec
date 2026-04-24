import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export interface ParetoRow {
  label: string;
  value: number;
}

/**
 * Combined bar + cumulative-% line chart — classic 80/20 visualization.
 * Used in the Sales dashboard "client concentration" section and
 * anywhere we want to illustrate distribution steepness.
 */
export default function Pareto({
  data,
  height = 280,
  barColor = "hsl(var(--primary))",
  lineColor = "hsl(var(--destructive))",
  topN = 30,
}: {
  data: ParetoRow[];
  height?: number;
  barColor?: string;
  lineColor?: string;
  /** Render only the top-N rows so the bar width stays readable. The cumulative-% is computed on the FULL dataset, which is what matters for concentration. */
  topN?: number;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-muted-foreground italic text-sm" style={{ height }}>
        —
      </div>
    );
  }
  const total = data.reduce((s, r) => s + (r.value || 0), 0);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  let running = 0;
  const withCum = sorted.map((r) => {
    running += r.value;
    return {
      label: r.label,
      value: r.value,
      cum_pct: total > 0 ? (running / total) * 100 : 0,
    };
  });
  const clipped = withCum.slice(0, topN);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={clipped} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={{ stroke: "hsl(var(--border))" }}
          interval={0}
          angle={-45}
          height={80}
          textAnchor="end"
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          unit="%"
          width={36}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
        />
        <Bar yAxisId="left" dataKey="value" fill={barColor} opacity={0.85} radius={[2, 2, 0, 0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cum_pct"
          stroke={lineColor}
          strokeWidth={1.75}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
