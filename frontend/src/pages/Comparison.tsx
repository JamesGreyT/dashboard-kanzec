import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import DirectionMultiSelect from "../components/DirectionMultiSelect";
import ScopeChip from "../components/ScopeChip";
import MatrixGrid, { type MatrixRow } from "../components/MatrixGrid";
import DrillPanel from "../components/DrillPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Measure = "sotuv" | "kirim";
type Mode = "yearly" | "monthly" | "daily";
type Dimension = "manager" | "direction" | "brand" | "model" | "region";
type View = "amount" | "share";

interface MatrixResp {
  measure: Measure;
  mode: Mode;
  dimension: Dimension;
  columns: string[];
  rows: MatrixRow[];
  totals: MatrixRow;
}

const SOTUV_DIMS: Dimension[] = ["manager", "direction", "brand", "model", "region"];
const KIRIM_DIMS: Dimension[] = ["manager", "direction", "region"];
const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function Comparison() {
  const { t } = useTranslation();

  const today = new Date();
  const [tab, setTab] = useState<Measure>("sotuv");
  const [mode, setMode] = useState<Mode>("yearly");
  const [dimension, setDimension] = useState<Dimension>("manager");
  const [view, setView] = useState<View>("amount");
  const [showPlan, setShowPlan] = useState(false);

  const [yearEnd, setYearEnd] = useState<number>(today.getFullYear());
  const [years, setYears] = useState<number>(4);
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);

  const [directions, setDirections] = useState<string[]>([]);

  // Drill-cell state — null = closed.
  const [drill, setDrill] = useState<{ label: string; bucket: string } | null>(null);

  // Reset dimension when switching tabs (Kirim doesn't allow brand/model).
  useEffect(() => {
    if (tab === "kirim" && (dimension === "brand" || dimension === "model")) {
      setDimension("manager");
    }
  }, [tab, dimension]);

  // Reset drill on any axis change so a stale cell click doesn't open the
  // wrong panel.
  useEffect(() => {
    setDrill(null);
  }, [tab, mode, dimension, view, yearEnd, years, year, month, directions]);

  const dims = tab === "sotuv" ? SOTUV_DIMS : KIRIM_DIMS;

  const baseQs = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("dimension", dimension);
    qs.set("mode", mode);
    if (mode === "yearly") {
      qs.set("year_end", String(yearEnd));
      qs.set("years", String(years));
    } else if (mode === "monthly") {
      qs.set("year", String(year));
    } else {
      qs.set("year", String(year));
      qs.set("month", String(month));
    }
    if (directions.length) qs.set("direction", directions.join(","));
    if (showPlan && dimension === "manager") qs.set("with_plan", "true");
    return qs;
  }, [dimension, mode, yearEnd, years, year, month, directions, showPlan]);

  const dirsOptionsQ = useQuery({
    queryKey: ["snapshots.directions"],
    queryFn: () => api<{ directions: string[] }>("/api/snapshots/directions"),
    staleTime: 5 * 60_000,
  });

  const matrixQ = useQuery({
    queryKey: ["comparison.matrix", tab, baseQs.toString()],
    queryFn: () => api<MatrixResp>(`/api/comparison/${tab}?${baseQs.toString()}`),
    staleTime: 30_000,
  });

  useEffect(() => {
    document.title = t("comparison.title") + " · Kanzec";
  }, [t]);

  const trendLabel =
    mode === "yearly"
      ? t("comparison.col_yoy", { defaultValue: "YoY" })
      : mode === "monthly"
      ? t("comparison.col_mom", { defaultValue: "MoM" })
      : t("comparison.col_dod", { defaultValue: "DoD" });

  // Translate machine column labels to human ones for monthly mode.
  // Years and days are already human-readable.
  const humanColumns = useMemo(() => {
    if (!matrixQ.data) return [];
    if (mode === "monthly") {
      return matrixQ.data.columns.map(
        (c) => MONTH_NAMES_EN[Math.max(0, parseInt(c, 10) - 1)] ?? c,
      );
    }
    return matrixQ.data.columns;
  }, [matrixQ.data, mode]);

  // Build a drill QS that mirrors the matrix QS but adds the cell coords.
  const drillQs = useMemo(() => {
    if (!drill) return null;
    const qs = new URLSearchParams(baseQs);
    qs.delete("with_plan");                       // not relevant to drill
    qs.set("dimension_value", drill.label);
    qs.set("bucket", drill.bucket);
    return qs;
  }, [drill, baseQs]);

  return (
    <div>
      <PageHeading
        crumb={[
          t("nav.analytics", { defaultValue: "Analytics" }),
          t("comparison.title", { defaultValue: "Comparison" }),
        ]}
        title={t("comparison.title", { defaultValue: "Comparison" })}
        subtitle={t("comparison.subtitle", {
          defaultValue:
            "Pivot Sotuv and Kirim by manager, direction, brand, model or region across years, months or days. Sotuv is net of returns.",
        })}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Measure)}>
        <TabsList className="mb-6">
          <TabsTrigger value="sotuv">{t("comparison.tab_sotuv", { defaultValue: "Sotuv" })}</TabsTrigger>
          <TabsTrigger value="kirim">{t("comparison.tab_kirim", { defaultValue: "Kirim" })}</TabsTrigger>
        </TabsList>

        {/* Control row — same shape for both tabs. */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Mode toggle */}
          <div className="inline-flex rounded-md border border-line/60 overflow-hidden">
            {(["yearly", "monthly", "daily"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  "px-3 h-9 text-[12px] uppercase tracking-[0.14em] font-medium transition-colors " +
                  (mode === m
                    ? "bg-mint text-white"
                    : "bg-background hover:bg-muted")
                }
              >
                {t(`comparison.mode_${m}`, {
                  defaultValue: m.charAt(0).toUpperCase() + m.slice(1),
                })}
              </button>
            ))}
          </div>

          {/* Dimension picker */}
          <Select value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dims.map((d) => (
                <SelectItem key={d} value={d}>
                  {t(`comparison.dim_${d}`, { defaultValue: d })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Mode-dependent pickers */}
          {mode === "yearly" && (
            <>
              <NumberStepper
                label={t("comparison.year_end", { defaultValue: "Year end" })}
                value={yearEnd}
                onChange={setYearEnd}
                min={2020}
                max={today.getFullYear() + 1}
              />
              <NumberStepper
                label={t("comparison.years", { defaultValue: "Years" })}
                value={years}
                onChange={setYears}
                min={2}
                max={6}
              />
            </>
          )}
          {mode === "monthly" && (
            <NumberStepper
              label={t("comparison.year", { defaultValue: "Year" })}
              value={year}
              onChange={setYear}
              min={2020}
              max={today.getFullYear() + 1}
            />
          )}
          {mode === "daily" && (
            <>
              <NumberStepper
                label={t("comparison.year", { defaultValue: "Year" })}
                value={year}
                onChange={setYear}
                min={2020}
                max={today.getFullYear() + 1}
              />
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
                <SelectTrigger className="h-9 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES_EN.map((n, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {/* Mix-share toggle */}
          <Button
            type="button"
            variant={view === "share" ? "default" : "outline"}
            size="sm"
            className="h-9"
            onClick={() => setView((v) => (v === "amount" ? "share" : "amount"))}
            title={
              view === "share"
                ? t("comparison.view_amount_hint", { defaultValue: "Show amounts" })
                : t("comparison.view_share_hint", { defaultValue: "Show column shares" })
            }
          >
            {view === "share" ? "%" : "$"}
          </Button>

          {/* Plan overlay (manager only) */}
          <Button
            type="button"
            variant={showPlan ? "default" : "outline"}
            size="sm"
            className="h-9"
            disabled={dimension !== "manager"}
            onClick={() => setShowPlan((v) => !v)}
            title={
              dimension === "manager"
                ? t("comparison.plan_hint", {
                    defaultValue: "Overlay app.dayslice_plan numbers under each cell",
                  })
                : t("comparison.plan_disabled", {
                    defaultValue: "Plan overlay is only available for the Manager dimension",
                  })
            }
          >
            {t("comparison.plan_overlay", { defaultValue: "Plan" })}
          </Button>

          <DirectionMultiSelect
            options={dirsOptionsQ.data?.directions ?? []}
            value={directions}
            onChange={setDirections}
          />
          <ScopeChip />
        </div>

        <TabsContent value="sotuv" className="mt-0">
          {matrixQ.isLoading && <LoadingHint />}
          {matrixQ.error && <ErrorHint />}
          {matrixQ.data && (
            <MatrixGrid
              columns={humanColumns}
              rows={matrixQ.data.rows}
              totals={matrixQ.data.totals}
              view={view}
              showPlan={showPlan && dimension === "manager"}
              trendLabel={trendLabel}
              onCellClick={(label, _human) =>
                setDrill({
                  label,
                  // Use the raw machine bucket label (the API works with
                  // it directly) — humanColumns is only for display.
                  bucket: matrixQ.data.columns[humanColumns.indexOf(_human)] ?? _human,
                })
              }
            />
          )}
        </TabsContent>
        <TabsContent value="kirim" className="mt-0">
          {matrixQ.isLoading && <LoadingHint />}
          {matrixQ.error && <ErrorHint />}
          {matrixQ.data && (
            <MatrixGrid
              columns={humanColumns}
              rows={matrixQ.data.rows}
              totals={matrixQ.data.totals}
              view={view}
              showPlan={showPlan && dimension === "manager"}
              trendLabel={trendLabel}
              onCellClick={(label, _human) =>
                setDrill({
                  label,
                  bucket: matrixQ.data.columns[humanColumns.indexOf(_human)] ?? _human,
                })
              }
            />
          )}
        </TabsContent>
      </Tabs>

      {drill && drillQs && (
        <section className="mt-8">
          <DrillPanel
            source="comparison"
            measure={tab}
            drillQs={drillQs}
            label={drill.label}
            bucket={
              mode === "monthly"
                ? MONTH_NAMES_EN[parseInt(drill.bucket, 10) - 1] ?? drill.bucket
                : drill.bucket
            }
          />
        </section>
      )}
    </div>
  );
}

function NumberStepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 h-9 px-2 rounded-md border border-line/60 bg-background">
      <span className="text-[10px] uppercase tracking-[0.14em] text-ink3">
        {label}
      </span>
      <button
        type="button"
        className="px-1.5 text-ink3 hover:text-ink disabled:opacity-30"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Decrement ${label}`}
      >
        −
      </button>
      <span className="font-mono tabular-nums text-[13px] text-ink min-w-[3ch] text-center">
        {value}
      </span>
      <button
        type="button"
        className="px-1.5 text-ink3 hover:text-ink disabled:opacity-30"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Increment ${label}`}
      >
        +
      </button>
    </div>
  );
}

function LoadingHint() {
  const { t } = useTranslation();
  return (
    <div className="text-[12px] italic text-ink3 py-6">
      {t("comparison.loading", { defaultValue: "Loading matrix…" })}
    </div>
  );
}

function ErrorHint() {
  const { t } = useTranslation();
  return (
    <div className="text-[12px] text-coraldk py-6">
      {t("comparison.error", { defaultValue: "Failed to load matrix." })}
    </div>
  );
}
