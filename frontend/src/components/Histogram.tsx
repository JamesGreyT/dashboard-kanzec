import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

/** Simple bar histogram. Buckets are passed in; this component just renders. */
export default function Histogram({
  data,
  xKey = "bucket",
  yKey = "count",
  height = 220,
  barColor = "hsl(var(--primary))",
  label,
}: {
  data: Array<Record<string, string | number>>;
  xKey?: string;
  yKey?: string;
  height?: number;
  barColor?: string;
  label?: string;
}) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground italic text-sm"
        style={{ height }}
      >
        —
      </div>
    );
  }
  return (
    <div className="min-w-0">
      {label && (
        <div className="eyebrow !tracking-[0.18em] mb-2 text-primary/70">
          {label}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <XAxis
            dataKey={xKey}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          />
          <Bar dataKey={yKey} radius={[2, 2, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={barColor} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
