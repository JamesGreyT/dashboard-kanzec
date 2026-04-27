/**
 * Clients (AR-aging) page — port of the hand-built `Data` sheet from
 * 1KanzecAR_CONTINUOUS_FIXED.xlsx. Per-client rollup of opening balances,
 * sales / returns / payments, current debt, aging buckets (1-30, 31-60,
 * 61-90, 90+), cumulative overdue thresholds, plus the editable Group
 * letter (A/B/C/D, edited from /data/legal-persons) and the per-client
 * instalment_days that drives bucketing.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  // Two decimals when there's a fractional part, none for clean integers.
  const abs = Math.abs(n);
  const frac = Math.round((abs - Math.trunc(abs)) * 100);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: frac === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function fmtZero(n: number | null | undefined): string {
  // Render zero as a dim em-dash for table density; only non-zeros render bold.
  if (n == null || n === 0) return "—";
  return fmtNum(n);
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

  // Debounce the free-form search input.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(h);
  }, [search]);

  // Reset pagination when filters change.
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

  const rows = aging.data?.rows ?? [];
  const total = aging.data?.total ?? 0;
  const summary = aging.data?.summary;

  return (
    <div>
      {/* Masthead --------------------------------------------------------- */}
      <div>
        <div className="caption text-muted-foreground">
          <span>{t("dashboard.crumb_dashboard")}</span>
          <span className="mx-2 text-muted-foreground/60">·</span>
          <span>{t("nav.collection")}</span>
          <span className="mx-2 text-muted-foreground/60">·</span>
          <span className="text-foreground/80">{t("nav.clients")}</span>
        </div>

        <div className="mt-3 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground leading-[0.95]">
              <span className="font-semibold italic">{t("clients.title")}</span>
              <span className="">.</span>
            </h1>
            <p className="text-sm text-foreground/80 mt-3 max-w-[64ch]">
              {t("clients.blurb")}
            </p>
          </div>
          {summary && (
            <div className="md:text-right">
              <div
                className="text-xs uppercase tracking-wider font-medium text-muted-foreground"
                style={{ letterSpacing: "0.18em" }}
              >
                {t("clients.kpi.total_qarz")}
              </div>
              <div className="nums text-[3rem] md:text-[3.6rem] leading-none text-primary mt-2 tabular-nums">
                {fmtNum(summary.total_qarz)}
              </div>
              <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                {summary.debtor_count} {t("clients.kpi.clients")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter strip ----------------------------------------------------- */}
      <Card className="mt-6 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grow min-w-[260px] max-w-md">
            <Input
              placeholder={t("clients.search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <FilterSelect
            label={t("clients.filter.manager")}
            value={salesRoomId}
            onChange={setSalesRoomId}
            options={(rooms.data?.rooms ?? []).map((r) => ({
              value: r.room_id,
              label: r.room_name,
            }))}
          />
          <FilterSelect
            label={t("clients.filter.direction")}
            value={direction}
            onChange={setDirection}
            options={DIRECTIONS.map((d) => ({ value: d, label: d }))}
          />
          <FilterSelect
            label={t("clients.filter.group")}
            value={clientGroup}
            onChange={setClientGroup}
            options={GROUPS.map((g) => ({ value: g, label: g }))}
            short
          />
          <div className="min-w-[160px]">
            <Input
              placeholder={t("clients.filter.region")}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-[13px] text-foreground/80">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="accent-primary"
            />
            <span>{t("clients.filter.overdue_only")}</span>
          </label>
        </div>
      </Card>

      {/* Table ------------------------------------------------------------ */}
      <Card className="mt-6 overflow-x-auto">
        {aging.isLoading && (
          <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
        )}
        {aging.isError && (
          <div className="p-6 text-sm text-red-700">
            {(aging.error as Error)?.message ?? t("common.error")}
          </div>
        )}
        {!aging.isLoading && !aging.isError && (
          <table className="w-full text-[12.5px] tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground border-b border-border">
                <Th sticky>{t("clients.col.client")}</Th>
                <Th right>{t("clients.col.term_days")}</Th>
                <Th right>{t("clients.col.opening_debt")}</Th>
                <Th right>{t("clients.col.opening_credit")}</Th>
                <Th right strong>{t("clients.col.qarz")}</Th>
                <Th right>{t("clients.col.not_due")}</Th>
                <Th right>{t("clients.col.overdue")}</Th>
                <Th right>{t("clients.col.bucket_1_30")}</Th>
                <Th right>{t("clients.col.bucket_31_60")}</Th>
                <Th right>{t("clients.col.bucket_61_90")}</Th>
                <Th right>{t("clients.col.bucket_90_plus")}</Th>
                <Th>{t("clients.col.manager")}</Th>
                <Th>{t("clients.col.region")}</Th>
                <Th>{t("clients.col.direction")}</Th>
                <Th center>{t("clients.col.group")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={15} className="p-6 text-center text-muted-foreground">
                    {t("clients.empty")}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.person_id}
                  className="border-b border-border/60 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/collection/debt/client/${r.person_id}`)}
                >
                  <Td sticky>
                    <span className="font-medium text-foreground truncate max-w-[260px] block">
                      {r.client_name ?? r.person_id}
                    </span>
                    {r.tin && (
                      <span className="caption text-muted-foreground">{r.tin}</span>
                    )}
                  </Td>
                  <Td right>{r.term_days}</Td>
                  <Td right>{fmtZero(r.opening_debt)}</Td>
                  <Td right>{fmtZero(r.opening_credit)}</Td>
                  <Td right strong>{fmtNum(r.qarz)}</Td>
                  <Td right>{fmtZero(r.not_due)}</Td>
                  <Td right>{fmtZero(r.overdue)}</Td>
                  <Td right>{fmtZero(r.bucket_1_30)}</Td>
                  <Td right>{fmtZero(r.bucket_31_60)}</Td>
                  <Td right>{fmtZero(r.bucket_61_90)}</Td>
                  <Td right>{fmtZero(r.bucket_90_plus)}</Td>
                  <Td>
                    <span className="text-foreground/90 truncate max-w-[140px] block">
                      {r.manager ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-foreground/90 truncate max-w-[120px] block">
                      {r.region_name ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    {r.direction ? (
                      <span className="inline-flex text-[11.5px] px-1.5 py-0.5 rounded-[4px] bg-muted text-foreground/90 truncate max-w-[120px]">
                        {r.direction}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td center>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-[6px] bg-muted border border-border font-mono text-[12.5px]">
                      {r.client_group ?? "A"}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {total > limit && (
        <div className="mt-4">
          <Pagination
            offset={offset}
            limit={limit}
            total={total}
            onOffset={setOffset}
          />
        </div>
      )}
    </div>
  );
}

// ---- small helpers --------------------------------------------------------

function Th({
  children,
  right = false,
  center = false,
  strong = false,
  sticky = false,
}: {
  children: React.ReactNode;
  right?: boolean;
  center?: boolean;
  strong?: boolean;
  sticky?: boolean;
}) {
  return (
    <th
      className={[
        "px-2 py-2 font-medium whitespace-nowrap",
        right ? "text-right" : center ? "text-center" : "text-left",
        strong ? "text-foreground" : "",
        sticky ? "sticky left-0 bg-card z-10" : "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right = false,
  center = false,
  strong = false,
  sticky = false,
}: {
  children: React.ReactNode;
  right?: boolean;
  center?: boolean;
  strong?: boolean;
  sticky?: boolean;
}) {
  return (
    <td
      className={[
        "px-2 py-2 whitespace-nowrap",
        right ? "text-right" : center ? "text-center" : "text-left",
        strong ? "font-semibold text-foreground" : "text-foreground/80",
        sticky ? "sticky left-0 bg-card group-hover:bg-muted/40 z-10" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  short = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  short?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        "text-[13px] bg-card border border-border rounded-[6px] px-2.5 py-1.5",
        "outline-none focus:ring-1 focus:ring-ring focus:border-ring",
        short ? "min-w-[80px]" : "min-w-[160px]",
        value ? "text-foreground" : "text-muted-foreground",
      ].join(" ")}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
