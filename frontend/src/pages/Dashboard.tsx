import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarRange,
  HandCoins,
  Layers,
} from "lucide-react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { last90Days } from "../lib/dashboardWindow";
import PageHeading from "../components/PageHeading";
import MetricCard, { fmtNum, fmtCount, fmtPct } from "../components/MetricCard";
import TimeSeriesChart, { type SeriesPoint } from "../components/TimeSeriesChart";
import SectionCard from "../components/SectionCard";

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
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    document.title = t("dashboard.title", { defaultValue: "Dashboard" }) + " · Kanzec";
  }, [t]);

  // -------------------------------------------------------------------------
  // Top strip + 30d trend — single overview endpoint
  // -------------------------------------------------------------------------
  const overviewQ = useQuery({
    queryKey: ["dashboard.overview"],
    queryFn: () => api<OverviewResp>("/api/dashboard/overview"),
    staleTime: 60_000,
  });

  // -------------------------------------------------------------------------
  // Section tiles — independent useQuery per tile so loading/error state
  // doesn't cascade across the grid.
  // -------------------------------------------------------------------------
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
  // Derived shapes
  // -------------------------------------------------------------------------

  const trendSeries: SeriesPoint[] = useMemo(() => {
    const data = overviewQ.data?.series_30d ?? [];
    return data.map((p) => ({ date: p.day, value: p.orders, yoy: p.payments }));
  }, [overviewQ.data]);

  const todayDelta = (a: number | undefined, b: number | undefined) => {
    if (a == null || b == null || b === 0) return null;
    return a / b - 1;
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div>
      <PageHeading
        crumb={[t("dashboard.title", { defaultValue: "Dashboard" })]}
        title={t("dashboard.title", { defaultValue: "Dashboard" })}
        subtitle={t("dashboard.subtitle", {
          defaultValue:
            "Bugungi ko'rsatkichlar, asosiy bo'limlarning qisqa hisobotlari va tezkor navigatsiya.",
        })}
      />

      {/* Today strip — 4-up on desktop, 2-up on mobile */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-10">
        <MetricCard
          label={t("dashboard.today_orders", { defaultValue: "Today's orders" })}
          value={"$" + fmtNum(overviewQ.data?.today.orders.amount ?? 0, true)}
          unit={fmtCount(overviewQ.data?.today.orders.count ?? 0) + " " + t("dashboard.orders_unit", { defaultValue: "deals" })}
          delta={todayDelta(
            overviewQ.data?.today.orders.amount,
            overviewQ.data?.yesterday.orders.amount,
          )}
          deltaLabel={t("dashboard.vs_yesterday", { defaultValue: "vs yesterday" })}
        />
        <MetricCard
          label={t("dashboard.today_payments", { defaultValue: "Today's payments" })}
          value={"$" + fmtNum(overviewQ.data?.today.payments.amount ?? 0, true)}
          unit={fmtCount(overviewQ.data?.today.payments.count ?? 0) + " " + t("dashboard.payments_unit", { defaultValue: "tx" })}
          delta={todayDelta(
            overviewQ.data?.today.payments.amount,
            overviewQ.data?.yesterday.payments.amount,
          )}
          deltaLabel={t("dashboard.vs_yesterday", { defaultValue: "vs yesterday" })}
        />
        <MetricCard
          label={t("dashboard.week_orders", { defaultValue: "This week orders" })}
          value={"$" + fmtNum(overviewQ.data?.week.orders_amount ?? 0, true)}
          hint={t("dashboard.week_hint", { defaultValue: "rolling 7 days" })}
        />
        <MetricCard
          label={t("dashboard.active_30d", { defaultValue: "Active clients (30d)" })}
          value={fmtCount(overviewQ.data?.active_clients_30d ?? 0)}
          hint={t("dashboard.active_30d_hint", {
            defaultValue: "distinct clients with deliveries",
          })}
        />
      </section>

      {/* Section grid — Taqqoslash, Kunlik kesim (admin), Collection, RFM */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-10">
        <SectionCard
          to="/analytics/comparison"
          icon={Layers}
          title={t("nav.comparison", { defaultValue: "Comparison" })}
          subtitle={t("dashboard.section_comparison_subtitle", {
            defaultValue: "Sotuv va Kirim hozirgi yil vs o'tgan yil",
          })}
          loading={sotuvCmpQ.isLoading || kirimCmpQ.isLoading}
          error={!!sotuvCmpQ.error || !!kirimCmpQ.error}
        >
          <ComparisonTileBody sotuv={sotuvCmpQ.data} kirim={kirimCmpQ.data} t={t} />
        </SectionCard>

        {isAdmin && (
          <SectionCard
            to="/dayslice"
            icon={CalendarRange}
            title={t("nav.dayslice", { defaultValue: "Day-slice" })}
            subtitle={t("dashboard.section_dayslice_subtitle", {
              defaultValue: "Joriy oyning oxiriga prognoz",
            })}
            loading={projectionQ.isLoading}
            error={!!projectionQ.error}
          >
            <ProjectionTileBody data={projectionQ.data} t={t} />
          </SectionCard>
        )}

        <SectionCard
          to="/collection/worklist"
          icon={HandCoins}
          title={t("nav.worklist", { defaultValue: "Collection" })}
          subtitle={t("dashboard.section_collection_subtitle", {
            defaultValue: "Qarzdorlik va oldindan to'lovlar",
          })}
          loading={worklistQ.isLoading || prepaymentsQ.isLoading}
          error={!!worklistQ.error || !!prepaymentsQ.error}
        >
          <CollectionTileBody
            worklist={worklistQ.data}
            prepayments={prepaymentsQ.data}
            t={t}
          />
        </SectionCard>

        <SectionCard
          to="/analytics/sales?tab=rfm"
          icon={BarChart3}
          title={t("dashboard.section_rfm_title", { defaultValue: "RFM" })}
          subtitle={t("dashboard.section_rfm_subtitle", {
            defaultValue: "So'nggi 90 kun bo'yicha mijoz segmentlari",
          })}
          loading={rfmQ.isLoading}
          error={!!rfmQ.error}
        >
          <RfmTileBody data={rfmQ.data} t={t} />
        </SectionCard>
      </section>

      {/* 30-day trend */}
      {trendSeries.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] text-foreground mb-3">
            {t("dashboard.trend_30d", { defaultValue: "30-day trend" })}
            <span aria-hidden className="font-display-italic text-primary ml-[2px]">.</span>
          </h2>
          <div className="bg-card border rounded-2xl shadow-soft p-4">
            <TimeSeriesChart
              data={trendSeries}
              showYoY
              primaryLabel={t("dashboard.orders_label", { defaultValue: "Orders" })}
              yoyLabel={t("dashboard.payments_label", { defaultValue: "Payments" })}
              showArea
              height={260}
            />
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tile bodies — kept inline, not separate files (small + only used here)
// ---------------------------------------------------------------------------

function ComparisonTileBody({
  sotuv,
  kirim,
  t,
}: {
  sotuv: ComparisonResp | undefined;
  kirim: ComparisonResp | undefined;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const sotuvNow = sotuv?.totals.values.at(-1) ?? null;
  const sotuvYoY = sotuv?.totals.trend_delta_pct ?? null;
  const kirimNow = kirim?.totals.values.at(-1) ?? null;
  const kirimYoY = kirim?.totals.trend_delta_pct ?? null;
  const yearLabel = sotuv?.columns.at(-1) ?? new Date().getFullYear().toString();
  return (
    <div className="grid grid-cols-2 gap-3">
      <KpiBlock
        label={t("comparison.tab_sotuv", { defaultValue: "Sotuv" })}
        sub={yearLabel}
        value={sotuvNow != null ? "$" + fmtNum(sotuvNow, true) : "—"}
        delta={sotuvYoY}
      />
      <KpiBlock
        label={t("comparison.tab_kirim", { defaultValue: "Kirim" })}
        sub={yearLabel}
        value={kirimNow != null ? "$" + fmtNum(kirimNow, true) : "—"}
        delta={kirimYoY}
      />
    </div>
  );
}

function ProjectionTileBody({
  data,
  t,
}: {
  data: ProjectionResp | undefined;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const sMtd = data?.current_mtd.sotuv;
  const kMtd = data?.current_mtd.kirim;
  const sMean = data?.projection.sotuv.mean;
  const kMean = data?.projection.kirim.mean;
  return (
    <div className="grid grid-cols-2 gap-3">
      <KpiBlock
        label={t("comparison.tab_sotuv", { defaultValue: "Sotuv" })}
        sub={t("dashboard.metric_mtd", { defaultValue: "MTD" })}
        value={sMtd != null ? "$" + fmtNum(sMtd, true) : "—"}
        hint={
          sMean != null
            ? t("dashboard.metric_projection", {
                defaultValue: "≈ ${{n}} forecast",
                n: fmtNum(sMean, true),
              }) as string
            : undefined
        }
      />
      <KpiBlock
        label={t("comparison.tab_kirim", { defaultValue: "Kirim" })}
        sub={t("dashboard.metric_mtd", { defaultValue: "MTD" })}
        value={kMtd != null ? "$" + fmtNum(kMtd, true) : "—"}
        hint={
          kMean != null
            ? t("dashboard.metric_projection", {
                defaultValue: "≈ ${{n}} forecast",
                n: fmtNum(kMean, true),
              }) as string
            : undefined
        }
      />
    </div>
  );
}

function CollectionTileBody({
  worklist,
  prepayments,
  t,
}: {
  worklist: WorklistResp | undefined;
  prepayments: PrepaymentsResp | undefined;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const total = worklist?.summary.total_outstanding;
  const debtors = worklist?.summary.debtor_count;
  const over90 = worklist?.summary.total_over_90;
  const over90Cnt = worklist?.summary.debtor_over_90_count;
  const prepay = prepayments?.rows.reduce((s, r) => s + (r.credit_balance ?? 0), 0);
  return (
    <div className="grid grid-cols-2 gap-3">
      <KpiBlock
        label={t("dashboard.metric_total_debt", { defaultValue: "Total debt" })}
        sub={
          debtors != null
            ? (t("dashboard.metric_debtors_n", {
                defaultValue: "{{n}} debtors",
                n: fmtCount(debtors),
              }) as string)
            : ""
        }
        value={total != null ? "$" + fmtNum(total, true) : "—"}
      />
      <KpiBlock
        label={t("dashboard.metric_over_90", { defaultValue: "90+ days" })}
        sub={
          over90Cnt != null
            ? (t("dashboard.metric_debtors_n", {
                defaultValue: "{{n}} debtors",
                n: fmtCount(over90Cnt),
              }) as string)
            : ""
        }
        value={over90 != null ? "$" + fmtNum(over90, true) : "—"}
      />
      <KpiBlock
        label={t("dashboard.metric_prepayments", { defaultValue: "Prepayments" })}
        sub={
          prepayments?.total != null
            ? (t("dashboard.metric_clients_n", {
                defaultValue: "{{n}} clients",
                n: fmtCount(prepayments.total),
              }) as string)
            : ""
        }
        value={prepay != null && prepay > 0 ? "$" + fmtNum(prepay, true) : "—"}
      />
    </div>
  );
}

function RfmTileBody({
  data,
  t,
}: {
  data: RfmResp | undefined;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const seg = data?.segment_distribution ?? [];
  const find = (name: string) =>
    seg.find((s) => s.segment.toLowerCase() === name.toLowerCase())?.clients ?? 0;
  const cells: Array<{ key: string; label: string; n: number; tone: string }> = [
    {
      key: "champions",
      label: t("dashboard.rfm_champions", { defaultValue: "Champions" }),
      n: find("Champions"),
      tone: "text-emerald-700 dark:text-emerald-400",
    },
    {
      key: "loyal",
      label: t("dashboard.rfm_loyal", { defaultValue: "Loyal" }),
      n: find("Loyal"),
      tone: "text-foreground",
    },
    {
      key: "atrisk",
      label: t("dashboard.rfm_at_risk", { defaultValue: "At-Risk" }),
      n: find("At-Risk"),
      tone: "text-amber-700 dark:text-amber-400",
    },
    {
      key: "lost",
      label: t("dashboard.rfm_lost", { defaultValue: "Lost" }),
      n: find("Lost"),
      tone: "text-red-700 dark:text-red-400",
    },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {cells.map((c) => (
        <div key={c.key} className="flex flex-col gap-0.5 min-w-0">
          <div className={"font-display text-[26px] font-medium leading-[1] tabular-nums " + c.tone}>
            {fmtCount(c.n)}
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground truncate">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared mini-KPI block — used inside section tiles
// ---------------------------------------------------------------------------

function KpiBlock({
  label,
  sub,
  value,
  delta,
  hint,
}: {
  label: string;
  sub?: string;
  value: string;
  delta?: number | null;
  hint?: string;
}) {
  const deltaCls =
    delta == null
      ? "text-muted-foreground/60"
      : delta > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : delta < 0
      ? "text-red-700 dark:text-red-400"
      : "text-muted-foreground";
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground flex items-baseline gap-1.5">
        <span>{label}</span>
        {sub && <span className="font-mono normal-case text-muted-foreground/70">{sub}</span>}
      </div>
      <div className="font-display text-[28px] md:text-[30px] font-medium leading-[1.05] tabular-nums text-foreground">
        {value}
      </div>
      {(delta != null || hint) && (
        <div className="text-[11px] font-mono tabular-nums">
          {delta != null && <span className={deltaCls}>{fmtPct(delta)} </span>}
          {hint && <span className="text-muted-foreground italic">{hint}</span>}
        </div>
      )}
    </div>
  );
}
