/**
 * 4-to-7-segment aging bar. Used in-table on debt worklist rows and the
 * Debt dashboard's "all debtors" RankedTable. Segments show share of
 * total outstanding in each aging bucket.
 *
 * Mobile Card Stream colorway:
 *   0–30   mint #10B981   (recent — healthy)
 *   31–60  amber #F59E0B  (warning)
 *   61–90  amber-dk #B45309 (warning escalating)
 *   91+    coral #F87171  (overdue, default red signal)
 *   91–180 coral #F87171
 *   181–365 coraldk #DC2626
 *   365+   deep red #991B1B (extreme)
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
  a0_30: "#10B981",
  a31_60: "#F59E0B",
  a61_90: "#B45309",
  a91_plus: "#F87171",
  a91_180: "#F87171",
  a181_365: "#DC2626",
  a365_plus: "#991B1B",
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
        className="rounded-full bg-line"
        style={{ height, width }}
        aria-label="—"
      />
    );
  }
  return (
    <div
      className="flex rounded-full overflow-hidden bg-line"
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
