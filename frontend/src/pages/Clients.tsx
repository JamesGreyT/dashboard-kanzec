/**
 * Clients (AR-aging) — the "Almanac of Receivables".
 *
 * Editorial broadsheet treatment of the per-client AR ledger: italic
 * Fraunces client names, JetBrains Mono ledger figures, a four-stat
 * masthead KPI strip, ChipSelect filters (matching DebtWorklist), and a
 * sticky-header ledger table with tier-colored aging buckets. Same data
 * model and API as before — this file is purely a visual/structural
 * redesign of the previous flat 13-column table.
 */
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../lib/api";
import Card from "../components/Card";
import Input from "../components/Input";
import Pagination from "../components/Pagination";

interface ClientRow {
  person_id: string;
  client_name: string | null;
  tin: string | null;
  region_name: string | null;
  category: string | null;
  direction: string | null;
  client_group: string | null;
  term_days: number;
  opening_debt: number;
  opening_credit: number;
  sotuv: number;
  vozrat: number;
  tolov: number;
  total_credits: number;
  total_debt: number;
  qarz: number;
  not_due: number;
  overdue: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
  overdue_0: number;
  overdue_30: number;
  overdue_60: number;
  overdue_90: number;
  last_order_date: string | null;
  last_payment_date: string | null;
  primary_room_id: string | null;
  manager: string | null;
}

interface AgingResp {
  rows: ClientRow[];
  total: number;
  summary: {
    debtor_count: number;
    total_qarz: number;
    total_sotuv: number;
    total_tolov: number;
    total_overdue: number;
    total_over_90: number;
    total_opening_debt: number;
    total_opening_credit: number;
  };
  default_term_days: number;
}

interface Room {
  room_id: string;
  room_code: string | null;
  room_name: string;
}

const GROUPS = ["A", "B", "C", "D"] as const;

// Same direction values as DataViewer / DebtWorklist — kept inline to avoid
// cross-page coupling. Sync with backend ALLOWED_DIRECTIONS.
const DIRECTIONS = [
  "B2B", "Yangi", "MATERIAL", "Export", "Цех", "Marketplace",
  "Online", "Doʻkon", "BAZA",
  "Sergeli 6/4/1 D", "Farxod bozori D", "Sergeli 3/3/13 D",
];

// Yoʻnalish → tone class. Mirrors the same map in DebtWorklist; kept inline
// since cross-page sharing is more friction than copy.
const DIRECTION_TONE: Record<string, string> = {
  "B2B":         "bg-primary/10 text-primary",
  "Yangi":       "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  "MATERIAL":    "bg-primary/10 text-primary",
  "Export":      "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  "Цех":         "bg-[rgba(136,125,110,0.2)] text-foreground/80",
  "Marketplace": "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  "Online":      "bg-[rgba(107,115,133,0.15)] text-foreground/80",
  "Doʻkon":      "bg-primary/10 text-primary",
  "BAZA":        "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
};

