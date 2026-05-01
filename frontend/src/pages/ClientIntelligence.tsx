import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Phone, FileEdit, ArrowUpRight } from "lucide-react";

import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import { fmtNum, fmtCount, fmtPct } from "../components/MetricCard";
import RankedTable, { type ColumnDef, type Page } from "../components/RankedTable";
import Heatmap from "../components/Heatmap";
import AgingBar from "../components/AgingBar";
import Sparkline from "../components/Sparkline";
import RFMSegmentPill from "../components/RFMSegmentPill";
import RiskScoreBar from "../components/RiskScoreBar";
import TrajectoryChip from "../components/TrajectoryChip";
import ActionQueueList, { type ActionItem } from "../components/ActionQueueList";
import QuickContactDialog from "../components/QuickContactDialog";
import ScopeChip from "../components/ScopeChip";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface RFM { r: number; f: number; m: number; score: string; segment: string; }
interface Aging { b1_30: number; b31_60: number; b61_90: number; b90_plus: number; }
interface ClientRow {
  person_id: string;
  name: string;
  tin: string | null;
  client_group: string | null;
  direction: string | null;
  region: string | null;
  room: string | null;
  phone: string | null;
  rfm: RFM | null;
  recency_days: number | null;
  ltv: number;
  aov: number;
  order_count: number;
  monthly_rev: number[];
  trajectory_pct: number | null;
  sku_breadth: number;
  outstanding: number;
  aging: Aging;
  promise_kept_pct: number | null;
  promise_total: number;
  risk_score: number;
  predicted_next_buy: string | null;
  days_overdue_for_repeat: number | null;
  last_contact_at: string | null;
  last_contact_outcome: string | null;
}
interface IntelligenceResp { rows: ClientRow[]; total: number; page: number; size: number; }

interface AnalyticsResp {
  kpi: {
    active_12m: number;
    at_risk_count: number;
    outstanding_total: number;
    predicted_next_7d: number;
    top5_concentration_pct: number | null;
  };
  rfm_heatmap: { r_labels: string[]; f_labels: string[]; counts: number[][]; monetary: number[][]; };
  aging_by_manager: { row_labels: string[]; col_labels: string[]; values: number[][]; };
  action_queue: ActionItem[];
  segment_distribution: { segment: string; count: number; revenue: number; }[];
}

type Segment = "all" | "champions" | "loyal" | "at_risk" | "hibernating" | "debt_warning" | "predicted";
const SEGMENTS: Segment[] = ["all", "champions", "loyal", "at_risk", "hibernating", "debt_warning", "predicted"];

