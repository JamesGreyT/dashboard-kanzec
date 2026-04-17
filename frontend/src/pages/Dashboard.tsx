import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import StatusPill, { StatusTone } from "../components/StatusPill";
import RelativeTime from "../components/RelativeTime";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard.overview"],
    queryFn: () => api<Overview>("/api/dashboard/overview"),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <PageHeading
        crumb={["Dashboard", "Overview"]}
        title="Dashboard"
        subtitle={
          <>
            <span className="serif-italic">Tashkent</span> ·{" "}
            {new Date().toLocaleString("en-GB", {
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
        <div className="mt-6 caption text-risk">Couldn't read the register.</div>
      )}

      {/* Stat cards */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          label="orders · today"
          value={fmt(data?.today.orders.count)}
          trend={deltaTrend(
            data?.today.orders.count ?? 0,
            data?.yesterday.orders.count ?? 0,
            " from yesterday",
          )}
        />
        <StatCard
          label="payments · today"
          value={fmt(data?.today.payments.amount, 0)}
          unit="USD"
          trend={pctTrend(
            data?.today.payments.amount ?? 0,
            data?.yesterday.payments.amount ?? 0,
            " vs yesterday",
          )}
        />
        <StatCard
          label="orders · last 7 days"
          value={fmt(data?.week.orders_amount, 0)}
          unit="USD"
        />
        <StatCard
          label="active clients · 30d"
          value={fmt(data?.active_clients_30d)}
        />
      </div>

      {/* Chart + worker health */}
      <div className="mt-8 grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
        <Card eyebrow="LAST 30 DAYS" title="Orders & payments">
          <div className="h-[260px]">
            {!isLoading && data && (
              <ResponsiveContainer>
                <LineChart data={data.series_30d} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
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
            )}
          </div>
        </Card>

        <Card eyebrow="REPORT WORKERS" title="Health">
          <div className="flex flex-col gap-3">
            {(data?.worker_health ?? []).map((w) => (
              <div
                key={w.key}
                className="flex items-center justify-between py-2 border-b border-rule last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <StatusPill tone={workerTone(w.last_recent_at, w.last_error_at)}>
                    {w.last_error_at && recentErr(w) ? "failed" : "live"}
                  </StatusPill>
                  <span className="text-body text-ink">{w.key}</span>
                </div>
                <div className="caption text-ink-3">
                  <RelativeTime iso={w.last_recent_at ?? w.last_all_at} />
                </div>
              </div>
            ))}
            {(!data || data.worker_health.length === 0) && !isLoading && (
              <div className="caption text-ink-3 py-2">no workers reporting.</div>
            )}
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="mt-8" eyebrow="TODAY" title="Recent activity">
        {(data?.recent_activity.length ?? 0) === 0 && (
          <div className="caption text-ink-3 py-4">no movement today — yet.</div>
        )}
        <div className="flex flex-col">
          {(data?.recent_activity ?? []).map((a, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-3 border-b border-rule last:border-b-0"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="mono text-mono-sm text-ink-3 tabular-nums shrink-0">
                  {new Date(a.ts).toLocaleTimeString("en-GB", {
                    timeZone: "Asia/Tashkent",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="eyebrow">{a.kind}</span>
                <span className="text-body text-ink truncate">{a.subject ?? "—"}</span>
              </div>
              {a.amount != null && (
                <span className="serif nums text-body text-ink tabular-nums">
                  {a.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
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

function deltaTrend(cur: number, prev: number, suffix: string) {
  if (prev === 0 && cur === 0) return undefined;
  const d = cur - prev;
  if (d === 0) return { tone: "quiet" as const, text: `— no change${suffix}` };
  const arrow = d > 0 ? "↗" : "↘";
  return {
    tone: d > 0 ? ("good" as const) : ("risk" as const),
    text: `${arrow} ${Math.abs(d).toLocaleString()}${suffix}`,
  };
}

function pctTrend(cur: number, prev: number, suffix: string) {
  if (prev === 0) return cur === 0 ? undefined : { tone: "good" as const, text: "↗ new" };
  const pct = ((cur - prev) / prev) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return { tone: "quiet" as const, text: `— flat${suffix}` };
  const arrow = rounded > 0 ? "↗" : "↘";
  return {
    tone: rounded > 0 ? ("good" as const) : ("risk" as const),
    text: `${arrow} ${Math.abs(rounded)}%${suffix}`,
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
