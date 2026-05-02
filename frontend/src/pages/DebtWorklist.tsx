/**
 * Qarzlar / Debt collection worklist — Mobile Card Stream rebuild (PR-A).
 *
 * Phone  (<md): vertical DebtorCard stack — avatar, Fraunces amount, aging bar,
 *               tap-to-call/SMS pills.
 * Desktop (md+): card-wrapped 12-col grid of DebtorRow components.
 *
 * Single-column page flow (no right-rail split):
 *   PageHeading → tabs → KPI strip → quick-win banner → filter bar →
 *   live indicator → debtor list → pagination →
 *   by-collector rollup (admin) → aging buckets section
 */
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Search,
  ChevronDown,
  X,
  CheckCircle2,
} from "lucide-react";
import { api } from "../lib/api";
import { formatIsoDate } from "../lib/format";
import { useAuth } from "../lib/auth";
import Card from "../components/Card";
import Input from "../components/Input";
import Pagination from "../components/Pagination";
import PageHeading from "../components/PageHeading";
import DebtorCard from "../components/DebtorCard";
import DebtorRow from "../components/DebtorRow";
import { WorklistRow } from "../components/DebtorCard";

// ---- Types ------------------------------------------------------------------

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


// ---- Formatting helpers -----------------------------------------------------

function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function renderDate(iso: string | null | undefined, _locale: string): string {
  return formatIsoDate(iso);
}


// ---- AgingBucket helper for page-level aggregation -------------------------

function agingBucketPcts(rows: WorklistRow[]) {
  const totals = rows.reduce(
    (acc, r) => ({
      a0: acc.a0 + r.aging_0_30,
      a30: acc.a30 + r.aging_30_60,
      a60: acc.a60 + r.aging_60_90,
      a90: acc.a90 + r.aging_90_plus,
    }),
    { a0: 0, a30: 0, a60: 0, a90: 0 },
  );
  const grand = totals.a0 + totals.a30 + totals.a60 + totals.a90;
  if (grand === 0) return { a0: 0, a30: 0, a60: 0, a90: 0, grand: 0 };
  return {
    a0: (totals.a0 / grand) * 100,
    a30: (totals.a30 / grand) * 100,
    a60: (totals.a60 / grand) * 100,
    a90: (totals.a90 / grand) * 100,
    grand,
  };
}

// ---- Main page --------------------------------------------------------------

