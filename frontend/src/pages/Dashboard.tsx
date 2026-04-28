import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarRange,
  HandCoins,
  Users,
  type LucideIcon,
} from "lucide-react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { last90Days } from "../lib/dashboardWindow";
import { fmtNum, fmtCount, fmtPct } from "../components/MetricCard";
import TimeSeriesChart, { type SeriesPoint } from "../components/TimeSeriesChart";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface OverviewResp {
  today:    { orders: { count: number; amount: number }; payments: { count: number; amount: number } };
  yesterday:{ orders: { count: number; amount: number }; payments: { amount: number } };
  week:     { orders_amount: number };
  active_clients_30d: number;
  series_30d: Array<{ day: string; orders: number; payments: number }>;
}

interface ComparisonResp {
  columns: string[];
  totals: { values: number[]; trend_delta_pct: number | null };
}

interface ProjectionResp {
  current_mtd: { sotuv: number; kirim: number };
  projection: {
    sotuv: { min: number; mean: number; max: number };
    kirim: { min: number; mean: number; max: number };
  };
}

interface WorklistResp {
  summary: {
    debtor_count: number;
    debtor_over_90_count: number;
    total_outstanding: number;
    total_over_90: number;
    total_overdue_promises: number;
  };
}

interface PrepaymentsResp {
  rows: Array<{ credit_balance: number }>;
  total: number;
}

