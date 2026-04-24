/** Tiny inline area sparkline for RankedTable rows.
 *  Pure SVG — no recharts overhead, safe to render 50+ per page. */
export default function Sparkline({
  values,
  width = 56,
  height = 18,
  positiveColor = "hsl(var(--primary))",
  negativeColor = "hsl(var(--destructive))",
}: {
  values: number[];
  width?: number;
  height?: number;
  positiveColor?: string;
  negativeColor?: string;
}) {
  if (!values.length) {
    return (
      <span className="inline-block text-muted-foreground/60 font-mono text-[10px]">—</span>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  const up = values[values.length - 1] >= values[0];
  const color = up ? positiveColor : negativeColor;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="inline-block align-middle"
    >
      <path d={area} fill={color} opacity={0.14} />
      <path d={path} stroke={color} strokeWidth={1.2} fill="none" />
    </svg>
  );
}
