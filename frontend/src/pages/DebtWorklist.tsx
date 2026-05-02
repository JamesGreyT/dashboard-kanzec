/**
 * Qarzlar / Debt Collection Worklist — Editorial Restraint redesign.
 *
 * Aesthetic: editorial restraint with dramatic serif moments. The page
 * reads like a magazine — a hero masthead with one Fraunces title and
 * two anchored numbers, a hairline-bordered band of secondary stats,
 * a typographic filter strip, and a long magazine-table list of
 * debtors separated by hairline rules (no card chrome).
 *
 * Single-column flow (no right-rail split):
 *   Masthead → secondary band → filter strip →
 *   debtor list → pagination → by-collector → aging buckets
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronDown, X } from "lucide-react";
import { api } from "../lib/api";
import { formatIsoDate } from "../lib/format";
import { useAuth } from "../lib/auth";
import Card from "../components/Card";
import Input from "../components/Input";
import Pagination from "../components/Pagination";
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

// ---- Formatters -------------------------------------------------------------

function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Compact USD: $1.2M, $580K. For hero displays where space is precious. */
function formatUsdCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (abs >= 1_000) {
    return `$${(n / 1_000).toFixed(0)}K`;
  }
  return `$${n.toFixed(0)}`;
}

function renderDate(iso: string | null | undefined): string {
  return formatIsoDate(iso);
}

function formatTodayUz(): string {
  const now = new Date();
  const months = [
    "yanvar", "fevral", "mart", "aprel", "may", "iyun",
    "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr",
  ];
  const day = now.getDate();
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  return `${day} ${month} ${year}`;
}

