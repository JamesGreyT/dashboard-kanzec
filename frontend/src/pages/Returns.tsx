import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import WindowPicker, { defaultWindow, type WindowState } from "../components/WindowPicker";
import MetricCard, { fmtNum, fmtCount, fmtPct } from "../components/MetricCard";
import TimeSeriesChart, { type SeriesPoint } from "../components/TimeSeriesChart";
import Heatmap from "../components/Heatmap";
import RankedTable, { type ColumnDef, type Page } from "../components/RankedTable";
import DirectionMultiSelect from "../components/DirectionMultiSelect";
import ScopeChip from "../components/ScopeChip";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

interface OverviewResp {
  returns:      { current: number; prior: number; yoy: number; mom_pct: number | null; yoy_pct: number | null };
  rate:         { current: number };
  return_lines: { current: number; prior: number; mom_pct: number | null };
  avg_ticket:   { current: number };
}

interface TimelineResp {
  series: Array<{ date: string; forward: number; returns: number; rate: number }>;
}

interface BrandHeatmap {
  row_labels: string[];
  col_labels: string[];          // ISO yyyy-mm-01
  values_rate: number[][];
  values_amount: number[][];
  totals: Array<{ brand: string; forward: number; returns: number; rate: number }>;
}

export default function Returns() {
  const { t } = useTranslation();

  const [window, setWindow] = useState<WindowState>(defaultWindow());
  const [directions, setDirections] = useState<string[]>([]);
  const [tab, setTab] = useState<"brand" | "clients" | "regions">("brand");
  const [heatMode, setHeatMode] = useState<"rate" | "amount">("rate");

  const baseQs = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("from", window.from);
    qs.set("to", window.to);
    if (directions.length) qs.set("direction", directions.join(","));
    return qs;
  }, [window, directions]);

  const dirsOptionsQ = useQuery({
    queryKey: ["snapshots.directions"],
    queryFn: () => api<{ directions: string[] }>("/api/snapshots/directions"),
    staleTime: 5 * 60_000,
  });

  const overviewQ = useQuery({
    queryKey: ["returns.overview", baseQs.toString()],
    queryFn: () => api<OverviewResp>(`/api/returns/overview?${baseQs.toString()}`),
    staleTime: 30_000,
  });

  const tlQ = useQuery({
    queryKey: ["returns.timeline", baseQs.toString()],
    queryFn: () => api<TimelineResp>(`/api/returns/timeline?${baseQs.toString()}`),
    staleTime: 30_000,
  });

  const heatQ = useQuery({
    queryKey: ["returns.heatmap", directions.join(",")],
    queryFn: () => {
      const q = new URLSearchParams();
      if (directions.length) q.set("direction", directions.join(","));
      q.set("months", "12");
      return api<BrandHeatmap>(`/api/returns/brand-heatmap?${q.toString()}`);
    },
    staleTime: 60_000,
  });

  // Ranked tables state
  type PagerState = { page: number; size: number; sort: string; search: string };
  const [pager, setPager] = useState<Record<string, PagerState>>({
    clients: { page: 0, size: 50, sort: "returns:desc", search: "" },
    regions: { page: 0, size: 50, sort: "returns:desc", search: "" },
  });
  const setPagerFor = (k: keyof typeof pager, n: PagerState) =>
    setPager((p) => ({ ...p, [k]: n }));

  const mkRankedQs = (k: keyof typeof pager) => {
    const q = new URLSearchParams(baseQs.toString());
    const p = pager[k];
    q.set("page", String(p.page));
    q.set("size", String(p.size));
    q.set("sort", p.sort);
    if (p.search) q.set("search", p.search);
    return q;
  };

  const clientsQ = useQuery({
    queryKey: ["returns.clients", mkRankedQs("clients").toString()],
    queryFn: () => api<Page<any>>(`/api/returns/clients?${mkRankedQs("clients").toString()}`),
    staleTime: 30_000,
    enabled: tab === "clients",
  });
  const regionsQ = useQuery({
    queryKey: ["returns.regions", mkRankedQs("regions").toString()],
    queryFn: () => api<Page<any>>(`/api/returns/regions?${mkRankedQs("regions").toString()}`),
    staleTime: 30_000,
    enabled: tab === "regions",
  });

  useEffect(() => {
    document.title = t("returns.title") + " · Kanzec";
  }, [t]);

  const series: SeriesPoint[] = (tlQ.data?.series ?? []).map((p) => ({
    date: p.date,
    value: p.returns,
    ma: 0,
    yoy: p.forward,        // overlay forward sales as the comparison line
  }));

  return (
    <div>
      <PageHeading
        crumb={[t("nav.analytics"), t("returns.title")]}
        title={t("returns.title")}
        subtitle={t("returns.subtitle")}
      />

      <div className="stagger-1 flex flex-wrap items-center gap-4 mb-6">
        <WindowPicker value={window} onChange={setWindow} />
        <DirectionMultiSelect
          options={dirsOptionsQ.data?.directions ?? []}
          value={directions}
          onChange={setDirections}
        />
        <ScopeChip />
      </div>

      <p className="text-[12px] italic text-ink3 mb-8 max-w-3xl leading-relaxed">
        {t("returns.disclosure")}
      </p>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 mb-12 stagger-2">
        <MetricCard
          label={t("returns.kpi_returns")}
          value={"$" + fmtNum(overviewQ.data?.returns.current ?? 0)}
          delta={overviewQ.data?.returns.mom_pct ?? null}
          deltaLabel={t("returns.vs_prior") as string}
          hint={overviewQ.data
            ? `YoY ${fmtPct(overviewQ.data.returns.yoy_pct)}`
            : undefined}
        />
        <MetricCard
          label={t("returns.kpi_rate")}
          value={fmtPct(overviewQ.data?.rate.current ?? 0)}
          hint={t("returns.rate_hint") as string}
        />
        <MetricCard
          label={t("returns.kpi_lines")}
          value={fmtCount(overviewQ.data?.return_lines.current ?? 0)}
          delta={overviewQ.data?.return_lines.mom_pct ?? null}
          deltaLabel={t("returns.vs_prior") as string}
        />
        <MetricCard
          label={t("returns.kpi_avg_ticket")}
          value={"$" + fmtNum(overviewQ.data?.avg_ticket.current ?? 0)}
          hint={t("returns.avg_ticket_hint") as string}
        />
      </div>

      {/* Timeline */}
      <section className="mb-12 stagger-3">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-ink">
            {t("returns.section_timeline")}
            <span aria-hidden className="font-display text-mintdk ml-[2px]">.</span>
          </h2>
          <div className="text-[10px] uppercase tracking-[0.16em] text-ink3">
            {t("returns.timeline_legend")}
          </div>
        </div>
        <TimeSeriesChart
          data={series}
          showYoY
          showArea
          primaryLabel={t("returns.legend_returns") as string}
          yoyLabel={t("returns.legend_forward") as string}
          primaryColor="hsl(var(--destructive))"
          yoyColor="hsl(var(--primary))"
        />
      </section>

      <hr className="mark-rule mb-12" aria-hidden />

      {/* Tabs */}
      <section className="stagger-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="mb-6">
            <TabsTrigger value="brand">{t("returns.tab_brand")}</TabsTrigger>
            <TabsTrigger value="clients">{t("returns.tab_clients")}</TabsTrigger>
            <TabsTrigger value="regions">{t("returns.tab_regions")}</TabsTrigger>
          </TabsList>

          <TabsContent value="brand">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <p className="text-[12px] italic text-ink3 max-w-3xl">
                {t("returns.heatmap_hint")}
              </p>
              <div className="flex gap-1" role="group" aria-label={t("returns.heatmap_mode") as string}>
                <button
                  type="button"
                  aria-pressed={heatMode === "rate"}
                  onClick={() => setHeatMode("rate")}
                  className={
                    "px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (heatMode === "rate"
                      ? "border-foreground/70 bg-background ring-2 ring-foreground/30 text-ink font-medium"
                      : "border-line/60 bg-muted/40 hover:bg-muted/60 text-ink3")
                  }
                >
                  {t("returns.mode_rate")}
                </button>
                <button
                  type="button"
                  aria-pressed={heatMode === "amount"}
                  onClick={() => setHeatMode("amount")}
                  className={
                    "px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (heatMode === "amount"
                      ? "border-foreground/70 bg-background ring-2 ring-foreground/30 text-ink font-medium"
                      : "border-line/60 bg-muted/40 hover:bg-muted/60 text-ink3")
                  }
                >
                  {t("returns.mode_amount")}
                </button>
              </div>
            </div>
            {heatQ.data && heatQ.data.row_labels.length > 0 ? (
              <Heatmap
                rowLabels={heatQ.data.row_labels}
                colLabels={heatQ.data.col_labels.map(formatMonthLabel)}
                values={heatMode === "rate" ? heatQ.data.values_rate : heatQ.data.values_amount}
                formatValue={(v) =>
                  v === 0
                    ? "—"
                    : heatMode === "rate"
                    ? (v * 100).toFixed(1) + "%"
                    : fmtNum(v, true)
                }
                rowHeader={t("returns.col_brand")}
              />
            ) : (
              <div className="text-ink3 italic text-sm py-10 text-center">—</div>
            )}
          </TabsContent>

          <TabsContent value="clients">
            <RankedTable
              columns={CLIENT_COLUMNS(t)}
              data={clientsQ.data}
              loading={clientsQ.isLoading}
              onChange={(n) => setPagerFor("clients", n)}
              getRowKey={(r) => r.person_id}
              exportHref={`/api/returns/export/clients.xlsx?${mkRankedQs("clients").toString()}`}
            />
          </TabsContent>

          <TabsContent value="regions">
            <RankedTable
              columns={REGION_COLUMNS(t)}
              data={regionsQ.data}
              loading={regionsQ.isLoading}
              onChange={(n) => setPagerFor("regions", n)}
              getRowKey={(r) => r.label}
              exportHref={`/api/returns/export/regions.xlsx?${mkRankedQs("regions").toString()}`}
            />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function formatMonthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${y.slice(2)}`;
}

function CLIENT_COLUMNS(t: any): ColumnDef<any>[] {
  return [
    { key: "name", label: t("returns.col_client"), sortable: true,
      render: (r) => <span className="text-ink">{r.name}</span> },
    { key: "manager", label: t("returns.col_manager"), sortable: false,
      render: (r) => <span className="text-ink3">{r.manager ?? "—"}</span> },
    { key: "direction", label: t("returns.col_direction"), sortable: false,
      render: (r) => <span className="text-ink3">{r.direction ?? "—"}</span> },
    { key: "region", label: t("returns.col_region"), sortable: false,
      render: (r) => <span className="text-ink3">{r.region ?? "—"}</span> },
    { key: "returns", label: t("returns.col_returns"), sortable: true, numeric: true,
      render: (r) => "$" + fmtNum(r.returns),
      footer: (totals) => "$" + fmtNum(totals.returns) },
    { key: "rate", label: t("returns.col_rate"), sortable: true, numeric: true,
      render: (r) => fmtPct(r.rate),
      footer: (totals) => fmtPct(totals.rate) },
    { key: "lines", label: t("returns.col_lines"), sortable: true, numeric: true,
      render: (r) => fmtCount(r.lines),
      footer: (totals) => fmtCount(totals.lines) },
    { key: "last_return", label: t("returns.col_last_return"), sortable: true, numeric: true,
      render: (r) => <span className="text-ink3">{r.last_return ?? "—"}</span> },
  ];
}

function REGION_COLUMNS(t: any): ColumnDef<any>[] {
  return [
    { key: "label", label: t("returns.col_region"), sortable: true,
      render: (r) => <span className="text-ink">{r.label}</span> },
    { key: "returns", label: t("returns.col_returns"), sortable: true, numeric: true,
      render: (r) => "$" + fmtNum(r.returns) },
    { key: "rate", label: t("returns.col_rate"), sortable: true, numeric: true,
      render: (r) => fmtPct(r.rate) },
    { key: "lines", label: t("returns.col_lines"), sortable: true, numeric: true,
      render: (r) => fmtCount(r.lines) },
    { key: "yoy_pct", label: t("returns.col_yoy"), sortable: false, numeric: true,
      render: (r) => yoyChip(r.yoy_pct) },
  ];
}

function yoyChip(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="text-ink3/60">—</span>;
  // For returns, *increasing* YoY is bad — invert tone.
  const sign = v > 0 ? "+" : "";
  const cls = v > 0.005 ? "text-coraldk"
            : v < -0.005 ? "text-mintdk"
            : "text-ink3";
  return <span className={`${cls} font-mono tabular-nums`}>{sign}{(v * 100).toFixed(1)}%</span>;
}
