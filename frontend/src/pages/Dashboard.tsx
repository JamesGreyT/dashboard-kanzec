import { useQuery } from "@tanstack/react-query";
import {
  Area,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { formatTashkentNow } from "../lib/format";
import PageHeading from "../components/PageHeading";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import StatusPill, { StatusTone } from "../components/StatusPill";
import RelativeTime from "../components/RelativeTime";
import { Phrase } from "../components/Loader";

interface Overview {
  today: {
    orders:   { count: number; amount: number };
    payments: { count: number; amount: number };
  };
  yesterday: {
    orders:   { count: number; amount: number };
    payments: { amount: number };
  };
  week: { orders_amount: number };
  active_clients_30d: number;
  series_30d: { day: string; orders: number; payments: number }[];
  worker_health: {
    key: string;
    last_recent_at: string | null;
    last_deep_at: string | null;
    last_all_at: string | null;
    last_error: string | null;
    last_error_at: string | null;
  }[];
  recent_activity: {
    kind: "order" | "payment";
    ts: string;
    subject: string | null;
    amount: number | null;
  }[];
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard.overview"],
    queryFn: () => api<Overview>("/api/dashboard/overview"),
    refetchInterval: 60_000,
  });

  // Seven-day tail of the 30-day series — inlined into the lede card.
  const sparkSeries = data ? data.series_30d.slice(-7) : [];

  return (
    <div>
      <div className="">
        <PageHeading
          crumb={[t("dashboard.crumb_dashboard"), t("dashboard.crumb_overview")]}
          title={t("dashboard.title")}
          subtitle={
            <>
              <span className="font-semibold italic">{t("common.tashkent")}</span> ·{" "}
              {formatTashkentNow()}
            </>
          }
        />
      </div>

      {isError && (
        <div className="mt-6 caption text-red-700 dark:text-red-400 border-l-2 border-red-500 pl-3">
          {t("common.error")}
        </div>
      )}

      {/* Row 1 — lede (2/3) + stacked stats (1/3) */}
      <div className="mt-10 grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 items-stretch">
        <LedeOrdersCard
          value={data?.today.orders.count}
          prev={data?.yesterday.orders.count ?? 0}
          sparkline={sparkSeries}
          weekTotal={data?.week.orders_amount}
        />
        <div className="grid grid-rows-2 gap-6">
          <StatCard
            label={t("dashboard.payments_today_usd")}
            value={fmt(data?.today.payments.amount)}
            trend={pctTrend(
              data?.today.payments.amount ?? 0,
              data?.yesterday.payments.amount ?? 0,
              ` ${t("dashboard.trend_vs_yesterday")}`,
              t,
            )}
          />
          <StatCard
            label={t("dashboard.active_clients_30d")}
            value={fmt(data?.active_clients_30d)}
          />
        </div>
      </div>

      {/* Row 2 — full-width chart card */}
      <Card
        className="mt-8"
        eyebrow={t("dashboard.last_30_days")}
        title={t("dashboard.orders_and_payments")}
      >
        <ChartLegend />
        <div className="h-[280px] mt-3">
          {isLoading ? (
            <Phrase />
          ) : data ? (
            <ResponsiveContainer>
              <LineChart data={data.series_30d} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontFamily: "var(--font-mono)" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) => v.toLocaleString("en-US", { notation: "compact" })}
                />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                  content={<ChartTooltip />}
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={1.75}
                  dot={false}
                  name="orders"
                />
                <Line
                  type="monotone"
                  dataKey="payments"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.75}
                  dot={false}
                  name="payments"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </Card>

      {/* Row 3 — workers (1/3) + activity (2/3) */}
      <div className="mt-8 grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-6 items-stretch">
        <Card eyebrow={t("dashboard.report_workers")} title={t("dashboard.register")}>
          {(data?.worker_health ?? []).length === 0 && !isLoading && (
            <Phrase kind="empty" />
          )}
          <div className="flex flex-col">
            {(data?.worker_health ?? []).map((w, i, arr) => {
              const wTone = workerTone(w.last_recent_at, w.last_error_at);
              const railClass = {
                live: "bg-emerald-500",
                failed: "bg-red-500",
                quiet: "bg-muted-foreground",
                staged: "bg-amber-500",
              }[wTone];
              const failed = wTone === "failed";
              return (
                <div
                  key={w.key}
                  className={[
                    "relative pl-4 py-3",
                    i < arr.length - 1 ? "border-b border-border" : "",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className={`absolute left-0 top-3 bottom-3 w-[2px] ${railClass}`}
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs text-foreground">{w.key}</span>
                    <StatusPill tone={wTone} pulse={wTone === "live"}>
                      {failed ? t("dashboard.failed") : t("dashboard.live")}
                    </StatusPill>
                  </div>
                  <div className="mt-1 caption text-foreground/80">
                    <RelativeTime iso={w.last_recent_at ?? w.last_all_at} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card eyebrow={t("dashboard.today")} title={t("dashboard.recent_activity")}>
          {(data?.recent_activity.length ?? 0) === 0 && !isLoading && (
            <Phrase kind="empty" />
          )}
          <div className="flex flex-col">
            {(data?.recent_activity ?? []).map((a, i, arr) => (
              <div
                key={i}
                className={[
                  "relative pl-4 py-3 flex items-baseline gap-4",
                  i < arr.length - 1 ? "border-b border-border" : "",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className={[
                    "absolute left-0 top-3 bottom-3 w-[2px]",
                    a.kind === "payment" ? "bg-primary" : "bg-foreground",
                  ].join(" ")}
                />
                <span
                  className={[
                    "text-[10px] uppercase tracking-[0.12em] font-semibold shrink-0 w-[56px]",
                    a.kind === "payment"
                      ? "text-primary"
                      : "text-muted-foreground",
                  ].join(" ")}
                >
                  {t(`dashboard.kind_${a.kind}`)}
                </span>
                <span className="text-sm text-foreground truncate flex-1 min-w-0">
                  {a.subject ?? "—"}
                </span>
                {a.amount != null && (
                  <span
                    className={[
                      "font-mono text-sm tabular-nums shrink-0",
                      a.kind === "payment" ? "text-primary" : "text-foreground",
                    ].join(" ")}
                  >
                    {a.amount.toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )}
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0 w-[62px] text-right">
                  {new Date(a.ts).toLocaleTimeString("en-GB", {
                    timeZone: "Asia/Tashkent",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Lede card — the front-page story. Composes as 2 columns at xl:
 *   LEFT  → text-xs text-muted-foreground uppercase tracking-wider font-medium + italic trend + week-total marginalia
 *   RIGHT → 96px tabular number + 120px sparkline directly beneath it
 *           with a baseline hairline, 8% mark area fill, and a mark dot
 *           + halo at the rightmost point.
 * On narrower widths we fall back to the stacked layout.
 */
function LedeOrdersCard({
  value,
  prev,
  sparkline,
  weekTotal,
}: {
  value: number | undefined;
  prev: number;
  sparkline: { day: string; orders: number }[];
  weekTotal: number | undefined;
}) {
  const { t } = useTranslation();
  const trend =
    value != null
      ? deltaTrend(value, prev, ` ${t("dashboard.trend_from_yesterday")}`, t)
      : undefined;
  return (
    <Card className="relative flex flex-col min-h-[260px]" accent>
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("dashboard.orders_today")}</div>

      {/* Mobile / tablet: stacked. xl: 2-column composition. */}
      <div className="flex-1 mt-6 xl:mt-0 xl:grid xl:grid-cols-[1fr_1.4fr] xl:gap-10 xl:items-end">
        {/* LEFT — marginalia */}
        <div className="xl:pb-2 order-2 xl:order-none">
          {trend && (
            <div className="caption italic text-foreground/80 leading-relaxed">
              {trend.arrow && (
                <span
                  className={`not-italic mr-1.5 text-[15px] font-semibold ${trend.toneClass}`}
                >
                  {trend.arrow}
                </span>
              )}
              {trend.text}
            </div>
          )}
          {weekTotal != null && (
            <div className="mt-5">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("dashboard.last_7_days")}</div>
              <div className="mt-1.5 nums text-2xl text-foreground tabular-nums leading-none">
                {weekTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="caption text-muted-foreground mt-1">USD</div>
            </div>
          )}
        </div>

        {/* RIGHT — number + sparkline */}
        <div className="order-1 xl:order-none flex flex-col items-end xl:items-stretch">
          <div className="nums text-[96px] leading-none text-foreground tabular-nums self-end">
            {value != null ? value.toLocaleString() : "—"}
          </div>
          <LedeSparkline data={sparkline} />
        </div>
      </div>
    </Card>
  );
}

function LedeSparkline({ data }: { data: { day: string; orders: number }[] }) {
  if (!data.length) return <div className="h-[120px] mt-4" />;
  const last = data[data.length - 1];
  return (
    <div className="h-[120px] mt-4 relative">
      {/* Baseline hairline — the sparkline sits on "ruled paper." */}
      <div
        aria-hidden
        className="absolute left-0 right-0 bottom-0 h-px bg-rule"
      />
      <ResponsiveContainer>
        <ComposedChart
          data={data}
          margin={{ top: 6, right: 12, left: 0, bottom: 0 }}
        >
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
          <Area
            type="monotone"
            dataKey="orders"
            stroke="none"
            fill="var(--mark)"
            fillOpacity={0.08}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="orders"
            stroke="var(--mark)"
            strokeWidth={1.25}
            dot={(props) => {
              // Only render a dot at the last data point — the editorial "we are here."
              const { index, cx, cy } = props as {
                index?: number; cx?: number; cy?: number;
              };
              if (
                index !== data.length - 1 ||
                cx == null ||
                cy == null
              ) {
                return <g key={`d-${index ?? 0}`} />;
              }
              return (
                <g key="d-last">
                  <circle cx={cx} cy={cy} r={7} fill="var(--mark-bg)" />
                  <circle cx={cx} cy={cy} r={3} fill="var(--mark)" />
                </g>
              );
            }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {/* End-point label ("today's count") in small . */}
      <div className="absolute right-0 -bottom-5 caption text-muted-foreground font-mono tabular-nums">
        {last.orders.toLocaleString()}
      </div>
    </div>
  );
}

/** Editorial chart tooltip — paper card with a vermilion edge rail, text-xs text-muted-foreground uppercase tracking-wider font-medium
 *  label, and border-b border-dotted border-border flex-1 mx-2 rows per series. Matches the Drawer voice. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="relative bg-card border border-border rounded-[8px] py-2.5 pl-4 pr-4"
      style={{ minWidth: 200, boxShadow: "0 2px 8px rgba(26,23,19,0.06)" }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-primary rounded-r"
      />
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5 tabular-nums">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-baseline gap-2 py-0.5">
          <span className="caption text-foreground/80 capitalize">{p.name}</span>
          <span className="flex-1 border-b border-dotted border-border translate-y-[-3px] min-w-[8px]" />
          <span className="nums text-sm text-foreground tabular-nums">
            {p.value.toLocaleString("en-US")}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-6 caption">
      <span className="inline-flex items-center gap-2 text-foreground/80">
        <span
          aria-hidden
          className="block w-[10px] h-[2px] bg-foreground"
        />
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("dashboard.kind_order")}</span>
      </span>
      <span className="inline-flex items-center gap-2 text-foreground/80">
        <span
          aria-hidden
          className="block w-[10px] h-[2px] bg-primary"
        />
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("dashboard.kind_payment")}</span>
      </span>
    </div>
  );
}

function fmt(n: number | undefined, digits = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function deltaTrend(
  cur: number,
  prev: number,
  suffix: string,
  t: (key: string) => string,
) {
  if (prev === 0 && cur === 0) return undefined;
  const d = cur - prev;
  if (d === 0)
    return {
      arrow: "—",
      text: t("dashboard.trend_no_change_from_yesterday"),
      toneClass: "text-muted-foreground",
    };
  return {
    arrow: d > 0 ? "↗" : "↘",
    text: `${Math.abs(d).toLocaleString()}${suffix}`,
    toneClass: d > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400",
  };
}

function pctTrend(
  cur: number,
  prev: number,
  suffix: string,
  t: (key: string) => string,
) {
  if (prev === 0)
    return cur === 0
      ? undefined
      : {
          tone: "good" as const,
          arrow: "↗",
          text: `${t("dashboard.trend_new")}${suffix}`,
        };
  const pct = ((cur - prev) / prev) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0)
    return {
      tone: "quiet" as const,
      arrow: "—",
      text: t("dashboard.trend_flat_vs_yesterday"),
    };
  return {
    tone: rounded > 0 ? ("good" as const) : ("risk" as const),
    arrow: rounded > 0 ? "↗" : "↘",
    text: `${Math.abs(rounded)}%${suffix}`,
  };
}

function workerTone(lastOk: string | null, lastErr: string | null): StatusTone {
  if (!lastOk) return "quiet";
  if (lastErr && recentErr({ last_error_at: lastErr, last_recent_at: lastOk } as WorkerHealthLike))
    return "failed";
  return "live";
}

interface WorkerHealthLike {
  last_error_at: string | null;
  last_recent_at: string | null;
}

function recentErr(w: WorkerHealthLike) {
  if (!w.last_error_at) return false;
  if (!w.last_recent_at) return true;
  return new Date(w.last_error_at) > new Date(w.last_recent_at);
}
