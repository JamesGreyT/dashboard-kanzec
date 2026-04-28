/**
 * Cell-tint helper extracted from `Heatmap.tsx` so other tables (e.g.
 * `MatrixGrid`) can stay visually consistent. Background opacity scales
 * with `|value| / max`, capped at 42% so text remains readable on top.
 *
 * Pass the column max for per-column shading (recommended for matrix
 * pivots — each column's distribution is what the eye scans), or the
 * global max for cross-column shading.
 */
export function tintBackground(value: number, max: number): string | undefined {
  if (!value || max <= 0) return undefined;
  const intensity = Math.abs(value) / max;
  const alphaPct = Math.min(0.42, intensity * 0.42) * 100;
  const accent = value < 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))";
  return `color-mix(in oklab, ${accent} ${alphaPct.toFixed(1)}%, transparent)`;
}

export function columnMax(values: number[][]): number[] {
  if (!values.length) return [];
  const cols = values[0].length;
  const out = new Array<number>(cols).fill(0);
  for (const row of values) {
    for (let c = 0; c < cols; c++) {
      const v = Math.abs(row[c] ?? 0);
      if (v > out[c]) out[c] = v;
    }
  }
  return out;
}
