import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import MetricCard, { fmtNum, fmtPct } from "../components/MetricCard";
import TimeSeriesChart, { type SeriesPoint } from "../components/TimeSeriesChart";
import Heatmap from "../components/Heatmap";
import RiskFlagList, { type RiskFlag } from "../components/RiskFlagList";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";

interface NorthStarResp {
  revenue: number;
  cash: number;
  outstanding: number;
  prepay: number;
  net_wc: number;
}

interface TrajectoryResp {
  fy: { from: string; to: string };
  prior_fy: { from: string; to: string };
  elapsed_days: number;
  fy_days: number;
  cur_total: number;
  prior_same_period: number;
  prior_full_fy: number;
  run_rate_projection: number;
  gap_to_prior_full: number;
  gap_to_prior_full_pct: number | null;
  series: Array<{ date: string; value: number; yoy: number }>;
}

interface ConcentrationResp {
  total_clients: number;
  total_revenue: number;
  top_10_share: number;
  top_20_share: number;
  top_50_share: number;
  gini: number;
  pareto: Array<{ rank: number; rank_pct: number; cumulative_share: number }>;
  top_clients: Array<{ rank: number; person_id: string; name: string; revenue: number; share: number }>;
}

interface ConcentrationTrendResp {
  series: Array<{ quarter: string; gini: number; clients: number; total: number }>;
}

interface ManagerLeverageResp {
  managers: Array<{ manager: string; revenue: number; deals: number; clients: number; yoy_pct: number | null }>;
  hidden_talent: Array<{ manager: string; revenue: number; yoy_pct: number | null }>;
  hidden_underperformer: Array<{ manager: string; revenue: number; yoy_pct: number | null }>;
}

interface ManagerProductivityResp {
  row_labels: string[];
  col_labels: string[];
  values: number[][];
}

interface CashConversionResp {
  series: Array<{ date: string; outstanding: number; prepay: number; net_wc: number; month_revenue: number; dso: number | null }>;
}

interface RiskResp { flags: RiskFlag[] }

