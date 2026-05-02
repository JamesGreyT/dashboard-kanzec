import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import AsOfPicker, { type AsOfPickerValue } from "../components/AsOfPicker";
import YearMatrix, { type YearMatrixRow } from "../components/YearMatrix";
import DrillPanel from "../components/DrillPanel";
import ProjectionStrip from "../components/ProjectionStrip";
import PlanGridEditable from "../components/PlanGridEditable";
import Heatmap from "../components/Heatmap";
import DirectionMultiSelect from "../components/DirectionMultiSelect";
import ScopeChip from "../components/ScopeChip";
import { fmtNum } from "../components/MetricCard";

interface ScoreboardResp {
  slice: { month_start: string; as_of: string; day_n: number; month_days: number };
  year_columns: number[];
  sotuv: { rows: YearMatrixRow[]; totals: { by_year: number[]; yoy_pct: number | null } };
  kirim: { rows: YearMatrixRow[]; totals: { by_year: number[]; yoy_pct: number | null } };
}

interface ProjectionResp {
  slice: { day_n: number; month_days: number };
  history: Array<{ year: number; ratio: number }>;
  current_mtd: { sotuv: number; kirim: number };
  projection: {
    sotuv: { min: number; mean: number; max: number };
    kirim: { min: number; mean: number; max: number };
  };
}

