/**
 * Boshqaruv paneli — Editorial Restraint redesign (PR-B).
 *
 * Same direction as DebtWorklist: Fraunces serif moments, hairline
 * rules between sections, no card chrome on spotlight or tile grid.
 * Hero masthead with mint bloom + count-up. Pulse strip stays
 * editorial-band style with vertical hairlines. Spotlight Taqqoslash
 * dissolved into hairline composition. KunlikKesim / Collection / RFM
 * become 3 typographic blocks separated by hairlines, not chunky cards.
 * 30-day trend retuned with editorial header.
 */
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
import { fmtCount, fmtPct } from "../components/MetricCard";
import TimeSeriesChart, { type SeriesPoint } from "../components/TimeSeriesChart";

// ---------------------------------------------------------------------------
// Response types (unchanged)
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
// Formatters
// ---------------------------------------------------------------------------

/** Compact USD: $1.2M, $580K, $22. No cents for hero displays. */
function fmtUsdCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/** Uzbek weekday + date string. "DUSHANBA · 2 MAY 2026" */
function formatDateEyebrow(): string {
  const now = new Date();
  const weekdays = ["YAKSHANBA", "DUSHANBA", "SESHANBA", "CHORSHANBA", "PAYSHANBA", "JUMA", "SHANBA"];
  const months = ["YANVAR", "FEVRAL", "MART", "APREL", "MAY", "IYUN", "IYUL", "AVGUST", "SENTYABR", "OKTYABR", "NOYABR", "DEKABR"];
  return `${weekdays[now.getDay()]} · ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    document.title = t("dashboard.title", { defaultValue: "Dashboard" }) + " · Kanzec";
  }, [t]);

  // -------------------------------------------------------------------------
  // Queries (verbatim — same keys, same query strings, same staleTime)
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

  // Hero number: today's payment amount (compact)
  const heroPayAmt = overviewQ.data?.today.payments.amount;
  const heroPayCnt = overviewQ.data?.today.payments.count;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="relative pb-20">

      {/* ============================================================
          1. MASTHEAD — editorial hero with mint bloom
          ============================================================ */}
      <header className="relative pt-2 pb-12 md:pt-6 md:pb-16">
        <span aria-hidden className="masthead-bloom" />

        <div className="relative">
          {/* Eyebrow — date + breadcrumb, DM Mono uppercase */}
          <div className="text-[10px] md:text-[11px] font-mono uppercase tracking-[0.22em] text-ink3 mb-6 md:mb-8">
            <span className="text-ink2">{formatDateEyebrow()}</span>
            <span className="mx-3 text-ink4">/</span>
            <span>{t("dashboard.crumb_dashboard", { defaultValue: "Boshqaruv paneli" })}</span>
          </div>

          {/* HERO ROW — title left (7 cols), today's pulse right (5 cols) */}
          <div className="grid grid-cols-12 gap-y-10 md:gap-y-0 gap-x-8 md:items-end">

            {/* Left — Fraunces title + standfirst */}
            <div className="col-span-12 md:col-span-7">
              <h1 className="hero-title text-[56px] md:text-[96px] text-ink count-up">
                Boshqaruv paneli
              </h1>
              <p className="standfirst mt-4 md:mt-5 max-w-[42ch] md:max-w-[52ch]">
                {t("dashboard.subtitle")}
              </p>
            </div>

            {/* Right — today's payment pulse */}
            <div className="col-span-12 md:col-span-5">
              <hr className="hairline mb-6 md:hidden" aria-hidden />
              <div className="md:text-right md:pl-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink3 mb-3">
                  {t("dashboard.pulse_label", { defaultValue: "Bugungi puls" })}
                </div>
                <div className="hero-num text-[56px] md:text-[68px] text-ink count-up leading-[0.95]">
                  {heroPayAmt != null ? fmtUsdCompact(heroPayAmt) : "—"}
                </div>
                <div className="mt-4 flex md:justify-end items-center gap-2.5 text-[12px] font-mono tracking-[0.02em] text-ink3">
                  <span className="dot-live" />
                  <span>{t("dashboard.today_payments")}</span>
                  {heroPayCnt != null && (
                    <>
                      <span className="text-ink4">·</span>
                      <span className="text-ink2 font-semibold">
                        {fmtCount(heroPayCnt)} ta
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================
          2. PULSE STRIP — editorial-band, 4 cells with vertical hairlines
          ============================================================ */}
      <section
        className="editorial-band relative reveal-up"
        style={{ animationDelay: "160ms" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4">
          <PulseStat
            label={t("dashboard.today_orders")}
            value={overviewQ.data ? fmtUsdCompact(overviewQ.data.today.orders.amount) : "—"}
            sub={overviewQ.data ? fmtCount(overviewQ.data.today.orders.count) + " " + t("dashboard.orders_unit") : ""}
            delta={todayDelta(
              overviewQ.data?.today.orders.amount,
              overviewQ.data?.yesterday.orders.amount,
            )}
            deltaLabel={t("dashboard.vs_yesterday") as string}
            position="first"
          />
          <div className="hairline-v hidden md:block" aria-hidden />
          <PulseStat
            label={t("dashboard.today_payments")}
            value={overviewQ.data ? fmtUsdCompact(overviewQ.data.today.payments.amount) : "—"}
            sub={overviewQ.data ? fmtCount(overviewQ.data.today.payments.count) + " " + t("dashboard.payments_unit") : ""}
            delta={todayDelta(
              overviewQ.data?.today.payments.amount,
              overviewQ.data?.yesterday.payments.amount,
            )}
            deltaLabel={t("dashboard.vs_yesterday") as string}
            position="mid"
          />
          <div className="hairline-v hidden md:block" aria-hidden />
          <PulseStat
            label={t("dashboard.week_orders")}
            value={overviewQ.data ? fmtUsdCompact(overviewQ.data.week.orders_amount) : "—"}
            sub={t("dashboard.week_hint") as string}
            position="mid"
          />
          <div className="hairline-v hidden md:block" aria-hidden />
          <PulseStat
            label={t("dashboard.active_30d")}
            value={overviewQ.data ? fmtCount(overviewQ.data.active_clients_30d) : "—"}
            sub={t("dashboard.active_30d_hint") as string}
            position="last"
          />
        </div>
      </section>

      {/* ============================================================
          3. SPOTLIGHT — Taqqoslash, dissolved hairline composition
          ============================================================ */}
      <section
        className="mt-16 md:mt-24 reveal-up"
        style={{ animationDelay: "220ms" }}
      >
        {/* Section eyebrow row with inline link */}
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3 mb-2">
              Taqqoslash
            </div>
            <h2 className="hero-title text-[24px] md:text-[28px] text-ink">
              {yearPrev && yearNow ? `${yearPrev} → ${yearNow}` : "Taqqoslash"}
            </h2>
          </div>
          <Link
            to="/analytics/comparison"
            aria-label="Taqqoslash sahifasini ochish"
            className="group flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-ink3 hover:text-ink transition-colors pb-1"
          >
            <span>Ochish</span>
            <ArrowUpRight
              className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
              aria-hidden
            />
          </Link>
        </div>

        <hr className="hairline-mint mb-8" aria-hidden />

        {sotuvCmpQ.isLoading || kirimCmpQ.isLoading ? (
          <SpotlightSkeleton />
        ) : sotuvCmpQ.error || kirimCmpQ.error ? (
          <p className="text-[12px] italic text-coraldk">Yuklab bo'lmadi.</p>
        ) : (
          /* Two halves — vertical hairline divider at md+ */
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1px_1fr] gap-y-10 md:gap-y-0">
            <SpotlightHalf
              label={t("comparison.tab_sotuv") as string}
              current={sotuvCmpQ.data?.totals.values.at(-1) ?? null}
              prior={sotuvCmpQ.data?.totals.values.at(-2) ?? null}
              yoy={sotuvCmpQ.data?.totals.trend_delta_pct ?? null}
              yearPrev={yearPrev}
            />
            <div className="hairline-v hidden md:block" aria-hidden />
            <SpotlightHalf
              label={t("comparison.tab_kirim") as string}
              current={kirimCmpQ.data?.totals.values.at(-1) ?? null}
              prior={kirimCmpQ.data?.totals.values.at(-2) ?? null}
              yoy={kirimCmpQ.data?.totals.trend_delta_pct ?? null}
              yearPrev={yearPrev}
              indent
            />
          </div>
        )}
      </section>

      {/* ============================================================
          4. TILE ROW — KunlikKesim / Collection / RFM
          Dissolved sections side-by-side (md+), stacked mobile.
          Hairline rules separate tiles vertically (md) / horizontally (mobile).
          ============================================================ */}
      <section
        className="mt-16 md:mt-24 reveal-up"
        style={{ animationDelay: "280ms" }}
      >
        {/* Section header */}
        <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3 mb-4">
          Ko'rsatkichlar
        </div>
        <hr className="hairline mb-0" aria-hidden />

        {/* Tiles */}
        <div
          className={[
            "grid",
            isAdmin
              ? "grid-cols-1 md:grid-cols-[1fr_1px_1fr_1px_1fr]"
              : "grid-cols-1 md:grid-cols-[1fr_1px_1fr]",
          ].join(" ")}
        >
          {isAdmin && (
            <>
              <KunlikKesimTile
                data={projectionQ.data}
                loading={projectionQ.isLoading}
                error={!!projectionQ.error}
                t={t}
              />
              <div className="hairline-v hidden md:block" aria-hidden />
            </>
          )}

          <CollectionTile
            worklist={worklistQ.data}
            prepayments={prepaymentsQ.data}
            loading={worklistQ.isLoading || prepaymentsQ.isLoading}
            error={!!worklistQ.error || !!prepaymentsQ.error}
            t={t}
          />

          <div className="hairline-v hidden md:block" aria-hidden />

          <RfmTile
            data={rfmQ.data}
            loading={rfmQ.isLoading}
            error={!!rfmQ.error}
            t={t}
          />
        </div>
      </section>

      {/* ============================================================
          5. TREND — editorial header + borderless chart wrapper
          ============================================================ */}
      {trendSeries.length > 0 && (
        <section
          className="mt-16 md:mt-24 reveal-up"
          style={{ animationDelay: "340ms" }}
        >
          {/* Header */}
          <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3 mb-2">
                {t("dashboard.trend_eyebrow", { defaultValue: "Oxirgi 30 kun" })}
              </div>
              <h2 className="hero-title text-[26px] md:text-[34px] text-ink">
                30 kunlik trend
              </h2>
              <p className="standfirst mt-2 text-[14px]">
                Sotuv va to'lov yo'naltirilgan dinamikasi.
              </p>
            </div>
            {/* Legend — right-aligned, inline */}
            <div className="flex items-center gap-5 text-[10px] font-mono uppercase tracking-[0.16em] text-ink3 pb-1">
              <LegendDot
                color="#111827"
                label={t("dashboard.orders_label") as string}
              />
              <LegendDot
                color="#10B981"
                label={t("dashboard.payments_label") as string}
              />
            </div>
          </div>

          <hr className="hairline mb-5" aria-hidden />

          {/* Chart — no card wrapper, pure editorial canvas */}
          <TimeSeriesChart
            data={trendSeries}
            showYoY
            primaryLabel={t("dashboard.orders_label") as string}
            yoyLabel={t("dashboard.payments_label") as string}
            showArea
            height={200}
          />
        </section>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// ---------------------------------------------------------------------------
// PulseStat — editorial cell inside the band
// ---------------------------------------------------------------------------

function PulseStat({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  position = "mid",
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  deltaLabel?: string;
  position?: "first" | "mid" | "last";
}) {
  const deltaCls =
    delta == null || !Number.isFinite(delta)
      ? "text-ink4"
      : delta > 0
      ? "text-mintdk"
      : delta < 0
      ? "text-coraldk"
      : "text-ink3";

  const paddingCls =
    position === "first"
      ? "px-0 py-6 md:pr-7 md:pl-0"
      : position === "last"
      ? "px-0 py-6 md:px-7 md:pr-0"
      : "px-0 py-6 md:px-7";

  return (
    <div className={`flex flex-col min-w-0 ${paddingCls}`}>
      <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3 mb-3">
        {label}
      </div>
      <div className="hero-num text-[28px] md:text-[36px] text-ink count-up">
        {value}
      </div>
      <div className="flex items-baseline gap-2 mt-3 text-[11px] font-mono min-h-[14px] flex-wrap">
        {delta != null && Number.isFinite(delta) && (
          <span className={`${deltaCls} font-semibold`}>
            {fmtPct(delta)}
          </span>
        )}
        {sub && (
          <span className="text-ink3 italic tracking-[0.02em] truncate">{sub}</span>
        )}
        {delta != null && Number.isFinite(delta) && deltaLabel && (
          <span className="text-ink4 italic ml-auto md:ml-0">{deltaLabel}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpotlightHalf — one side of the Taqqoslash composition
// ---------------------------------------------------------------------------

function SpotlightHalf({
  label,
  current,
  prior,
  yoy,
  yearPrev,
  indent,
}: {
  label: string;
  current: number | null;
  prior: number | null;
  yoy: number | null;
  yearPrev: string;
  indent?: boolean;
}) {
  const yoyCls =
    yoy == null || !Number.isFinite(yoy)
      ? "text-ink4"
      : yoy > 0
      ? "text-mintdk"
      : yoy < 0
      ? "text-coraldk"
      : "text-ink3";

  return (
    <div className={`flex flex-col gap-3 ${indent ? "md:pl-10" : ""}`}>
      <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3">
        {label}
      </div>
      <div className="hero-num text-[48px] md:text-[68px] text-ink count-up">
        {current != null ? fmtUsdCompact(current) : "—"}
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        {yoy != null && Number.isFinite(yoy) && (
          <span className={`${yoyCls} font-mono font-semibold text-[14px]`}>
            {fmtPct(yoy)}
          </span>
        )}
        {prior != null && yearPrev && (
          <span className="standfirst text-[14px] text-ink3">
            {fmtUsdCompact(prior)}{" "}
            <span className="not-italic font-mono text-ink4 text-[11px] tracking-[0.02em]">
              ({yearPrev})
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function SpotlightSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 md:gap-y-0 gap-x-10">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 animate-pulse">
          <div className="h-2.5 w-14 bg-ink/[0.07] rounded" />
          <div className="h-14 md:h-16 w-2/3 bg-ink/[0.08] rounded" />
          <div className="h-3 w-1/2 bg-ink/[0.05] rounded" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dissolved tile — shared editorial shell (no card chrome)
// ---------------------------------------------------------------------------

function TileShell({
  to,
  icon: Icon,
  eyebrow,
  loading,
  error,
  children,
}: {
  to: string;
  icon: LucideIcon;
  eyebrow: string;
  loading?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={`${eyebrow} — ochish`}
      className="group row-editorial block py-8 px-0 md:px-8 first:md:pl-0 last:md:pr-0 outline-none focus-visible:ring-2 focus-visible:ring-mint rounded-sm border-b md:border-b-0 border-ink/[0.06] last:border-b-0"
    >
      {/* Tile eyebrow */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon
            className="w-3.5 h-3.5 text-ink3 shrink-0"
            strokeWidth={1.8}
            aria-hidden
          />
          <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3">
            {eyebrow}
          </span>
        </div>
        <ArrowUpRight
          className="w-3.5 h-3.5 text-ink4 group-hover:text-ink transition-colors shrink-0"
          aria-hidden
        />
      </div>

      {error ? (
        <p className="text-[12px] italic text-coraldk">Yuklab bo'lmadi.</p>
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
    <div className="space-y-3 animate-pulse">
      <div className="h-2.5 w-20 bg-ink/[0.07] rounded" />
      <div className="h-8 w-2/3 bg-ink/[0.08] rounded" />
      <div className="h-2.5 w-1/2 bg-ink/[0.05] rounded" />
      <div className="h-[3px] w-full bg-ink/[0.05] rounded-full mt-3" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KunlikKesim tile — MTD over forecast, two stacked typographic stats
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
    <TileShell
      to="/dayslice"
      icon={CalendarRange}
      eyebrow={t("nav.dayslice") as string}
      loading={loading}
      error={error}
    >
      <h3 className="hero-title text-[22px] md:text-[26px] text-ink mb-5">
        {t("dashboard.metric_mtd")}
      </h3>

      <div className="space-y-5">
        <ForecastRow
          label={t("comparison.tab_sotuv") as string}
          mtd={data?.current_mtd.sotuv}
          forecast={data?.projection.sotuv.mean}
        />
        <hr className="hairline" aria-hidden />
        <ForecastRow
          label={t("comparison.tab_kirim") as string}
          mtd={data?.current_mtd.kirim}
          forecast={data?.projection.kirim.mean}
        />
      </div>
    </TileShell>
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
  const pct =
    mtd != null && forecast != null && forecast > 0
      ? Math.min(1, mtd / forecast)
      : 0;

  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3 mb-2">
        {label}
      </div>
      <div className="flex items-baseline gap-2.5 mb-2.5">
        <span className="hero-num text-[24px] md:text-[28px] text-ink">
          {mtd != null ? fmtUsdCompact(mtd) : "—"}
        </span>
        <span className="standfirst text-[13px] text-ink3">
          → {forecast != null ? fmtUsdCompact(forecast) : "—"}
        </span>
      </div>
      {/* Hairline progress bar */}
      <div
        className="rounded-full overflow-hidden"
        style={{ background: "rgba(17,24,39,0.06)", height: 3 }}
      >
        <div
          className="h-full rounded-full draw-in-w bg-mint"
          style={{ width: `${(pct * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collection tile — debt headline + 90+ hairline progress bar
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
    <TileShell
      to="/collection/worklist"
      icon={HandCoins}
      eyebrow={t("nav.debt_clients") as string}
      loading={loading}
      error={error}
    >
      {/* Hero debt number */}
      <h3 className="hero-num text-[36px] md:text-[44px] text-ink count-up mb-1">
        {total != null ? fmtUsdCompact(total) : "—"}
      </h3>
      <div className="text-[11px] font-mono text-ink3 tracking-[0.04em] mb-5">
        {debtors != null
          ? t("dashboard.metric_debtors_n", { n: fmtCount(debtors) })
          : ""}
      </div>

      {/* 90+ as fraction of total — mint hairline progress bar */}
      <div className="mb-1.5 flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.18em] text-ink3">
        <span>{t("dashboard.metric_over_90")}</span>
        <span className="text-coraldk font-semibold">
          {(over90Pct * 100).toFixed(0)}%
        </span>
      </div>
      <div
        className="rounded-full overflow-hidden mb-2"
        style={{ background: "rgba(17,24,39,0.06)", height: 3 }}
      >
        <div
          className="h-full rounded-full draw-in-w"
          style={{
            width: `${(over90Pct * 100).toFixed(1)}%`,
            background: "#F87171",
          }}
        />
      </div>
      <div className="flex items-baseline justify-between text-[12px] font-mono">
        <span className="text-coraldk font-semibold">
          {over90 != null ? fmtUsdCompact(over90) : "—"}
        </span>
        <span className="text-ink3 tracking-[0.02em]">
          {over90Cnt != null
            ? t("dashboard.metric_debtors_n", { n: fmtCount(over90Cnt) })
            : ""}
        </span>
      </div>

      {/* Prepayments — understated italic line */}
      {prepay != null && prepay > 0 && (
        <div className="mt-4 pt-3 border-t border-ink/[0.06] flex items-baseline justify-between text-[11px]">
          <span className="standfirst text-[12px] text-ink3">
            {t("dashboard.metric_prepayments")}
          </span>
          <span className="font-mono text-mintdk font-semibold tracking-[0.02em]">
            {fmtUsdCompact(prepay)}
          </span>
        </div>
      )}
    </TileShell>
  );
}

// ---------------------------------------------------------------------------
// RFM tile — 4 segments as typographic list, color-toned Fraunces numbers
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

  type Tone = "mint" | "ink" | "amber" | "coral";
  const cells: Array<{ key: string; label: string; n: number; tone: Tone }> = [
    { key: "champ", label: t("dashboard.rfm_champions") as string, n: find("Champions"), tone: "mint" },
    { key: "loyal", label: t("dashboard.rfm_loyal") as string,     n: find("Loyal"),      tone: "ink" },
    { key: "risk",  label: t("dashboard.rfm_at_risk") as string,   n: find("At-Risk"),    tone: "amber" },
    { key: "lost",  label: t("dashboard.rfm_lost") as string,      n: find("Lost"),       tone: "coral" },
  ];

  const numCls = (tone: Tone) =>
    tone === "mint"
      ? "text-mintdk"
      : tone === "amber"
      ? "text-[#B45309]"
      : tone === "coral"
      ? "text-coraldk"
      : "text-ink";

  return (
    <TileShell
      to="/analytics/sales?tab=rfm"
      icon={Users}
      eyebrow={t("dashboard.section_rfm_title", { defaultValue: "RFM" }) as string}
      loading={loading}
      error={error}
    >
      <h3 className="hero-title text-[22px] md:text-[26px] text-ink mb-5">
        90 kunlik RFM
      </h3>

      <div className="space-y-0">
        {cells.map((c, i) => (
          <div
            key={c.key}
            className={[
              "flex items-baseline justify-between py-3",
              i < cells.length - 1 ? "border-b border-ink/[0.05]" : "",
            ].join(" ")}
          >
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink3">
              {c.label}
            </span>
            <span className={`hero-num text-[22px] md:text-[26px] ${numCls(c.tone)}`}>
              {fmtCount(c.n)}
            </span>
          </div>
        ))}
      </div>
    </TileShell>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}
