/**
 * 4-to-5-segment aging bar. Used in-table on debt worklist rows and the
 * Debt dashboard's "all debtors" RankedTable. Segments show share of
 * total outstanding in each aging bucket.
 */
export interface AgingSegments {
  a0_30?: number;
  a31_60?: number;
  a61_90?: number;
  a91_plus?: number;
  a91_180?: number;
  a181_365?: number;
  a365_plus?: number;
}

const COLORS = {
  a0_30: "#10b981",       // emerald
  a31_60: "#f59e0b",      // amber
  a61_90: "#c2410c",      // umber
  a91_plus: "#b91c1c",    // red
  a91_180: "#b91c1c",
  a181_365: "#7f1d1d",
  a365_plus: "#450a0a",
};

export default function AgingBar({
  segments,
  height = 10,
  width = 140,
}: {
  segments: AgingSegments;
  height?: number;
  width?: number;
}) {
  const order = Object.keys(COLORS) as Array<keyof typeof COLORS>;
  const vals = order.map((k) => Math.max(0, segments[k] ?? 0));
  const total = vals.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div
        className="rounded-[3px] bg-muted"
        style={{ height, width }}
        aria-label="—"
      />
    );
  }
  return (
    <div
      className="flex rounded-[3px] overflow-hidden bg-muted"
      style={{ height, width }}
      role="img"
      aria-label={`aging: ${order.map((k, i) => `${k}=${vals[i]}`).join(", ")}`}
    >
      {order.map((k, i) => {
        const v = vals[i];
        if (v === 0) return null;
        const pct = (v / total) * 100;
        return (
          <div
            key={k}
            className="transition-[width] duration-300"
            style={{
              width: `${pct}%`,
              backgroundColor: COLORS[k],
              marginRight: i < order.length - 1 && v > 0 ? 1 : 0,
            }}
            title={`${k}: ${v.toLocaleString("en-US")}`}
          />
        );
      })}
    </div>
  );
}