interface RfmResp {
  segment_distribution?: Array<{ segment: string; clients: number; revenue: number }>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    document.title = t("dashboard.title", { defaultValue: "Dashboard" }) + " · Kanzec";
  }, [t]);

  // Localized "Monday, 28 April 2026" for the masthead eyebrow.
  const lang = (i18n.language || "uz").split("-")[0];
  const dateLabel = new Date().toLocaleDateString(
    lang === "uz" ? "uz-UZ" : lang === "ru" ? "ru-RU" : "en-US",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  );

  // Split the title across two lines with the italic accent dot trailing
  // the last word — same trick PageHeading uses.
  const titleWords = (t("dashboard.title", { defaultValue: "Dashboard" }) as string).trim().split(/\s+/);
  const titleHead = titleWords.slice(0, -1).join(" ");
  const titleTail = titleWords[titleWords.length - 1];

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------
  const overviewQ = useQuery({
    queryKey: ["dashboard.overview"],
    queryFn: () => api<OverviewResp>("/api/dashboard/overview"),
    staleTime: 60_000,
  });

  const sotuvCmpQ = useQuery({
    queryKey: ["dashboard.cmp.sotuv"],
    queryFn: () =>
      api<ComparisonResp>(
        "/api/comparison/sotuv?dimension=manager&mode=yearly&years=2",
      ),
    staleTime: 5 * 60_000,
  });
  const kirimCmpQ = useQuery({
    queryKey: ["dashboard.cmp.kirim"],
    queryFn: () =>
      api<ComparisonResp>(
        "/api/comparison/kirim?dimension=manager&mode=yearly&years=2",
      ),
    staleTime: 5 * 60_000,
  });

  const projectionQ = useQuery({
    queryKey: ["dashboard.projection"],
    queryFn: () => api<ProjectionResp>("/api/dayslice/projection?years=4"),
    staleTime: 5 * 60_000,
    enabled: isAdmin,
  });

  const worklistQ = useQuery({
    queryKey: ["dashboard.worklist"],
    queryFn: () => api<WorklistResp>("/api/debt/worklist?limit=1"),
    staleTime: 60_000,
  });
  const prepaymentsQ = useQuery({
    queryKey: ["dashboard.prepayments"],
    queryFn: () => api<PrepaymentsResp>("/api/debt/prepayments?limit=1"),
    staleTime: 60_000,
  });

  const rfmWindow = useMemo(last90Days, []);
  const rfmQ = useQuery({
    queryKey: ["dashboard.rfm.sales", rfmWindow.from, rfmWindow.to],
    queryFn: () => {
      const qs = new URLSearchParams({
        from: rfmWindow.from,
        to: rfmWindow.to,
        size: "1",
      });
      return api<RfmResp>(`/api/sales/rfm?${qs.toString()}`);
    },
    staleTime: 5 * 60_000,
  });

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const trendSeries: SeriesPoint[] = useMemo(() => {
    const data = overviewQ.data?.series_30d ?? [];
    return data.map((p) => ({ date: p.day, value: p.orders, yoy: p.payments }));
  }, [overviewQ.data]);

  const todayDelta = (a: number | undefined, b: number | undefined) => {
    if (a == null || b == null || b === 0) return null;
    return a / b - 1;
  };

  const yearLabels = sotuvCmpQ.data?.columns ?? [];
  const yearNow = yearLabels.at(-1) ?? "";
  const yearPrev = yearLabels.at(-2) ?? "";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-8 md:space-y-10 pb-10">
      {/* MASTHEAD */}
      <header className="stagger-0 relative pb-5">
        <div className="grid grid-cols-12 gap-x-6 gap-y-3 items-end">
          <div className="col-span-12 md:col-span-7">
            <div className="eyebrow !tracking-[0.18em] mb-2">{dateLabel}</div>
            <h1 className="font-display text-[28px] sm:text-[36px] md:text-[44px] font-medium leading-[1.05] tracking-[-0.015em] text-foreground">
              {titleHead && <span>{titleHead} </span>}
              <span>
                {titleTail}
                <span aria-hidden className="font-display-italic text-primary">.</span>
              </span>
            </h1>
          </div>
          <div className="col-span-12 md:col-span-5 md:pl-6 md:border-l border-border/60 md:self-end pb-1">
            <p className="text-[12px] md:text-[13px] text-muted-foreground italic leading-relaxed max-w-prose">
              {t("dashboard.subtitle")}
            </p>
          </div>
        </div>
        <div className="mark-rule absolute bottom-0 left-0 right-0" aria-hidden />
      </header>

      {/* PULSE STRIP — editorial stat list, hairline dividers between cells */}
      <section className="stagger-1">
        <div className="eyebrow !tracking-[0.18em] mb-3 flex items-baseline gap-2">
          <span>{t("dashboard.pulse_label", { defaultValue: "Bugungi puls" })}</span>
          <span aria-hidden className="font-display-italic text-primary text-[14px] -ml-0.5">.</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-0 gap-y-5 md:divide-x divide-border/50">
          <PulseStat
            label={t("dashboard.today_orders")}
            value={overviewQ.data ? "$" + fmtNum(overviewQ.data.today.orders.amount, true) : "—"}
            sub={overviewQ.data ? fmtCount(overviewQ.data.today.orders.count) + " " + t("dashboard.orders_unit") : ""}
            delta={todayDelta(
              overviewQ.data?.today.orders.amount,
              overviewQ.data?.yesterday.orders.amount,
            )}
            deltaLabel={t("dashboard.vs_yesterday") as string}
            isFirst
          />
          <PulseStat
            label={t("dashboard.today_payments")}
            value={overviewQ.data ? "$" + fmtNum(overviewQ.data.today.payments.amount, true) : "—"}
            sub={overviewQ.data ? fmtCount(overviewQ.data.today.payments.count) + " " + t("dashboard.payments_unit") : ""}
            delta={todayDelta(
              overviewQ.data?.today.payments.amount,
              overviewQ.data?.yesterday.payments.amount,
            )}
            deltaLabel={t("dashboard.vs_yesterday") as string}
          />
          <PulseStat
            label={t("dashboard.week_orders")}
            value={overviewQ.data ? "$" + fmtNum(overviewQ.data.week.orders_amount, true) : "—"}
            sub={t("dashboard.week_hint") as string}
          />
          <PulseStat
            label={t("dashboard.active_30d")}
            value={overviewQ.data ? fmtCount(overviewQ.data.active_clients_30d) : "—"}
            sub={t("dashboard.active_30d_hint") as string}
          />
        </div>
      </section>

      {/* SPOTLIGHT — Taqqoslash, the lead headline of the page */}
      <SpotlightCard
        to="/analytics/comparison"
        eyebrow={t("nav.comparison") as string}
        kicker={yearPrev && yearNow ? `${yearPrev} → ${yearNow}` : ""}
        loading={sotuvCmpQ.isLoading || kirimCmpQ.isLoading}
        error={!!sotuvCmpQ.error || !!kirimCmpQ.error}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 md:gap-y-0 md:gap-x-10 md:divide-x divide-border/40">
          <SpotlightHalf
            label={t("comparison.tab_sotuv") as string}
            current={sotuvCmpQ.data?.totals.values.at(-1) ?? null}
            prior={sotuvCmpQ.data?.totals.values.at(-2) ?? null}
            yoy={sotuvCmpQ.data?.totals.trend_delta_pct ?? null}
            yearPrev={yearPrev}
          />
          <SpotlightHalf
            label={t("comparison.tab_kirim") as string}
            current={kirimCmpQ.data?.totals.values.at(-1) ?? null}
            prior={kirimCmpQ.data?.totals.values.at(-2) ?? null}
            yoy={kirimCmpQ.data?.totals.trend_delta_pct ?? null}
            yearPrev={yearPrev}
            offset
          />
        </div>
      </SpotlightCard>

      {/* SECONDARY GRID — three tiles, asymmetric layouts inside */}
      <section
        className={
          "stagger-3 grid gap-4 md:gap-4 grid-cols-1 " +
          (isAdmin ? "md:grid-cols-3" : "md:grid-cols-2")
        }
      >
        {isAdmin && (
          <KunlikKesimTile data={projectionQ.data} loading={projectionQ.isLoading} error={!!projectionQ.error} t={t} />
        )}
        <CollectionTile
          worklist={worklistQ.data}
          prepayments={prepaymentsQ.data}
          loading={worklistQ.isLoading || prepaymentsQ.isLoading}
          error={!!worklistQ.error || !!prepaymentsQ.error}
          t={t}
        />
        <RfmTile data={rfmQ.data} loading={rfmQ.isLoading} error={!!rfmQ.error} t={t} />
      </section>

      {/* TREND — minimal chrome, sits in the page like an inline figure */}
      {trendSeries.length > 0 && (
        <section className="stagger-4">
          <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
            <div>
              <div className="eyebrow !tracking-[0.16em] mb-1">
                {t("dashboard.trend_eyebrow", { defaultValue: "Oxirgi 30 kun" })}
              </div>
              <h2 className="font-display text-[20px] md:text-[24px] font-medium tracking-[-0.01em] leading-[1] text-foreground">
                {t("dashboard.trend_30d")}
                <span aria-hidden className="font-display-italic text-primary">.</span>
              </h2>
            </div>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <LegendDot
                color="hsl(var(--foreground))"
                label={t("dashboard.orders_label") as string}
              />
              <LegendDot
                color="hsl(var(--primary))"
                label={t("dashboard.payments_label") as string}
              />
            </div>
          </div>
          <div className="border-t border-border/50 pt-3">
            <TimeSeriesChart
              data={trendSeries}
              showYoY
              primaryLabel={t("dashboard.orders_label") as string}
              yoyLabel={t("dashboard.payments_label") as string}
              showArea
              height={200}
            />
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pulse stat — vertical editorial cell. Hairline divider from sibling.
// ---------------------------------------------------------------------------

function PulseStat({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  isFirst,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  deltaLabel?: string;
  isFirst?: boolean;
}) {
  const cls =
    delta == null || !Number.isFinite(delta)
      ? "text-muted-foreground/60"
      : delta > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : delta < 0
      ? "text-red-700 dark:text-red-400"
      : "text-muted-foreground";
  return (
    <div className={"flex flex-col gap-1.5 min-w-0 " + (isFirst ? "md:pr-5" : "md:px-5 last:md:pr-0")}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
        {label}
      </div>
      <div className="font-display text-[24px] md:text-[28px] font-medium leading-[1] tabular-nums text-foreground">
        {value}
      </div>
      <div className="flex items-baseline gap-2 text-[10px] tabular-nums min-h-[12px]">
        {delta != null && Number.isFinite(delta) && (
          <span className={cls + " font-mono font-medium"}>{fmtPct(delta)}</span>
        )}
        {sub && (
          <span className="text-muted-foreground italic truncate">{sub}</span>
        )}
        {delta != null && Number.isFinite(delta) && deltaLabel && (
          <span className="text-muted-foreground/60 italic ml-auto md:ml-0">{deltaLabel}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spotlight — the featured year-over-year comparison block
// ---------------------------------------------------------------------------

function SpotlightCard({
  to,
  eyebrow,
  kicker,
  loading,
  error,
  children,
}: {
  to: string;
  eyebrow: string;
  kicker?: string;
  loading?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={`${eyebrow} — open`}
      className={
        "stagger-2 group relative block bg-card border rounded-2xl p-5 md:p-7 " +
        "transition-shadow hover:shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        "overflow-hidden"
      }
    >
      {/* Decorative radial wash in the top-right corner — primary-tinted,
       *  very low opacity. Adds atmosphere without being a "blob". */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 w-[180px] h-[180px] rounded-full opacity-[0.07]"
        style={{
          background:
            "radial-gradient(circle at center, hsl(var(--primary)) 0%, transparent 65%)",
        }}
      />
      <div className="relative flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <div className="eyebrow !tracking-[0.18em] flex items-baseline gap-2.5">
          <span>{eyebrow}</span>
          {kicker && (
            <>
              <span aria-hidden className="text-muted-foreground/40">·</span>
              <span className="font-mono normal-case text-[10px] text-muted-foreground/80 tabular-nums">
                {kicker}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 group-hover:text-foreground transition-colors">
          <span>{loading ? "…" : "Ochish"}</span>
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </div>
      </div>
      <div className="relative">
        {error ? <SpotlightError /> : loading ? <SpotlightSkeleton /> : children}
      </div>
    </Link>
  );
}

function SpotlightHalf({
  label,
  current,
  prior,
  yoy,
  yearPrev,
  offset,
}: {
  label: string;
  current: number | null;
  prior: number | null;
  yoy: number | null;
  yearPrev: string;
  offset?: boolean;
}) {
  const yoyCls =
    yoy == null || !Number.isFinite(yoy)
      ? "text-muted-foreground/60"
      : yoy > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : yoy < 0
      ? "text-red-700 dark:text-red-400"
      : "text-muted-foreground";
  return (
    <div className={"flex flex-col gap-2 " + (offset ? "md:pl-10" : "")}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
        {label}
      </div>
      <div className="font-display text-[36px] md:text-[44px] font-medium leading-[1] tracking-[-0.015em] tabular-nums text-foreground">
        {current != null ? "$" + fmtNum(current, true) : "—"}
      </div>
      <div className="flex items-baseline gap-2 mt-0.5 text-[11px] tabular-nums flex-wrap">
        {yoy != null && Number.isFinite(yoy) && (
          <span className={yoyCls + " text-[13px] font-mono font-medium"}>
            {fmtPct(yoy)}
          </span>
        )}
        {prior != null && yearPrev && (
          <span className="text-muted-foreground italic">
            ${fmtNum(prior, true)} <span className="text-muted-foreground/60 not-italic">({yearPrev})</span>
          </span>
        )}
      </div>
    </div>
  );
}

function SpotlightSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 md:gap-y-0 md:gap-x-10">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2 animate-pulse">
          <div className="h-3 w-16 bg-muted/40 rounded" />
          <div className="h-10 md:h-12 w-2/3 bg-muted/50 rounded" />
          <div className="h-3 w-1/2 bg-muted/30 rounded" />
        </div>
      ))}
    </div>
  );
}

function SpotlightError() {
  return (
    <div className="text-[12px] italic text-red-700 dark:text-red-400">
      Failed to load.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tile chrome — shared shell for the three secondary cards
// ---------------------------------------------------------------------------

function TileFrame({
  to,
  icon: Icon,
  eyebrow,
  kicker,
  loading,
  error,
  children,
}: {
  to: string;
  icon: LucideIcon;
  eyebrow: string;
  kicker?: string;
  loading?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={`${eyebrow} — open`}
      className={
        "group relative block bg-card border rounded-2xl p-5 min-h-[160px] " +
        "transition-shadow hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      }
    >
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          <div className="eyebrow !tracking-[0.16em] truncate">{eyebrow}</div>
          {kicker && (
            <>
              <span aria-hidden className="text-muted-foreground/40 px-0.5">·</span>
              <div className="font-mono normal-case text-[10px] text-muted-foreground/70 truncate">
                {kicker}
              </div>
            </>
          )}
        </div>
        <ArrowUpRight
          className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0"
          aria-hidden
        />
      </div>
      {error ? (
        <div className="text-[12px] italic text-red-700 dark:text-red-400">Failed to load.</div>
      ) : loading ? (
        <TileSkeleton />
      ) : (
        children
      )}
    </Link>
  );
}

function TileSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-2.5 w-20 bg-muted/40 rounded" />
      <div className="h-7 w-2/3 bg-muted/50 rounded" />
      <div className="h-2.5 w-1/2 bg-muted/30 rounded" />
      <div className="h-2.5 w-3/5 bg-muted/30 rounded mt-4" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KunlikKesim tile — MTD over forecast, two stacked stats
// ---------------------------------------------------------------------------

function KunlikKesimTile({
  data,
  loading,
  error,
  t,
}: {
  data: ProjectionResp | undefined;
  loading: boolean;
  error: boolean;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <TileFrame
      to="/dayslice"
      icon={CalendarRange}
      eyebrow={t("nav.dayslice") as string}
      kicker={t("dashboard.metric_mtd") as string}
      loading={loading}
      error={error}
    >
      <div className="space-y-3">
        <ForecastRow
          label={t("comparison.tab_sotuv") as string}
          mtd={data?.current_mtd.sotuv}
          forecast={data?.projection.sotuv.mean}
        />
        <div className="border-t border-border/40" />
        <ForecastRow
          label={t("comparison.tab_kirim") as string}
          mtd={data?.current_mtd.kirim}
          forecast={data?.projection.kirim.mean}
        />
      </div>
    </TileFrame>
  );
}

function ForecastRow({
  label,
  mtd,
  forecast,
}: {
  label: string;
  mtd: number | undefined;
  forecast: number | undefined;
}) {
  // Visual progress: how much of the projected month-end is the MTD
  // already? Capped at 100% so a high actual doesn't run off the bar.
  const pct =
    mtd != null && forecast != null && forecast > 0
      ? Math.min(1, mtd / forecast)
      : 0;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
        {label}
      </div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <div className="font-display text-[24px] font-medium leading-[1] tabular-nums text-foreground">
          {mtd != null ? "$" + fmtNum(mtd, true) : "—"}
        </div>
        <div className="text-[11px] text-muted-foreground italic font-mono">
          → ${forecast != null ? fmtNum(forecast, true) : "—"}
        </div>
      </div>
      {/* Hairline progress — MTD as fraction of forecast */}
      <div className="h-[2px] bg-muted/40 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/70 transition-all"
          style={{ width: `${(pct * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collection tile — total debt headline + 90+ days hairline bar
// ---------------------------------------------------------------------------

function CollectionTile({
  worklist,
  prepayments,
  loading,
  error,
  t,
}: {
  worklist: WorklistResp | undefined;
  prepayments: PrepaymentsResp | undefined;
  loading: boolean;
  error: boolean;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const total = worklist?.summary.total_outstanding;
  const debtors = worklist?.summary.debtor_count;
  const over90 = worklist?.summary.total_over_90;
  const over90Cnt = worklist?.summary.debtor_over_90_count;
  const prepay = prepayments?.rows.reduce((s, r) => s + (r.credit_balance ?? 0), 0);
  const over90Pct = total && over90 ? over90 / total : 0;
  return (
    <TileFrame
      to="/collection/worklist"
      icon={HandCoins}
      eyebrow={t("nav.worklist") as string}
      loading={loading}
      error={error}
    >
      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
            {t("dashboard.metric_total_debt")}
          </div>
          <div className="font-display text-[28px] md:text-[32px] font-medium leading-[1] tabular-nums text-foreground">
            {total != null ? "$" + fmtNum(total, true) : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground italic mt-1">
            {debtors != null
              ? t("dashboard.metric_debtors_n", { n: fmtCount(debtors) })
              : ""}
          </div>
        </div>

        {/* 90+ days as portion of total — single hairline bar */}
        <div>
          <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
            <span>{t("dashboard.metric_over_90")}</span>
            <span className="font-mono tabular-nums normal-case text-muted-foreground/80">
              {(over90Pct * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-[2px] bg-muted/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-destructive/70 transition-all"
              style={{ width: `${(over90Pct * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="flex items-baseline justify-between mt-1.5 text-[11px]">
            <span className="font-mono tabular-nums text-foreground">
              {over90 != null ? "$" + fmtNum(over90, true) : "—"}
            </span>
            <span className="text-muted-foreground italic">
              {over90Cnt != null
                ? t("dashboard.metric_debtors_n", { n: fmtCount(over90Cnt) })
                : ""}
            </span>
          </div>
        </div>

        {/* Prepayments — single understated line */}
        {prepay != null && prepay > 0 && (
          <div className="text-[10px] text-muted-foreground border-t border-border/40 pt-2 flex items-baseline justify-between">
            <span className="italic">{t("dashboard.metric_prepayments")}</span>
            <span className="font-mono tabular-nums text-foreground">
              ${fmtNum(prepay, true)}
            </span>
          </div>
        )}
      </div>
    </TileFrame>
  );
}

// ---------------------------------------------------------------------------
// RFM tile — 4 segments as a 2x2 mini-grid, color-toned numbers
// ---------------------------------------------------------------------------

function RfmTile({
  data,
  loading,
  error,
  t,
}: {
  data: RfmResp | undefined;
  loading: boolean;
  error: boolean;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const seg = data?.segment_distribution ?? [];
  const find = (name: string) =>
    seg.find((s) => s.segment.toLowerCase() === name.toLowerCase())?.clients ?? 0;

  type Tone = "primary" | "fg" | "amber" | "destructive";
  const cells: Array<{ key: string; label: string; n: number; tone: Tone }> = [
    { key: "champ", label: t("dashboard.rfm_champions") as string, n: find("Champions"), tone: "primary" },
    { key: "loyal", label: t("dashboard.rfm_loyal") as string, n: find("Loyal"), tone: "fg" },
    { key: "risk",  label: t("dashboard.rfm_at_risk") as string, n: find("At-Risk"), tone: "amber" },
    { key: "lost",  label: t("dashboard.rfm_lost") as string, n: find("Lost"), tone: "destructive" },
  ];
  const toneCls = (tone: Tone) =>
    tone === "primary"
      ? "text-primary"
      : tone === "amber"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "destructive"
      ? "text-destructive"
      : "text-foreground";

  return (
    <TileFrame
      to="/analytics/sales?tab=rfm"
      icon={Users}
      eyebrow={t("dashboard.section_rfm_title", { defaultValue: "RFM" }) as string}
      kicker="90 kun"
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {cells.map((c) => (
          <div key={c.key} className="min-w-0">
            <div
              className={
                "font-display text-[24px] md:text-[26px] font-medium leading-[1] tabular-nums " +
                toneCls(c.tone)
              }
            >
              {fmtCount(c.n)}
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mt-1 truncate">
              {c.label}
            </div>
          </div>
        ))}
      </div>
    </TileFrame>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}
