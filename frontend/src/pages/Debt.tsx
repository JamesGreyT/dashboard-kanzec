/**
 * Qarzlar / Debt collection worklist — "The Collector's Ledger".
 *
 * Editorial redesign: every debtor reads as a magazine pull-quote dossier
 * with the serif amount owed as the anchor. Contact affordances (phone,
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
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
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
function renderDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d)).toLocaleDateString(locale || "en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function renderDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale || "en-GB", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---- Typographic atoms ---------------------------------------------------


/** 4-bucket aging column with captions beneath — magazine table style. */
function AgingColumn({
  row,
  dense = false,
}: {
  row: Pick<WorklistRow, "aging_0_30" | "aging_30_60" | "aging_60_90" | "aging_90_plus">;
  dense?: boolean;
}) {
  const { t } = useTranslation();
  const total =
    row.aging_0_30 + row.aging_30_60 + row.aging_60_90 + row.aging_90_plus;
  const buckets: Array<{ key: "0_30" | "30_60" | "60_90" | "90_plus"; v: number; tone: string }> = [
    { key: "0_30", v: row.aging_0_30, tone: "bg-good/70" },
    { key: "30_60", v: row.aging_30_60, tone: "bg-warn/70" },
    { key: "60_90", v: row.aging_60_90, tone: "bg-mark/60" },
    { key: "90_plus", v: row.aging_90_plus, tone: "bg-risk" },
  ];
  if (total <= 0) {
    return <span className="caption text-ink-3">—</span>;
  }
  const barHeight = dense ? "h-[3px]" : "h-[6px]";
  return (
    <div className={dense ? "flex flex-col gap-1 w-full" : "flex flex-col gap-2 w-full"}>
      <div className="flex gap-[2px]">
        {buckets.map((b) => {
          const pct = total > 0 ? b.v / total : 0;
          if (pct <= 0)
            return (
              <div
                key={b.key}
                className={`flex-none w-[2px] ${barHeight} bg-rule`}
              />
            );
          return (
            <div
              key={b.key}
              title={`${t(`debt.aging.${b.key}`)} · ${formatUsd(b.v)}`}
              className={`${barHeight} ${b.tone}`}
              style={{ flex: pct }}
            />
          );
        })}
      </div>
      {!dense && (
        <div className="grid grid-cols-4 gap-[2px]">
          {buckets.map((b) => (
            <div key={b.key} className="flex flex-col gap-0.5">
              <span
                className="font-mono text-[10px] uppercase text-ink-3"
                style={{ letterSpacing: "0.08em" }}
              >
                {t(`debt.aging.${b.key}`)}
              </span>
              <span
                className={`mono text-mono-xs tabular-nums ${
                  b.v > 0 ? "text-ink-2" : "text-ink-3"
                }`}
              >
                {b.v > 0 ? formatUsd(b.v) : "·"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutcomeKicker({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation();
  const tone: Record<Outcome, string> = {
    called: "text-ink-2",
    no_answer: "text-ink-3",
    promised: "text-mark",
    rescheduled: "text-warn",
    refused: "text-risk",
    paid: "text-good",
    note: "text-ink-3",
  };
  return (
    <span
      className={`eyebrow ${tone[outcome]}`}
      style={{ letterSpacing: "0.14em" }}
    >
      {t(`debt.outcome.${outcome}`)}
    </span>
  );
}

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

function TelegramGlyph({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M3 11.5 20 5l-2.8 14.2L11 15.4 15.6 10 9 14l-4-1-2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyableAction({
  href,
  onCopy,
  children,
  kind,
}: {
  href?: string;
  onCopy?: string;
  children: ReactNode;
  kind: "phone" | "telegram";
}) {
  const [copied, setCopied] = useState(false);
  if (!onCopy) return null;
  const Glyph = kind === "phone" ? PhoneGlyph : TelegramGlyph;
  return (
    <a
      href={href}
      onClick={(e) => {
        e.stopPropagation();
        if (!href) {
          navigator.clipboard.writeText(onCopy).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }
      }}
      className="group inline-flex items-center gap-2 text-body text-ink-2 hover:text-mark transition-colors"
    >
      <Glyph className="shrink-0 text-ink-3 group-hover:text-mark transition-colors" />
      <span className="mono text-mono-sm tabular-nums">{children}</span>
      <AnimatePresence>
        {copied && (
          <motion.span
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="caption text-good"
          >
            ✓
          </motion.span>
        )}
      </AnimatePresence>
    </a>
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
      {/* ============================================================
          Masthead
          ============================================================ */}
      <div className="stagger-0">
        <div className="caption text-ink-3">
          <span>{t("dashboard.crumb_dashboard")}</span>
          <span className="mx-2 text-ink-3/60">·</span>
          <span>{t("nav.collection")}</span>
          <span className="mx-2 text-ink-3/60">·</span>
          <span className="text-ink-2">{t("nav.debt")}</span>
        </div>

        <div className="mt-3 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <h1 className="serif text-heading-lg text-ink leading-[0.95]">
              <span className="serif-italic">{t("debt.title")}</span>
              <span className="mark-stop">.</span>
            </h1>
            <p className="text-body text-ink-2 mt-3 max-w-[52ch]">
              {t("debt.blurb")}
            </p>
          </div>

          <div className="md:text-right">
            <div
              className="eyebrow text-ink-3"
              style={{ letterSpacing: "0.18em" }}
            >
              {t("debt.kpi.total_ar")}
            </div>
            <div className="serif nums text-[3rem] md:text-[3.6rem] leading-none text-mark mt-2 tabular-nums">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={String(worklist.data?.summary.total_outstanding ?? 0)}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                  className="inline-block"
                >
                  {formatUsd(worklist.data?.summary.total_outstanding ?? 0)}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="mt-1 caption text-ink-3 tabular-nums">
              {worklist.data
                ? t("debt.updated_ago", { s: ageSec ?? 0 })
                : t("common.loading")}
              <span className="ml-2 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-good animate-live-pulse inline-block" />
                <span className="caption text-ink-3">{t("common.live")}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="leader mt-8" />
      </div>

      {/* Tabs */}
      <div className="stagger-1 flex items-end justify-between gap-6">
        <div className="flex items-center gap-8">
          {(["worklist", "prepayments"] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setTab(k);
                setOffset(0);
              }}
              className={[
                "pb-2 relative transition-colors",
                tab === k ? "text-mark" : "text-ink-2 hover:text-ink",
              ].join(" ")}
            >
              <span className="serif-italic text-heading-sm leading-none">
                {t(`debt.tab.${k}`)}
              </span>
              {tab === k && (
                <motion.span
                  layoutId="debt-tab-underline"
                  className="absolute left-0 right-0 -bottom-px h-[2px] bg-mark"
                />
              )}
            </button>
          ))}
        </div>
        {tab === "worklist" && (
          <div className="caption text-ink-3 tabular-nums">
            {worklist.data?.summary.debtor_count ?? 0}{" "}
            {t("debt.col.debtors").toLowerCase()} ·{" "}
            <span className="text-risk">
              {worklist.data?.summary.debtor_over_90_count ?? 0}{" "}
              {t("debt.kpi.over_90_count").toLowerCase()}
            </span>
          </div>
        )}
      </div>

      {tab === "worklist" ? (
        <>
          {/* Editorial masthead — "Today's posting" */}
          <Card className="stagger-2 mt-4" accent>
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

          {showByCollector && (
            <Card className="stagger-3 mt-6 p-0 overflow-hidden">
              <div className="px-5 md:px-7 pt-5 md:pt-7 pb-4 flex items-baseline justify-between">
                <div>
                  <div className="eyebrow" style={{ letterSpacing: "0.18em" }}>
                    {t("debt.by_collector")}
                  </div>
                  <div className="serif-italic text-heading-sm text-ink mt-1">
                    {t("debt.by_collector_title")}
                  </div>
                </div>
                {salesRoomId && (
                  <button
                    onClick={() => {
                      setSalesRoomId("");
                      setOffset(0);
                    }}
                    className="caption text-ink-2 hover:text-mark hover:underline decoration-mark underline-offset-[3px]"
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
                          "h-10 px-5 md:px-7 border-y border-rule eyebrow text-ink-3",
                          i === 0 ? "text-left" : "text-right",
                        ].join(" ")}
                        style={{ letterSpacing: "0.16em" }}
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
                            ? "bg-mark-bg/40"
                            : i % 2 === 0
                              ? "hover:bg-paper-2"
                              : "bg-paper-2/40 hover:bg-paper-2",
                        ].join(" ")}
                      >
                        <td className="h-[48px] px-5 md:px-7 border-b border-rule text-body text-ink relative">
                          {active && (
                            <span
                              aria-hidden
                              className="absolute left-0 top-2 bottom-2 w-[2px] bg-mark rounded-r"
                            />
                          )}
                          <span className="serif-italic">{r.room_name}</span>
                        </td>
                        <td className="h-[48px] px-5 md:px-7 border-b border-rule text-right serif text-ink tabular-nums">
                          {formatUsd(r.outstanding)}
                        </td>
                        <td className="h-[48px] px-5 md:px-7 border-b border-rule text-right text-risk tabular-nums serif">
                          {formatUsd(r.over_90)}
                        </td>
                        <td className="h-[48px] px-5 md:px-7 border-b border-rule text-right caption text-ink-2 tabular-nums">
                          {r.debtors_count}
                        </td>
                        <td className="h-[48px] px-5 md:px-7 border-b border-rule text-right text-good tabular-nums serif">
                          {formatUsd(r.collected_mtd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {/* Filter masthead */}
          <div className="stagger-3 mt-8">
            <div className="eyebrow mb-3" style={{ letterSpacing: "0.18em" }}>
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
                  "inline-flex items-center gap-2 h-10 px-3 rounded-[10px] border transition-colors cursor-pointer select-none",
                  overdueOnly
                    ? "border-mark bg-mark-bg text-mark"
                    : "border-rule bg-card text-ink-2 hover:border-rule-2",
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
                    overdueOnly ? "bg-mark" : "border border-ink-3/50",
                  ].join(" ")}
                />
                <span className="caption">{t("debt.filter.overdue_only")}</span>
              </label>
            </div>
          </div>

          {/* Dossier list */}
          <div className="stagger-4 mt-6 flex flex-col gap-3">
            {worklist.isLoading && (
              <Card className="p-8">
                <div className="caption text-ink-3 text-center">
                  {t("common.loading")}
                </div>
              </Card>
            )}

            {!worklist.isLoading && worklistRows.length === 0 && (
              <Card className="py-16 md:py-24">
                <div className="text-center">
                  <div className="serif-italic text-heading-md text-ink">
                    {t("debt.empty_title")}
                    <span className="mark-stop">.</span>
                  </div>
                  <div className="text-body text-ink-2 mt-3 max-w-[40ch] mx-auto">
                    {t("debt.empty_worklist")}
                  </div>
                </div>
              </Card>
            )}

            {worklistRows.map((r, idx) => (
              <DossierCard
                key={r.person_id}
                row={r}
                rank={offset + idx + 1}
                locale={locale}
                onOpen={() => navigate(`/collection/debt/client/${r.person_id}`)}
              />
            ))}
          </div>

          {worklist.data && worklist.data.total > limit && (
            <div className="stagger-5 mt-6">
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
        </>
      ) : (
        <>
          <div className="stagger-2 mt-6 flex items-center gap-3">
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
            <div className="caption text-ink-3 shrink-0 tabular-nums">
              {(prepayments.data?.total ?? 0).toLocaleString()}{" "}
              {t("debt.tab.prepayments").toLowerCase()}
            </div>
          </div>

          <div className="stagger-3 mt-4 flex flex-col gap-3">
            {(prepayments.data?.rows ?? []).map((r) => (
              <PrepaymentCard key={r.person_id} row={r} locale={locale} />
            ))}

            {!prepayments.isLoading &&
              (prepayments.data?.rows.length ?? 0) === 0 && (
                <Card className="py-16 md:py-24">
                  <div className="text-center">
                    <div className="serif-italic text-heading-md text-ink">
                      {t("debt.empty_prepayments_title")}
                      <span className="mark-stop">.</span>
                    </div>
                    <div className="text-body text-ink-2 mt-3 max-w-[40ch] mx-auto">
                      {t("debt.empty_prepayments")}
                    </div>
                  </div>
                </Card>
              )}
          </div>

          {prepayments.data && prepayments.data.total > limit && (
            <div className="stagger-4 mt-6">
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
    mark: "text-mark",
    risk: "text-risk",
    good: "text-good",
    quiet: "text-ink-3",
  }[tone];
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow text-ink-3" style={{ letterSpacing: "0.18em" }}>
        {label}
      </span>
      <span
        className={`serif nums text-[1.75rem] md:text-[2rem] leading-none tabular-nums ${toneClass}`}
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
        "relative inline-flex items-center gap-2 h-10 pl-3 pr-8 rounded-[10px] border transition-colors cursor-pointer",
        active
          ? "border-mark bg-mark-bg text-mark"
          : "border-rule bg-card text-ink-2 hover:border-rule-2 hover:text-ink",
      ].join(" ")}
    >
      <span
        className="caption text-ink-3 uppercase"
        style={{ letterSpacing: "0.14em" }}
      >
        {label}
      </span>
      <span className="text-body">{current}</span>
      <span
        aria-hidden
        className="absolute right-3 top-1/2 -translate-y-1/2 serif text-ink-3"
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

function DossierCard({
  row,
  rank,
  locale,
  onOpen,
}: {
  row: WorklistRow;
  rank: number;
  locale: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card
      interactive
      className="p-0 overflow-hidden cursor-pointer"
      accent={row.aging_90_plus > 0}
    >
      <div
        onClick={onOpen}
        className="p-5 md:p-7 grid gap-5 md:grid-cols-[auto_minmax(0,1fr)_auto]"
      >
        <div className="flex md:flex-col md:items-end gap-2 md:gap-1 md:w-12 shrink-0 order-1 md:order-1">
          <span
            className="mono text-mono-xs text-ink-3 tabular-nums"
            style={{ letterSpacing: "0.05em" }}
          >
            №{rank.toString().padStart(2, "0")}
          </span>
          {row.has_overdue_promise && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-mark animate-live-pulse"
              title={t("debt.overdue_promise")}
            />
          )}
        </div>

        <div className="order-3 md:order-2 flex flex-col gap-4 min-w-0">
          <div>
            <h3 className="serif-italic text-heading-sm text-ink leading-tight">
              {row.name ?? "—"}
            </h3>
            <div className="mt-1 caption text-ink-3 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {row.primary_room_name && (
                <span>
                  <span className="text-ink-3">
                    {t("debt.col.sales_person")}:
                  </span>{" "}
                  <span className="text-ink-2">{row.primary_room_name}</span>
                </span>
              )}
              {row.direction && (
                <>
                  <span className="text-ink-3/50">·</span>
                  <span className="text-mark">{row.direction}</span>
                </>
              )}
              {row.category && (
                <>
                  <span className="text-ink-3/50">·</span>
                  <span className="text-ink-2">{row.category}</span>
                </>
              )}
              {row.region_name && (
                <>
                  <span className="text-ink-3/50">·</span>
                  <span className="text-ink-2">{row.region_name}</span>
                </>
              )}
              {row.tin && (
                <>
                  <span className="text-ink-3/50">·</span>
                  <span className="mono text-mono-xs">{row.tin}</span>
                </>
              )}
            </div>
          </div>

          {(row.main_phone || row.telegram) && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {row.main_phone && (
                <CopyableAction
                  kind="phone"
                  href={`tel:${row.main_phone.replace(/[^+\d]/g, "")}`}
                  onCopy={row.main_phone}
                >
                  {row.main_phone}
                </CopyableAction>
              )}
              {row.telegram && (
                <CopyableAction kind="telegram" onCopy={row.telegram}>
                  {row.telegram}
                </CopyableAction>
              )}
            </div>
          )}

          <AgingColumn row={row} />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 caption text-ink-3">
            {row.days_since_payment != null && (
              <span className="serif-italic">
                {row.days_since_payment} {t("debt.days")}
              </span>
            )}
            {row.last_contact_at && row.last_contact_outcome && (
              <>
                <span className="text-ink-3/50">·</span>
                <span className="flex items-center gap-1.5">
                  <OutcomeKicker outcome={row.last_contact_outcome} />
                  <span className="serif-italic">
                    {renderDateTime(row.last_contact_at, locale)}
                  </span>
                  {row.last_contact_by && (
                    <span className="text-ink-3">— {row.last_contact_by}</span>
                  )}
                </span>
              </>
            )}
            {row.has_overdue_promise && row.last_promised_amount != null && (
              <>
                <span className="text-ink-3/50">·</span>
                <span className="text-mark serif-italic">
                  ⚠{" "}
                  {t("debt.drawer.promised", {
                    amount: formatUsd(row.last_promised_amount),
                    date: renderDate(row.last_promised_by_date, locale),
                  })}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="order-2 md:order-3 flex flex-col md:items-end justify-start md:justify-start">
          <div className="eyebrow text-ink-3" style={{ letterSpacing: "0.18em" }}>
            {t("debt.col.outstanding")}
          </div>
          <div
            className={[
              "serif nums tabular-nums leading-none mt-2",
              row.aging_90_plus > 0 ? "text-mark" : "text-ink",
            ].join(" ")}
            style={{ fontSize: "2.25rem" }}
          >
            {formatUsd(row.outstanding)}
          </div>
          <div className="caption text-ink-3 mt-2 tabular-nums">
            {t("debt.of_n_invoiced", {
              amount: formatUsd(row.gross_invoiced),
            })}
          </div>
          {(row.opening_debt > 0 || row.opening_credit > 0) && (
            <div
              className="caption italic text-ink-3 mt-1 tabular-nums"
              title={t("debt.opening_hint")}
            >
              {row.opening_debt > 0
                ? t("debt.opening_ar", { amount: formatUsd(row.opening_debt) })
                : t("debt.opening_ap", { amount: formatUsd(row.opening_credit) })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function PrepaymentCard({ row, locale }: { row: PrepayRow; locale: string }) {
  const { t } = useTranslation();
  return (
    <Card className="p-5 md:p-7 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        <h3 className="serif-italic text-heading-sm text-ink leading-tight">
          {row.name ?? "—"}
        </h3>
        <div className="mt-1 caption text-ink-3 flex items-center gap-x-2 flex-wrap">
          {row.region_name && <span>{row.region_name}</span>}
          {row.tin && (
            <>
              <span className="text-ink-3/50">·</span>
              <span className="mono text-mono-xs">{row.tin}</span>
            </>
          )}
          {row.last_payment_date && (
            <>
              <span className="text-ink-3/50">·</span>
              <span>
                {t("debt.col.last_payment")}:{" "}
                <span className="serif-italic">
                  {renderDate(row.last_payment_date, locale)}
                </span>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="md:text-right">
        <div className="eyebrow text-ink-3" style={{ letterSpacing: "0.18em" }}>
          {t("debt.col.credit")}
        </div>
        <div
          className="serif nums tabular-nums text-good leading-none mt-2"
          style={{ fontSize: "2rem" }}
        >
          + {formatUsd(row.credit_balance)}
        </div>
        <div className="caption text-ink-3 mt-2 tabular-nums">
          {t("debt.of_n_invoiced", {
            amount: formatUsd(row.gross_invoiced),
          })}
        </div>
      </div>
    </Card>
  );
}