// ---- Aging aggregation ------------------------------------------------------

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

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function Debt() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || "en-GB";
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"worklist" | "prepayments">("worklist");

  // ---- Filter state ---------------------------------------------------------
  const [search, setSearch] = useState("");
  const [salesRoomId, setSalesRoomId] = useState<string>("");
  const [direction, setDirection] = useState<string>("");
  void setDirection;
  const [agingBucket, setAgingBucket] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("");
  void setOutcome;
  const [overdueOnly, setOverdueOnly] = useState(false);
  void setOverdueOnly;
  const [offset, setOffset] = useState(0);
  const limit = 25;

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

  const quickWinCount = worklistRows.filter(
    (r) => r.outstanding > 0 && r.outstanding < 1_000_000,
  ).length;
  const showQuickWin = quickWinCount > 0 && !quickwinDismissed;

  const agingPcts = agingBucketPcts(worklistRows);

  // ---- Handlers ------------------------------------------------------------
  const handleDismissQuickWin = () => {
    setQuickwinDismissed(true);
    try {
      localStorage.setItem(QUICKWIN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const handleTabChange = (k: "worklist" | "prepayments") => {
    setTab(k);
    setOffset(0);
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="relative pb-20">
      {/* ============================================================
          1. MASTHEAD — editorial hero
          ============================================================ */}
      <header className="relative pt-2 pb-12 md:pt-6 md:pb-16">
        <span aria-hidden className="masthead-bloom" />

        <div className="relative">
          {/* Eyebrow — date as art, oversized DM Mono uppercase */}
          <div className="flex items-center justify-between gap-6 mb-6 md:mb-8">
            <div className="text-[10px] md:text-[11px] font-mono uppercase tracking-[0.22em] text-ink3">
              <span className="text-ink2">{formatTodayUz()}</span>
              <span className="mx-3 text-ink4">/</span>
              <span>Qarzlar bo'limi</span>
              <span className="mx-3 text-ink4">/</span>
              <span className="text-ink3">{t("nav.debt")}</span>
            </div>

            {/* Tabs — inline, refined */}
            <nav className="flex items-center gap-7" aria-label="Bo'limlar">
              {(["worklist", "prepayments"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => handleTabChange(k)}
                  className={[
                    "relative pb-2 transition-colors duration-200",
                    tab === k
                      ? "text-ink"
                      : "text-ink3 hover:text-ink",
                  ].join(" ")}
                >
                  <span className="font-sans text-[13px] font-medium tracking-[-0.005em]">
                    {t(`debt.tab.${k}`)}
                  </span>
                  {tab === k && (
                    <motion.span
                      layoutId="debt-tab-underline"
                      className="absolute left-0 right-0 -bottom-px h-[2px] bg-mint rounded-full"
                      transition={{ duration: 0.28, ease: [0.2, 0.85, 0.25, 1] }}
                    />
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* HERO ROW — title left, anchored numbers right */}
          <div className="grid grid-cols-12 gap-8 items-end">
            {/* Title + standfirst */}
            <div className="col-span-12 md:col-span-7">
              <h1 className="hero-title text-[64px] md:text-[96px] text-ink count-up">
                Qarzlar
              </h1>
              <p className="standfirst mt-4 md:mt-5">
                Barcha qarzdorlar bir ro'yxatda — ustuvorligi, yoshi, oxirgi
                aloqasi va to'lov tarixi bilan.
              </p>
            </div>

            {/* Right anchor — total + over-90 numbers */}
            <div className="col-span-12 md:col-span-5">
              <div className="md:text-right md:pl-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink3 mb-3">
                  Bugungi holat
                </div>
                <div className="hero-num text-[48px] md:text-[68px] text-ink count-up leading-none">
                  {summary
                    ? formatUsdCompact(summary.total_outstanding)
                    : "—"}
                </div>
                <div className="mt-3 flex md:justify-end items-center gap-2.5 text-[12px] font-mono tracking-[0.02em] text-ink3">
                  <span className="dot-live" />
                  <span>jami qarz</span>
                  {summary && summary.debtor_over_90_count > 0 && (
                    <>
                      <span className="text-ink4">·</span>
                      <span className="text-coraldk font-semibold">
                        {summary.debtor_over_90_count} ta xavf ostida
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
          2. SECONDARY BAND — hairline-bordered, four small numbers
          ============================================================ */}
      {tab === "worklist" && summary && (
        <section className="editorial-band relative reveal-up" style={{ animationDelay: "180ms" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-ink/[0.06]">
            <BandStat
              label="Qarzdorlar"
              value={summary.debtor_count.toLocaleString()}
              suffix="mijoz"
            />
            <BandStat
              label="90+ kun"
              value={summary.debtor_over_90_count.toLocaleString()}
              suffix={`/ ${summary.debtor_count} ta`}
              tone="coral"
            />
            <BandStat
              label="90+ summa"
              value={formatUsdCompact(summary.total_over_90)}
              suffix="USD"
              tone="coral"
            />
            <BandStat
              label="Va'dalar"
              value={formatUsdCompact(summary.total_overdue_promises)}
              suffix="muddati o'tgan"
              tone={summary.total_overdue_promises > 0 ? "amber" : "neutral"}
            />
          </div>
        </section>
      )}

      {/* ============================================================
          3. QUICK-WIN CALLOUT — italic Fraunces sentence, no box
          ============================================================ */}
      {tab === "worklist" && showQuickWin && (
        <aside className="relative mt-10 md:mt-14 reveal-up" style={{ animationDelay: "260ms" }}>
          <hr className="hairline-mint mb-5" aria-hidden />
          <div className="flex items-start gap-5 pr-10">
            <div
              className="text-[10px] font-mono uppercase tracking-[0.22em] text-mintdk shrink-0 pt-1"
              style={{ width: 92 }}
            >
              Tezkor yutuq
            </div>
            <p className="standfirst text-ink2 flex-1">
              <span className="font-display italic">{quickWinCount} ta mijoz</span>{" "}
              1M dan kam qarz bilan — bugun yopilsa, ro'yxatdan chiqadi.{" "}
              <button
                onClick={() => setAgingBucket("")}
                className="font-display italic text-mintdk underline decoration-mint/40 underline-offset-4 hover:decoration-mint/70 transition-colors"
              >
                Ko'rib chiqish →
              </button>
            </p>
            <button
              onClick={handleDismissQuickWin}
              aria-label="Yopish"
              className="absolute top-5 right-0 text-ink4 hover:text-ink2 transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </aside>
      )}

      {tab === "worklist" ? (
        <>
          {/* ============================================================
              4. FILTER STRIP — typographic, hairline-only
              ============================================================ */}
          <section
            className="mt-12 md:mt-16 reveal-up"
            style={{ animationDelay: "320ms" }}
          >
            {/* Search — typographic underline */}
            <div className="relative">
              <Search
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink3 pointer-events-none"
                strokeWidth={1.6}
              />
              <input
                type="text"
                placeholder="Mijozni qidirish — nom, TIN, telefon"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
                className="editorial-search"
              />
            </div>

            {/* Filter row — scope chip + aging tabs */}
            <div className="flex items-center justify-between flex-wrap gap-x-6 gap-y-3 mt-5 md:mt-6">
              <div className="flex items-center gap-5 flex-wrap">
                {userIsTeamLeadOrAdmin && rooms.data && (
                  <ScopeDropdown
                    rooms={rooms.data.rooms}
                    value={salesRoomId}
                    onChange={(v) => {
                      setSalesRoomId(v);
                      setOffset(0);
                    }}
                  />
                )}

                {/* Aging segmented — tab-bar style with mint underline */}
                <div className="flex items-center gap-1 -mb-px">
                  {(
                    [
                      { v: "", label: "Hammasi" },
                      { v: "0_30", label: "0–30" },
                      { v: "30_60", label: "31–60" },
                      { v: "60_90", label: "61–90" },
                      { v: "90_plus", label: "90+" },
                    ] as const
                  ).map((b) => (
                    <button
                      key={b.v}
                      onClick={() => {
                        setAgingBucket(b.v);
                        setOffset(0);
                      }}
                      className={[
                        "seg-tab",
                        agingBucket === b.v ? "active" : "",
                        b.v === "90_plus" ? "coral" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live indicator — right-aligned */}
              <div className="live-line">
                <span className="dot-live" />
                <span>
                  {ageSec != null
                    ? t("debt.updated_ago", { s: ageSec })
                    : t("common.loading")}
                </span>
              </div>
            </div>

            <hr className="hairline mt-5 md:mt-6" aria-hidden />
          </section>

          {/* ============================================================
              5. DEBTOR LIST — magazine table on desktop, editorial cards on mobile
              ============================================================ */}
          <section className="mt-2">
            {worklist.isLoading && (
              <div className="py-24 text-center">
                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink3">
                  Yuklanmoqda
                </div>
              </div>
            )}

            {!worklist.isLoading && worklistRows.length === 0 && (
              <div className="py-24 md:py-32 text-center">
                <h2 className="hero-title text-[42px] text-ink">
                  {t("debt.empty_title")}
                </h2>
                <p className="standfirst mt-4 mx-auto">
                  {t("debt.empty_worklist")}
                </p>
              </div>
            )}

            {!worklist.isLoading && worklistRows.length > 0 && (
              <>
                {/* MOBILE: editorial card stack with hairline rules */}
                <div className="md:hidden -mx-4">
                  <div className="bg-white">
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
                </div>

                {/* DESKTOP: magazine table — no card chrome, hairline rules */}
                <div className="hidden md:block bg-white -mx-4 lg:-mx-7 rounded-none border-y border-ink/[0.06]">
                  {/* Column header — uppercase mono, generous padding */}
                  <div
                    className="grid grid-cols-12 items-center px-7 py-4 border-b border-ink/[0.06]"
                  >
                    <div className="col-span-1 text-center text-[9px] font-mono uppercase tracking-[0.22em] text-ink3">
                      P
                    </div>
                    <div className="col-span-4 text-[9px] font-mono uppercase tracking-[0.22em] text-ink3">
                      Mijoz
                    </div>
                    <div className="col-span-2 text-right pr-4 text-[9px] font-mono uppercase tracking-[0.22em] text-ink3">
                      Summa
                    </div>
                    <div className="col-span-2 text-[9px] font-mono uppercase tracking-[0.22em] text-ink3">
                      Yosh
                    </div>
                    <div className="col-span-2 text-[9px] font-mono uppercase tracking-[0.22em] text-ink3">
                      Oxirgi aloqa
                    </div>
                    <div className="col-span-1 text-right text-[9px] font-mono uppercase tracking-[0.22em] text-ink3">
                      Aksiya
                    </div>
                  </div>

                  {worklistRows.map((row, i) => (
                    <DebtorRow
                      key={row.person_id}
                      row={row}
                      index={i}
                      onClick={() =>
                        navigate(`/collection/debt/client/${row.person_id}`)
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ============================================================
              6. PAGINATION
              ============================================================ */}
          {worklist.data && worklist.data.total > limit && (
            <div className="mt-8 md:mt-10 px-1">
              <Pagination
                offset={offset}
                limit={limit}
                total={worklist.data.total}
                onOffset={setOffset}
              />
            </div>
          )}

          {/* ============================================================
              7. BY-COLLECTOR ROLLUP — admin-only
              ============================================================ */}
          {showByCollector && worklist.data && (
            <ByCollectorSection
              data={worklist.data.by_collector}
              activeRoomId={salesRoomId}
              onRoomToggle={(id) => {
                setSalesRoomId(salesRoomId === id ? "" : id);
                setOffset(0);
              }}
              onClear={() => {
                setSalesRoomId("");
                setOffset(0);
              }}
            />
          )}

          {/* ============================================================
              8. AGING BUCKETS — section
              ============================================================ */}
          {worklistRows.length > 0 && summary && (
            <AgingBucketsSection
              rows={worklistRows}
              pcts={agingPcts}
              over90Count={summary.debtor_over_90_count}
              over90Total={summary.total_over_90}
            />
          )}
        </>
      ) : (
        // ============================================================
        // PREPAYMENTS TAB — kept structurally intact
        // ============================================================
        <section className="mt-12">
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
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink3 shrink-0">
              {(prepayments.data?.total ?? 0).toLocaleString()}{" "}
              {t("debt.tab.prepayments").toLowerCase()}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {(prepayments.data?.rows ?? []).map((r) => (
              <PrepaymentCard key={r.person_id} row={r} locale={locale} />
            ))}

            {!prepayments.isLoading &&
              (prepayments.data?.rows.length ?? 0) === 0 && (
                <div className="py-24 md:py-32 text-center">
                  <h2 className="hero-title text-[42px] text-ink">
                    {t("debt.empty_prepayments_title")}
                  </h2>
                  <p className="standfirst mt-4 mx-auto">
                    {t("debt.empty_prepayments")}
                  </p>
                </div>
              )}
          </div>

          {prepayments.data && prepayments.data.total > limit && (
            <div className="mt-8">
              <Pagination
                offset={offset}
                limit={limit}
                total={prepayments.data.total}
                onOffset={setOffset}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** A single number in the secondary editorial band. */
function BandStat({
  label,
  value,
  suffix,
  tone = "neutral",
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "neutral" | "coral" | "amber";
}) {
  const valueClass =
    tone === "coral"
      ? "text-coraldk"
      : tone === "amber"
        ? "text-[#B45309]"
        : "text-ink";

  return (
    <div className="px-5 md:px-7 py-5 md:py-6 bg-transparent">
      <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3 mb-2.5">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`hero-num text-[28px] md:text-[34px] ${valueClass}`}>
          {value}
        </span>
        {suffix && (
          <span className="text-[11px] font-mono text-ink3 tracking-[0.04em]">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/** Refined scope dropdown — rendered as a button with a soft chevron. */
function ScopeDropdown({
  rooms,
  value,
  onChange,
}: {
  rooms: Room[];
  value: string;
  onChange: (v: string) => void;
}) {
  const active = !!value;
  const activeRoom = rooms.find((r) => r.room_id === value);

  return (
    <div className="relative">
      <button
        className={[
          "inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium tracking-[-0.005em] transition-all",
          active
            ? "bg-ink text-white shadow-[0_4px_12px_-4px_rgba(17,24,39,0.18)]"
            : "bg-transparent text-ink2 shadow-[inset_0_0_0_1px_rgba(17,24,39,0.14)] hover:shadow-[inset_0_0_0_1px_rgba(17,24,39,0.24)]",
        ].join(" ")}
      >
        <span>{active ? activeRoom?.room_name ?? "Filter" : "Mening sotuvchilarim"}</span>
        <ChevronDown className="w-3 h-3 opacity-70" strokeWidth={2} />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full"
        >
          <option value="">Hammasi</option>
          {rooms.map((r) => (
            <option key={r.room_id} value={r.room_id}>
              {r.room_name}
            </option>
          ))}
        </select>
      </button>
    </div>
  );
}

/** By-collector section — full-width hairline composition, not a card. */
function ByCollectorSection({
  data,
  activeRoomId,
  onRoomToggle,
  onClear,
}: {
  data: WorklistResp["by_collector"];
  activeRoomId: string;
  onRoomToggle: (id: string) => void;
  onClear: () => void;
}) {
  const maxOut = Math.max(...data.map((x) => x.outstanding), 1);

  return (
    <section
      className="mt-16 md:mt-24 reveal-up"
      style={{ animationDelay: "120ms" }}
    >
      {/* Section header */}
      <div className="flex items-end justify-between mb-7 gap-4">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3 mb-2">
            Admin
          </div>
          <h2 className="hero-title text-[28px] md:text-[34px] text-ink">
            Sotuvchilar bo'yicha
          </h2>
        </div>
        {activeRoomId && (
          <button
            onClick={onClear}
            className="text-[12px] text-ink3 hover:text-ink font-sans tracking-[-0.005em] transition-colors"
          >
            Filtrni tozalash →
          </button>
        )}
      </div>

      <hr className="hairline mb-1" aria-hidden />

      <div>
        {data.map((r, i) => {
          const barPct = Math.max(8, (r.outstanding / maxOut) * 100);
          const isTop3 = i < 3;
          const isMid = i >= 3 && i < 6;
          const barColor = isTop3 ? "#10B981" : isMid ? "#F59E0B" : "#9CA3AF";
          const isActive = activeRoomId === r.room_id;
          const initials = r.room_name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0])
            .join("")
            .toUpperCase();

          return (
            <div
              key={r.room_id}
              onClick={() => onRoomToggle(r.room_id)}
              className={[
                "row-editorial cursor-pointer",
                "grid grid-cols-12 items-center px-7 py-5 border-b border-ink/[0.06]",
                isActive ? "bg-mintbg/40" : "",
              ].join(" ")}
            >
              {/* Rank + avatar */}
              <div className="col-span-1 flex items-center gap-3 pr-4">
                <span className="text-[10px] font-mono text-ink4 tracking-[0.04em]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              {/* Avatar + name + bar */}
              <div className="col-span-7 flex items-center gap-4 pr-6 min-w-0">
                <div
                  className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-semibold tracking-[0.02em]"
                  style={{
                    background: [
                      "linear-gradient(135deg,#1F2937,#374151)",
                      "linear-gradient(135deg,#7E22CE,#581C87)",
                      "linear-gradient(135deg,#0E7490,#155E75)",
                      "linear-gradient(135deg,#9F1239,#881337)",
                      "linear-gradient(135deg,#92400E,#78350F)",
                    ][i % 5],
                    fontSize: 11,
                  }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-sans font-semibold text-ink text-[14px] truncate leading-tight tracking-[-0.005em]">
                    {r.room_name}
                  </div>
                  <div className="mt-2 h-[3px] bg-ink/[0.05] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full draw-in-w"
                      style={{
                        width: `${barPct}%`,
                        background: barColor,
                        animationDelay: `${i * 60}ms`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Mijoz count */}
              <div className="col-span-2 text-right pr-4">
                <div className="text-[12px] font-mono text-ink3 tracking-[0.02em]">
                  {r.debtors_count} mijoz
                </div>
              </div>

              {/* Outstanding */}
              <div className="col-span-2 text-right">
                <div className="hero-num text-[18px] text-ink leading-none">
                  {formatUsdCompact(r.outstanding)}
                </div>
                <div className="text-[9px] font-mono text-ink4 mt-1 tracking-[0.16em] uppercase">
                  USD
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Aging buckets section — refined typographic composition. */
function AgingBucketsSection({
  rows,
  pcts,
  over90Count,
  over90Total,
}: {
  rows: WorklistRow[];
  pcts: { a0: number; a30: number; a60: number; a90: number; grand: number };
  over90Count: number;
  over90Total: number;
}) {
  const buckets = [
    {
      label: "0 – 30 kun",
      count: rows.filter((r) => r.aging_0_30 > 0).length,
      pct: pcts.a0,
      color: "#10B981",
      labelClass: "text-ink2",
      countClass: "text-ink3",
    },
    {
      label: "31 – 60 kun",
      count: rows.filter((r) => r.aging_30_60 > 0).length,
      pct: pcts.a30,
      color: "#34D399",
      labelClass: "text-ink2",
      countClass: "text-ink3",
    },
    {
      label: "61 – 90 kun",
      count: rows.filter((r) => r.aging_60_90 > 0).length,
      pct: pcts.a60,
      color: "#F59E0B",
      labelClass: "text-[#B45309]",
      countClass: "text-ink3",
    },
    {
      label: "90+ kun",
      count: rows.filter((r) => r.aging_90_plus > 0).length,
      pct: pcts.a90,
      color: "#FB923C",
      labelClass: "text-coraldk",
      countClass: "text-coraldk",
    },
  ];

  return (
    <section
      className="mt-16 md:mt-24 reveal-up"
      style={{ animationDelay: "180ms" }}
    >
      <div className="flex items-end justify-between mb-7 gap-4">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3 mb-2">
            Yosh taqsimoti
          </div>
          <h2 className="hero-title text-[28px] md:text-[34px] text-ink">
            Aging buckets
          </h2>
          <p className="standfirst mt-2 text-[14px]">
            Joriy ko'rish bo'yicha — ekrandagi mijozlar.
          </p>
        </div>
        {over90Count > 0 && (
          <div className="text-right shrink-0">
            <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink3 mb-1">
              90+ summa
            </div>
            <div className="hero-num text-[26px] text-coraldk leading-none">
              {formatUsdCompact(over90Total)}
            </div>
          </div>
        )}
      </div>

      <hr className="hairline mb-6" aria-hidden />

      <div className="space-y-5 md:space-y-6">
        {buckets.map((b, i) => (
          <div key={b.label}>
            <div className="flex items-baseline justify-between mb-2.5">
              <span className={`text-[13px] font-sans font-semibold tracking-[-0.005em] ${b.labelClass}`}>
                {b.label}
              </span>
              <span className={`text-[12px] font-mono ${b.countClass} tracking-[0.02em]`}>
                {b.count} mijoz
                {b.label === "90+ kun" && over90Total > 0 && (
                  <span className="ml-2">· {formatUsdCompact(over90Total)}</span>
                )}
              </span>
            </div>
            <div
              className="rounded-full overflow-hidden"
              style={{ background: "rgba(17,24,39,0.04)", height: 4 }}
            >
              <div
                className="h-full rounded-full draw-in-w"
                style={{
                  width: `${b.pct}%`,
                  background: b.color,
                  animationDelay: `${100 + i * 80}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Prepayment card (kept editorial-clean) -------------------------------

function PrepaymentCard({ row, locale }: { row: PrepayRow; locale: string }) {
  const { t } = useTranslation();
  void locale;

  return (
    <Card className="p-6 md:p-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div>
        <h3 className="hero-title text-[22px] md:text-[26px] text-ink leading-tight">
          {row.name ?? "—"}
        </h3>
        <div className="mt-3 text-[12px] font-mono text-ink3 flex items-center gap-x-4 gap-y-1 flex-wrap tracking-[0.02em]">
          {row.region_name && <span>{row.region_name}</span>}
          {row.tin && (
            <>
              <span className="text-ink4">·</span>
              <span>{row.tin}</span>
            </>
          )}
          {row.last_payment_date && (
            <>
              <span className="text-ink4">·</span>
              <span>
                {t("debt.col.last_payment")}:{" "}
                <span className="font-semibold text-ink2">
                  {renderDate(row.last_payment_date)}
                </span>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="md:text-right">
        <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-mintdk mb-1.5">
          Kredit balans
        </div>
        <div className="hero-num text-[34px] md:text-[40px] text-mintdk leading-none">
          + {formatUsd(row.credit_balance)}
        </div>
        <div className="text-[10px] font-mono text-ink3 mt-2 tracking-[0.04em]">
          {t("debt.of_n_invoiced", { amount: formatUsd(row.gross_invoiced) })}
        </div>
      </div>
    </Card>
  );
}
