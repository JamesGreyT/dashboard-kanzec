import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  AreaChart, Area, Cell, ReferenceLine,
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import MetricCard, { fmtNum, fmtCount } from "../components/MetricCard";
import Heatmap from "../components/Heatmap";
import AgingBar from "../components/AgingBar";
import RankedTable, { type ColumnDef, type Page } from "../components/RankedTable";
import DirectionMultiSelect from "../components/DirectionMultiSelect";
import ScopeChip from "../components/ScopeChip";
import { usePreferences } from "../lib/preferences";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface KPIResp {
  total_outstanding: number;
  debtors: number;
  over_90: number;
  largest: number;
  wavg_age_days: number;
  overdue_promises: number;
}

const BUCKET_COLORS: Record<string, string> = {
  "0-15": "#10b981",
  "16-30": "#fbbf24",
  "31-60": "#f59e0b",
  "61-90": "#c2410c",
  "91-180": "#b91c1c",
  "181-365": "#7f1d1d",
  "365+": "#450a0a",
};

export default function Debt() {
  const { t } = useTranslation();
  const [directions, setDirections] = useState<string[]>([]);
  const [tab, setTab] = useState<"all" | "stale" | "risk" | "managers" | "broken">("all");
  const prefsQ = usePreferences();
  const [prefsApplied, setPrefsApplied] = useState(false);
  if (!prefsApplied && prefsQ.data) {
    const p = prefsQ.data;
    if (p.default_directions?.length) setDirections(p.default_directions);
    setPrefsApplied(true);
  }

  const dirsOpts = useQuery({
    queryKey: ["snapshots.directions"],
    queryFn: () => api<{ directions: string[] }>("/api/snapshots/directions"),
    staleTime: 5 * 60_000,
  });

  const kpiQ = useQuery({
    queryKey: ["debt.kpi"],
    queryFn: () => api<KPIResp>("/api/debt/dashboard"),
    staleTime: 60_000,
  });
  const pyramidQ = useQuery({
    queryKey: ["debt.pyramid"],
    queryFn: () => api<{ buckets: Array<{ bucket: string; rows: number; clients: number; amount: number }> }>("/api/debt/aging-pyramid"),
    staleTime: 60_000,
  });
  const trendQ = useQuery({
    queryKey: ["debt.trend"],
    queryFn: () => api<{ series: Array<{ week: string; over_90_approx: number }> }>("/api/debt/aging-trend?weeks=26"),
    staleTime: 60_000,
  });
  const heatQ = useQuery({
    queryKey: ["debt.regionaging"],
    queryFn: () => api<{ row_labels: string[]; col_labels: string[]; values: number[][] }>("/api/debt/region-aging"),
    staleTime: 60_000,
  });
  const moveQ = useQuery({
    queryKey: ["debt.move"],
    queryFn: () => api<{ series: Array<{ week: string; invoiced: number; paid: number; net: number }> }>("/api/debt/debt-movement?weeks=26"),
    staleTime: 60_000,
  });
  const mgrQ = useQuery({
    queryKey: ["debt.mgr"],
    queryFn: () => api<{ rows: any[] }>("/api/debt/manager-portfolios"),
    staleTime: 60_000,
  });

  // Chart annotations — vertical notes on the aging-trend chart.
  const qc = useQueryClient();
  const annQ = useQuery({
    queryKey: ["ann.debt.aging_trend"],
    queryFn: () => api<{ rows: Array<{ id: number; chart_key: string; x_date: string; note: string; created_by_name: string; created_at: string }> }>(
      "/api/annotations?chart_key=debt.aging_trend",
    ),
    staleTime: 60_000,
  });
  const addAnnotation = async (x_date: string) => {
    const note = window.prompt(t("debt_dash.annotation_prompt", { defaultValue: "Note for this week?" }) as string);
    if (!note) return;
    try {
      await api("/api/annotations", {
        method: "POST",
        body: JSON.stringify({ chart_key: "debt.aging_trend", x_date, note }),
      });
      qc.invalidateQueries({ queryKey: ["ann.debt.aging_trend"] });
    } catch (e) {
      console.error(e);
    }
  };
  // Annotations are deleted via the dedicated admin UI or by the author
  // from the list. Kept simple on this page: hover-popover only.

  // paginated lists
  const [pager, setPager] = useState<Record<string, { page: number; size: number; sort: string; search: string }>>({
    all:      { page: 0, size: 50, sort: "debt:desc", search: "" },
    stale:    { page: 0, size: 50, sort: "days_since_order:desc", search: "" },
    risk:     { page: 0, size: 50, sort: "risk_score:desc", search: "" },
    managers: { page: 0, size: 50, sort: "outstanding:desc", search: "" },
    broken:   { page: 0, size: 50, sort: "broken:desc", search: "" },
  });
  const setPagerFor = (k: keyof typeof pager, n: typeof pager["all"]) =>
    setPager((p) => ({ ...p, [k]: n }));

  const qsFor = (k: keyof typeof pager) => {
    const q = new URLSearchParams();
    const p = pager[k];
    q.set("page", String(p.page)); q.set("size", String(p.size)); q.set("sort", p.sort);
    if (p.search) q.set("search", p.search);
    if (directions.length) q.set("direction", directions.join(","));
    return q;
  };

  const allQ = useQuery({
    queryKey: ["debt.all", qsFor("all").toString()],
    queryFn: () => api<Page<any>>(`/api/debt/debtors?${qsFor("all").toString()}`),
    staleTime: 60_000,
    enabled: tab === "all",
  });
  const staleQ = useQuery({
    queryKey: ["debt.stale", qsFor("stale").toString()],
    queryFn: () => api<Page<any>>(`/api/debt/stale-debtors?${qsFor("stale").toString()}`),
    staleTime: 60_000,
    enabled: tab === "stale",
  });
  const riskQ = useQuery({
    queryKey: ["debt.risk", qsFor("risk").toString()],
    queryFn: () => api<Page<any>>(`/api/debt/risk-scores?${qsFor("risk").toString()}`),
    staleTime: 60_000,
    enabled: tab === "risk",
  });
  const brokenQ = useQuery({
    queryKey: ["debt.broken"],
    queryFn: () => api<{ rows: any[] }>("/api/debt/broken-promise-debtors"),
    staleTime: 60_000,
    enabled: tab === "broken",
  });

  useEffect(() => {
    document.title = t("debt_dash.title") + " · Kanzec";
  }, [t]);

  const pyramidData = (pyramidQ.data?.buckets ?? []).map((b) => ({
    bucket: b.bucket, amount: b.amount, clients: b.clients, fill: BUCKET_COLORS[b.bucket] ?? "#999",
  }));

  return (
    <div>
      <PageHeading
        crumb={[t("nav.collection"), t("debt_dash.title")]}
        title={t("debt_dash.title")}
        subtitle={t("debt_dash.subtitle")}
      />

      <div className="stagger-1 flex flex-wrap items-center gap-4 mb-8">
        <DirectionMultiSelect
          options={dirsOpts.data?.directions ?? []}
          value={directions}
          onChange={setDirections}
        />
        <ScopeChip />
        <Link
          to="/collection/worklist"
          className="text-[11px] uppercase tracking-[0.14em] text-primary hover:underline ml-auto"
        >
          {t("debt_dash.open_worklist")} →
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 mb-12 stagger-2">
        <MetricCard
          label={t("debt_dash.kpi_outstanding")}
          value={"$" + fmtNum(kpiQ.data?.total_outstanding ?? 0)}
          hint={kpiQ.data ? `${t("debt_dash.largest")}: $${fmtNum(kpiQ.data.largest)}` : undefined}
        />
        <MetricCard
          label={t("debt_dash.kpi_debtors")}
          value={fmtCount(kpiQ.data?.debtors ?? 0)}
          hint={kpiQ.data ? `${t("debt_dash.wavg_age")}: ${kpiQ.data.wavg_age_days.toFixed(0)}d` : undefined}
          href="/collection/worklist"
          title={t("debt_dash.drill_worklist", { defaultValue: "Open worklist" }) as string}
        />
        <MetricCard
          label={t("debt_dash.kpi_over_90")}
          value={fmtCount(kpiQ.data?.over_90 ?? 0)}
          hint={t("debt_dash.over_90_hint") as string}
        />
        <MetricCard
          label={t("debt_dash.kpi_promises")}
          value={fmtCount(kpiQ.data?.overdue_promises ?? 0)}
          hint={t("debt_dash.promises_hint") as string}
        />
      </div>

      {/* Aging pyramid + trend */}
      <section className="mb-12 stagger-3 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-10">
        <div>
          <div className="eyebrow !tracking-[0.18em] mb-2 text-primary">
            {t("debt_dash.chart_pyramid")}
          </div>
          {pyramidData.length > 0 && (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pyramidData} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                <XAxis
                  type="number"
                  tickFormatter={(v) => Math.abs(v) >= 1000 ? Math.round(v/1000) + "k" : String(v)}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  type="category"
                  dataKey="bucket"
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={66}
                />
                <Tooltip
                  formatter={(v: number, n) => n === "amount" ? "$" + fmtNum(v) : fmtNum(v)}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, fontFamily: "var(--font-mono)" }}
                />
                <Bar dataKey="amount" radius={[0, 3, 3, 0]}>
                  {pyramidData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="eyebrow !tracking-[0.18em] text-primary">
              {t("debt_dash.chart_trend")}
            </div>
            <button
              type="button"
              onClick={() => {
                const latest = trendQ.data?.series[trendQ.data.series.length - 1]?.week;
                if (latest) addAnnotation(latest);
              }}
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-primary hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
              aria-label={t("debt_dash.add_annotation", { defaultValue: "Add note to latest week" }) as string}
            >
              <Plus className="h-3 w-3" aria-hidden />
              {t("debt_dash.add_annotation", { defaultValue: "Add note" })}
            </button>
          </div>
          {trendQ.data && (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendQ.data.series.map((r) => ({ week_key: r.week, week: r.week.slice(5), value: r.over_90_approx }))}>
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                <YAxis tickFormatter={(v) => Math.abs(v) >= 1000 ? Math.round(v/1000) + "k" : String(v)}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const notes = annQ.data?.rows.filter((a) => a.x_date.slice(5) === label) ?? [];
                    return (
                      <div className="bg-card border border-border rounded-md p-2.5 shadow-lg text-[12px] relative overflow-hidden max-w-[320px]">
                        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
                        <div className="font-mono text-muted-foreground mb-1 pl-1.5">{label}</div>
                        <div className="flex items-center gap-2 pl-1.5 tabular-nums">
                          <span className="text-foreground">Over 90d</span>
                          <span className="ml-auto font-mono">${fmtNum(payload[0].value ?? 0)}</span>
                        </div>
                        {notes.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border/60 pl-1.5">
                            {notes.map((n: any) => (
                              <div key={n.id} className="leading-snug mb-1 last:mb-0">
                                <div className="text-[11px] font-medium text-primary uppercase tracking-[0.08em]">
                                  Note{n.created_by_name ? " · " + n.created_by_name : ""}
                                </div>
                                <div className="text-[12px] text-foreground">{n.note}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="value" stroke="#b91c1c" fill="#b91c1c" fillOpacity={0.15} strokeWidth={1.75} />
                {annQ.data?.rows.map((a) => (
                  <ReferenceLine
                    key={a.id}
                    x={a.x_date.slice(5)}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{
                      value: "•",
                      position: "top",
                      fill: "hsl(var(--primary))",
                      fontSize: 16,
                    }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
          {annQ.data && annQ.data.rows.length > 0 && (
            <div className="mt-2 text-[11px] text-muted-foreground italic">
              {t("debt_dash.annotation_hover_hint", {
                defaultValue: "{{n}} note(s) pinned — hover the • markers to read.",
                n: annQ.data.rows.length,
              })}
            </div>
          )}
        </div>
      </section>

      <hr className="mark-rule mb-12" aria-hidden />

      {/* Region × aging heatmap + debt movement */}
      <section className="mb-12 stagger-4 grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div>
          <div className="eyebrow !tracking-[0.18em] mb-3 text-primary">
            {t("debt_dash.chart_heatmap")}
          </div>
          {heatQ.data && (
            <Heatmap
              rowLabels={heatQ.data.row_labels}
              colLabels={heatQ.data.col_labels}
              values={heatQ.data.values}
              formatValue={(v) => v === 0 ? "—" : fmtNum(v, true)}
            />
          )}
        </div>
        <div>
          <div className="eyebrow !tracking-[0.18em] mb-2 text-primary">
            {t("debt_dash.chart_movement")}
          </div>
          {moveQ.data && (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={moveQ.data.series.map((r) => ({ week: r.week.slice(5), invoiced: r.invoiced, paid: -r.paid }))}
                margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                <YAxis tickFormatter={(v) => Math.abs(v) >= 1000 ? Math.round(v/1000) + "k" : String(v)}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => "$" + fmtNum(Math.abs(v))}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, fontFamily: "var(--font-mono)" }} />
                <Bar dataKey="invoiced" fill="hsl(var(--primary))" opacity={0.75} radius={[3, 3, 0, 0]} />
                <Bar dataKey="paid" fill="#047857" opacity={0.85} radius={[0, 0, 3, 3]} />
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
            {t("debt_dash.section_ranked")}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">{t("debt_dash.tab_all")}</TabsTrigger>
            <TabsTrigger value="stale">{t("debt_dash.tab_stale")}</TabsTrigger>
            <TabsTrigger value="risk">{t("debt_dash.tab_risk")}</TabsTrigger>
            <TabsTrigger value="managers">{t("debt_dash.tab_managers")}</TabsTrigger>
            <TabsTrigger value="broken">{t("debt_dash.tab_broken")}</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            <RankedTable
              columns={DEBTOR_COLS(t)} data={allQ.data} loading={allQ.isLoading}
              onChange={(n) => setPagerFor("all", n)}
              getRowKey={(r) => r.person_id}
              exportHref={`/api/debt/export/debtors.xlsx?${qsFor("all").toString()}`}
            />
          </TabsContent>
          <TabsContent value="stale">
            <RankedTable
              columns={STALE_COLS(t)} data={staleQ.data} loading={staleQ.isLoading}
              onChange={(n) => setPagerFor("stale", n)}
              getRowKey={(r) => r.person_id}
              exportHref={`/api/debt/export/stale-debtors.xlsx?${qsFor("stale").toString()}`}
            />
          </TabsContent>
          <TabsContent value="risk">
            <RankedTable
              columns={RISK_COLS(t)} data={riskQ.data} loading={riskQ.isLoading}
              onChange={(n) => setPagerFor("risk", n)}
              getRowKey={(r) => r.person_id}
              exportHref={`/api/debt/export/risk-scores.xlsx?${qsFor("risk").toString()}`}
            />
          </TabsContent>
          <TabsContent value="managers">
            {mgrQ.data && (
              <div className="overflow-x-auto border border-border/60 rounded-md bg-background/70">
                <table className="w-full text-[13px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("debt_dash.col_manager")}</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("debt_dash.col_clients")}</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("debt_dash.col_outstanding")}</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("debt_dash.col_over_90_amt")}</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("debt_dash.col_over_90_pct")}</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("debt_dash.col_largest")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mgrQ.data.rows.map((r) => (
                      <tr key={r.manager} className="border-t border-border/40">
                        <td className="px-3 py-2">{r.manager}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtNum(r.clients)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">${fmtNum(r.outstanding)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-red-700 dark:text-red-400">${fmtNum(r.over_90_amount)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{(r.over_90_pct * 100).toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">${fmtNum(r.largest)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
          <TabsContent value="broken">
            {brokenQ.data && brokenQ.data.rows.length > 0 ? (
              <div className="overflow-x-auto border border-border/60 rounded-md bg-background/70">
                <table className="w-full text-[13px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("sales.col_name")}</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("sales.col_direction")}</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("debt_dash.col_broken")}</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("debt_dash.col_promised")}</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-medium text-muted-foreground">{t("debt_dash.col_last_contact")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brokenQ.data.rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.direction}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-red-700 dark:text-red-400">{r.broken}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{r.promised}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{r.last_contact?.slice(0, 10) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-muted-foreground italic text-sm py-10 text-center">—</div>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function DEBTOR_COLS(t: any): ColumnDef<any>[] {
  return [
    { key: "name",      label: t("sales.col_name"),      width: "22%" },
    { key: "direction", label: t("sales.col_direction"), width: "10%" },
    { key: "region",    label: t("sales.col_region"),    width: "12%" },
    { key: "debt",      label: t("debt_dash.col_debt"),  numeric: true,
      render: (r) => "$" + fmtNum(r.debt),
      footer: (tt) => "$" + fmtNum(tt.debt) },
    { key: "aging",     label: t("debt_dash.col_aging"), sortable: false,
      render: (r) => (
        <div className="flex items-center gap-2 justify-end">
          <AgingBar segments={r.aging ?? {}} width={120} height={10} />
        </div>
      ),
      align: "right" },
    { key: "invoiced",  label: t("payments_dash.col_invoiced"), numeric: true,
      render: (r) => "$" + fmtNum(r.invoiced) },
    { key: "last_order", label: t("sales.col_last_order"), numeric: true, render: (r) => r.last_order ?? "—" },
    { key: "last_pay",  label: t("payments_dash.col_last_pay"), numeric: true, render: (r) => r.last_pay ?? "—" },
  ];
}

function STALE_COLS(t: any): ColumnDef<any>[] {
  return [
    { key: "name",      label: t("sales.col_name"),      width: "24%" },
    { key: "direction", label: t("sales.col_direction"), width: "10%" },
    { key: "region",    label: t("sales.col_region"),    width: "14%" },
    { key: "debt",      label: t("debt_dash.col_debt"),  numeric: true,
      render: (r) => "$" + fmtNum(r.debt),
      footer: (tt) => "$" + fmtNum(tt.debt) },
    { key: "days_since_order", label: t("debt_dash.col_days_since_order"), numeric: true,
      render: (r) => r.days_since_order != null ? r.days_since_order + "d" : "—" },
    { key: "last_order", label: t("sales.col_last_order"), numeric: true, render: (r) => r.last_order ?? "—" },
    { key: "last_pay",  label: t("payments_dash.col_last_pay"), numeric: true, render: (r) => r.last_pay ?? "—" },
  ];
}

function RISK_COLS(t: any): ColumnDef<any>[] {
  return [
    { key: "name",      label: t("sales.col_name"),      width: "22%" },
    { key: "direction", label: t("sales.col_direction"), width: "10%" },
    { key: "region",    label: t("sales.col_region"),    width: "14%" },
    { key: "risk_score", label: t("debt_dash.col_risk"), numeric: true,
      render: (r) => {
        const s = r.risk_score ?? 0;
        const color = s >= 70 ? "text-red-700 dark:text-red-400"
                    : s >= 40 ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400";
        return <span className={color}>{s.toFixed(1)}</span>;
      } },
    { key: "debt",       label: t("debt_dash.col_debt"), numeric: true, render: (r) => "$" + fmtNum(r.debt) },
    { key: "aged_share", label: t("debt_dash.col_aged_share"), numeric: true,
      render: (r) => r.aged_share != null ? (r.aged_share * 100).toFixed(0) + "%" : "—" },
    { key: "days_since_pay", label: t("debt_dash.col_days_since_pay"), numeric: true,
      render: (r) => r.days_since_pay != null ? r.days_since_pay + "d" : t("debt_dash.never") },
  ];
}