export default function Executive() {
  const { t } = useTranslation();

  const nsQ = useQuery({
    queryKey: ["exec.ns"],
    queryFn: () => api<NorthStarResp>("/api/executive/north-star"),
    staleTime: 30_000,
  });
  const trajQ = useQuery({
    queryKey: ["exec.traj"],
    queryFn: () => api<TrajectoryResp>("/api/executive/trajectory"),
    staleTime: 60_000,
  });
  const concQ = useQuery({
    queryKey: ["exec.conc"],
    queryFn: () => api<ConcentrationResp>("/api/executive/concentration"),
    staleTime: 60_000,
  });
  const concTrendQ = useQuery({
    queryKey: ["exec.conc.trend"],
    queryFn: () => api<ConcentrationTrendResp>("/api/executive/concentration-trend?quarters=8"),
    staleTime: 5 * 60_000,
  });
  const mgrQ = useQuery({
    queryKey: ["exec.mgr"],
    queryFn: () => api<ManagerLeverageResp>("/api/executive/manager-leverage"),
    staleTime: 60_000,
  });
  const mgrProdQ = useQuery({
    queryKey: ["exec.mgr.prod"],
    queryFn: () => api<ManagerProductivityResp>("/api/executive/manager-productivity?months=12"),
    staleTime: 5 * 60_000,
  });
  const cashQ = useQuery({
    queryKey: ["exec.cash"],
    queryFn: () => api<CashConversionResp>("/api/executive/cash-conversion?months=12"),
    staleTime: 5 * 60_000,
  });
  const riskQ = useQuery({
    queryKey: ["exec.risk"],
    queryFn: () => api<RiskResp>("/api/executive/risk-flags"),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    document.title = t("executive.title") + " · Kanzec";
  }, [t]);

  const trajSeries: SeriesPoint[] = (trajQ.data?.series ?? []).map((p) => ({
    date: p.date, value: p.value, yoy: p.yoy,
  }));

  return (
    <div>
      <PageHeading
        crumb={[t("executive.crumb"), t("executive.title")]}
        title={t("executive.title")}
        subtitle={t("executive.subtitle")}
      />

      <p className="text-[12px] italic text-muted-foreground mb-8 max-w-3xl leading-relaxed stagger-1">
        {t("executive.disclosure")}
      </p>

      {/* North-star strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 mb-12 stagger-2">
        <MetricCard
          label={t("executive.ns_revenue")}
          value={"$" + fmtNum(nsQ.data?.revenue ?? 0)}
          hint={t("executive.ns_revenue_hint") as string}
        />
        <MetricCard
          label={t("executive.ns_cash")}
          value={"$" + fmtNum(nsQ.data?.cash ?? 0)}
          hint={t("executive.ns_cash_hint") as string}
        />
        <MetricCard
          label={t("executive.ns_outstanding")}
          value={"$" + fmtNum(nsQ.data?.outstanding ?? 0)}
          href="/collection/debt"
          hint={`${t("executive.ns_prepay")}: $${fmtNum(nsQ.data?.prepay ?? 0)}`}
        />
        <MetricCard
          label={t("executive.ns_net_wc")}
          value={"$" + fmtNum(nsQ.data?.net_wc ?? 0)}
          hint={(nsQ.data && nsQ.data.net_wc > 0
            ? t("executive.ns_net_wc_pos")
            : t("executive.ns_net_wc_neg")) as string}
        />
      </div>

      {/* § 1 — Trajectory */}
      <hr className="mark-rule mb-8" aria-hidden />
      <section className="mb-14 stagger-3">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
            <span className="eyebrow !text-[10px] mr-3">§ 1</span>
            {t("executive.section_trajectory")}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <TimeSeriesChart
              data={trajSeries}
              showYoY
              showArea
              primaryLabel={t("executive.cur_fy") as string}
              yoyLabel={t("executive.prior_fy") as string}
              primaryColor="hsl(var(--foreground))"
              yoyColor="hsl(var(--muted-foreground))"
            />
          </div>
          <div className="space-y-3">
            <ProjectionChip data={trajQ.data} />
          </div>
        </div>
      </section>

      {/* § 2 — Concentration */}
      <hr className="mark-rule mb-8" aria-hidden />
      <section className="mb-14 stagger-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
            <span className="eyebrow !text-[10px] mr-3">§ 2</span>
            {t("executive.section_concentration")}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
          {concQ.data && (
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t("executive.gini_label")}: {concQ.data.gini.toFixed(3)}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <ParetoCurve data={concQ.data?.pareto ?? []} />
          </div>
          <div className="space-y-2">
            <ShareCard label={t("executive.top_10")} value={concQ.data?.top_10_share ?? 0} />
            <ShareCard label={t("executive.top_20")} value={concQ.data?.top_20_share ?? 0} />
            <ShareCard label={t("executive.top_50")} value={concQ.data?.top_50_share ?? 0} />
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-3">
              {t("executive.gini_trend")}
            </div>
            <GiniTrend data={concTrendQ.data?.series ?? []} />
          </div>
        </div>
      </section>

      {/* § 3 — Manager leverage */}
      <hr className="mark-rule mb-8" aria-hidden />
      <section className="mb-14 stagger-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
            <span className="eyebrow !text-[10px] mr-3">§ 3</span>
            {t("executive.section_managers")}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-6">
          <div className="lg:col-span-2">
            <ManagerBars data={mgrQ.data?.managers ?? []} />
          </div>
          <div className="space-y-4">
            <ManagerHighlights
              title={t("executive.hidden_talent") as string}
              tone="positive"
              data={mgrQ.data?.hidden_talent ?? []}
            />
            <ManagerHighlights
              title={t("executive.hidden_under") as string}
              tone="negative"
              data={mgrQ.data?.hidden_underperformer ?? []}
            />
          </div>
        </div>
        {mgrProdQ.data && mgrProdQ.data.row_labels.length > 0 && (
          <div className="mt-6">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">
              {t("executive.productivity_matrix")}
            </div>
            <Heatmap
              rowLabels={mgrProdQ.data.row_labels}
              colLabels={mgrProdQ.data.col_labels.map(formatMonthLabel)}
              values={mgrProdQ.data.values}
              formatValue={(v) => (v === 0 ? "—" : fmtNum(v, true))}
            />
          </div>
        )}
      </section>

      {/* § 4 — Cash conversion */}
      <hr className="mark-rule mb-8" aria-hidden />
      <section className="mb-14 stagger-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
            <span className="eyebrow !text-[10px] mr-3">§ 4</span>
            {t("executive.section_cash")}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
        </div>
        <CashConversionCharts data={cashQ.data} />
      </section>

      {/* § 5 — Risk watchlist */}
      <hr className="mark-rule mb-8" aria-hidden />
      <section className="mb-14 stagger-7">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground">
            <span className="eyebrow !text-[10px] mr-3">§ 5</span>
            {t("executive.section_risks")}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
          {riskQ.data && (
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {riskQ.data.flags.length} {t("executive.flags")}
            </span>
          )}
        </div>
        <RiskFlagList flags={riskQ.data?.flags ?? []} />
      </section>
    </div>
  );
}

function ProjectionChip({ data }: { data: TrajectoryResp | undefined }) {
  const { t } = useTranslation();
  if (!data) return null;
  const gap = data.gap_to_prior_full;
  const gapPct = data.gap_to_prior_full_pct ?? 0;
  const tone =
    gap > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-red-700 dark:text-red-400";
  return (
    <div className="border border-border/60 rounded-md p-4 bg-muted/30">
      <div className="eyebrow !text-[10px] mb-1">{t("executive.run_rate")}</div>
      <div className="font-display text-[28px] md:text-[32px] font-medium tracking-tight text-foreground">
        ${fmtNum(data.run_rate_projection, true)}
      </div>
      <div className="text-[12px] text-muted-foreground italic mt-0.5">
        {t("executive.run_rate_hint", { elapsed: data.elapsed_days, total: data.fy_days })}
      </div>
      <div className="mt-3 pt-3 border-t border-border/40">
        <div className="eyebrow !text-[10px] mb-0.5">{t("executive.gap_to_prior_fy")}</div>
        <div className={"font-mono tabular-nums text-[18px] " + tone}>
          {gap >= 0 ? "+" : ""}${fmtNum(gap, true)}{" "}
          <span className="text-[12px] opacity-80">({fmtPct(gapPct)})</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1 italic">
          {t("executive.prior_fy_was")}: ${fmtNum(data.prior_full_fy, true)}
        </div>
      </div>
    </div>
  );
}

function ShareCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/40 pb-1.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-[16px] text-foreground">
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  );
}