// A/B/C/D tier coloring. A = endorsed, D = at-risk.
const GROUP_TONE: Record<string, string> = {
  A: "bg-emerald-100/60 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border-emerald-700/20",
  B: "bg-muted text-foreground border-border",
  C: "bg-amber-100/70 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-700/30",
  D: "bg-red-100/70 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-700/30",
};

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const frac = Math.round((abs - Math.trunc(abs)) * 100);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: frac === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function fmtZero(n: number | null | undefined): string {
  if (n == null || n === 0) return "·";
  return fmtNum(n);
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function Clients() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [salesRoomId, setSalesRoomId] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [direction, setDirection] = useState<string>("");
  const [clientGroup, setClientGroup] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(h);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, salesRoomId, region, direction, clientGroup, overdueOnly]);

  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/api/rooms"),
  });

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (salesRoomId) p.set("sales_manager_room_id", salesRoomId);
    if (region) p.set("region", region);
    if (direction) p.set("direction", direction);
    if (clientGroup) p.set("client_group", clientGroup);
    if (overdueOnly) p.set("overdue_only", "true");
    return p.toString();
  }, [offset, debouncedSearch, salesRoomId, region, direction, clientGroup, overdueOnly]);

  const aging = useQuery({
    queryKey: ["clients.aging", qs],
    queryFn: () => api<AgingResp>(`/api/debt/clients-aging?${qs}`),
    refetchInterval: 60_000,
  });

  // "live" pulse — seconds since last successful fetch.
  const [heartbeat, setHeartbeat] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => setHeartbeat(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  const lastFetchMs = aging.dataUpdatedAt || null;
  const ageSec = lastFetchMs
    ? Math.max(0, Math.floor((heartbeat - lastFetchMs) / 1000))
    : null;

  const rows = aging.data?.rows ?? [];
  const total = aging.data?.total ?? 0;
  const summary = aging.data?.summary;

  return (
    <div>
      {/* ============================================================
          Masthead — crumb · italic display title · KPI anchor
          ============================================================ */}
      <div className="stagger-0">
        <div className="caption text-muted-foreground">
          <span>{t("dashboard.crumb_dashboard")}</span>
          <span className="mx-2 text-muted-foreground/60">·</span>
          <span>{t("nav.collection")}</span>
          <span className="mx-2 text-muted-foreground/60">·</span>
          <span className="text-foreground/80">{t("nav.clients")}</span>
        </div>

        <div className="mt-3 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <h1 className="text-4xl md:text-[2.75rem] font-semibold tracking-tight text-foreground leading-[0.95]">
              <span className="font-display-italic">{t("clients.title")}</span>
              <span className="text-primary">.</span>
            </h1>
            <p className="text-sm text-foreground/80 mt-3 max-w-[58ch]">
              {t("clients.blurb")}
            </p>
          </div>

          <div className="md:text-right">
            <div className="eyebrow">{t("clients.kpi.total_qarz")}</div>
            <div className="nums text-[2.75rem] md:text-[3.5rem] leading-none text-primary mt-2 tabular-nums font-mono">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={String(summary?.total_qarz ?? 0)}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                  className="inline-block"
                >
                  {fmtUsd(summary?.total_qarz ?? 0)}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="mt-1 caption text-muted-foreground tabular-nums">
              {summary
                ? `${summary.debtor_count.toLocaleString()} ${t("clients.kpi.clients")}`
                : t("common.loading")}
              <span className="ml-2 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                <span className="caption text-muted-foreground tabular-nums">
                  {ageSec != null ? `${ageSec}s` : "—"}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="mark-rule mt-8" />
      </div>

      {/* ============================================================
          KPI strip — four-stat masthead
          ============================================================ */}
      <div className="stagger-1">
        <Card className="mt-6 p-5 md:p-7" accent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-5 gap-x-6">
            <MastheadStat
              label={t("clients.kpi.total_qarz")}
              value={fmtUsd(summary?.total_qarz ?? 0)}
              tone="ink"
            />
            <MastheadStat
              label={t("clients.col.overdue")}
              value={fmtUsd(summary?.total_overdue ?? 0)}
              tone={summary?.total_overdue ? "mark" : "quiet"}
            />
            <MastheadStat
              label={t("clients.col.bucket_90_plus")}
              value={fmtUsd(summary?.total_over_90 ?? 0)}
              tone={summary?.total_over_90 ? "risk" : "quiet"}
            />
            <MastheadStat
              label={t("clients.kpi.clients")}
              value={(summary?.debtor_count ?? 0).toLocaleString()}
              tone="quiet"
            />
          </div>
        </Card>
      </div>

      {/* ============================================================
          Filter strip — search input + ChipSelects + overdue toggle
          ============================================================ */}
      <div className="stagger-2 mt-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="grow min-w-[260px] max-w-md">
            <Input
              placeholder={t("clients.search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <ChipSelect
            label={t("clients.filter.manager")}
            value={salesRoomId}
            onChange={setSalesRoomId}
            options={[
              { value: "", label: t("clients.filter.manager") },
              ...(rooms.data?.rooms ?? []).map((r) => ({
                value: r.room_id,
                label: r.room_name,
              })),
            ]}
          />

          <ChipSelect
            label={t("clients.filter.direction")}
            value={direction}
            onChange={setDirection}
            options={[
              { value: "", label: t("clients.filter.direction") },
              ...DIRECTIONS.map((d) => ({ value: d, label: d })),
            ]}
          />

          <ChipSelect
            label={t("clients.filter.group")}
            value={clientGroup}
            onChange={setClientGroup}
            options={[
              { value: "", label: t("clients.filter.group") },
              ...GROUPS.map((g) => ({ value: g, label: g })),
            ]}
          />

          <ChipInput
            label={t("clients.filter.region")}
            value={region}
            onChange={setRegion}
          />

          <label
            className={[
              "inline-flex items-center gap-2 h-10 px-3 rounded-[10px] border transition-colors cursor-pointer select-none",
              overdueOnly
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-foreground/80 hover:border-primary/40",
            ].join(" ")}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            <span
              aria-hidden
              className={[
                "inline-block h-3 w-3 rounded-sm transition-colors",
                overdueOnly ? "bg-primary" : "border border-foreground/30",
              ].join(" ")}
            />
            <span className="caption">{t("clients.filter.overdue_only")}</span>
          </label>
        </div>
      </div>

      {/* ============================================================
          Ledger table
          ============================================================ */}
      <div className="stagger-3 mt-6">
        {aging.isLoading && (
          <Card className="p-12">
            <div className="caption text-muted-foreground text-center">
              {t("common.loading")}
            </div>
          </Card>
        )}

        {!aging.isLoading && aging.isError && (
          <Card className="p-8">
            <div className="caption text-red-700 dark:text-red-400 text-center">
              {(aging.error as Error)?.message ?? t("common.error")}
            </div>
          </Card>
        )}

        {!aging.isLoading && !aging.isError && rows.length === 0 && (
          <Card className="py-16 md:py-24">
            <div className="text-center">
              <div className="font-display-italic text-3xl tracking-tight text-foreground">
                {t("clients.empty")}
                <span className="text-primary">.</span>
              </div>
            </div>
          </Card>
        )}

        {!aging.isLoading && !aging.isError && rows.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table
                className="w-full border-collapse text-[13px]"
                style={{ tableLayout: "fixed", minWidth: 1320 }}
              >
                <colgroup>
                  <col style={{ width: 240 }} /> {/* Mijoz */}
                  <col style={{ width: 64 }} />  {/* Necha kun */}
                  <col style={{ width: 130 }} /> {/* Qarz */}
                  <col style={{ width: 110 }} /> {/* Muddati tugamagan */}
                  <col style={{ width: 110 }} /> {/* Muddati o'tgan */}
                  <col style={{ width: 92 }} />  {/* 1-30 */}
                  <col style={{ width: 92 }} />  {/* 31-60 */}
                  <col style={{ width: 92 }} />  {/* 61-90 */}
                  <col style={{ width: 92 }} />  {/* 90+ */}
                  <col style={{ width: 130 }} /> {/* Meneger */}
                  <col style={{ width: 120 }} /> {/* Region */}
                  <col style={{ width: 110 }} /> {/* Yo'nalish */}
                  <col style={{ width: 50 }} />  {/* Group */}
                </colgroup>

                <thead className="sticky top-0 z-20">
                  <tr>
                    <LedgerTh sticky>{t("clients.col.client")}</LedgerTh>
                    <LedgerTh align="right">{t("clients.col.term_days")}</LedgerTh>
                    <LedgerTh align="right" anchor>{t("clients.col.qarz")}</LedgerTh>
                    <LedgerTh align="right">{t("clients.col.not_due")}</LedgerTh>
                    <LedgerTh align="right">{t("clients.col.overdue")}</LedgerTh>
                    <LedgerTh align="right">{t("clients.col.bucket_1_30")}</LedgerTh>
                    <LedgerTh align="right">{t("clients.col.bucket_31_60")}</LedgerTh>
                    <LedgerTh align="right">{t("clients.col.bucket_61_90")}</LedgerTh>
                    <LedgerTh align="right">{t("clients.col.bucket_90_plus")}</LedgerTh>
                    <LedgerTh>{t("clients.col.manager")}</LedgerTh>
                    <LedgerTh>{t("clients.col.region")}</LedgerTh>
                    <LedgerTh>{t("clients.col.direction")}</LedgerTh>
                    <LedgerTh align="center">{t("clients.col.group")}</LedgerTh>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r, i) => (
                    <LedgerRow
                      key={r.person_id}
                      row={r}
                      zebra={i % 2 === 1}
                      onOpen={() => navigate(`/collection/debt/client/${r.person_id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {total > limit && (
        <div className="mt-6">
          <Card className="p-0 overflow-hidden">
            <Pagination
              offset={offset}
              limit={limit}
              total={total}
              onOffset={setOffset}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Atoms
// ============================================================

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
    ink: "text-foreground",
    mark: "text-primary",
    risk: "text-red-700 dark:text-red-400",
    good: "text-emerald-700 dark:text-emerald-400",
    quiet: "text-muted-foreground",
  }[tone];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      <span
        className={`nums font-mono text-[1.65rem] md:text-[1.9rem] leading-none tabular-nums ${toneClass}`}
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
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-foreground/80 hover:border-primary/40 hover:text-foreground",
      ].join(" ")}
    >
      <span
        className="caption text-muted-foreground uppercase"
        style={{ letterSpacing: "0.14em" }}
      >
        {label}
      </span>
      <span className="text-sm">{current}</span>
      <span
        aria-hidden
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        ▾
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label={label}
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

function ChipInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const active = value !== "";
  return (
    <label
      className={[
        "relative inline-flex items-center gap-2 h-10 pl-3 pr-3 rounded-[10px] border transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-foreground/80 focus-within:border-primary/40",
      ].join(" ")}
    >
      <span
        className="caption text-muted-foreground uppercase shrink-0"
        style={{ letterSpacing: "0.14em" }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none text-sm w-[120px] placeholder:text-muted-foreground/70"
        placeholder="—"
        aria-label={label}
      />
    </label>
  );
}

// ============================================================
// Ledger table parts
// ============================================================

function LedgerTh({
  children,
  align = "left",
  sticky = false,
  anchor = false,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  sticky?: boolean;
  anchor?: boolean;
}) {
  return (
    <th
      className={[
        "h-11 px-3 md:px-4 border-y border-border bg-card",
        "eyebrow text-muted-foreground",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        anchor ? "text-foreground" : "",
        sticky ? "sticky left-0 z-10 bg-card" : "",
      ].join(" ")}
      style={{ letterSpacing: "0.14em" }}
    >
      {children}
    </th>
  );
}

function LedgerRow({
  row,
  zebra,
  onOpen,
}: {
  row: ClientRow;
  zebra: boolean;
  onOpen: () => void;
}) {
  const r = row;
  const directionTone = r.direction
    ? DIRECTION_TONE[r.direction] ?? "bg-muted text-foreground/80"
    : "bg-transparent text-muted-foreground";
  const groupTone = GROUP_TONE[r.client_group ?? "A"] ?? GROUP_TONE.A;

  return (
    <tr
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      className={[
        "group cursor-pointer outline-none transition-colors",
        "border-b border-border/60",
        zebra ? "bg-muted/30" : "bg-card",
        "hover:bg-primary/[0.06] focus-visible:bg-primary/[0.06]",
        "relative",
      ].join(" ")}
    >
      {/* Mijoz — sticky first column with italic display name + caption TIN.
          The 2px primary stripe on hover is rendered via ::before on the cell
          itself (Tailwind arbitrary variant) so it doesn't depend on a wrapper. */}
      <td
        className={[
          "px-3 md:px-4 py-3.5 align-top whitespace-nowrap",
          "sticky left-0 z-[1]",
          zebra ? "bg-muted/30" : "bg-card",
          "group-hover:bg-primary/[0.06] group-focus-visible:bg-primary/[0.06]",
          "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px]",
          "before:bg-primary before:opacity-0 group-hover:before:opacity-100 group-focus-visible:before:opacity-100",
          "before:transition-opacity",
        ].join(" ")}
      >
        <div className="font-display-italic text-[15px] leading-tight text-foreground truncate max-w-[220px]">
          {r.client_name ?? r.person_id}
        </div>
        {r.tin && (
          <div className="font-mono text-[10.5px] text-muted-foreground tracking-wider mt-0.5">
            {r.tin}
          </div>
        )}
      </td>

      <Td align="right" mono muted>
        {r.term_days}
      </Td>

      {/* Qarz — the anchor: one weight heavier, slightly larger, primary
          when nonzero. */}
      <td className="px-3 md:px-4 py-3.5 text-right whitespace-nowrap align-middle">
        <span
          className={[
            "font-mono tabular-nums text-[15px] leading-none",
            r.qarz > 0 ? "text-primary font-semibold" : "text-muted-foreground/70",
          ].join(" ")}
        >
          {fmtNum(r.qarz)}
        </span>
      </td>

      <Td align="right" mono dim={!r.not_due}>{fmtZero(r.not_due)}</Td>
      <Td align="right" mono dim={!r.overdue} tone={r.overdue ? "warm" : undefined}>
        {fmtZero(r.overdue)}
      </Td>

      {/* Bucket cells — heat tier ramps from neutral → umber → red. */}
      <Td align="right" mono dim={!r.bucket_1_30} tone={r.bucket_1_30 ? "amber" : undefined}>
        {fmtZero(r.bucket_1_30)}
      </Td>
      <Td align="right" mono dim={!r.bucket_31_60} tone={r.bucket_31_60 ? "warm" : undefined}>
        {fmtZero(r.bucket_31_60)}
      </Td>
      <Td align="right" mono dim={!r.bucket_61_90} tone={r.bucket_61_90 ? "hot" : undefined}>
        {fmtZero(r.bucket_61_90)}
      </Td>
      <Td align="right" mono dim={!r.bucket_90_plus} tone={r.bucket_90_plus ? "danger" : undefined}>
        {fmtZero(r.bucket_90_plus)}
      </Td>

      <Td>
        <span className="text-foreground/85 truncate max-w-[120px] block text-[12.5px]">
          {r.manager ?? "—"}
        </span>
      </Td>

      <Td>
        <span className="text-foreground/85 truncate max-w-[110px] block text-[12.5px]">
          {r.region_name ?? "—"}
        </span>
      </Td>

      <Td>
        {r.direction ? (
          <span
            className={[
              "inline-flex items-center text-[11px] px-2 py-[3px] rounded-[5px] truncate max-w-[100px]",
              "tracking-wide",
              directionTone,
            ].join(" ")}
            title={r.direction}
          >
            {r.direction}
          </span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </Td>

      <td className="px-3 md:px-4 py-3.5 text-center align-middle">
        <span
          className={[
            "inline-flex items-center justify-center w-7 h-7 rounded-[7px] border",
            "font-mono text-[12.5px] font-semibold leading-none",
            groupTone,
          ].join(" ")}
          aria-label={`Group ${r.client_group ?? "A"}`}
        >
          {r.client_group ?? "A"}
        </span>
      </td>
    </tr>
  );
}

function Td({
  children,
  align = "left",
  mono = false,
  muted = false,
  dim = false,
  tone,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  muted?: boolean;
  dim?: boolean;
  tone?: "amber" | "warm" | "hot" | "danger";
}) {
  // Heat tier — bucket cells take a graduated foreground tone so the eye
  // can scan a row and immediately see *where* the receivable is rotting.
  const toneClass = tone
    ? {
        amber: "text-foreground",
        warm: "text-amber-800 dark:text-amber-300",
        hot: "text-primary",
        danger: "text-red-700 dark:text-red-400",
      }[tone]
    : "";
  return (
    <td
      className={[
        "px-3 md:px-4 py-3.5 align-middle whitespace-nowrap",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
        mono ? "font-mono tabular-nums text-[12.5px]" : "",
        muted ? "text-muted-foreground" : "",
        dim ? "text-muted-foreground/55" : "",
        toneClass,
      ].join(" ")}
    >
      {children}
    </td>
  );
}