// Map a RankedTable sort key (e.g. "risk:desc") to the API's bare key.
const sortKeyOf = (s: string) => s.split(":")[0];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClientIntelligence() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [sort, setSort] = useState("risk:desc");
  const [contactDialog, setContactDialog] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    document.title = t("clients360.title", { defaultValue: "Mijozlar 360°" }) + " · Kanzec";
  }, [t]);

  const intelligenceQs = useMemo(() => {
    const q = new URLSearchParams();
    if (search.trim()) q.set("search", search.trim());
    q.set("segment", segment);
    q.set("page", String(page));
    q.set("size", String(size));
    q.set("sort", sortKeyOf(sort));
    return q.toString();
  }, [search, segment, page, size, sort]);

  const intelligenceQ = useQuery({
    queryKey: ["clients.intelligence", intelligenceQs],
    queryFn: () => api<IntelligenceResp>(`/api/clients/intelligence?${intelligenceQs}`),
    staleTime: 30_000,
  });

  // Analytics aggregates are page-scoped and don't depend on the segment chip
  // (the chip only filters the table). Use a stable key so segment changes
  // don't refetch this expensive query.
  const analyticsQ = useQuery({
    queryKey: ["clients.analytics"],
    queryFn: () => api<AnalyticsResp>("/api/clients/analytics"),
    staleTime: 60_000,
  });

  const segCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of analyticsQ.data?.segment_distribution ?? []) m[s.segment] = s.count;
    return m;
  }, [analyticsQ.data]);

  // ---- Table columns
  const columns: ColumnDef<ClientRow>[] = useMemo(() => [
    {
      key: "name", label: t("clients360.col_client", { defaultValue: "Client" }),
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-foreground truncate">{r.name}</span>
          {r.client_group && (
            <span
              title={`Tier ${r.client_group}`}
              className={
                "inline-flex items-center justify-center w-5 h-5 rounded-sm text-[10px] font-bold border " +
                (r.client_group === "A" ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                : r.client_group === "B" ? "bg-primary/10 text-primary border-primary/30"
                : r.client_group === "C" ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800")
              }
            >
              {r.client_group}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "rfm", label: t("clients360.col_rfm", { defaultValue: "RFM" }), sortable: false,
      render: (r) => <RFMSegmentPill segment={r.rfm?.segment ?? null} score={r.rfm?.score ?? null} />,
    },
    {
      key: "recency", label: t("clients360.col_recency", { defaultValue: "Recency" }), sortable: true, numeric: true,
      render: (r) => r.recency_days == null ? <span className="text-muted-foreground/60">—</span> : (
        <span className={"font-mono tabular-nums " +
          (r.recency_days < 30 ? "text-emerald-700 dark:text-emerald-400"
          : r.recency_days < 90 ? "text-foreground"
          : r.recency_days < 180 ? "text-amber-700 dark:text-amber-400"
          : "text-red-700 dark:text-red-400")
        }>{r.recency_days}d</span>
      ),
    },
    {
      key: "trend", label: t("clients360.col_trend", { defaultValue: "Trend" }), sortable: false,
      render: (r) => r.monthly_rev.length
        ? <Sparkline values={r.monthly_rev} width={64} height={18} />
        : <span className="text-muted-foreground/60">—</span>,
    },
    {
      key: "trajectory", label: t("clients360.col_trajectory", { defaultValue: "90d Δ" }), sortable: true, numeric: true,
      render: (r) => <TrajectoryChip pct={r.trajectory_pct} />,
    },
    {
      key: "ltv", label: t("clients360.col_ltv", { defaultValue: "LTV" }), sortable: true, numeric: true,
      render: (r) => <span className="font-mono tabular-nums text-foreground">${fmtNum(r.ltv, true)}</span>,
    },
    {
      key: "aov", label: t("clients360.col_aov", { defaultValue: "AOV" }), sortable: false, numeric: true,
      render: (r) => <span className="font-mono tabular-nums text-muted-foreground">${fmtNum(r.aov, true)}</span>,
    },
    {
      key: "skus", label: t("clients360.col_skus", { defaultValue: "SKUs" }), sortable: false, numeric: true,
      render: (r) => <span className="font-mono tabular-nums text-muted-foreground">{r.sku_breadth || "—"}</span>,
    },
    {
      key: "outstanding", label: t("clients360.col_debt", { defaultValue: "Debt" }), sortable: true, numeric: true,
      render: (r) => (
        <div className="flex flex-col items-end gap-1">
          <span className={"font-mono tabular-nums " + (r.outstanding > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
            {r.outstanding > 0 ? "$" + fmtNum(r.outstanding, true) : "—"}
          </span>
          {r.outstanding > 0 && (
            <AgingBar
              segments={{
                a0_30: r.aging.b1_30,
                a31_60: r.aging.b31_60,
                a61_90: r.aging.b61_90,
                a91_plus: r.aging.b90_plus,
              }}
              height={6}
              width={90}
            />
          )}
        </div>
      ),
    },
    {
      key: "promise", label: t("clients360.col_promise", { defaultValue: "Promise" }), sortable: false, numeric: true,
      render: (r) => r.promise_kept_pct == null ? <span className="text-muted-foreground/60">—</span> : (
        <span
          title={`${r.promise_total} promise${r.promise_total !== 1 ? "s" : ""}`}
          className={"font-mono tabular-nums " +
            (r.promise_kept_pct >= 0.8 ? "text-emerald-700 dark:text-emerald-400"
            : r.promise_kept_pct >= 0.5 ? "text-amber-700 dark:text-amber-400"
            : "text-red-700 dark:text-red-400")
          }
        >
          {Math.round(r.promise_kept_pct * 100)}%
        </span>
      ),
    },
    {
      key: "risk", label: t("clients360.col_risk", { defaultValue: "Risk" }), sortable: true, numeric: true,
      render: (r) => <RiskScoreBar score={r.risk_score} />,
    },
    {
      key: "next_buy", label: t("clients360.col_next_buy", { defaultValue: "Next buy" }), sortable: true, numeric: true,
      render: (r) => {
        if (r.predicted_next_buy == null) return <span className="text-muted-foreground/60">—</span>;
        const overdue = (r.days_overdue_for_repeat ?? 0) > 0;
        return (
          <span className={"font-mono tabular-nums " + (overdue ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
            {overdue ? `${r.days_overdue_for_repeat}d late` : r.predicted_next_buy.slice(5)}
          </span>
        );
      },
    },
    {
      key: "manager", label: t("clients360.col_manager", { defaultValue: "Manager" }), sortable: false,
      render: (r) => <span className="text-muted-foreground text-[12px]">{r.room ?? "—"}</span>,
    },
    {
      key: "last_contact", label: t("clients360.col_last_contact", { defaultValue: "Last contact" }), sortable: false,
      render: (r) => r.last_contact_at == null ? <span className="text-muted-foreground/60 text-[12px]">—</span> : (
        <div className="text-[11px]">
          <div className="font-mono tabular-nums text-muted-foreground">
            {r.last_contact_at.slice(0, 10)}
          </div>
          <div className="text-muted-foreground italic">{r.last_contact_outcome}</div>
        </div>
      ),
    },
    {
      key: "actions", label: "", sortable: false,
      render: (r) => (
        <div className="flex items-center gap-1 justify-end">
          {r.phone && (
            <a
              href={`tel:${r.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5"
              title={`call ${r.phone}`}
              aria-label="call"
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setContactDialog({ id: r.person_id, name: r.name }); }}
            className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5"
            title={t("clients360.action_log", { defaultValue: "Log contact" }) as string}
            aria-label="log contact"
          >
            <FileEdit className="h-3.5 w-3.5" />
          </button>
          <Link
            to={`/collection/debt/client/${r.person_id}`}
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5"
            title={t("clients360.action_open", { defaultValue: "Open dossier" }) as string}
            aria-label="open"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

  // ---- Page assembly
  const kpi = analyticsQ.data?.kpi;

  return (
    <div className="pb-14 space-y-9 md:space-y-11">
      <PageHeading
        crumb={[t("nav.clients_group", { defaultValue: "Mijozlar" }), t("clients360.title", { defaultValue: "Mijozlar 360°" })]}
        title={t("clients360.title", { defaultValue: "Mijozlar 360°" })}
        subtitle={t("clients360.subtitle", {
          defaultValue: "Kim sotib olishga yaqin · kim yo'qolyapti · kim qarz · har bir mijoz uchun bir qatorda.",
        })}
      />

      {/* ──────────────────────────────────────────────────────────────────
          ZONE 1 — Today's state
          Asymmetric KPI strip: concentration card spans 4/12 with a primary
          radial wash + "Strategic radar" eyebrow; the four operational vitals
          fill the remaining 8/12 with subtle accent borders so the eye reads
          them as a related cluster.
      ────────────────────────────────────────────────────────────────────── */}
      <section className="stagger-1 grid grid-cols-12 gap-3 md:gap-4">
        {/* Strategic radar — top-5 concentration */}
        <div className="col-span-12 md:col-span-4 relative overflow-hidden bg-card border rounded-2xl p-5 shadow-soft">
          <div
            aria-hidden
            className="absolute -top-16 -right-16 w-[220px] h-[220px] rounded-full pointer-events-none opacity-[0.10]"
            style={{ background: "radial-gradient(circle at center, hsl(var(--primary)) 0%, transparent 70%)" }}
          />
          <div className="relative">
            <div className="eyebrow !tracking-[0.18em] flex items-baseline gap-1.5 mb-3">
              <span>{t("clients360.kpi_top5_eyebrow", { defaultValue: "Strategic radar" })}</span>
              <span aria-hidden className="font-display-italic text-primary text-[12px] -ml-0.5">.</span>
            </div>
            <div className="font-display text-[36px] md:text-[42px] font-medium leading-[1] tracking-[-0.02em] tabular-nums text-foreground">
              {kpi?.top5_concentration_pct != null ? fmtPct(kpi.top5_concentration_pct) : "—"}
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t("clients360.kpi_top5", { defaultValue: "Top-5 concentration" })}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground italic max-w-[34ch] leading-relaxed">
              {t("clients360.kpi_top5_hint", { defaultValue: "Top 5 customers' share of LTV" })}
            </div>
          </div>
        </div>

        <KpiSmall
          accent="emerald"
          label={t("clients360.kpi_active", { defaultValue: "Active (12m)" }) as string}
          value={fmtCount(kpi?.active_12m ?? 0)}
        />
        <KpiSmall
          accent="amber"
          label={t("clients360.kpi_at_risk", { defaultValue: "At risk" }) as string}
          value={fmtCount(kpi?.at_risk_count ?? 0)}
          hint={t("clients360.kpi_at_risk_hint", { defaultValue: "Cannot lose / At risk" }) as string}
        />
        <KpiSmall
          accent="destructive"
          label={t("clients360.kpi_total_debt", { defaultValue: "Total debt" }) as string}
          value={"$" + fmtNum(kpi?.outstanding_total ?? 0, true)}
        />
        <KpiSmall
          accent="primary"
          label={t("clients360.kpi_predicted_7d", { defaultValue: "Predicted next 7d" }) as string}
          value={fmtCount(kpi?.predicted_next_7d ?? 0)}
          hint={t("clients360.kpi_predicted_hint", { defaultValue: "Overdue for repeat" }) as string}
        />
      </section>

      <hr className="mark-rule" aria-hidden />

      {/* ──────────────────────────────────────────────────────────────────
          ZONE 2 — Analysis
          Asymmetric 12-col: Action queue (5) — primary radial wash, slightly
          elevated. Aging × Manager (4) — destructive radial wash, the
          "bleeding cash" panel. RFM 5×5 (3) — clean editorial heatmap.
      ────────────────────────────────────────────────────────────────────── */}
      <section className="stagger-2 space-y-4">
        <ZoneTitle
          eyebrow={t("clients360.zone_analytics_eyebrow", { defaultValue: "Tahlil" }) as string}
          title={t("clients360.zone_analytics_title", { defaultValue: "Kim, qayerda, qachon" }) as string}
        />
        <div className="grid grid-cols-12 gap-3 md:gap-4">
          <Panel
            className="col-span-12 lg:col-span-5"
            accent="primary"
            elevated
            title={t("clients360.panel_queue", { defaultValue: "Action queue" })}
            subtitle={t("clients360.panel_queue_sub", { defaultValue: "Top 10 by overdue × LTV" }) as string}
          >
            <ActionQueueList
              items={analyticsQ.data?.action_queue ?? []}
              loading={analyticsQ.isLoading}
              error={!!analyticsQ.error}
            />
          </Panel>

          <Panel
            className="col-span-12 lg:col-span-4"
            accent="destructive"
            title={t("clients360.panel_aging", { defaultValue: "Aging × Manager" })}
            subtitle={t("clients360.panel_aging_sub", { defaultValue: "Outstanding $ per room, by bucket" }) as string}
          >
            {analyticsQ.data ? (
              <Heatmap
                rowLabels={analyticsQ.data.aging_by_manager.row_labels}
                colLabels={analyticsQ.data.aging_by_manager.col_labels}
                values={analyticsQ.data.aging_by_manager.values}
                formatValue={(v) => v === 0 ? "—" : "$" + fmtNum(v, true)}
                maxHeight={280}
              />
            ) : <SkeletonBlock />}
          </Panel>

          <Panel
            className="col-span-12 lg:col-span-3"
            title={t("clients360.panel_rfm", { defaultValue: "RFM 5×5" })}
            subtitle={t("clients360.panel_rfm_sub", { defaultValue: "Recency × Frequency · cell = customers" }) as string}
          >
            {analyticsQ.data ? (
              <Heatmap
                rowLabels={analyticsQ.data.rfm_heatmap.r_labels}
                colLabels={analyticsQ.data.rfm_heatmap.f_labels}
                values={analyticsQ.data.rfm_heatmap.counts}
                formatValue={(v) => v === 0 ? "—" : String(v)}
                rowHeader="R\\F"
                maxHeight={280}
              />
            ) : <SkeletonBlock />}
          </Panel>
        </div>
      </section>

      <hr className="mark-rule" aria-hidden />

      {/* ──────────────────────────────────────────────────────────────────
          ZONE 3 — All customers
          Title + sticky pill ribbon + the row table. The ribbon is the
          page's filter UI; chips have a subtle scale + shadow on active so
          the operator's choice always reads as the "selected" one.
      ────────────────────────────────────────────────────────────────────── */}
      <section className="stagger-3">
        <ZoneTitle
          eyebrow={t("clients360.zone_table_eyebrow", { defaultValue: "Barcha mijozlar" }) as string}
          title={t("clients360.zone_table_title", { defaultValue: "Filtr va harakat" }) as string}
        />

        {/* Sticky segment ribbon */}
        <div className="sticky top-0 z-10 -mx-2 px-2 mt-4 mb-5 py-2.5 bg-background/90 backdrop-blur-md border-y border-border/40">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow !tracking-[0.16em] mr-1 hidden sm:inline">
              {t("clients360.segment_label", { defaultValue: "Segment" })}
            </span>
            {SEGMENTS.map((s) => {
              const active = segment === s;
              const count = s === "all" ? null : segCounts[segLabel(s)] ?? null;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSegment(s); setPage(0); }}
                  className={
                    "px-2.5 py-1 rounded-full text-[11px] uppercase tracking-[0.10em] border transition-all duration-150 " +
                    (active
                      ? "bg-primary text-primary-foreground border-primary shadow-md scale-105 font-medium"
                      : "bg-card text-foreground/80 border-border hover:bg-muted hover:border-foreground/30")
                  }
                >
                  {t(`clients360.seg_${s}`, { defaultValue: s.replace("_", " ") })}
                  {count != null && (
                    <span
                      className={
                        "ml-1.5 font-mono tabular-nums " +
                        (active ? "opacity-85" : "text-muted-foreground")
                      }
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="ml-auto"><ScopeChip /></div>
          </div>
        </div>

        {/* The row table — wrapped in a thin layered container so the
            sticky ribbon doesn't visually fuse with the heatmaps above. */}
        <div className="bg-card border rounded-2xl shadow-soft p-3 md:p-4">
          <RankedTable<ClientRow>
            columns={columns}
            data={intelligenceQ.data ? {
              rows: intelligenceQ.data.rows,
              total: intelligenceQ.data.total,
              page: intelligenceQ.data.page,
              size: intelligenceQ.data.size,
              sort,
            } as Page<ClientRow> : undefined}
            loading={intelligenceQ.isLoading}
            onChange={(next) => {
              setPage(next.page);
              setSize(next.size);
              setSort(next.sort);
              setSearch(next.search);
            }}
            onRowClick={(r) => navigate(`/collection/debt/client/${r.person_id}`)}
            getRowKey={(r) => r.person_id}
            empty={t("clients360.empty", { defaultValue: "No clients match the current filter." }) as string}
          />
        </div>
      </section>

      {contactDialog && (
        <QuickContactDialog
          open
          onClose={() => setContactDialog(null)}
          personId={contactDialog.id}
          personName={contactDialog.name}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a chip filter to the canonical RFM segment label so the count
 *  annotation lines up with the segment_distribution payload. The chips
 *  are coarser than the 11-segment taxonomy — `at_risk` covers two
 *  segments — so for those we fall back to the page-level KPI count. */
function segLabel(s: Segment): string {
  switch (s) {
    case "champions": return "Champions";
    case "loyal": return "Loyal";
    case "hibernating": return "Hibernating";
    default: return ""; // at_risk, debt_warning, predicted, all → no exact match
  }
}

/**
 * Asymmetric panel with optional radial-wash accent. The wash is the
 * single design move that lets each panel telegraph its purpose without
 * resorting to outright color blocking — primary = "go do this",
 * destructive = "this is bleeding," none = "neutral data view."
 */
function Panel({
  title,
  subtitle,
  className,
  accent = "none",
  elevated = false,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  accent?: "primary" | "destructive" | "none";
  elevated?: boolean;
  children: React.ReactNode;
}) {
  const wash =
    accent === "primary" ? (
      <div
        aria-hidden
        className="absolute -bottom-14 -right-14 w-[200px] h-[200px] rounded-full pointer-events-none opacity-[0.09]"
        style={{ background: "radial-gradient(circle at center, hsl(var(--primary)) 0%, transparent 70%)" }}
      />
    ) : accent === "destructive" ? (
      <div
        aria-hidden
        className="absolute -top-12 -right-12 w-[160px] h-[160px] rounded-full pointer-events-none opacity-[0.07]"
        style={{ background: "radial-gradient(circle at center, hsl(var(--destructive)) 0%, transparent 70%)" }}
      />
    ) : null;
  const shadowCls = elevated ? "shadow-md" : "shadow-soft";
  return (
    <div className={"relative overflow-hidden bg-card border rounded-2xl p-4 md:p-5 " + shadowCls + " " + (className ?? "")}>
      {wash}
      <div className="relative mb-3">
        <div className="font-display text-[17px] font-medium text-foreground leading-tight">
          {title}
          <span aria-hidden className="font-display-italic text-primary ml-[1px]">.</span>
        </div>
        {subtitle && (
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-1">
            {subtitle}
          </div>
        )}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * Compact KPI card with a 2px tone-coded left border. Lets the four
 * operational vitals read as a related cluster while still color-coding
 * by intent (emerald = healthy, amber = watch, destructive = debt,
 * primary = predictive). Sits next to the larger Strategic-radar card
 * so the eye reads from "the one big number" → "the four metrics."
 */
function KpiSmall({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: "emerald" | "amber" | "destructive" | "primary";
}) {
  const accentBorder = {
    emerald: "border-l-emerald-500/70",
    amber: "border-l-amber-500/70",
    destructive: "border-l-destructive/70",
    primary: "border-l-primary/70",
  }[accent];
  return (
    <div
      className={
        "col-span-6 md:col-span-2 bg-card border border-l-2 rounded-2xl p-4 shadow-soft " +
        accentBorder
      }
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
        {label}
      </div>
      <div className="mt-2 font-display text-[24px] md:text-[26px] font-medium leading-[1.05] tracking-[-0.01em] tabular-nums text-foreground">
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 text-[10px] text-muted-foreground italic">
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * Section heading: an uppercase tracked-out eyebrow + a display-italic
 * title with the brand-standard vermilion period. Used to compose the
 * page into named zones (Tahlil, Barcha mijozlar) so the eye reads each
 * one as a deliberate section instead of scrolling past stacked cards.
 */
function ZoneTitle({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <div className="eyebrow !tracking-[0.18em] mb-1.5">{eyebrow}</div>
      <h2 className="font-display text-[22px] md:text-[26px] font-medium tracking-[-0.01em] leading-[1] text-foreground">
        {title}
        <span aria-hidden className="font-display-italic text-primary">.</span>
      </h2>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 w-1/3 bg-muted/40 rounded" />
      <div className="h-32 bg-muted/30 rounded" />
    </div>
  );
}
