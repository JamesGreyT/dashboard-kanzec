import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import WindowPicker, { defaultWindow, type WindowState } from "../components/WindowPicker";
import MetricCard, { fmtNum, fmtCount } from "../components/MetricCard";
import TimeSeriesChart, { type SeriesPoint } from "../components/TimeSeriesChart";
import Heatmap from "../components/Heatmap";
import RankedTable, { type ColumnDef, type Page } from "../components/RankedTable";
import DirectionMultiSelect from "../components/DirectionMultiSelect";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

interface OverviewResp {
  revenue: { current: number; prior: number; yoy: number; mom_pct: number | null; yoy_pct: number | null };
  deals:   { current: number; prior: number; yoy: number; mom_pct: number | null; yoy_pct: number | null };
  unique_clients: { current: number; prior: number; mom_pct: number | null; yoy_pct: number | null };
  avg_deal: { current: number; prior: number; mom_pct: number | null };
  returns_pct: number;
}

interface TimeseriesResp { series: SeriesPoint[] }

function usePaginatedQuery<T>(
  key: string,
  path: string,
  qs: URLSearchParams,
  enabled = true,
) {
  return useQuery({
    queryKey: [key, qs.toString()],
    queryFn: () => api<T>(`${path}?${qs.toString()}`),
    staleTime: 30_000,
    enabled,
  });
}

