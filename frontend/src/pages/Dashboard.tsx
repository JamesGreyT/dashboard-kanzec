import { useQuery } from "@tanstack/react-query";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
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
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard.overview"],
    queryFn: () => api<Overview>("/api/dashboard/overview"),
    refetchInterval: 60_000,
  });

  // Seven-day tail of the 30-day series — inlined into the lede card.
  const sparkSeries = data ? data.series_30d.slice(-7) : [];

  return (
    <div>
      <PageHeading
        crumb={[t("dashboard.crumb_dashboard"), t("dashboard.crumb_overview")]}
        title={t("dashboard.title")}
        subtitle={
          <>
            <span className="serif-italic">{t("common.tashkent")}</span> ·{" "}
            {new Date().toLocaleString(i18n.resolvedLanguage || "en-GB", {
              timeZone: "Asia/Tashkent",
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </>
        }
      />

      {isError && (
        <div className="mt-6 caption text-risk border-l-2 border-risk pl-3">
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
        <div className="h-[280px]">
          {isLoading ? (
            <Phrase />
          ) : data ? (
            <ResponsiveContainer>
              <LineChart data={data.series_30d} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fill: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                  axisLine={{ stroke: "var(--rule)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) => v.toLocaleString("en-US", { notation: "compact" })}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                  }}
                  labelStyle={{ color: "var(--ink-2)" }}
                  formatter={(v: number) => v.toLocaleString("en-US")}
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                  dot={false}
                  name="orders"
                />
                <Line
                  type="monotone"
                  dataKey="payments"
                  stroke="var(--mark)"
                  strokeWidth={1.5}
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
            {(data?.worker_health ?? []).map((w, i, arr) => (
              <div
                key={w.key}
                className={[
                  "flex items-center justify-between py-3",
                  i < arr.length - 1 ? "border-b border-rule" : "",
                ].join(" ")}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StatusPill tone={workerTone(w.last_recent_at, w.last_error_at)}>
                    {w.last_error_at && recentErr(w)
                      ? t("dashboard.failed")
                      : t("dashboard.live")}
                  </StatusPill>
                  <span className="text-body text-ink truncate">{w.key}</span>
                </div>
                <div className="caption text-ink-3 shrink-0">
                  <RelativeTime iso={w.last_recent_at ?? w.last_all_at} />
                </div>
              </div>
            ))}
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
                  "flex items-baseline justify-between py-3 gap-4",
                  i < arr.length - 1 ? "border-b border-rule" : "",
                ].join(" ")}
              >
                <div className="flex items-baseline gap-4 min-w-0">
                  <span className="mono text-mono-sm text-ink-3 tabular-nums shrink-0">
                    {new Date(a.ts).toLocaleTimeString(
                      i18n.resolvedLanguage || "en-GB",
                      {
                        timeZone: "Asia/Tashkent",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      },
                    )}
                  </span>
                  <span className="eyebrow">
                    {t(`dashboard.kind_${a.kind}`)}
                  </span>
                  <span className="text-body text-ink truncate">
                    {a.subject ?? "—"}
                  </span>
                </div>
                {a.amount != null && (
                  <span className="serif nums text-body text-ink tabular-nums shrink-0">
                    {a.amount.toLocaleString(
                      i18n.resolvedLanguage || "en-US",
                      { maximumFractionDigits: 2 },
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Lede card — the front-page story. Big number + editorial sparkline across
 * the bottom quarter of the card. The sparkline is the lede's *picture*,
 * not a separate panel.
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
      <div className="eyebrow">{t("dashboard.orders_today")}</div>
      <div className="flex-1 flex items-end justify-end">
        <div className="serif nums text-[96px] leading-none text-ink tabular-nums">
          {value != null ? value.toLocaleString() : "—"}
        </div>
      </div>
      {trend && (
        <>
          <div className="leader" />
          <div className="flex items-center justify-between">
            <div className="caption italic text-ink-2">
              {trend.arrow && (
                <span className={`not-italic mr-1.5 ${trend.toneClass}`}>
                  {trend.arrow}
                </span>
              )}
              {trend.text}
            </div>
            {weekTotal != null && (
              <div className="caption text-ink-3">
                <span className="eyebrow mr-2">{t("dashboard.last_7_days")}</span>
                <span className="serif nums text-ink tabular-nums">
                  {weekTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="ml-1.5">USD</span>
              </div>
            )}
          </div>
        </>
      )}
      <div className="h-[72px] -mx-2 mt-4">
        <ResponsiveContainer>
          <LineChart
            data={sparkline}
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          >
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Line
              type="monotone"
              dataKey="orders"
              stroke="var(--mark)"
              strokeWidth={1.25}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
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
      toneClass: "text-ink-3",
    };
  return {
    arrow: d > 0 ? "↗" : "↘",
    text: `${Math.abs(d).toLocaleString()}${suffix}`,
    toneClass: d > 0 ? "text-good" : "text-risk",
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
  if (lastErr && recentErr({ last_error_at: lastErr, last_recent_at: lastOk } as any))
    return "failed";
  return "live";
}

function recentErr(w: { last_error_at: string | null; last_recent_at: string | null }) {
  if (!w.last_error_at) return false;
  if (!w.last_recent_at) return true;
  return new Date(w.last_error_at) > new Date(w.last_recent_at);
}