interface RegionPivotResp {
  row_labels: string[];
  col_labels: string[];
  values: number[][];
  manager_totals: number[];
  manager_share: number[];
  grand_total: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function DaySlice() {
  const { t } = useTranslation();
  const [picker, setPicker] = useState<AsOfPickerValue>({
    mode: "anchor",
    asOf: todayIso(),
    sliceStart: monthStartIso(),
    sliceEnd: todayIso(),
    years: 4,
  });
  const [directions, setDirections] = useState<string[]>([]);

  const baseQs = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("as_of", picker.asOf);
    qs.set("years", String(picker.years));
    if (picker.mode === "custom") {
      qs.set("slice_start", picker.sliceStart);
      qs.set("slice_end", picker.sliceEnd);
    }
    if (directions.length) qs.set("direction", directions.join(","));
    return qs;
  }, [picker, directions]);

  const dirsOptionsQ = useQuery({
    queryKey: ["snapshots.directions"],
    queryFn: () => api<{ directions: string[] }>("/api/snapshots/directions"),
    staleTime: 5 * 60_000,
  });

  const sbQ = useQuery({
    queryKey: ["dayslice.scoreboard", baseQs.toString()],
    queryFn: () => api<ScoreboardResp>(`/api/dayslice/scoreboard?${baseQs.toString()}`),
    staleTime: 30_000,
  });
  const projQ = useQuery({
    queryKey: ["dayslice.projection", baseQs.toString()],
    queryFn: () => api<ProjectionResp>(`/api/dayslice/projection?${baseQs.toString()}`),
    staleTime: 30_000,
    enabled: picker.mode === "anchor",
  });
  const pivotQ = useQuery({
    queryKey: ["dayslice.pivot", baseQs.toString()],
    queryFn: () => api<RegionPivotResp>(`/api/dayslice/region-pivot?${baseQs.toString()}`),
    staleTime: 30_000,
  });

  useEffect(() => {
    document.title = t("dayslice.title") + " · Kanzec";
  }, [t]);

  // Defensive: an empty/cleared date input would make `new Date("T00:00:00")`
  // = Invalid Date and downstream getFullYear() returns NaN. Fall back to
  // today so the page never crashes mid-edit.
  const asOfDate = (() => {
    const d = new Date(picker.asOf + "T00:00:00");
    return Number.isNaN(d.getTime()) ? new Date() : d;
  })();
  const planYear = asOfDate.getFullYear();
  const planMonth = asOfDate.getMonth() + 1;

  const factSotuv = useMemo(() => {
    const out: Record<string, number> = {};
    if (sbQ.data) {
      for (const r of sbQ.data.sotuv.rows) {
        out[r.manager] = r.by_year[r.by_year.length - 1] ?? 0;
      }
    }
    return out;
  }, [sbQ.data]);
  const factKirim = useMemo(() => {
    const out: Record<string, number> = {};
    if (sbQ.data) {
      for (const r of sbQ.data.kirim.rows) {
        out[r.manager] = r.by_year[r.by_year.length - 1] ?? 0;
      }
    }
    return out;
  }, [sbQ.data]);
  const managers = useMemo(() => {
    if (!sbQ.data) return [];
    const all = new Set<string>();
    for (const r of sbQ.data.sotuv.rows) all.add(r.manager);
    for (const r of sbQ.data.kirim.rows) all.add(r.manager);
    return Array.from(all).filter((m) => m !== "(—)");
  }, [sbQ.data]);

  return (
    <div>
      <PageHeading
        crumb={[t("dayslice.crumb"), t("dayslice.title")]}
        title={t("dayslice.title")}
        subtitle={t("dayslice.subtitle")}
      />

      <div className="stagger-1 flex flex-wrap items-center gap-4 mb-8">
        <AsOfPicker value={picker} onChange={setPicker} />
        <DirectionMultiSelect
          options={dirsOptionsQ.data?.directions ?? []}
          value={directions}
          onChange={setDirections}
        />
        <ScopeChip />
      </div>

      <div className="stagger-2">
        {sbQ.data && (
          <YearMatrix
            title={t("dayslice.section_sotuv")}
            yearColumns={sbQ.data.year_columns}
            rows={sbQ.data.sotuv.rows}
            totals={sbQ.data.sotuv.totals}
            currentYear={asOfDate.getFullYear()}
            renderDrill={(manager, year) => (
              <DrillPanel measure="sotuv" manager={manager} year={year} baseQs={baseQs} />
            )}
          />
        )}
      </div>

      <div className="stagger-3">
        {sbQ.data && (
          <YearMatrix
            title={t("dayslice.section_kirim")}
            yearColumns={sbQ.data.year_columns}
            rows={sbQ.data.kirim.rows}
            totals={sbQ.data.kirim.totals}
            currentYear={asOfDate.getFullYear()}
            renderDrill={(manager, year) => (
              <DrillPanel measure="kirim" manager={manager} year={year} baseQs={baseQs} />
            )}
          />
        )}
      </div>

      {picker.mode === "anchor" && projQ.data && projQ.data.slice.day_n < projQ.data.slice.month_days && (
        <>
          <hr className="mark-rule mb-8" aria-hidden />
          <div className="stagger-4">
            <ProjectionStrip
              kind="sotuv"
              current_mtd={projQ.data.current_mtd.sotuv}
              projection={projQ.data.projection.sotuv}
              history={projQ.data.history}
              dayN={projQ.data.slice.day_n}
            />
            <ProjectionStrip
              kind="kirim"
              current_mtd={projQ.data.current_mtd.kirim}
              projection={projQ.data.projection.kirim}
              history={projQ.data.history}
              dayN={projQ.data.slice.day_n}
            />
          </div>
        </>
      )}

      <hr className="mark-rule mb-8" aria-hidden />

      <div className="stagger-5">
        {sbQ.data && (
          <PlanGridEditable
            year={planYear}
            month={planMonth}
            managers={managers}
            factSotuv={factSotuv}
            factKirim={factKirim}
          />
        )}

        {pivotQ.data && pivotQ.data.row_labels.length > 0 && (
          <section className="mb-12">
            <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-ink mb-3">
              {t("dayslice.section_region")}
              <span aria-hidden className="font-display text-mintdk ml-[2px]">.</span>
            </h2>
            <Heatmap
              rowLabels={pivotQ.data.row_labels}
              colLabels={pivotQ.data.col_labels}
              values={pivotQ.data.values}
              formatValue={(v) => (v === 0 ? "—" : fmtNum(v, true))}
              rowHeader={t("dayslice.region_label", { defaultValue: "Region" }) as string}
            />
            <div className="mt-3 text-[11px] text-ink3 italic font-mono">
              {t("dayslice.grand_total", { defaultValue: "Grand total" })}: ${fmtNum(pivotQ.data.grand_total)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
