import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, ReferenceLine } from "recharts";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import WindowPicker, { defaultWindow, windowFor, type WindowAlias, type WindowState } from "../components/WindowPicker";
import { usePreferences } from "../lib/preferences";
import MetricCard, { fmtNum, fmtCount } from "../components/MetricCard";
import TimeSeriesChart, { type SeriesPoint } from "../components/TimeSeriesChart";
import Histogram from "../components/Histogram";
import RankedTable, { type ColumnDef, type Page } from "../components/RankedTable";
import DirectionMultiSelect from "../components/DirectionMultiSelect";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface OverviewResp {
  receipts: { current: number; prior: number; yoy: number; mom_pct: number | null; yoy_pct: number | null };
  payments: { current: number; prior: number; yoy: number; mom_pct: number | null; yoy_pct: number | null };
  payers:   { current: number; prior: number; yoy: number; mom_pct: number | null; yoy_pct: number | null };
  avg_payment: { current: number; prior: number; mom_pct: number | null };
  dso: number;
  collection_ratio: number | null;
}

const METHOD_COLORS = ["hsl(var(--primary))", "#059669", "#7c2d12"];

export default function Payments() {
  const { t } = useTranslation();
  const [window, setWindow] = useState<WindowState>(defaultWindow());
  const [directions, setDirections] = useState<string[]>([]);
  const [tab, setTab] = useState<"payers" | "prepayers" | "regularity" | "churned">("payers");
  const prefsQ = usePreferences();
  const [prefsApplied, setPrefsApplied] = useState(false);
  if (!prefsApplied && prefsQ.data) {
    const p = prefsQ.data;
    if (p.default_window) setWindow(windowFor(p.default_window as WindowAlias));
    if (p.default_directions?.length) setDirections(p.default_directions);
    setPrefsApplied(true);
  }

  const baseQs = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("from", window.from); qs.set("to", window.to);
    if (directions.length) qs.set("direction", directions.join(","));
    return qs;
  }, [window, directions]);

  const dirsOpts = useQuery({
    queryKey: ["snapshots.directions"],
    queryFn: () => api<{ directions: string[] }>("/api/snapshots/directions"),
    staleTime: 5 * 60_000,
  });

  const ovQ = useQuery({
    queryKey: ["pay.ov", baseQs.toString()],
    queryFn: () => api<OverviewResp>(`/api/payments/overview?${baseQs.toString()}`),
    staleTime: 30_000,
  });
  const tsQ = useQuery({
    queryKey: ["pay.ts", baseQs.toString()],
    queryFn: () => api<{ series: SeriesPoint[] }>(`/api/payments/timeseries?${baseQs.toString()}&granularity=day`),
    staleTime: 30_000,
  });
  const methodQ = useQuery({
    queryKey: ["pay.method", baseQs.toString()],
    queryFn: () => api<{ split: Array<{ method: string; count: number; amount: number }> }>(`/api/payments/method-split?${baseQs.toString()}`),
    staleTime: 30_000,
  });
  const weekdayQ = useQuery({
    queryKey: ["pay.weekday", baseQs.toString()],
    queryFn: () => api<{ pattern: Array<{ dow: number; label: string; count: number; amount: number }> }>(`/api/payments/weekday?${baseQs.toString()}`),
    staleTime: 30_000,
  });
  const velocityQ = useQuery({
    queryKey: ["pay.velocity", baseQs.toString()],
    queryFn: () => api<{ histogram: Array<{ bucket: string; count: number; amount: number }> }>(`/api/payments/velocity?${baseQs.toString()}`),
    staleTime: 30_000,
  });
  const crQ = useQuery({
    queryKey: ["pay.cr", baseQs.toString()],
    queryFn: () => api<{ series: Array<{ month: string; invoiced: number; paid: number; ratio: number | null }> }>(`/api/payments/collection-ratio?${baseQs.toString()}`),
    staleTime: 30_000,
  });

  const [pager, setPager] = useState<Record<string, { page: number; size: number; sort: string; search: string }>>({
    payers:     { page: 0, size: 50, sort: "receipts:desc", search: "" },
    prepayers:  { page: 0, size: 50, sort: "credit:desc", search: "" },
    regularity: { page: 0, size: 50, sort: "receipts:desc", search: "" },
    churned:    { page: 0, size: 50, sort: "receipts:desc", search: "" },
  });
  const setPagerFor = (k: keyof typeof pager, next: typeof pager["payers"]) =>
    setPager((p) => ({ ...p, [k]: next }));

  const mkQs = (k: keyof typeof pager, path: string) => {
    const q = path === "/api/payments/payers" ? new URLSearchParams(baseQs.toString()) : new URLSearchParams();
    const p = pager[k];
    q.set("page", String(p.page)); q.set("size", String(p.size)); q.set("sort", p.sort);
    if (p.search) q.set("search", p.search);
    if (directions.length) q.set("direction", directions.join(","));
    return q;
  };

  const payersQ = useQuery({
    queryKey: ["pay.payers", mkQs("payers", "/api/payments/payers").toString()],
    queryFn: () => api<Page<any>>(`/api/payments/payers?${mkQs("payers", "/api/payments/payers").toString()}`),
    staleTime: 30_000,
    enabled: tab === "payers",
  });
  const prepayersQ = useQuery({
    queryKey: ["pay.pre", mkQs("prepayers", "").toString()],
    queryFn: () => api<Page<any>>(`/api/payments/prepayers?${mkQs("prepayers", "").toString()}`),
    staleTime: 30_000,
    enabled: tab === "prepayers",
  });
  const regQ = useQuery({
    queryKey: ["pay.reg", mkQs("regularity", "").toString()],
    queryFn: () => api<Page<any>>(`/api/payments/regularity?${mkQs("regularity", "").toString()}`),
    staleTime: 30_000,
    enabled: tab === "regularity",
  });
  const chQ = useQuery({
    queryKey: ["pay.ch", mkQs("churned", "").toString()],
    queryFn: () => api<Page<any>>(`/api/payments/churned?${mkQs("churned", "").toString()}`),
    staleTime: 30_000,
    enabled: tab === "churned",
  });

  useEffect(() => {
    document.title = t("payments_dash.title") + " · Kanzec";
  }, [t]);

  const weekdayAvg = (weekdayQ.data?.pattern ?? []).reduce((s, r) => s + r.amount, 0) /
    Math.max(1, weekdayQ.data?.pattern.length ?? 1);

  return (
    <div>
      <PageHeading
        crumb={[t("nav.analytics"), t("payments_dash.title")]}
        title={t("payments_dash.title")}
        subtitle={t("payments_dash.subtitle")}
      />
      <div className="stagger-1 flex flex-wrap items-center gap-4 mb-8">
        <WindowPicker value={window} onChange={setWindow} />
        <DirectionMultiSelect
          options={dirsOpts.data?.directions ?? []}
          value={directions}
          onChange={setDirections}
        />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 mb-12 stagger-2">
        <MetricCard
          label={t("payments_dash.kpi_receipts")}
          value={"$" + fmtNum(ovQ.data?.receipts.current ?? 0)}
          delta={ovQ.data?.receipts.mom_pct ?? null}
          deltaLabel={t("sales.vs_prior") as string}
          hint={ovQ.data ? `YoY ${ovQ.data.receipts.yoy_pct != null ? ((ovQ.data.receipts.yoy_pct * 100).toFixed(1) + "%") : "—"}` : undefined}
        />
        <MetricCard
          label={t("payments_dash.kpi_payments")}
          value={fmtCount(ovQ.data?.payments.current ?? 0)}
          delta={ovQ.data?.payments.mom_pct ?? null}
          deltaLabel={t("sales.vs_prior") as string}
          href="/data/payments"
          title={t("payments_dash.drill_payments", { defaultValue: "Open payment rows" }) as string}
        />
        <MetricCard
          label={t("payments_dash.kpi_dso")}
          value={ovQ.data ? ovQ.data.dso.toFixed(1) : "—"}
          unit={t("payments_dash.days") as string}
          hint={t("payments_dash.dso_hint") as string}
        />
        <MetricCard
          label={t("payments_dash.kpi_collection")}
          value={ovQ.data && ovQ.data.collection_ratio != null
            ? (ovQ.data.collection_ratio * 100).toFixed(1) + "%"
            : "—"}
          hint={
            ovQ.data && ovQ.data.collection_ratio != null && ovQ.data.collection_ratio > 1.0
              ? (t("payments_dash.collection_prepay_hint") as string)
              : (t("payments_dash.collection_hint") as string)
          }
        />
      </div>

      {/* Primary timeseries */}
      <section className="mb-12 stagger-3">
        <div className="eyebrow !tracking-[0.18em] mb-2 text-primary">
          {t("payments_dash.chart_timeseries")}
        </div>
        <TimeSeriesChart
          data={tsQ.data?.series ?? []}
          showArea showMA showYoY
          primaryLabel={t("payments_dash.kirim") as string}
          yoyLabel={t("sales.yoy") as string}
          primaryColor="#047857"     // emerald-700 — cash inflow accent
          maColor="hsl(var(--primary))"
          height={280}
        />
      </section>

      <hr className="mark-rule mb-12" aria-hidden />

      {/* Two-column: method donut + weekday pattern */}
      <section className="mb-12 stagger-4 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <div className="eyebrow !tracking-[0.18em] mb-2 text-primary">
            {t("payments_dash.chart_method")}
          </div>
          {methodQ.data && (
            <div className="flex items-center gap-6 min-h-[220px]">
              <ResponsiveContainer width="50%" height={220}>
                <PieChart>
                  <Pie
                    data={methodQ.data.split}
                    dataKey="amount"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={84}
                    strokeWidth={0}
                  >
                    {methodQ.data.split.map((_, i) => (
                      <Cell key={i} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => "$" + fmtNum(v)}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 text-[13px]">
                {methodQ.data.split.map((r, i) => {
                  const pct = r.amount / Math.max(1, methodQ.data!.split.reduce((s, x) => s + x.amount, 0));
                  return (
                    <div key={r.method} className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: METHOD_COLORS[i] }} />
                      <span className="text-foreground">{r.method}</span>
                      <span className="ml-auto font-mono tabular-nums">{(pct * 100).toFixed(1)}%</span>
                      <span className="font-mono tabular-nums text-muted-foreground">·  ${fmtNum(r.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="eyebrow !tracking-[0.18em] mb-2 text-primary">
            {t("payments_dash.chart_weekday")}
          </div>
          {weekdayQ.data && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekdayQ.data.pattern}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => Math.abs(v) >= 1000 ? Math.round(v/1000) + "k" : String(v)} />
                <ReferenceLine y={weekdayAvg} stroke="hsl(var(--primary))" strokeDasharray="3 3" />
                <Bar dataKey="amount" fill="#047857" opacity={0.85} radius={[3, 3, 0, 0]} />
                <Tooltip
                  formatter={(v: number) => "$" + fmtNum(v)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <hr className="mark-rule mb-12" aria-hidden />

      {/* Velocity + collection ratio */}
      <section className="mb-12 stagger-5 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <div className="eyebrow !tracking-[0.18em] mb-2 text-primary">
            {t("payments_dash.chart_velocity")}
          </div>
          <Histogram
            data={(velocityQ.data?.histogram ?? []).map((r) => ({ bucket: r.bucket, count: r.count, amount: r.amount }))}
            xKey="bucket"
            yKey="amount"
            barColor="#047857"
            height={240}
          />
        </div>
        <div>
          <div className="eyebrow !tracking-[0.18em] mb-2 text-primary">
            {t("payments_dash.chart_collection")}
          </div>
          {crQ.data && crQ.data.series.length > 0 && (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={crQ.data.series.map((r) => ({ ...r, month: r.month.slice(0, 7) }))}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                <YAxis tickFormatter={(v) => Math.abs(v) >= 1000 ? Math.round(v/1000) + "k" : String(v)}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number) => "$" + fmtNum(v)}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, fontFamily: "var(--font-mono)" }}
                />
                <Bar dataKey="invoiced" fill="hsl(var(--primary))" opacity={0.55} radius={[3, 3, 0, 0]} />
                <Bar dataKey="paid"     fill="#047857"              opacity={0.85} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <hr className="mark-rule mb-12" aria-hidden />

      {/* Ranked tabs */}
      <section className="mb-12 stagger-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
            {t("payments_dash.section_ranked")}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="mb-4">
            <TabsTrigger value="payers">{t("payments_dash.tab_payers")}</TabsTrigger>
            <TabsTrigger value="prepayers">{t("payments_dash.tab_prepayers")}</TabsTrigger>
            <TabsTrigger value="regularity">{t("payments_dash.tab_regularity")}</TabsTrigger>
            <TabsTrigger value="churned">{t("payments_dash.tab_churned")}</TabsTrigger>
          </TabsList>
          <TabsContent value="payers">
            <RankedTable
              columns={PAYER_COLS(t)} data={payersQ.data} loading={payersQ.isLoading}
              onChange={(n) => setPagerFor("payers", n)}
              getRowKey={(r) => r.person_id}
              exportHref={`/api/payments/export/payers.xlsx?${mkQs("payers", "/api/payments/payers").toString()}`}
            />
          </TabsContent>
          <TabsContent value="prepayers">
            <RankedTable
              columns={PREPAY_COLS(t)} data={prepayersQ.data} loading={prepayersQ.isLoading}
              onChange={(n) => setPagerFor("prepayers", n)}
              getRowKey={(r) => r.person_id}
              exportHref={`/api/payments/export/prepayers.xlsx?${mkQs("prepayers", "").toString()}`}
            />
          </TabsContent>
          <TabsContent value="regularity">
            <RankedTable
              columns={REG_COLS(t)} data={regQ.data} loading={regQ.isLoading}
              onChange={(n) => setPagerFor("regularity", n)}
              getRowKey={(r) => r.person_id}
              exportHref={`/api/payments/export/regularity.xlsx?${mkQs("regularity", "").toString()}`}
            />
          </TabsContent>
          <TabsContent value="churned">
            <RankedTable
              columns={CH_COLS(t)} data={chQ.data} loading={chQ.isLoading}
              onChange={(n) => setPagerFor("churned", n)}
              getRowKey={(r) => r.person_id}
              exportHref={`/api/payments/export/churned.xlsx?${mkQs("churned", "").toString()}`}
            />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function classPill(c: string) {
  const tone = {
    daily:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    weekly:   "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    monthly:  "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
    sporadic: "bg-muted text-muted-foreground",
    churned:  "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300",
  }[c] ?? "bg-muted text-muted-foreground";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-[0.06em] ${tone}`}>{c}</span>;
}

function PAYER_COLS(t: any): ColumnDef<any>[] {
  return [
    { key: "name",      label: t("sales.col_name"),      width: "24%" },
    { key: "direction", label: t("sales.col_direction"), width: "10%" },
    { key: "region",    label: t("sales.col_region"),    width: "12%" },
    { key: "receipts",  label: t("payments_dash.col_receipts"), numeric: true,
      render: (r) => "$" + fmtNum(r.receipts),
      footer: (tt) => "$" + fmtNum(tt.receipts) },
    { key: "payments", label: t("payments_dash.col_payments"), numeric: true,
      render: (r) => fmtNum(r.payments),
      footer: (tt) => fmtNum(tt.payments) },
    { key: "avg_payment", label: t("payments_dash.col_avg_pay"), numeric: true,
      render: (r) => "$" + fmtNum(r.avg_payment) },
    { key: "yoy_pct",   label: t("sales.col_yoy"), numeric: true,
      render: (r) => r.yoy_pct == null ? <span className="text-muted-foreground/60">—</span>
        : <span className={r.yoy_pct > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
            {(r.yoy_pct * 100).toFixed(1)}%
          </span> },
    { key: "last_pay",  label: t("payments_dash.col_last_pay"), numeric: true, render: (r) => r.last_pay ?? "—" },
    { key: "first_pay", label: t("payments_dash.col_first_pay"), numeric: true, render: (r) => r.first_pay ?? "—" },
  ];
}

function PREPAY_COLS(t: any): ColumnDef<any>[] {
  return [
    { key: "name",      label: t("sales.col_name"),      width: "28%" },
    { key: "direction", label: t("sales.col_direction"), width: "12%" },
    { key: "region",    label: t("sales.col_region"),    width: "14%" },
    { key: "credit",    label: t("payments_dash.col_credit"), numeric: true,
      render: (r) => "$" + fmtNum(r.credit),
      footer: (tt) => "$" + fmtNum(tt.credit) },
    { key: "paid",      label: t("payments_dash.col_paid"), numeric: true, render: (r) => "$" + fmtNum(r.paid) },
    { key: "invoiced",  label: t("payments_dash.col_invoiced"), numeric: true, render: (r) => "$" + fmtNum(r.invoiced) },
    { key: "last_pay",  label: t("payments_dash.col_last_pay"), numeric: true, render: (r) => r.last_pay ?? "—" },
  ];
}

function REG_COLS(t: any): ColumnDef<any>[] {
  return [
    { key: "name",      label: t("sales.col_name"),      width: "22%" },
    { key: "class",     label: t("payments_dash.col_class"), sortable: false,
      render: (r) => classPill(r.class ?? "sporadic") },
    { key: "direction", label: t("sales.col_direction"), width: "10%" },
    { key: "region",    label: t("sales.col_region"),    width: "12%" },
    { key: "receipts",  label: t("payments_dash.col_receipts"), numeric: true,
      render: (r) => "$" + fmtNum(r.receipts),
      footer: (tt) => "$" + fmtNum(tt.receipts) },
    { key: "payments", label: t("payments_dash.col_payments"), numeric: true, render: (r) => fmtNum(r.payments) },
    { key: "avg_gap", label: t("payments_dash.col_avg_gap"), numeric: true,
      render: (r) => r.avg_gap == null ? "—" : Number(r.avg_gap).toFixed(1) + "d" },
    { key: "last_pay", label: t("payments_dash.col_last_pay"), numeric: true, render: (r) => r.last_pay ?? "—" },
  ];
}

function CH_COLS(t: any): ColumnDef<any>[] {
  return [
    { key: "name",       label: t("sales.col_name"),      width: "28%" },
    { key: "direction",  label: t("sales.col_direction"), width: "12%" },
    { key: "region",     label: t("sales.col_region"),    width: "14%" },
    { key: "receipts",   label: t("payments_dash.col_past_receipts"), numeric: true,
      render: (r) => "$" + fmtNum(r.receipts),
      footer: (tt) => "$" + fmtNum(tt.receipts) },
    { key: "last_pay",   label: t("payments_dash.col_last_pay"), numeric: true, render: (r) => r.last_pay ?? "—" },
    { key: "days_since", label: t("payments_dash.col_days_since"), numeric: true, render: (r) => fmtNum(r.days_since) + "d" },
  ];
}
