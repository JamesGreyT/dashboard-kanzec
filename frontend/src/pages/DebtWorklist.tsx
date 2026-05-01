/**
 * Qarzlar / Debt collection worklist — "The Collector's Ledger".
 *
 * Editorial redesign: every debtor reads as a magazine pull-quote dossier
 * with the  amount owed as the anchor. Contact affordances (phone,
 * telegram) are tap-to-dial / one-click copy. Aging renders as a
 * typographic column-inch bar, not a generic pill. The drawer becomes the
 * collector's "dossier page" with keyboard-shortcut outcome buttons so a
 * caller can log a contact without leaving the keyboard.
 */
import {
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { formatIsoDate } from "../lib/format";
import { useAuth } from "../lib/auth";
import Card from "../components/Card";
import Input from "../components/Input";
import Pagination from "../components/Pagination";

type Outcome =
  | "called"
  | "no_answer"
  | "promised"
  | "rescheduled"
  | "refused"
  | "paid"
  | "note";

interface WorklistRow {
  person_id: number;
  name: string | null;
  tin: string | null;
  main_phone: string | null;
  telegram: string | null;
  address: string | null;
  region_name: string | null;
  category: string | null;
  direction: string | null;
  owner_name: string | null;
  gross_invoiced: number;
  gross_paid: number;
  outstanding: number;
  opening_debt: number;
  opening_credit: number;
  last_order_date: string | null;
  order_count: number;
  last_payment_date: string | null;
  pay_count: number;
  days_since_payment: number | null;
  aging_0_30: number;
  aging_30_60: number;
  aging_60_90: number;
  aging_90_plus: number;
  primary_room_id: string | null;
  primary_room_name: string | null;
  last_contact_outcome: Outcome | null;
  last_contact_at: string | null;
  last_promised_amount: number | null;
  last_promised_by_date: string | null;
  last_follow_up_date: string | null;
  last_contact_by: string | null;
  has_overdue_promise: boolean;
  priority: number;
}

interface WorklistResp {
  summary: {
    debtor_count: number;
    debtor_over_90_count: number;
    total_outstanding: number;
    total_over_90: number;
    total_overdue_promises: number;
  };
  rows: WorklistRow[];
  total: number;
  by_collector: {
    room_id: string;
    room_name: string;
    debtors_count: number;
    outstanding: number;
    over_90: number;
    collected_mtd: number;
  }[];
}

interface PrepayRow {
  person_id: number;
  name: string | null;
  tin: string | null;
  region_name: string | null;
  gross_invoiced: number;
  gross_paid: number;
  credit_balance: number;
  last_payment_date: string | null;
}

interface Room {
  room_id: string;
  room_code: string | null;
  room_name: string;
}

const OUTCOMES: Outcome[] = [
  "called",
  "no_answer",
  "promised",
  "rescheduled",
  "refused",
  "paid",
  "note",
];

// Yoʻnalish dropdown — every value that appears on legal_person.direction.
// Must stay in sync with ALLOWED_DIRECTIONS in backend/app/data/router.py.
const DIRECTIONS: string[] = [
  "B2B",
  "Yangi",
  "MATERIAL",
  "Export",
  "Цех",
  "Marketplace",
  "Online",
  "Doʻkon",
  "BAZA",
  "Sergeli 6/4/1 D",
  "Farxod bozori D",
  "Sergeli 3/3/13 D",
];

// ---- Formatting helpers ---------------------------------------------------

function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Parse "YYYY-MM-DD" as a calendar date (no TZ shift). Avoids the Americas
 *  off-by-one when date-only fields land in `new Date()`. */
function renderDate(iso: string | null | undefined, _locale: string): string {
  return formatIsoDate(iso);
}

// ---- Typographic atoms ---------------------------------------------------



function PhoneGlyph({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M5.5 4h3.6l1.2 4-2 1.6a12 12 0 0 0 6.1 6.1l1.6-2 4 1.2v3.6A2 2 0 0 1 18 20.5 16 16 0 0 1 3.5 6 2 2 0 0 1 5.5 4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}


// ---- Main page ------------------------------------------------------------

export default function Debt() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || "en-GB";
  const { user } = useAuth();
  const [tab, setTab] = useState<"worklist" | "prepayments">("worklist");

  const [search, setSearch] = useState("");
  const [salesRoomId, setSalesRoomId] = useState<string>("");
  const [direction, setDirection] = useState<string>("");
  const [agingBucket, setAgingBucket] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/api/rooms"),
  });

  const worklistQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    if (search) p.set("search", search);
    if (salesRoomId) p.set("sales_manager_room_id", salesRoomId);
    if (direction) p.set("direction", direction);
    if (agingBucket) p.set("aging_bucket", agingBucket);
    if (outcome) p.set("outcome", outcome);
    if (overdueOnly) p.set("overdue_promises_only", "true");
    return p.toString();
  }, [offset, search, salesRoomId, direction, agingBucket, outcome, overdueOnly]);

  const worklist = useQuery({
    queryKey: ["debt.worklist", worklistQs],
    queryFn: () => api<WorklistResp>(`/api/debt/worklist?${worklistQs}`),
    enabled: tab === "worklist",
    refetchInterval: 60_000,
  });

  const prepayments = useQuery({
    queryKey: ["debt.prepayments", search, offset],
    queryFn: () =>
      api<{ rows: PrepayRow[]; total: number }>(
        `/api/debt/prepayments?${new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
          ...(search ? { search } : {}),
        }).toString()}`,
      ),
    enabled: tab === "prepayments",
  });

  const navigate = useNavigate();

  const [heartbeat, setHeartbeat] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => setHeartbeat(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  const lastFetchMs = worklist.dataUpdatedAt || null;
  const ageSec = lastFetchMs
    ? Math.max(0, Math.floor((heartbeat - lastFetchMs) / 1000))
    : null;

  const userIsTeamLeadOrAdmin =
    user?.role === "admin" || (user?.scope_rooms.length ?? 0) !== 1;
  const showByCollector =
    userIsTeamLeadOrAdmin && (worklist.data?.by_collector.length ?? 0) > 0;

  const worklistRows = worklist.data?.rows ?? [];

  return (
    <div>
      {/* MASTHEAD — single-column PageHeading + live indicator on the right */}
      <header className="stagger-0 pb-6">
        <div className="eyebrow mb-3 flex items-center gap-2 flex-wrap">
          <span className="text-ink3">{t("dashboard.crumb_dashboard")}</span>
          <span className="text-ink4">/</span>
          <span className="text-ink3">{t("nav.collection")}</span>
          <span className="text-ink4">/</span>
          <span className="text-ink2">{t("nav.debt")}</span>
        </div>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-display text-4xl md:text-[44px] font-semibold leading-[1.04] tracking-[-0.04em] text-ink">
              {t("debt.title")}
            </h1>
            <p className="mt-3 text-sm text-ink3 max-w-[62ch] leading-relaxed">
              {t("debt.blurb")}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 h-9 rounded-full bg-mintbg text-mintdk eyebrow !text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulsemint inline-block" />
            <span>
              {worklist.data
                ? t("debt.updated_ago", { s: ageSec ?? 0 })
                : t("common.loading")}
            </span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-end justify-between gap-6 border-b border-line">
        <div className="flex items-center gap-8">
          {(["worklist", "prepayments"] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setTab(k);
                setOffset(0);
              }}
              className={[
                "pb-3 relative transition-colors",
                tab === k ? "text-mintdk" : "text-ink3 hover:text-ink",
              ].join(" ")}
            >
              <span className="font-display text-lg md:text-xl font-semibold tracking-[-0.02em] leading-none">
                {t(`debt.tab.${k}`)}
              </span>
              {tab === k && (
                <motion.span
                  layoutId="debt-tab-underline"
                  className="absolute left-0 right-0 -bottom-px h-[2px] bg-mint rounded-t-full"
                />
              )}
            </button>
          ))}
        </div>
        {tab === "worklist" && (
          <div className="text-xs text-ink3 tabular-nums font-mono pb-3">
            {worklist.data?.summary.debtor_count ?? 0}{" "}
            {t("debt.col.debtors").toLowerCase()} ·{" "}
            <span className="text-coraldk">
              {worklist.data?.summary.debtor_over_90_count ?? 0}{" "}
              {t("debt.kpi.over_90_count").toLowerCase()}
            </span>
          </div>
        )}
      </div>

      {tab === "worklist" ? (
        <>
          {/* KPI strip — 4 mini cards in a row */}
          <Card className="mt-6" accent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6">
              <MastheadStat
                label={t("debt.kpi.total_ar")}
                value={formatUsd(worklist.data?.summary.total_outstanding ?? 0)}
              />
              <MastheadStat
                label={t("debt.kpi.over_90")}
                value={formatUsd(worklist.data?.summary.total_over_90 ?? 0)}
                tone="risk"
              />
              <MastheadStat
                label={t("debt.kpi.debtors")}
                value={(worklist.data?.summary.debtor_count ?? 0).toLocaleString()}
              />
              <MastheadStat
                label={t("debt.kpi.overdue_promises")}
                value={formatUsd(worklist.data?.summary.total_overdue_promises ?? 0)}
                tone={
                  worklist.data?.summary.total_overdue_promises ? "mark" : "quiet"
                }
              />
            </div>
          </Card>

          {/* Filter bar */}
          <div className="mt-8">
            <div className="eyebrow mb-3">
              {t("debt.filter.title")}
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder={t("debt.filter.search_placeholder")}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOffset(0);
                  }}
                />
              </div>
              {userIsTeamLeadOrAdmin && rooms.data && (
                <ChipSelect
                  label={t("debt.filter.sales_manager")}
                  value={salesRoomId}
                  onChange={(v) => {
                    setSalesRoomId(v);
                    setOffset(0);
                  }}
                  options={[
                    { value: "", label: t("debt.filter.all_sales") },
                    ...rooms.data.rooms.map((r) => ({
                      value: r.room_id,
                      label: r.room_name,
                    })),
                  ]}
                />
              )}
              <ChipSelect
                label="Yoʻnalish"
                value={direction}
                onChange={(v) => {
                  setDirection(v);
                  setOffset(0);
                }}
                options={[
                  { value: "", label: "Barchasi" },
                  ...DIRECTIONS.map((d) => ({ value: d, label: d })),
                ]}
              />
              <ChipSelect
                label={t("debt.filter.aging")}
                value={agingBucket}
                onChange={(v) => {
                  setAgingBucket(v);
                  setOffset(0);
                }}
                options={[
                  { value: "", label: t("debt.filter.all_aging") },
                  ...(["0_30", "30_60", "60_90", "90_plus"] as const).map((b) => ({
                    value: b,
                    label: t(`debt.aging.${b}`),
                  })),
                ]}
              />
              <ChipSelect
                label={t("debt.filter.outcome")}
                value={outcome}
                onChange={(v) => {
                  setOutcome(v);
                  setOffset(0);
                }}
                options={[
                  { value: "", label: t("debt.filter.all_outcomes") },
                  { value: "none", label: t("debt.outcome.none") },
                  ...OUTCOMES.map((o) => ({
                    value: o,
                    label: t(`debt.outcome.${o}`),
                  })),
                ]}
              />
              <label
                className={[
                  "inline-flex items-center gap-2 h-10 px-3 rounded-xl border transition-colors cursor-pointer select-none",
                  overdueOnly
                    ? "border-mint bg-mintbg text-mintdk"
                    : "border-line bg-card text-ink2 hover:border-mint/40 hover:bg-mintbg/40",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={overdueOnly}
                  onChange={(e) => {
                    setOverdueOnly(e.target.checked);
                    setOffset(0);
                  }}
                />
                <span
                  aria-hidden
                  className={[
                    "inline-block h-3 w-3 rounded-sm transition-colors",
                    overdueOnly ? "bg-mint" : "border border-ink4",
                  ].join(" ")}
                />
                <span className="text-xs">{t("debt.filter.overdue_only")}</span>
              </label>
            </div>
          </div>

          {/* Ledger table — full-width debtor list */}
          <div className="mt-6">
            {worklist.isLoading && (
              <Card className="p-8">
                <div className="text-xs text-ink3 text-center">
                  {t("common.loading")}
                </div>
              </Card>
            )}

            {!worklist.isLoading && worklistRows.length === 0 && (
              <Card className="py-16 md:py-24">
                <div className="text-center">
                  <div className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
                    {t("debt.empty_title")}
                  </div>
                  <div className="text-sm text-ink3 mt-3 max-w-[40ch] mx-auto">
                    {t("debt.empty_worklist")}
                  </div>
                </div>
              </Card>
            )}

            {!worklist.isLoading && worklistRows.length > 0 && (
              <LedgerTable
                rows={worklistRows}
                onOpen={(id) => navigate(`/collection/debt/client/${id}`)}
              />
            )}
          </div>

          {worklist.data && worklist.data.total > limit && (
            <div className="mt-6">
              <Card className="p-0 overflow-hidden">
                <Pagination
                  offset={offset}
                  limit={limit}
                  total={worklist.data.total}
                  onOffset={setOffset}
                />
              </Card>
            </div>
          )}

          {/* By-collector rollup — full-width section BELOW the debtor list (admin-only) */}
          {showByCollector && (
            <Card className="mt-8 p-0 overflow-hidden">
              <div className="px-5 md:px-7 pt-5 md:pt-7 pb-4 flex items-baseline justify-between">
                <div>
                  <div className="eyebrow">
                    {t("debt.by_collector")}
                  </div>
                  <div className="font-display text-xl font-semibold tracking-[-0.02em] text-ink mt-1">
                    {t("debt.by_collector_title")}
                  </div>
                </div>
                {salesRoomId && (
                  <button
                    onClick={() => {
                      setSalesRoomId("");
                      setOffset(0);
                    }}
                    className="text-xs text-ink2 hover:text-mintdk hover:underline decoration-mint underline-offset-[3px]"
                  >
                    {t("debt.clear_filter")}
                  </button>
                )}
              </div>
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    {[
                      "debt.col.sales_person",
                      "debt.col.outstanding",
                      "debt.col.over_90",
                      "debt.col.debtors",
                      "debt.col.collected_mtd",
                    ].map((k, i) => (
                      <th
                        key={k}
                        className={[
                          "h-10 px-5 md:px-7 border-y border-line eyebrow !text-[10px] !tracking-[0.14em]",
                          i === 0 ? "text-left" : "text-right",
                        ].join(" ")}
                      >
                        {t(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {worklist.data?.by_collector.map((r, i) => {
                    const active = salesRoomId === r.room_id;
                    return (
                      <tr
                        key={r.room_id}
                        onClick={() => {
                          setSalesRoomId(active ? "" : r.room_id);
                          setOffset(0);
                        }}
                        className={[
                          "transition-colors cursor-pointer",
                          active
                            ? "bg-mintbg/60"
                            : i % 2 === 0
                              ? "hover:bg-mintbg/40"
                              : "bg-paper/40 hover:bg-mintbg/40",
                        ].join(" ")}
                      >
                        <td className="h-[48px] px-5 md:px-7 border-b border-line text-sm text-ink relative">
                          {active && (
                            <span
                              aria-hidden
                              className="absolute left-0 top-2 bottom-2 w-[3px] bg-mint rounded-r-full"
                            />
                          )}
                          <span className="font-medium">{r.room_name}</span>
                        </td>
                        <td className="h-[48px] px-5 md:px-7 border-b border-line text-right text-ink font-mono tabular-nums">
                          {formatUsd(r.outstanding)}
                        </td>
                        <td className="h-[48px] px-5 md:px-7 border-b border-line text-right text-coraldk font-mono tabular-nums">
                          {formatUsd(r.over_90)}
                        </td>
                        <td className="h-[48px] px-5 md:px-7 border-b border-line text-right text-xs text-ink2 font-mono tabular-nums">
                          {r.debtors_count}
                        </td>
                        <td className="h-[48px] px-5 md:px-7 border-b border-line text-right text-mintdk font-mono tabular-nums">
                          {formatUsd(r.collected_mtd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-3">
            <div className="flex-1">
              <Input
                placeholder={t("debt.filter.search_placeholder")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
            </div>
            <div className="text-xs text-ink3 shrink-0 font-mono tabular-nums">
              {(prepayments.data?.total ?? 0).toLocaleString()}{" "}
              {t("debt.tab.prepayments").toLowerCase()}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {(prepayments.data?.rows ?? []).map((r) => (
              <PrepaymentCard key={r.person_id} row={r} locale={locale} />
            ))}

            {!prepayments.isLoading &&
              (prepayments.data?.rows.length ?? 0) === 0 && (
                <Card className="py-16 md:py-24">
                  <div className="text-center">
                    <div className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
                      {t("debt.empty_prepayments_title")}
                    </div>
                    <div className="text-sm text-ink3 mt-3 max-w-[40ch] mx-auto">
                      {t("debt.empty_prepayments")}
                    </div>
                  </div>
                </Card>
              )}
          </div>

          {prepayments.data && prepayments.data.total > limit && (
            <div className="mt-6">
              <Card className="p-0 overflow-hidden">
                <Pagination
                  offset={offset}
                  limit={limit}
                  total={prepayments.data.total}
                  onOffset={setOffset}
                />
              </Card>
            </div>
          )}
        </>
      )}

    </div>
  );
}

function MastheadStat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "mark" | "risk" | "good" | "quiet";
}) {
  const toneClass = {
    ink: "text-ink",
    mark: "text-mintdk",
    risk: "text-coraldk",
    good: "text-mintdk",
    quiet: "text-ink3",
  }[tone];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow">
        {label}
      </span>
      <span
        className={`kpi-num text-[28px] md:text-[36px] ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function ChipSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const active = value !== "";
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <label
      className={[
        "relative inline-flex items-center gap-2 h-10 pl-3 pr-8 rounded-xl border transition-colors cursor-pointer",
        active
          ? "border-mint bg-mintbg text-mintdk"
          : "border-line bg-card text-ink2 hover:border-mint/40 hover:bg-mintbg/40",
      ].join(" ")}
    >
      <span className="eyebrow">{label}</span>
      <span className="text-sm">{current}</span>
      <span
        aria-hidden
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink3"
      >
        ▾
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}


function PrepaymentCard({ row, locale }: { row: PrepayRow; locale: string }) {
  const { t } = useTranslation();
  return (
    <Card className="p-5 md:p-7 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink leading-tight">
          {row.name ?? "—"}
        </h3>
        <div className="mt-1 text-xs text-ink3 flex items-center gap-x-2 flex-wrap">
          {row.region_name && <span>{row.region_name}</span>}
          {row.tin && (
            <>
              <span className="text-ink4">·</span>
              <span className="font-mono text-xs">{row.tin}</span>
            </>
          )}
          {row.last_payment_date && (
            <>
              <span className="text-ink4">·</span>
              <span>
                {t("debt.col.last_payment")}:{" "}
                <span className="font-medium text-ink2">
                  {renderDate(row.last_payment_date, locale)}
                </span>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="md:text-right">
        <div className="eyebrow">
          {t("debt.col.credit")}
        </div>
        <div
          className="kpi-num text-mintdk leading-none mt-2"
          style={{ fontSize: "2rem" }}
        >
          + {formatUsd(row.credit_balance)}
        </div>
        <div className="text-xs text-ink3 mt-2 font-mono tabular-nums">
          {t("debt.of_n_invoiced", {
            amount: formatUsd(row.gross_invoiced),
          })}
        </div>
      </div>
    </Card>
  );
}

// ========================================================================
// Ledger table — replaces the old dossier-card stream.
// 6 columns:  Mijoz · Qarz · Eskirish · Kun · Aloqa · (actions)
// Row hover: orange-tinted bg + 2px mark left-stripe + action icons fade in.
// Click row → client detail page.
// ========================================================================

// Map Yoʻnalish direction → tone class pair. Anything not in the map falls
// back to a neutral stone tag.
const DIRECTION_TONE: Record<string, string> = {
  "B2B":         "bg-mintbg text-mintdk",
  "Yangi":       "bg-mintbg text-mintdk",
  "MATERIAL":    "bg-mintbg text-mintdk",
  "Export":      "bg-amberbg text-amber",
  "Цех":         "bg-line text-ink2",
  "Marketplace": "bg-amberbg text-amber",
  "Online":      "bg-line text-ink2",
  "Doʻkon":      "bg-mintbg text-mintdk",
  "BAZA":        "bg-amberbg text-amber",
};

const OUTCOME_PILL: Record<Outcome, string> = {
  called:      "bg-line text-ink2",
  no_answer:   "bg-line text-ink3",
  promised:    "bg-mintbg text-mintdk",
  refused:     "bg-coralbg text-coraldk",
  paid:        "bg-mintbg text-mintdk",
  rescheduled: "bg-amberbg text-amber",
  note:        "bg-line text-ink3",
};

type BucketKey = "0_30" | "30_60" | "60_90" | "90_plus";

function agingDominance(r: WorklistRow) {
  const buckets: Array<{
    key: BucketKey;
    v: number;
    tone: "ok" | "warn" | "hot";
    className: string;
  }> = [
    { key: "0_30",    v: r.aging_0_30,    tone: "ok",   className: "bg-mint" },
    { key: "30_60",   v: r.aging_30_60,   tone: "warn", className: "bg-amber" },
    { key: "60_90",   v: r.aging_60_90,   tone: "hot",  className: "bg-[#cc8027]" },
    { key: "90_plus", v: r.aging_90_plus, tone: "hot",  className: "bg-coraldk" },
  ];
  const total = buckets.reduce((s, b) => s + b.v, 0);
  if (total === 0) return { pct: 0, top: null, total: 0, buckets };
  const top = [...buckets].sort((a, b) => b.v - a.v)[0];
  return { pct: Math.round((top.v / total) * 100), top, total, buckets };
}

function relativeTime(
  iso: string | null,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diffMs = Date.now() - d;
  if (diffMs < 0) return t("debt.time_ago.just");
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1)  return t("debt.time_ago.just");
  if (hours < 24) return t("debt.time_ago.hours", { n: hours });
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 30)  return t("debt.time_ago.days", { n: days });
  const months = Math.floor(days / 30);
  return t("debt.time_ago.months", { n: months });
}

function LedgerTable({
  rows,
  onOpen,
}: {
  rows: WorklistRow[];
  onOpen: (personId: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-[13px]"
          style={{ tableLayout: "fixed", minWidth: 1060 }}
        >
          <colgroup>
            <col style={{ width: "38%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "6%" }} />
          </colgroup>
          <thead>
            <tr>
              <LedgerTh>{t("debt.col.client")}</LedgerTh>
              <LedgerTh align="right" sort="desc">{t("debt.col.outstanding")}</LedgerTh>
              <LedgerTh>{t("debt.col.aging")}</LedgerTh>
              <LedgerTh align="right">{t("debt.col.days_no_pay")}</LedgerTh>
              <LedgerTh>{t("debt.col.contact")}</LedgerTh>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <LedgerRow key={r.person_id} row={r} onOpen={() => onOpen(r.person_id)} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LedgerTh({
  children,
  align = "left",
  sort,
}: {
  children: ReactNode;
  align?: "left" | "right";
  sort?: "asc" | "desc";
}) {
  return (
    <th
      className={[
        "eyebrow !text-[10px] !tracking-[0.14em] !font-medium px-4 py-3",
        "border-b border-line bg-paper/80 whitespace-nowrap",
        align === "right" ? "text-right" : "text-left",
      ].join(" ")}
    >
      {children}
      <span
        className={`ml-1.5 ${sort ? "text-mint" : "text-ink4"}`}
        aria-hidden
      >
        {sort === "asc" ? "▲" : sort === "desc" ? "▼" : "⇅"}
      </span>
    </th>
  );
}

function LedgerRow({
  row,
  onOpen,
}: {
  row: WorklistRow;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || "en-GB";
  const aging = agingDominance(row);
  const isHot = aging.top?.tone === "hot" && aging.pct >= 50;
  const directionTone =
    (row.direction && DIRECTION_TONE[row.direction]) || "bg-muted text-muted-foreground";
  const overdue = (row.days_since_payment ?? 0) > 30;

  return (
    <tr
      onClick={onOpen}
      className={[
        "group border-b border-line last:border-b-0 cursor-pointer",
        "hover:bg-mintbg/40 transition-colors relative",
      ].join(" ")}
    >
      {/* Mijoz */}
      <td className="px-4 py-3 align-middle relative">
        <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-transparent group-hover:bg-mint transition-colors" />
        <div className="font-medium text-ink text-[14px] leading-tight truncate">
          {row.name ?? "—"}
        </div>
        <div className="mt-1 text-[11.5px] text-ink3 truncate">
          {row.direction && (
            <span
              className={[
                "inline-block font-mono text-[9.5px] font-semibold uppercase",
                "tracking-[0.06em] px-1.5 py-[2px] rounded-md mr-2 align-[1px]",
                directionTone,
              ].join(" ")}
            >
              {row.direction}
            </span>
          )}
          {row.region_name && <span>{row.region_name}</span>}
          {row.main_phone && (
            <>
              <span className="opacity-50 mx-1.5">·</span>
              <span className="font-mono">{row.main_phone}</span>
            </>
          )}
          {row.primary_room_name && (
            <>
              <span className="opacity-50 mx-1.5">·</span>
              <span className="text-ink2">{row.primary_room_name}</span>
            </>
          )}
        </div>
      </td>

      {/* Qarz */}
      <td className="px-4 py-3 text-right align-middle">
        <div
          className={[
            "font-mono text-[17px] font-semibold leading-none tabular-nums",
            isHot ? "text-coraldk" : "text-ink",
          ].join(" ")}
        >
          {formatUsd(row.outstanding)}
        </div>
        <div className="mt-1 font-mono text-[10.5px] text-ink3 tabular-nums">
          {t("debt.of_n_invoiced", { amount: formatUsd(row.gross_invoiced) })}
        </div>
      </td>

      {/* Eskirish */}
      <td className="px-4 py-3 align-middle">
        <div className="flex gap-[1px] h-[10px] w-full max-w-[160px] rounded-full overflow-hidden bg-line">
          {aging.buckets.map((b) =>
            b.v > 0 ? (
              <div key={b.key} className={b.className} style={{ flex: b.v }} />
            ) : null,
          )}
        </div>
        {aging.total > 0 && aging.top && (
          <div
            className={[
              "mt-[5px] font-mono text-[10.5px] tabular-nums font-semibold",
              aging.top.tone === "hot" ? "text-coraldk" :
              aging.top.tone === "warn" ? "text-amber" : "text-mintdk",
            ].join(" ")}
          >
            {aging.pct}% · {t(`debt.aging.${aging.top.key}`)}
          </div>
        )}
      </td>

      {/* Kun */}
      <td className="px-4 py-3 text-right align-middle">
        <div
          className={[
            "font-mono text-[13px] font-medium tabular-nums",
            overdue ? "text-coraldk" : "text-ink2",
          ].join(" ")}
        >
          {row.days_since_payment != null ? `${row.days_since_payment} d` : "—"}
        </div>
        <div className="mt-1 font-mono text-[10.5px] text-ink3 tabular-nums">
          {row.last_payment_date ? renderDate(row.last_payment_date, locale) : "—"}
        </div>
      </td>

      {/* Aloqa */}
      <td className="px-4 py-3 align-middle">
        {row.last_contact_outcome ? (
          <>
            <span
              className={[
                "inline-flex items-center gap-[5px] font-mono text-[10px] tracking-[0.05em]",
                "uppercase font-semibold px-2 py-[3px] rounded-full whitespace-nowrap",
                OUTCOME_PILL[row.last_contact_outcome],
              ].join(" ")}
            >
              <span className="w-[5px] h-[5px] rounded-full bg-current" />
              {t(`debt.outcome.${row.last_contact_outcome}`)}
            </span>
            {row.last_contact_outcome === "promised" && row.last_promised_amount != null ? (
              <div className="mt-1 text-[12px] text-mintdk whitespace-nowrap font-medium font-mono tabular-nums">
                {formatUsd(row.last_promised_amount)}
                {row.last_promised_by_date &&
                  ` · ${renderDate(row.last_promised_by_date, locale)}`}
              </div>
            ) : (
              <div className="mt-1 font-mono text-[10.5px] text-ink3 tabular-nums whitespace-nowrap">
                {relativeTime(row.last_contact_at, t)}
              </div>
            )}
          </>
        ) : (
          <span className="text-ink3 text-[12.5px]">
            — {t("debt.no_contact_yet")}
          </span>
        )}
      </td>

      {/* Actions — fade in on row hover */}
      <td className="px-3 py-3 text-right align-middle whitespace-nowrap">
        <span className="inline-flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity align-middle">
          {row.main_phone && (
            <a
              href={`tel:${row.main_phone.replace(/[^+\d]/g, "")}`}
              onClick={(e) => e.stopPropagation()}
              title={t("debt.action.call")}
              className="w-[26px] h-[26px] border border-line rounded-md bg-card grid place-items-center text-ink3 hover:border-mint hover:bg-mintbg hover:text-mintdk transition-colors"
            >
              <PhoneGlyph />
            </a>
          )}
        </span>
        <span className="text-ink4 text-[18px] pl-1.5 align-middle group-hover:text-mint transition-colors">
          ›
        </span>
      </td>
    </tr>
  );
}