function ParetoCurve({ data }: { data: ConcentrationResp["pareto"] }) {
  if (!data.length) {
    return <div className="text-muted-foreground italic text-sm py-10 text-center">—</div>;
  }
  const series = data.map((p) => ({
    rank_pct: Math.round(p.rank_pct * 100),
    cum: Math.round(p.cumulative_share * 100),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="rank_pct"
          unit="%"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={{ stroke: "hsl(var(--border))" }}
          domain={[0, 100]}
          type="number"
        />
        <YAxis
          unit="%"
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          formatter={(v: number) => `${v}%`}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6, fontSize: 12,
          }}
        />
        <ReferenceLine y={80} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="cum"
          stroke="hsl(var(--foreground))"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function GiniTrend({ data }: { data: ConcentrationTrendResp["series"] }) {
  if (!data.length) return null;
  const points = data.map((p) => ({
    quarter: p.quarter.slice(0, 7),
    gini: Number((p.gini * 100).toFixed(1)),
  }));
  return (
    <ResponsiveContainer width="100%" height={70}>
      <ComposedChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
        <XAxis
          dataKey="quarter"
          tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(v: number) => `${v}%`}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6, fontSize: 11,
          }}
        />
        <Bar dataKey="gini" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ManagerBars({ data }: { data: ManagerLeverageResp["managers"] }) {
  if (!data.length) {
    return <div className="text-muted-foreground italic text-sm py-10 text-center">—</div>;
  }
  const points = data.slice(0, 16).map((m) => ({
    manager: m.manager,
    revenue: Math.round(m.revenue),
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.min(360, 28 * points.length + 40)}>
      <ComposedChart data={points} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => fmtNum(v, true)}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="manager"
          width={120}
          tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(v: number) => "$" + fmtNum(v)}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6, fontSize: 12,
          }}
        />
        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 2, 2, 0]} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ManagerHighlights({
  title, tone, data,
}: {
  title: string;
  tone: "positive" | "negative";
  data: Array<{ manager: string; revenue: number; yoy_pct: number | null }>;
}) {
  const dot = tone === "positive" ? "bg-emerald-500" : "bg-red-500";
  const yoyTone = tone === "positive"
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-red-700 dark:text-red-400";
  return (
    <div className="border border-border/60 rounded-md p-3 bg-muted/30">
      <div className="flex items-center gap-2 mb-2">
        <span className={"inline-block w-2 h-2 rounded-full " + dot} aria-hidden />
        <span className="eyebrow !text-[10px]">{title}</span>
      </div>
      {data.length === 0 ? (
        <div className="text-muted-foreground italic text-[12px]">—</div>
      ) : (
        <ul className="space-y-1.5">
          {data.map((m) => (
            <li key={m.manager} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-foreground truncate">{m.manager}</span>
              <span className={"font-mono tabular-nums text-[12px] " + yoyTone}>
                {m.yoy_pct === null ? "—" : (m.yoy_pct >= 0 ? "+" : "") + (m.yoy_pct * 100).toFixed(0) + "%"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CashConversionCharts({ data }: { data: CashConversionResp | undefined }) {
  const { t } = useTranslation();
  if (!data || data.series.length === 0) {
    return <div className="text-muted-foreground italic text-sm py-10 text-center">—</div>;
  }
  const series = data.series.map((s) => ({
    date: s.date,
    outstanding: Math.round(s.outstanding),
    prepay: Math.round(s.prepay),
    net_wc: Math.round(s.net_wc),
    dso: s.dso ? Math.round(s.dso) : null,
  }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">
          {t("executive.dso_trend")}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={series} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatMonthShort} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
            <Line type="monotone" dataKey="dso" name="DSO" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">
          {t("executive.net_wc_trend")}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={series} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatMonthShort} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
            <YAxis tickFormatter={(v) => fmtNum(v, true)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={(v: number) => "$" + fmtNum(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
            <Bar dataKey="net_wc" fill="hsl(var(--primary))" name={t("executive.net_wc_label") as string} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatMonthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${y.slice(2)}`;
}

function formatMonthShort(iso: string): string {
  return formatMonthLabel(iso);
}