export default function Debt() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || "en-GB";
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"worklist" | "prepayments">("worklist");

  // ---- Filter state ---------------------------------------------------------
  const [search, setSearch] = useState("");
  const [salesRoomId, setSalesRoomId] = useState<string>("");
  // direction + outcome kept in state for API query; setters exposed but not
  // yet wired to UI controls in this PR — will be added in a follow-up.
  const [direction, setDirection] = useState<string>("");
  void setDirection; // reserved for future direction-filter chip
  const [agingBucket, setAgingBucket] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("");
  void setOutcome; // reserved for future outcome-filter chip
  const [overdueOnly, setOverdueOnly] = useState(false);
  void setOverdueOnly; // UI removed; state kept for API query param
  const [offset, setOffset] = useState(0);
  const limit = 25;

  // Quick-win banner dismiss (persisted in localStorage)
  const QUICKWIN_KEY = "debt.quickwin.dismissed";
  const [quickwinDismissed, setQuickwinDismissed] = useState(() => {
    try {
      return localStorage.getItem(QUICKWIN_KEY) === "1";
    } catch {
      return false;
    }
  });

  // ---- Queries -------------------------------------------------------------
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

  // ---- Live heartbeat -------------------------------------------------------
  const [heartbeat, setHeartbeat] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => setHeartbeat(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  const lastFetchMs = worklist.dataUpdatedAt || null;
  const ageSec = lastFetchMs
    ? Math.max(0, Math.floor((heartbeat - lastFetchMs) / 1000))
    : null;

  // ---- Derived state --------------------------------------------------------
  const userIsTeamLeadOrAdmin =
    user?.role === "admin" || (user?.scope_rooms.length ?? 0) !== 1;
  const showByCollector =
    userIsTeamLeadOrAdmin && (worklist.data?.by_collector.length ?? 0) > 0;

  const worklistRows = worklist.data?.rows ?? [];
  const summary = worklist.data?.summary;

  // Quick-win: debtors with outstanding < 1,000,000 (in USD that's < 1M — treat as raw < 1_000_000)
  const quickWinCount = worklistRows.filter((r) => r.outstanding > 0 && r.outstanding < 1_000_000).length;
  const showQuickWin = quickWinCount > 0 && !quickwinDismissed;

  // Aging bucket percentages for the "Yosh taqsimoti" section
  const agingPcts = agingBucketPcts(worklistRows);

  // ---- Handlers ------------------------------------------------------------
  const handleDismissQuickWin = () => {
    setQuickwinDismissed(true);
    try { localStorage.setItem(QUICKWIN_KEY, "1"); } catch { /* ignore */ }
  };

  const handleTabChange = (k: "worklist" | "prepayments") => {
    setTab(k);
    setOffset(0);
  };

  // ---- Render --------------------------------------------------------------
  return (
    <div>
      {/* ============================================================
          1. Page Heading
          ============================================================ */}
      <PageHeading
        crumb={[
          t("dashboard.crumb_dashboard"),
          t("nav.collection"),
          t("nav.debt"),
        ]}
        title={t("debt.title")}
        subtitle={t("debt.blurb")}
      />

      {/* ============================================================
          2. Tabs row — worklist | prepayments
          ============================================================ */}
      <div className="flex items-end justify-between gap-6 mb-6">
        <div className="flex items-center gap-8">
          {(["worklist", "prepayments"] as const).map((k) => (
            <button
              key={k}
              onClick={() => handleTabChange(k)}
              className={[
                "pb-2 relative transition-colors",
                tab === k
                  ? "text-primary"
                  : "text-foreground/80 hover:text-foreground",
              ].join(" ")}
            >
              <span className="font-semibold italic text-xl leading-none">
                {t(`debt.tab.${k}`)}
              </span>
              {tab === k && (
                <motion.span
                  layoutId="debt-tab-underline"
                  className="absolute left-0 right-0 -bottom-px h-[2px] bg-primary"
                />
              )}
            </button>
          ))}
        </div>
        {tab === "worklist" && summary && (
          <div className="flex items-center gap-2 text-[12px] text-ink3 font-mono">
            <span className="dot-live" />
            <span>
              {summary.debtor_count} qarzdor &middot;{" "}
              <span className="text-coral font-semibold">
                {summary.debtor_over_90_count} ta 90+
              </span>
            </span>
          </div>
        )}
      </div>

      {/* ============================================================
          WORKLIST TAB
          ============================================================ */}
      {tab === "worklist" ? (
        <>
          {/* ----------------------------------------------------------
              3. KPI Strip — 4 cards horizontal desktop / 2x2 mobile
              Each card: eyebrow → value → sub-detail (8-12px gap each)
              ---------------------------------------------------------- */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {/* (a) Jami qarz — total outstanding */}
            <div className="bg-white rounded-2xl shadow-card p-4 flex flex-col gap-0">
              <div className="eyebrow text-ink3">Jami qarz</div>
              <div className="mt-2">
                <span className="kpi-num text-[28px] md:text-[36px] text-ink">
                  {formatUsd(summary?.total_outstanding ?? 0)}
                </span>
              </div>
              <div className="mt-2 text-[10px] text-ink3 font-mono tracking-wide uppercase">
                USD · umumiy
              </div>
            </div>

            {/* (b) Qarzdorlar — debtor_count */}
            <div className="bg-white rounded-2xl shadow-card p-4 flex flex-col gap-0">
              <div className="eyebrow text-ink3">Qarzdorlar</div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="kpi-num text-[28px] md:text-[36px] text-ink">
                  {(summary?.debtor_count ?? 0).toLocaleString()}
                </span>
                <span className="text-ink3 text-[11px] font-mono">mijoz</span>
              </div>
              <div className="mt-2 text-[10px] text-ink3 font-mono tracking-wide uppercase">
                {t("debt.kpi.debtors")}
              </div>
            </div>

            {/* (c) 90+ kun — debtor_over_90_count / total_over_90 */}
            <div className="bg-white rounded-2xl shadow-card p-4 flex flex-col gap-0">
              <div className="eyebrow" style={{ color: "#B91C1C" }}>90+ kun · xavf</div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="kpi-num text-[28px] md:text-[36px] text-coral">
                  {(summary?.debtor_over_90_count ?? 0).toLocaleString()}
                </span>
                <span className="text-ink3 text-[11px] font-mono">
                  / {(summary?.debtor_count ?? 0)} ta
                </span>
              </div>
              <div className="mt-2 w-full">
                <div className="age-bar">
                  {summary && summary.total_outstanding > 0 ? (
                    <>
                      <span
                        className="age-0"
                        style={{
                          flex: Math.max(0, summary.total_outstanding - summary.total_over_90),
                        }}
                      />
                      <span className="age-90" style={{ flex: summary.total_over_90 }} />
                    </>
                  ) : (
                    <span className="age-0" style={{ flex: 1 }} />
                  )}
                </div>
              </div>
            </div>

            {/* (d) Muddati o'tgan va'dalar — total_overdue_promises */}
            <div
              className="rounded-2xl shadow-card p-4 flex flex-col gap-0"
              style={{ background: "linear-gradient(180deg,#FFFFFF 0%, #F0FDF4 100%)" }}
            >
              <div className="eyebrow" style={{ color: "#059669" }}>
                Muddati o'tgan va'dalar
              </div>
              <div className="mt-2">
                <span className="kpi-num text-[28px] md:text-[36px] text-mintdk">
                  {formatUsd(summary?.total_overdue_promises ?? 0)}
                </span>
              </div>
              <div className="mt-2 text-[10px] text-mintdk font-mono tracking-wide uppercase">
                {t("debt.kpi.overdue_promises")}
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------
              4. Quick-win banner (only when there are small debtors)
              ---------------------------------------------------------- */}
          {showQuickWin && (
            <div
              className="relative rounded-2xl p-[14px] mb-4 overflow-hidden"
              style={{
                background: "linear-gradient(135deg,#ECFDF5 0%,#FFFFFF 60%)",
                boxShadow: "inset 0 0 0 1px #A7F3D0",
              }}
            >
              {/* decorative radial glow */}
              <span
                aria-hidden
                className="absolute right-[-30px] bottom-[-30px] w-[140px] h-[140px] rounded-full pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle,rgba(16,185,129,.18),transparent 60%)",
                }}
              />
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-xl bg-mint text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-[14px] h-[14px]" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-ink text-[13px]">
                    Tezda yopish mumkin
                  </div>
                  <div className="text-[12px] text-ink2 mt-1 leading-snug">
                    {quickWinCount} ta mijoz 1M dan kam — bugun yopilsa, ro'yxatdan
                    chiqadi.
                  </div>
                  <button
                    onClick={() => setAgingBucket("")}
                    className="mt-2 btn-mint-soft text-[12px] px-3 py-1.5 inline-flex items-center gap-1"
                  >
                    Ko'rib chiqish
                  </button>
                </div>
                <button
                  onClick={handleDismissQuickWin}
                  aria-label="Yopish"
                  className="text-ink3 hover:text-ink shrink-0 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------
              5. Filter bar — search row + chip row
              Three controls: scope chip · aging buckets · search.
              HOLAT placeholder chips and visual-only sort removed.
              ---------------------------------------------------------- */}
          <div className="bg-white rounded-2xl shadow-card p-3 mb-3 flex flex-col gap-2">
            {/* Row 1: search input — full width, single line */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[13px] h-[13px] text-ink3" />
              <Input
                placeholder={t("debt.filter.search_placeholder")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
                className="pl-8 h-9 text-[13px] w-full"
              />
            </div>

            {/* Row 2: scope chip + aging bucket segmented control */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Scope chip — salesRoomId filter */}
              {userIsTeamLeadOrAdmin && rooms.data && (
                <div className="relative shrink-0">
                  <button
                    className={[
                      "inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-semibold transition-colors",
                      salesRoomId
                        ? "bg-ink text-white"
                        : "bg-white text-ink2 shadow-[inset_0_0_0_1px_#E5E7EB]",
                    ].join(" ")}
                  >
                    Mening sotuvchilarim
                    {salesRoomId && (
                      <span className="text-[10px] font-mono opacity-70">
                        ({rooms.data.rooms.find((r) => r.room_id === salesRoomId)?.room_name ?? ""})
                      </span>
                    )}
                    <ChevronDown className="w-3 h-3" />
                    <select
                      value={salesRoomId}
                      onChange={(e) => { setSalesRoomId(e.target.value); setOffset(0); }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    >
                      <option value="">Hammasi</option>
                      {rooms.data.rooms.map((r) => (
                        <option key={r.room_id} value={r.room_id}>
                          {r.room_name}
                        </option>
                      ))}
                    </select>
                  </button>
                </div>
              )}

              {/* Aging bucket segmented control */}
              <div
                className="flex items-center gap-1 bg-paper rounded-xl p-1"
                style={{ boxShadow: "inset 0 0 0 1px #E5E7EB" }}
              >
                {(
                  [
                    { v: "", label: "Hammasi" },
                    { v: "0_30", label: "0-30" },
                    { v: "30_60", label: "31-60" },
                    { v: "60_90", label: "61-90" },
                    { v: "90_plus", label: "90+" },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.v}
                    onClick={() => { setAgingBucket(b.v); setOffset(0); }}
                    className={[
                      "h-9 px-3.5 rounded-[10px] text-[13px] font-semibold transition-colors",
                      agingBucket === b.v
                        ? b.v === "90_plus"
                          ? "bg-white text-coraldk border border-coral/40 shadow-sm"
                          : "bg-white text-ink shadow-sm border border-line"
                        : "text-ink3 bg-transparent border border-transparent",
                    ].join(" ")}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------
              6. Live indicator + count
              ---------------------------------------------------------- */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="dot-live" />
              <span className="text-[11px] text-ink3 font-mono">
                {ageSec != null
                  ? t("debt.updated_ago", { s: ageSec })
                  : t("common.loading")}
              </span>
            </div>
            {summary && (
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                  style={{ background: "#F3F4F6", color: "#374151", boxShadow: "inset 0 0 0 1px #E5E7EB" }}
                >
                  {summary.debtor_count} ta
                </span>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                  style={{ background: "#FEF2F2", color: "#DC2626", boxShadow: "inset 0 0 0 1px #FECACA" }}
                >
                  {summary.debtor_over_90_count} ta 90+
                </span>
              </div>
            )}
          </div>

          {/* ----------------------------------------------------------
              7. Debtor list — mobile cards / desktop grid
              ---------------------------------------------------------- */}
          {worklist.isLoading && (
            <Card className="p-8 mb-4">
              <div className="eyebrow text-center">{t("common.loading")}</div>
            </Card>
          )}

          {!worklist.isLoading && worklistRows.length === 0 && (
            <Card className="py-16 md:py-24 mb-4">
              <div className="text-center">
                <div className="font-display font-semibold text-2xl text-foreground">
                  {t("debt.empty_title")}
                  <span className="font-display-italic text-primary">.</span>
                </div>
                <div className="text-sm text-muted-foreground mt-3 max-w-[40ch] mx-auto">
                  {t("debt.empty_worklist")}
                </div>
              </div>
            </Card>
          )}

          {!worklist.isLoading && worklistRows.length > 0 && (
            <>
              {/* ---- MOBILE: card stack ---- */}
              <div className="md:hidden flex flex-col gap-3 mb-4">
                {worklistRows.map((row, i) => (
                  <DebtorCard
                    key={row.person_id}
                    row={row}
                    index={i}
                    onClick={() =>
                      navigate(`/collection/debt/client/${row.person_id}`)
                    }
                  />
                ))}
              </div>

              {/* ---- DESKTOP: card-wrapped 12-col grid ---- */}
              <div className="hidden md:block bg-white rounded-2xl shadow-card overflow-hidden mb-4">
                {/* List header */}
                <div className="flex items-center px-4 py-3 border-b border-line">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink text-[14px]">
                      Qarzdorlar ro'yxati
                    </span>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                      style={{ background: "#F3F4F6", color: "#374151", boxShadow: "inset 0 0 0 1px #E5E7EB" }}
                    >
                      {summary?.debtor_count ?? 0} ta
                    </span>
                    {(summary?.debtor_over_90_count ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                        style={{ background: "#FEF2F2", color: "#DC2626", boxShadow: "inset 0 0 0 1px #FECACA" }}
                      >
                        {summary?.debtor_over_90_count} ta 90+
                      </span>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-2 text-[11px] text-ink3 font-mono">
                    <span className="dot-live" />
                    yangilanmoqda · har 60s
                  </div>
                </div>

                {/* Column header row */}
                <div
                  className="grid grid-cols-12 items-center border-b border-line bg-paper"
                  style={{ height: 36 }}
                >
                  <div className="col-span-1 text-center eyebrow text-[10px] px-3">P</div>
                  <div className="col-span-4 eyebrow text-[10px] px-3">Mijoz</div>
                  <div className="col-span-2 eyebrow text-[10px] px-3 text-right">Summa</div>
                  <div className="col-span-2 eyebrow text-[10px] px-3">Yosh</div>
                  <div className="col-span-2 eyebrow text-[10px] px-3">Oxirgi aloqa</div>
                  <div className="col-span-1 eyebrow text-[10px] px-3 text-right">Aksiya</div>
                </div>

                {/* Rows */}
                {worklistRows.map((row) => (
                  <DebtorRow
                    key={row.person_id}
                    row={row}
                    onClick={() =>
                      navigate(`/collection/debt/client/${row.person_id}`)
                    }
                  />
                ))}
              </div>
            </>
          )}

          {/* ----------------------------------------------------------
              8. Pagination
              ---------------------------------------------------------- */}
          {worklist.data && worklist.data.total > limit && (
            <div className="mb-6">
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

          {/* ----------------------------------------------------------
              9. By-collector rollup (admin / team-lead only)
              ---------------------------------------------------------- */}
          {showByCollector && (
            <div className="bg-white rounded-2xl shadow-card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="eyebrow text-ink3">Admin · sotuvchi bo'yicha</div>
                  <div className="font-semibold text-ink text-[14px] mt-0.5">
                    Sotuvchilar rollup
                  </div>
                </div>
                {salesRoomId && (
                  <button
                    onClick={() => { setSalesRoomId(""); setOffset(0); }}
                    className="text-[11px] text-ink3 hover:text-primary font-semibold"
                  >
                    Filtrni tozalash
                  </button>
                )}
              </div>

              {/* Column labels */}
              <div className="grid grid-cols-12 eyebrow mb-2" style={{ fontSize: 9, letterSpacing: ".14em" }}>
                <div className="col-span-6">Sotuvchi</div>
                <div className="col-span-3 text-right">Mijoz</div>
                <div className="col-span-3 text-right">Qarz</div>
              </div>
              <div className="h-px my-2" style={{ background: "linear-gradient(90deg,transparent,#E5E7EB 20%,#E5E7EB 80%,transparent)" }} />

              {/* Collector rows — top 3 bars: mint, next 3: amber, rest: gray */}
              {worklist.data?.by_collector.map((r, i) => {
                const maxOut = Math.max(
                  ...( worklist.data?.by_collector.map((x) => x.outstanding) ?? [1] ),
                  1,
                );
                const barPct = Math.max(8, (r.outstanding / maxOut) * 100);
                const barColor = i < 3 ? "#10B981" : i < 6 ? "#F59E0B" : "#9CA3AF";
                const active = salesRoomId === r.room_id;
                return (
                  <div
                    key={r.room_id}
                    onClick={() => { setSalesRoomId(active ? "" : r.room_id); setOffset(0); }}
                    className={[
                      "flex items-center gap-2.5 py-2.5 cursor-pointer",
                      i > 0 ? "border-t border-dashed border-line" : "",
                      active ? "opacity-100" : "opacity-90 hover:opacity-100",
                    ].join(" ")}
                  >
                    {/* Avatar */}
                    <div
                      className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold"
                      style={{
                        background: [
                          "linear-gradient(135deg,#10B981,#047857)",
                          "linear-gradient(135deg,#7C3AED,#4C1D95)",
                          "linear-gradient(135deg,#0EA5E9,#075985)",
                          "linear-gradient(135deg,#F472B6,#9D174D)",
                          "linear-gradient(135deg,#F59E0B,#B45309)",
                        ][i % 5],
                      }}
                    >
                      {r.room_name
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                    {/* Name + mini bar */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink text-[13px]">{r.room_name}</div>
                      <div className="mt-1.5 h-[3px] bg-line rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${barPct}%`, background: barColor }}
                        />
                      </div>
                    </div>
                    {/* Stats */}
                    <div className="text-right shrink-0">
                      <div className="text-[12px] text-ink3 font-mono">{r.debtors_count} mijoz</div>
                      <div className="font-semibold text-ink text-[13px] font-mono">
                        {formatUsd(r.outstanding)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Mini stats — placeholder (API doesn't provide recovery%) */}
              <div
                className="h-px my-3"
                style={{ background: "linear-gradient(90deg,transparent,#E5E7EB 20%,#E5E7EB 80%,transparent)" }}
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="eyebrow" style={{ fontSize: 9 }}>Eng yaxshi</div>
                  <div className="font-semibold text-mintdk text-[13px] mt-0.5 font-mono">—</div>
                  <div className="text-[10px] text-ink3 font-mono">recovery %</div>
                </div>
                <div>
                  <div className="eyebrow" style={{ fontSize: 9 }}>O'rtacha</div>
                  <div className="font-semibold text-ink text-[13px] mt-0.5 font-mono">—</div>
                  <div className="text-[10px] text-ink3 font-mono">recovery</div>
                </div>
                <div>
                  <div className="eyebrow" style={{ fontSize: 9 }}>Eng past</div>
                  <div className="font-semibold text-coral text-[13px] mt-0.5 font-mono">—</div>
                  <div className="text-[10px] text-ink3 font-mono">recovery %</div>
                </div>
              </div>

              <button
                className="mt-3 w-full h-10 rounded-xl bg-paper text-ink2 text-[12px] font-semibold flex items-center justify-center gap-1"
                style={{ boxShadow: "inset 0 0 0 1px #E5E7EB" }}
                onClick={() => setSalesRoomId("")}
              >
                Hammasi ({worklist.data?.by_collector.length ?? 0} sotuvchi)
              </button>
            </div>
          )}

          {/* ----------------------------------------------------------
              10. Aging buckets section
              ---------------------------------------------------------- */}
          {worklistRows.length > 0 && (
            <div className="bg-white rounded-2xl shadow-card p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="eyebrow text-ink3">Yosh taqsimoti</div>
                  <div className="font-semibold text-ink text-[14px] mt-0.5">
                    Aging buckets
                  </div>
                </div>
                {(summary?.debtor_over_90_count ?? 0) > 0 && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: "#FEF2F2", color: "#DC2626", boxShadow: "inset 0 0 0 1px #FECACA" }}
                  >
                    {summary?.debtor_over_90_count} ta 90+
                  </span>
                )}
              </div>
              <div className="text-[10px] text-ink3 font-mono mb-3">joriy ko'rish bo'yicha</div>

              <div className="space-y-2">
                {/* 0-30 kun */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-ink2 font-semibold">0 - 30 kun</span>
                    <span className="font-mono text-ink3">
                      {worklistRows.filter((r) => r.aging_0_30 > 0).length} mijoz
                    </span>
                  </div>
                  <div className="age-bar">
                    <span className="age-0" style={{ flex: agingPcts.a0 }} />
                    <span style={{ background: "#F3F4F6", flex: 100 - agingPcts.a0 }} />
                  </div>
                </div>

                {/* 31-60 kun */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-ink2 font-semibold">31 - 60 kun</span>
                    <span className="font-mono text-ink3">
                      {worklistRows.filter((r) => r.aging_30_60 > 0).length} mijoz
                    </span>
                  </div>
                  <div className="age-bar">
                    <span className="age-30" style={{ flex: agingPcts.a30 }} />
                    <span style={{ background: "#F3F4F6", flex: 100 - agingPcts.a30 }} />
                  </div>
                </div>

                {/* 61-90 kun */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-ink2 font-semibold">61 - 90 kun</span>
                    <span className="font-mono text-ink3">
                      {worklistRows.filter((r) => r.aging_60_90 > 0).length} mijoz
                    </span>
                  </div>
                  <div className="age-bar">
                    <span className="age-60" style={{ flex: agingPcts.a60 }} />
                    <span style={{ background: "#F3F4F6", flex: 100 - agingPcts.a60 }} />
                  </div>
                </div>

                {/* 90+ kun */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-coral font-semibold">90+ kun</span>
                    <span className="font-mono text-coral">
                      {worklistRows.filter((r) => r.aging_90_plus > 0).length} mijoz
                      {summary?.total_over_90
                        ? ` · ${formatUsd(summary.total_over_90)}`
                        : ""}
                    </span>
                  </div>
                  <div className="age-bar">
                    <span className="age-90" style={{ flex: agingPcts.a90 }} />
                    <span style={{ background: "#F3F4F6", flex: 100 - agingPcts.a90 }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* ============================================================
           PREPAYMENTS TAB — kept intact from previous implementation
           ============================================================ */
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
            <div className="eyebrow text-ink3 shrink-0 tabular-nums">
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
                    <div className="font-display font-semibold text-2xl text-foreground">
                      {t("debt.empty_prepayments_title")}
                      <span className="font-display-italic text-primary">.</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-3 max-w-[40ch] mx-auto">
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

// ---- Prepayment card (kept from previous impl) ----------------------------

function PrepaymentCard({ row, locale }: { row: PrepayRow; locale: string }) {
  const { t } = useTranslation();
  return (
    <Card className="p-5 md:p-7 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        <h3 className="font-display font-semibold text-xl text-foreground leading-tight">
          {row.name ?? "—"}
        </h3>
        <div className="mt-1 eyebrow text-muted-foreground flex items-center gap-x-2 flex-wrap normal-case text-xs">
          {row.region_name && <span>{row.region_name}</span>}
          {row.tin && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="font-mono">{row.tin}</span>
            </>
          )}
          {row.last_payment_date && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>
                {t("debt.col.last_payment")}:{" "}
                <span className="font-semibold">{renderDate(row.last_payment_date, locale)}</span>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="md:text-right">
        <div className="eyebrow text-muted-foreground">{t("debt.col.credit")}</div>
        <div className="kpi-num tabular-nums text-emerald-700 dark:text-emerald-400 leading-none mt-2 text-[2rem]">
          + {formatUsd(row.credit_balance)}
        </div>
        <div className="eyebrow text-muted-foreground mt-2 tabular-nums normal-case text-xs">
          {t("debt.of_n_invoiced", { amount: formatUsd(row.gross_invoiced) })}
        </div>
      </div>
    </Card>
  );
}
