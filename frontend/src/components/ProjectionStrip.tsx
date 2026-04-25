import { useTranslation } from "react-i18next";
import MetricCard, { fmtNum } from "./MetricCard";

export interface Projection {
  min: number;
  mean: number;
  max: number;
}

export interface HistoryEntry {
  year: number;
  ratio: number;
}

/**
 * Three Min/Mean/Max MetricCards in a row. Used twice on the day-slice
 * page — Sotuv strip stacked above Kirim strip. The hint line under
 * each card explains the projection: "by day-N typically X% booked".
 */
export default function ProjectionStrip({
  kind,
  current_mtd,
  projection,
  history,
  dayN,
}: {
  kind: "sotuv" | "kirim";
  current_mtd: number;
  projection: Projection;
  history: HistoryEntry[];
  dayN: number;
}) {
  const { t } = useTranslation();
  const meanRatio = history.length
    ? history.reduce((a, b) => a + b.ratio, 0) / history.length
    : null;
  const hint =
    meanRatio === null
      ? (t("dayslice.proj_hint_no_history", {
          defaultValue: "no historical data",
        }) as string)
      : (t("dayslice.proj_hint", {
          defaultValue:
            "by day {{day}} typically {{pct}}% booked ({{n}}-yr history)",
          day: dayN,
          pct: (meanRatio * 100).toFixed(0),
          n: history.length,
        }) as string);
  const titleKey =
    kind === "sotuv"
      ? "dayslice.section_projection_sotuv"
      : "dayslice.section_projection_kirim";

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display text-[18px] md:text-[20px] font-medium tracking-[-0.01em] text-foreground">
          {t(titleKey)}
          <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
        </h3>
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {t("dayslice.mtd_label")}: ${fmtNum(current_mtd, true)}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        <MetricCard
          label={t("dayslice.proj_min")}
          value={"$" + fmtNum(projection.min, true)}
          hint={hint}
          title={"$" + fmtNum(projection.min)}
        />
        <MetricCard
          label={t("dayslice.proj_mean")}
          value={"$" + fmtNum(projection.mean, true)}
          hint={hint}
          title={"$" + fmtNum(projection.mean)}
        />
        <MetricCard
          label={t("dayslice.proj_max")}
          value={"$" + fmtNum(projection.max, true)}
          hint={hint}
          title={"$" + fmtNum(projection.max)}
        />
      </div>
    </section>
  );
}
