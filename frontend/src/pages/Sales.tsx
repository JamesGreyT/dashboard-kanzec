import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import WindowPicker, { defaultWindow, windowFor, type WindowAlias, type WindowState } from "../components/WindowPicker";
import { usePreferences } from "../lib/preferences";
import MetricCard, { fmtNum, fmtCount } from "../components/MetricCard";
import TimeSeriesChart, { type SeriesPoint } from "../components/TimeSeriesChart";
import Heatmap from "../components/Heatmap";
import RankedTable, { type ColumnDef, type Page } from "../components/RankedTable";
import Sparkline from "../components/Sparkline";
import DirectionMultiSelect from "../components/DirectionMultiSelect";
import ScopeChip from "../components/ScopeChip";
import {
  useChartAnnotations,
  AnnotationMarkers,
  AddAnnotationButton,
} from "../components/ChartAnnotations";
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
  const [tab, setTab] = useState<"clients" | "managers" | "brands" | "regions" | "rfm">("clients");
  const prefsQ = usePreferences();
  const [prefsApplied, setPrefsApplied] = useState(false);
  // Apply saved preferences once on first successful fetch.
  if (!prefsApplied && prefsQ.data) {
    const p = prefsQ.data;
    if (p.default_window) setWindow(windowFor(p.default_window as WindowAlias));
    if (p.default_directions?.length) setDirections(p.default_directions);
    setPrefsApplied(true);
  }

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

  const xsellQ = useQuery({
    queryKey: ["sales.xsell", baseQs.toString()],
    queryFn: () => api<{ pairs: Array<{ brand_a: string; brand_b: string; cnt: number; cnt_a: number; cnt_b: number; deals: number; support: number; lift: number | null }>; brands: string[] }>(
      `/api/sales/cross-sell?${baseQs.toString()}&limit=30`,
    ),
    staleTime: 60_000,
  });

  // Ranked tables state (one shared control per tab, reset on tab switch)
  type PagerState = { page: number; size: number; sort: string; search: string; segment?: string };
  const [pager, setPager] = useState<Record<string, PagerState>>({
    clients:  { page: 0, size: 50, sort: "revenue:desc", search: "" },
    managers: { page: 0, size: 50, sort: "revenue:desc", search: "" },
    brands:   { page: 0, size: 50, sort: "revenue:desc", search: "" },
    regions:  { page: 0, size: 50, sort: "revenue:desc", search: "" },
    rfm:      { page: 0, size: 50, sort: "revenue:desc", search: "", segment: "" },
  });
  const setPagerFor = (k: keyof typeof pager, next: PagerState) =>
    setPager((p) => ({ ...p, [k]: next }));

  const mkRankedQs = (k: keyof typeof pager) => {
    const q = new URLSearchParams(baseQs.toString());
    const p = pager[k];
    q.set("page", String(p.page));
    q.set("size", String(p.size));
    q.set("sort", p.sort);
    if (p.search) q.set("search", p.search);
    if (p.segment) q.set("segment", p.segment);
    // Request per-row sparkline only for the Clients tab — it's the
    // most useful and avoids needlessly fetching timeseries for brand
    // / region / manager aggregates.
    if (k === "clients") q.set("with_sparkline", "true");
    return q;
  };

  const clientsQ  = usePaginatedQuery<Page<any>>("sales.clients",  "/api/sales/clients",  mkRankedQs("clients"),  tab === "clients");
  const managersQ = usePaginatedQuery<Page<any>>("sales.managers", "/api/sales/managers", mkRankedQs("managers"), tab === "managers");
  const brandsQ   = usePaginatedQuery<Page<any>>("sales.brands",   "/api/sales/brands",   mkRankedQs("brands"),   tab === "brands");
  const regionsQ  = usePaginatedQuery<Page<any>>("sales.regions",  "/api/sales/regions",  mkRankedQs("regions"),  tab === "regions");
  const rfmQ      = usePaginatedQuery<Page<any> & { segment_distribution?: Array<{ segment: string; clients: number; revenue: number }> }>(
    "sales.rfm",
    "/api/sales/rfm",
    mkRankedQs("rfm"),
    tab === "rfm",
  );

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
        <ScopeChip />
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
      <SalesTimeseries series={series} />

      <hr className="mark-rule mb-12" aria-hidden />

      {/* Cross-sell affinity */}
      <section className="mb-12 stagger-3">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
            {t("sales.section_xsell", { defaultValue: "Cross-sell" })}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("sales.xsell_deals_hint", {
              defaultValue: "{{n}} deals carry ≥ 2 brands",
              n: xsellQ.data?.pairs?.[0]?.deals ?? 0,
            })}
          </div>
        </div>
        {xsellQ.data && xsellQ.data.pairs.length > 0 ? (
          <div className="overflow-x-auto border border-border/60 rounded-md bg-background/70">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    {t("sales.col_brand_a", { defaultValue: "Brand A" })}
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    {t("sales.col_brand_b", { defaultValue: "Brand B" })}
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    {t("sales.col_deals_both", { defaultValue: "Deals with both" })}
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    {t("sales.col_support", { defaultValue: "Support" })}
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    {t("sales.col_lift", { defaultValue: "Lift" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {xsellQ.data.pairs.map((p, i) => {
                  const lift = p.lift ?? 0;
                  const liftTone = lift >= 3
                    ? "text-emerald-700 dark:text-emerald-400 font-medium"
                    : lift >= 1.5
                    ? "text-foreground"
                    : "text-muted-foreground";
                  return (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-3 py-1.5 text-foreground">{p.brand_a}</td>
                      <td className="px-3 py-1.5 text-foreground">{p.brand_b}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtNum(p.cnt)}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {(p.support * 100).toFixed(2)}%
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${liftTone}`}>
                        {lift.toFixed(2)}×
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-muted-foreground italic text-sm py-10 text-center">—</div>
        )}
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
            <TabsTrigger value="rfm">{t("sales.tab_rfm")}</TabsTrigger>
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
          <TabsContent value="rfm">
            {rfmQ.data?.segment_distribution && (
              <div
                className="mb-4 flex flex-wrap gap-2"
                role="group"
                aria-label={t("sales.rfm_segment_filter", { defaultValue: "Filter by segment" }) as string}
              >
                {pager.rfm.segment && (
                  <button
                    type="button"
                    onClick={() =>
                      setPagerFor("rfm", { ...pager.rfm, page: 0, segment: "" })
                    }
                    className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-full border border-foreground/40 bg-foreground text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span className="text-[12px]">
                      {t("sales.rfm_clear", { defaultValue: "All" })}
                    </span>
                  </button>
                )}
                {rfmQ.data.segment_distribution.map((s) => {
                  const active = pager.rfm.segment === s.segment;
                  return (
                    <button
                      key={s.segment}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setPagerFor("rfm", {
                          ...pager.rfm,
                          page: 0,
                          segment: active ? "" : s.segment,
                        })
                      }
                      className={
                        "inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
                        (active
                          ? "border-foreground/70 bg-background ring-2 ring-foreground/30"
                          : "border-border/60 bg-muted/40 hover:bg-muted/60")
                      }
                      title={`${s.segment} — ${s.clients} clients, $${Math.round(s.revenue).toLocaleString("en-US")}`}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: rfmSegmentColor(s.segment) }}
                        aria-hidden
                      />
                      <span className={"text-[12px] " + (active ? "text-foreground font-medium" : "text-foreground")}>
                        {s.segment}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                        {s.clients}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <RankedTable
              columns={RFM_COLUMNS(t)}
              data={rfmQ.data}
              loading={rfmQ.isLoading}
              onChange={(n) => setPagerFor("rfm", { ...pager.rfm, ...n })}
              getRowKey={(r) => r.person_id}
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
    { key: "sparkline", label: "12W", numeric: true, sortable: false, width: "72px",
      render: (r) => (
        <Sparkline
          values={Array.isArray(r.sparkline) ? r.sparkline : []}
          width={56}
          height={18}
          ariaLabel={`12-week revenue trend for ${r.name}`}
        />
      ) },
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

function rfmSegmentColor(seg: string): string {
  const map: Record<string, string> = {
    "Champions": "#047857",
    "Loyal": "#10b981",
    "Potential loyalists": "#0891b2",
    "New customers": "#3b82f6",
    "Promising": "#6366f1",
    "Need attention": "#a16207",
    "About to sleep": "#ca8a04",
    "At risk": "#dc2626",
    "Cannot lose them": "#7c2d12",
    "Hibernating": "#6b7280",
    "Lost": "#111827",
  };
  return map[seg] ?? "#6b7280";
}

function RFM_COLUMNS(t: any): ColumnDef<any>[] {
  return [
    { key: "name", label: t("sales.col_name"), width: "22%" },
    { key: "segment", label: t("sales.col_segment"), width: "14%", sortable: false,
      render: (r) => (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-[0.06em] text-white"
          style={{ backgroundColor: rfmSegmentColor(r.segment ?? "") }}
        >
          {r.segment ?? "—"}
        </span>
      ) },
    { key: "direction", label: t("sales.col_direction"), width: "10%" },
    { key: "region",    label: t("sales.col_region"),    width: "12%" },
    { key: "revenue", label: t("sales.col_revenue"), numeric: true,
      render: (r) => "$" + fmtNum(r.revenue),
      footer: (tt) => "$" + fmtNum(tt.revenue) },
    { key: "deals", label: t("sales.col_deals"), numeric: true,
      render: (r) => fmtNum(r.deals),
      footer: (tt) => fmtNum(tt.deals) },
    { key: "r", label: "R", numeric: true, render: (r) => String(r.r ?? "—") },
    { key: "f", label: "F", numeric: true, render: (r) => String(r.f ?? "—") },
    { key: "m", label: "M", numeric: true, render: (r) => String(r.m ?? "—") },
    { key: "days_since", label: t("sales.col_days_since"), numeric: true,
      render: (r) => (r.days_since != null ? r.days_since + "d" : "—") },
    { key: "last_order_date", label: t("sales.col_last_order"), numeric: true,
      render: (r) => r.last_order_date ?? "—" },
  ];
}

function SalesTimeseries({ series }: { series: SeriesPoint[] }) {
  const { t } = useTranslation();
  const { rows, add } = useChartAnnotations("sales.timeseries");
  const latest = series[series.length - 1]?.date;
  return (
    <section className="mb-12 stagger-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="eyebrow !tracking-[0.18em] text-primary">
          {t("sales.chart_timeseries")}
        </div>
        <AddAnnotationButton
          latestDate={latest}
          onAdd={(x_date, note) => add.mutate({ x_date, note })}
        />
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
        overlays={
          <AnnotationMarkers
            rows={rows}
            xMatcher={(iso) => iso}
          />
        }
        annotations={rows}
      />
    </section>
  );
}