export default function Sales() {
  const { t } = useTranslation();

  const [window, setWindow] = useState<WindowState>(defaultWindow());
  const [directions, setDirections] = useState<string[]>([]);
  const [tab, setTab] = useState<"clients" | "managers" | "brands" | "regions">("clients");

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
    queryKey: ["sales.overview", baseQs.toString()],
    queryFn: () => api<OverviewResp>(`/api/sales/overview?${baseQs.toString()}`),
    staleTime: 30_000,
  });

  const tsQ = useQuery({
    queryKey: ["sales.timeseries", baseQs.toString()],
    queryFn: () => api<TimeseriesResp>(`/api/sales/timeseries?${baseQs.toString()}&granularity=day`),
    staleTime: 30_000,
  });

  const heatQ = useQuery({
    queryKey: ["sales.seasonality", directions.join(",")],
    queryFn: () => {
      const q = new URLSearchParams();
      q.set("years", "4");
      if (directions.length) q.set("direction", directions.join(","));
      return api<{ row_labels: string[]; col_labels: string[]; values: number[][] }>(
        `/api/sales/seasonality?${q.toString()}`,
      );
    },
    staleTime: 5 * 60_000,
  });

  // Ranked tables state (one shared control per tab, reset on tab switch)
  const [pager, setPager] = useState<Record<string, { page: number; size: number; sort: string; search: string }>>({
    clients:  { page: 0, size: 50, sort: "revenue:desc", search: "" },
    managers: { page: 0, size: 50, sort: "revenue:desc", search: "" },
    brands:   { page: 0, size: 50, sort: "revenue:desc", search: "" },
    regions:  { page: 0, size: 50, sort: "revenue:desc", search: "" },
  });
  const setPagerFor = (k: keyof typeof pager, next: typeof pager["clients"]) =>
    setPager((p) => ({ ...p, [k]: next }));

  const mkRankedQs = (k: keyof typeof pager) => {
    const q = new URLSearchParams(baseQs.toString());
    const p = pager[k];
    q.set("page", String(p.page));
    q.set("size", String(p.size));
    q.set("sort", p.sort);
    if (p.search) q.set("search", p.search);
    return q;
  };

  const clientsQ  = usePaginatedQuery<Page<any>>("sales.clients",  "/api/sales/clients",  mkRankedQs("clients"),  tab === "clients");
  const managersQ = usePaginatedQuery<Page<any>>("sales.managers", "/api/sales/managers", mkRankedQs("managers"), tab === "managers");
  const brandsQ   = usePaginatedQuery<Page<any>>("sales.brands",   "/api/sales/brands",   mkRankedQs("brands"),   tab === "brands");
  const regionsQ  = usePaginatedQuery<Page<any>>("sales.regions",  "/api/sales/regions",  mkRankedQs("regions"),  tab === "regions");

  useEffect(() => {
    document.title = t("sales.title") + " · Kanzec";
  }, [t]);

  const series: SeriesPoint[] = tsQ.data?.series ?? [];

  // Inline sparkline series per client (built on-the-fly from the last
  // 30 days of the main timeseries, not per-client). Kept simple; can
  // be upgraded to per-row sparklines in a later phase.

  return (
    <div>
      <PageHeading
        crumb={[t("nav.analytics"), t("sales.title")]}
        title={t("sales.title")}
        subtitle={t("sales.subtitle")}
      />

      <div className="stagger-1 flex flex-wrap items-center gap-4 mb-8">
        <WindowPicker value={window} onChange={setWindow} />
        <DirectionMultiSelect
          options={dirsOptionsQ.data?.directions ?? []}
          value={directions}
          onChange={setDirections}
        />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 mb-12 stagger-2">
        <MetricCard
          label={t("sales.kpi_revenue")}
          value={"$" + fmtNum(overviewQ.data?.revenue.current ?? 0)}
          delta={overviewQ.data?.revenue.mom_pct ?? null}
          deltaLabel={t("sales.vs_prior") as string}
          hint={overviewQ.data ? `YoY ${overviewQ.data.revenue.yoy_pct != null ? ((overviewQ.data.revenue.yoy_pct * 100).toFixed(1) + "%") : "—"}` : undefined}
        />
        <MetricCard
          label={t("sales.kpi_deals")}
          value={fmtCount(overviewQ.data?.deals.current ?? 0)}
          delta={overviewQ.data?.deals.mom_pct ?? null}
          deltaLabel={t("sales.vs_prior") as string}
          href="/data/orders"
          title={t("sales.drill_deals", { defaultValue: "Open deal lines" }) as string}
        />
        <MetricCard
          label={t("sales.kpi_clients")}
          value={fmtCount(overviewQ.data?.unique_clients.current ?? 0)}
          delta={overviewQ.data?.unique_clients.mom_pct ?? null}
          deltaLabel={t("sales.vs_prior") as string}
          href="/data/legal-persons"
          title={t("sales.drill_clients", { defaultValue: "Open client list" }) as string}
        />
        <MetricCard
          label={t("sales.kpi_avg_deal")}
          value={"$" + fmtNum(overviewQ.data?.avg_deal.current ?? 0)}
          delta={overviewQ.data?.avg_deal.mom_pct ?? null}
          deltaLabel={t("sales.vs_prior") as string}
          hint={overviewQ.data ? `${t("sales.returns")}: ${(overviewQ.data.returns_pct * 100).toFixed(2)}%` : undefined}
        />
      </div>

      {/* Primary time series */}
      <section className="mb-12 stagger-3">
        <div className="eyebrow !tracking-[0.18em] mb-2 text-primary">
          {t("sales.chart_timeseries")}
        </div>
        <TimeSeriesChart
          data={series}
          showArea
          showMA
          showYoY
          highlightAnomalies
          primaryLabel={t("sales.sotuv") as string}
          yoyLabel={t("sales.yoy") as string}
          maLabel="7d MA"
          height={280}
        />
      </section>

      <hr className="mark-rule mb-12" aria-hidden />

      {/* Seasonality heatmap */}
      <section className="mb-12 stagger-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
            {t("sales.section_seasonality")}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
        </div>
        {heatQ.data && (
          <Heatmap
            rowLabels={heatQ.data.row_labels}
            colLabels={heatQ.data.col_labels}
            values={heatQ.data.values}
            formatValue={(v) => (v === 0 ? "—" : fmtNum(v, true))}
          />
        )}
      </section>

      <hr className="mark-rule mb-12" aria-hidden />

      {/* Ranked tables in tabs */}
      <section className="mb-12 stagger-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
            {t("sales.section_ranked")}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="mb-4">
            <TabsTrigger value="clients">{t("sales.tab_clients")}</TabsTrigger>
            <TabsTrigger value="managers">{t("sales.tab_managers")}</TabsTrigger>
            <TabsTrigger value="brands">{t("sales.tab_brands")}</TabsTrigger>
            <TabsTrigger value="regions">{t("sales.tab_regions")}</TabsTrigger>
          </TabsList>

          <TabsContent value="clients">
            <RankedTable
              columns={CLIENT_COLUMNS(t)}
              data={clientsQ.data}
              loading={clientsQ.isLoading}
              onChange={(n) => setPagerFor("clients", n)}
              getRowKey={(r) => r.person_id}
              exportHref={`/api/sales/export/clients.xlsx?${mkRankedQs("clients").toString()}`}
            />
          </TabsContent>
          <TabsContent value="managers">
            <RankedTable
              columns={MANAGER_COLUMNS(t)}
              data={managersQ.data}
              loading={managersQ.isLoading}
              onChange={(n) => setPagerFor("managers", n)}
              getRowKey={(r) => r.label}
              exportHref={`/api/sales/export/managers.xlsx?${mkRankedQs("managers").toString()}`}
            />
          </TabsContent>
          <TabsContent value="brands">
            <RankedTable
              columns={BRAND_COLUMNS(t)}
              data={brandsQ.data}
              loading={brandsQ.isLoading}
              onChange={(n) => setPagerFor("brands", n)}
              getRowKey={(r) => r.label}
              exportHref={`/api/sales/export/brands.xlsx?${mkRankedQs("brands").toString()}`}
            />
          </TabsContent>
          <TabsContent value="regions">
            <RankedTable
              columns={REGION_COLUMNS(t)}
              data={regionsQ.data}
              loading={regionsQ.isLoading}
              onChange={(n) => setPagerFor("regions", n)}
              getRowKey={(r) => r.label}
              exportHref={`/api/sales/export/regions.xlsx?${mkRankedQs("regions").toString()}`}
            />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function yoyChip(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="text-muted-foreground/60">—</span>;
  const sign = v > 0 ? "+" : "";
  const cls = v > 0.005 ? "text-emerald-700 dark:text-emerald-400"
            : v < -0.005 ? "text-red-700 dark:text-red-400"
            : "text-muted-foreground";
  return <span className={cls}>{sign}{(v * 100).toFixed(1)}%</span>;
}

function CLIENT_COLUMNS(t: any): ColumnDef<any>[] {
  return [
    { key: "name",       label: t("sales.col_name"),      width: "24%" },
    { key: "direction",  label: t("sales.col_direction"), width: "10%" },
    { key: "region",     label: t("sales.col_region"),    width: "12%" },
    { key: "revenue",    label: t("sales.col_revenue"),   numeric: true,
      render: (r) => "$" + fmtNum(r.revenue),
      footer: (t2) => "$" + fmtNum(t2.revenue) },
    { key: "deals",      label: t("sales.col_deals"),     numeric: true,
      render: (r) => fmtNum(r.deals),
      footer: (t2) => fmtNum(t2.deals) },
    { key: "avg_deal",   label: t("sales.col_avg_deal"),  numeric: true,
      render: (r) => "$" + fmtNum(r.avg_deal) },
    { key: "yoy_pct",    label: t("sales.col_yoy"),       numeric: true,
      render: (r) => yoyChip(r.yoy_pct) },
    { key: "last_order", label: t("sales.col_last_order"), numeric: true,
      render: (r) => r.last_order ?? "—" },
    { key: "first_order", label: t("sales.col_first_order"), numeric: true, sortable: false,
      render: (r) => r.first_order ?? "—" },
  ];
}

function MANAGER_COLUMNS(t: any): ColumnDef<any>[] {
  return [
    { key: "label",          label: t("sales.col_manager"), width: "26%" },
    { key: "revenue",        label: t("sales.col_revenue"), numeric: true,
      render: (r) => "$" + fmtNum(r.revenue),
      footer: (tt) => "$" + fmtNum(tt.revenue) },
    { key: "deals",          label: t("sales.col_deals"), numeric: true,
      render: (r) => fmtNum(r.deals),
      footer: (tt) => fmtNum(tt.deals) },
    { key: "unique_clients", label: t("sales.col_clients"), numeric: true,
      render: (r) => fmtNum(r.unique_clients) },
    { key: "qty",            label: t("sales.col_qty"), numeric: true,
      render: (r) => fmtNum(r.qty) },
    { key: "yoy_pct",        label: t("sales.col_yoy"), numeric: true,
      render: (r) => yoyChip(r.yoy_pct) },
  ];
}

function BRAND_COLUMNS(t: any): ColumnDef<any>[] {
  return [
    { key: "label",    label: t("sales.col_brand"), width: "28%" },
    { key: "skus",     label: t("sales.col_skus"), numeric: true, render: (r) => fmtNum(r.skus) },
    { key: "revenue",  label: t("sales.col_revenue"), numeric: true,
      render: (r) => "$" + fmtNum(r.revenue),
      footer: (tt) => "$" + fmtNum(tt.revenue) },
    { key: "qty",      label: t("sales.col_qty"), numeric: true, render: (r) => fmtNum(r.qty) },
    { key: "yoy_pct",  label: t("sales.col_yoy"), numeric: true, render: (r) => yoyChip(r.yoy_pct) },
    { key: "last_active", label: t("sales.col_last_sold"), numeric: true, render: (r) => r.last_active ?? "—" },
  ];
}

function REGION_COLUMNS(t: any): ColumnDef<any>[] {
  return [
    { key: "label",          label: t("sales.col_region"), width: "28%" },
    { key: "revenue",        label: t("sales.col_revenue"), numeric: true,
      render: (r) => "$" + fmtNum(r.revenue),
      footer: (tt) => "$" + fmtNum(tt.revenue) },
    { key: "deals",          label: t("sales.col_deals"), numeric: true, render: (r) => fmtNum(r.deals) },
    { key: "unique_clients", label: t("sales.col_clients"), numeric: true, render: (r) => fmtNum(r.unique_clients) },
    { key: "qty",            label: t("sales.col_qty"), numeric: true, render: (r) => fmtNum(r.qty) },
    { key: "yoy_pct",        label: t("sales.col_yoy"), numeric: true, render: (r) => yoyChip(r.yoy_pct) },
  ];
}
