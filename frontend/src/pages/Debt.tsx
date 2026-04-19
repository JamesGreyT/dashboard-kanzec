/**
 * Qarzlar / Debt collection worklist. Lives at /collection/debt.
 *
 * For a collector: opens on their room's debtors sorted by priority, one card
 * per client with inline contact info + aging bar + last-call outcome. Click
 * a row → drawer with Orders / Payments / Contact-log tabs and a single form
 * to record the next call outcome.
 *
 * For an admin or team lead: same worklist, plus a "By sales person"
 * rollup panel showing per-room outstanding / at-risk / collected-MTD.
 */
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth, isScoped } from "../lib/auth";
import Card from "../components/Card";
import Button from "../components/Button";
import StatCard from "../components/StatCard";
import Drawer from "../components/Drawer";
import Input from "../components/Input";
import Pagination from "../components/Pagination";
import Modal from "../components/Modal";
import { GlyphSvg } from "../components/Sidebar";

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
  owner_name: string | null;
  gross_invoiced: number;
  gross_paid: number;
  outstanding: number;
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

function formatUsd(n: number): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function AgingBar({ row }: { row: WorklistRow }) {
  const total =
    row.aging_0_30 + row.aging_30_60 + row.aging_60_90 + row.aging_90_plus;
  if (total <= 0) return <span className="caption text-ink-3">—</span>;
  const seg = (v: number, tone: string) => ({
    flex: v / total,
    tone,
  });
  const segs = [
    seg(row.aging_0_30, "bg-good"),
    seg(row.aging_30_60, "bg-mark-2"),
    seg(row.aging_60_90, "bg-mark"),
    seg(row.aging_90_plus, "bg-risk"),
  ];
  return (
    <div
      className="flex h-2 w-full rounded-full overflow-hidden bg-paper-2"
      title={`0-30: ${formatUsd(row.aging_0_30)} · 30-60: ${formatUsd(row.aging_30_60)} · 60-90: ${formatUsd(row.aging_60_90)} · 90+: ${formatUsd(row.aging_90_plus)}`}
    >
      {segs.map((s, i) =>
        s.flex > 0 ? (
          <div
            key={i}
            style={{ flex: s.flex }}
            className={`${s.tone} h-full`}
          />
        ) : null,
      )}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: Outcome | null | undefined }) {
  const { t } = useTranslation();
  if (!outcome) return <span className="caption text-ink-3">—</span>;
  const tone = {
    called: "bg-paper-2 text-ink-2",
    no_answer: "bg-paper-2 text-ink-3",
    promised: "bg-mark-bg text-mark",
    rescheduled: "bg-paper-2 text-ink-2",
    refused: "bg-risk-bg text-risk",
    paid: "bg-good/10 text-good",
    note: "bg-paper-2 text-ink-3",
  }[outcome];
  return (
    <span className={`caption px-2 py-0.5 rounded ${tone}`}>
      {t(`debt.outcome.${outcome}`)}
    </span>
  );
}

export default function Debt() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<"worklist" | "prepayments">("worklist");

  // Filters -----------------------------------------------------------------
  const [search, setSearch] = useState("");
  const [salesRoomId, setSalesRoomId] = useState<string>("");
  const [agingBucket, setAgingBucket] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

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
    if (agingBucket) p.set("aging_bucket", agingBucket);
    if (outcome) p.set("outcome", outcome);
    if (overdueOnly) p.set("overdue_promises_only", "true");
    return p.toString();
  }, [offset, search, salesRoomId, agingBucket, outcome, overdueOnly]);

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

  const [openPersonId, setOpenPersonId] = useState<number | null>(null);

  const userIsTeamLeadOrAdmin = !isScoped(user) || (user?.scope_rooms.length ?? 0) >= 2;

  const worklistRows = worklist.data?.rows ?? [];

  return (
    <div>
      <div className="stagger-0">
        <div>
          <div className="caption text-ink-3">
            <span>{t("dashboard.crumb_dashboard")}</span>
            <span className="mx-2">·</span>
            <span>{t("nav.collection")}</span>
            <span className="mx-2">·</span>
            <span className="text-ink-2">{t("nav.debt")}</span>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <span
              aria-hidden
              className="shrink-0 inline-flex items-center justify-center h-11 w-11 rounded-full"
              style={{ background: "var(--mark-bg)", color: "var(--mark)" }}
            >
              <GlyphSvg kind="payments" size={22} />
            </span>
            <h1 className="serif text-heading-lg text-ink leading-none">
              {t("debt.title")}
              <span className="mark-stop">.</span>
            </h1>
          </div>
          <p className="text-body text-ink-2 mt-3 max-w-2xl">
            {t("debt.blurb")}
          </p>
          <div className="leader mt-6" />
        </div>
      </div>

      <div className="stagger-1 mt-4 flex items-center gap-6 border-b border-rule">
        {(["worklist", "prepayments"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              setOffset(0);
            }}
            className={[
              "pb-3 text-label transition-colors",
              tab === k
                ? "text-mark border-b-2 border-mark -mb-px"
                : "text-ink-2 hover:text-ink border-b-2 border-transparent",
            ].join(" ")}
          >
            {t(`debt.tab.${k}`)}
          </button>
        ))}
      </div>

      {tab === "worklist" && (
        <>
          <div className="stagger-2 mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("debt.kpi.total_ar")}
              value={formatUsd(worklist.data?.summary.total_outstanding ?? 0)}
            />
            <StatCard
              label={t("debt.kpi.over_90")}
              value={formatUsd(worklist.data?.summary.total_over_90 ?? 0)}
            />
            <StatCard
              label={t("debt.kpi.debtors")}
              value={(worklist.data?.summary.debtor_count ?? 0).toLocaleString()}
            />
            <StatCard
              label={t("debt.kpi.over_90_count")}
              value={(
                worklist.data?.summary.debtor_over_90_count ?? 0
              ).toLocaleString()}
            />
          </div>

          {userIsTeamLeadOrAdmin && (worklist.data?.by_collector.length ?? 0) > 0 && (
            <Card className="stagger-3 mt-4 p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-rule">
                <div className="eyebrow">{t("debt.by_collector")}</div>
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
                    ].map((k) => (
                      <th
                        key={k}
                        className="h-10 px-4 border-b border-rule eyebrow font-semibold text-ink-3 text-left"
                      >
                        {t(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {worklist.data?.by_collector.map((r) => (
                    <tr
                      key={r.room_id}
                      className="transition-colors hover:bg-paper-2 cursor-pointer"
                      onClick={() => {
                        setSalesRoomId(
                          salesRoomId === r.room_id ? "" : r.room_id,
                        );
                        setOffset(0);
                      }}
                    >
                      <td className="h-[44px] px-4 border-b border-rule text-body text-ink">
                        {r.room_name}
                        {salesRoomId === r.room_id && (
                          <span className="caption ml-2 text-mark">●</span>
                        )}
                      </td>
                      <td className="h-[44px] px-4 border-b border-rule text-body text-ink tabular-nums">
                        {formatUsd(r.outstanding)}
                      </td>
                      <td className="h-[44px] px-4 border-b border-rule text-body text-risk tabular-nums">
                        {formatUsd(r.over_90)}
                      </td>
                      <td className="h-[44px] px-4 border-b border-rule caption text-ink-2 tabular-nums">
                        {r.debtors_count}
                      </td>
                      <td className="h-[44px] px-4 border-b border-rule text-body text-good tabular-nums">
                        {formatUsd(r.collected_mtd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="stagger-3 mt-6 flex flex-col md:flex-row md:items-center gap-3">
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
              <select
                value={salesRoomId}
                onChange={(e) => {
                  setSalesRoomId(e.target.value);
                  setOffset(0);
                }}
                className="h-10 bg-paper-2 px-3 rounded-[10px] border border-rule text-body"
              >
                <option value="">{t("debt.filter.all_sales")}</option>
                {rooms.data.rooms.map((r) => (
                  <option key={r.room_id} value={r.room_id}>
                    {r.room_name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={agingBucket}
              onChange={(e) => {
                setAgingBucket(e.target.value);
                setOffset(0);
              }}
              className="h-10 bg-paper-2 px-3 rounded-[10px] border border-rule text-body"
            >
              <option value="">{t("debt.filter.all_aging")}</option>
              {["0_30", "30_60", "60_90", "90_plus"].map((b) => (
                <option key={b} value={b}>
                  {t(`debt.aging.${b}`)}
                </option>
              ))}
            </select>
            <select
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setOffset(0);
              }}
              className="h-10 bg-paper-2 px-3 rounded-[10px] border border-rule text-body"
            >
              <option value="">{t("debt.filter.all_outcomes")}</option>
              <option value="none">{t("debt.outcome.none")}</option>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {t(`debt.outcome.${o}`)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 caption text-ink-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => {
                  setOverdueOnly(e.target.checked);
                  setOffset(0);
                }}
              />
              {t("debt.filter.overdue_only")}
            </label>
          </div>

          <Card className="stagger-3 mt-4 p-0 overflow-hidden">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  {[
                    "debt.col.client",
                    "debt.col.outstanding",
                    "debt.col.days_no_pay",
                    "debt.col.aging",
                    "debt.col.last_contact",
                  ].map((k) => (
                    <th
                      key={k}
                      className="h-10 px-4 border-b border-rule eyebrow font-semibold text-ink-3 text-left"
                    >
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {worklistRows.map((r) => (
                  <tr
                    key={r.person_id}
                    onClick={() => setOpenPersonId(r.person_id)}
                    className="cursor-pointer transition-colors hover:bg-paper-2"
                  >
                    <td className="h-[64px] px-4 border-b border-rule text-body text-ink">
                      <div className="font-medium">{r.name ?? "—"}</div>
                      <div className="caption text-ink-3 mt-0.5">
                        {[
                          r.primary_room_name,
                          r.category,
                          r.region_name,
                          r.main_phone,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td className="h-[64px] px-4 border-b border-rule text-body text-ink tabular-nums align-top pt-3">
                      <div className="serif text-[20px] leading-none">
                        {formatUsd(r.outstanding)}
                      </div>
                      {r.has_overdue_promise && (
                        <div className="caption text-risk mt-1">
                          ⚠ {t("debt.overdue_promise")}
                        </div>
                      )}
                    </td>
                    <td className="h-[64px] px-4 border-b border-rule caption text-ink-2 tabular-nums">
                      {r.days_since_payment != null
                        ? `${r.days_since_payment} ${t("debt.days")}`
                        : "—"}
                    </td>
                    <td className="h-[64px] px-4 border-b border-rule w-[180px]">
                      <AgingBar row={r} />
                    </td>
                    <td className="h-[64px] px-4 border-b border-rule">
                      <OutcomeBadge outcome={r.last_contact_outcome} />
                      {r.last_contact_at && (
                        <div className="caption text-ink-3 mt-1">
                          {new Date(r.last_contact_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {worklist.isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 caption text-ink-3 text-center">
                      {t("common.loading")}
                    </td>
                  </tr>
                )}
                {!worklist.isLoading && worklistRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 caption text-ink-3 text-center">
                      {t("debt.empty_worklist")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {worklist.data && (
              <Pagination
                offset={offset}
                limit={limit}
                total={worklist.data.total}
                onOffset={setOffset}
              />
            )}
          </Card>
        </>
      )}

      {tab === "prepayments" && (
        <>
          <div className="stagger-2 mt-6">
            <Input
              placeholder={t("debt.filter.search_placeholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          <Card className="stagger-3 mt-4 p-0 overflow-hidden">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  {[
                    "debt.col.client",
                    "debt.col.region",
                    "debt.col.invoiced",
                    "debt.col.paid",
                    "debt.col.credit",
                    "debt.col.last_payment",
                  ].map((k) => (
                    <th
                      key={k}
                      className="h-10 px-4 border-b border-rule eyebrow font-semibold text-ink-3 text-left"
                    >
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(prepayments.data?.rows ?? []).map((r) => (
                  <tr key={r.person_id} className="transition-colors hover:bg-paper-2">
                    <td className="h-[52px] px-4 border-b border-rule text-body text-ink">
                      {r.name ?? "—"}
                      {r.tin && (
                        <span className="caption text-ink-3 ml-2 mono">{r.tin}</span>
                      )}
                    </td>
                    <td className="h-[52px] px-4 border-b border-rule caption text-ink-2">
                      {r.region_name ?? "—"}
                    </td>
                    <td className="h-[52px] px-4 border-b border-rule text-body text-ink tabular-nums">
                      {formatUsd(r.gross_invoiced)}
                    </td>
                    <td className="h-[52px] px-4 border-b border-rule text-body text-ink tabular-nums">
                      {formatUsd(r.gross_paid)}
                    </td>
                    <td className="h-[52px] px-4 border-b border-rule text-body text-good tabular-nums">
                      {formatUsd(r.credit_balance)}
                    </td>
                    <td className="h-[52px] px-4 border-b border-rule caption text-ink-3 tabular-nums">
                      {r.last_payment_date
                        ? new Date(r.last_payment_date).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
                {!prepayments.isLoading &&
                  (prepayments.data?.rows.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 caption text-ink-3 text-center">
                        {t("debt.empty_prepayments")}
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
            {prepayments.data && (
              <Pagination
                offset={offset}
                limit={limit}
                total={prepayments.data.total}
                onOffset={setOffset}
              />
            )}
          </Card>
        </>
      )}

      {openPersonId != null && (
        <DebtDrawer
          personId={openPersonId}
          onClose={() => setOpenPersonId(null)}
        />
      )}
    </div>
  );
}

// ---- Drawer ---------------------------------------------------------------

interface ClientDetail {
  contact: Record<string, any>;
  aging: Record<string, any>;
  orders: Array<Record<string, any>>;
  payments: Array<Record<string, any>>;
  contact_log: Array<{
    id: number;
    contacted_at: string;
    contacted_by: number;
    contacted_by_name: string | null;
    outcome: Outcome;
    promised_amount: number | null;
    promised_by_date: string | null;
    follow_up_date: string | null;
    note: string | null;
  }>;
}

function DebtDrawer({
  personId,
  onClose,
}: {
  personId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["debt.client", personId],
    queryFn: () => api<ClientDetail>(`/api/debt/client/${personId}`),
  });
  const [tab, setTab] = useState<"orders" | "payments" | "calls">("calls");

  const contact = detail.data?.contact;
  const aging = detail.data?.aging;

  const outstanding =
    (aging?.gross_invoiced ?? 0) - (aging?.gross_paid ?? 0);

  return (
    <Drawer
      open
      onClose={onClose}
      title={contact?.name ?? "—"}
      pk={contact?.tin ? `TIN ${contact.tin}` : undefined}
    >
      {detail.isLoading && <div className="caption text-ink-3">{t("common.loading")}</div>}
      {contact && (
        <div className="flex flex-col gap-5">
          <Card className="p-4">
            <div className="serif text-[26px] leading-none text-ink tabular-nums">
              {formatUsd(outstanding)}
            </div>
            <div className="caption text-ink-3 mt-1">
              {t("debt.kpi.total_ar")} · {t("debt.kpi.gross_paid")}{" "}
              {formatUsd(aging?.gross_paid ?? 0)} ·{" "}
              {t("debt.kpi.gross_invoiced")}{" "}
              {formatUsd(aging?.gross_invoiced ?? 0)}
            </div>
            {aging && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[
                  ["0_30", aging.aging_0_30],
                  ["30_60", aging.aging_30_60],
                  ["60_90", aging.aging_60_90],
                  ["90_plus", aging.aging_90_plus],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex flex-col">
                    <span className="caption text-ink-3">
                      {t(`debt.aging.${k}`)}
                    </span>
                    <span className="tabular-nums text-ink">
                      {formatUsd(v as number)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="eyebrow mb-2">{t("debt.drawer.contact")}</div>
            <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1 text-body">
              {[
                ["debt.contact.phone", contact.main_phone],
                ["debt.contact.telegram", contact.telegram],
                ["debt.contact.address", contact.address],
                ["debt.contact.region", contact.region_name],
                ["debt.contact.category", contact.category],
                ["debt.contact.owner", contact.owner_name],
              ].map(([k, v]) =>
                v ? (
                  <div key={k as string} className="contents">
                    <dt className="eyebrow text-ink-3 text-right">{t(k as string)}</dt>
                    <dd className="text-ink">{v as string}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </Card>

          <div className="flex items-center gap-4 border-b border-rule">
            {(["calls", "orders", "payments"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={[
                  "pb-2 text-label transition-colors",
                  tab === k
                    ? "text-mark border-b-2 border-mark -mb-px"
                    : "text-ink-2 hover:text-ink border-b-2 border-transparent",
                ].join(" ")}
              >
                {t(`debt.drawer.${k}`)}
              </button>
            ))}
          </div>

          {tab === "calls" && (
            <CallsTab
              personId={personId}
              entries={detail.data?.contact_log ?? []}
              onChange={() => {
                qc.invalidateQueries({ queryKey: ["debt.client", personId] });
                qc.invalidateQueries({ queryKey: ["debt.worklist"] });
              }}
            />
          )}
          {tab === "orders" && (
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-body">
                <thead>
                  <tr>
                    {["delivery_date", "product_name", "sold_quant", "product_amount"].map(
                      (k) => (
                        <th
                          key={k}
                          className="h-8 px-3 border-b border-rule eyebrow text-left"
                        >
                          {t(`debt.orders_col.${k}`)}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(detail.data?.orders ?? []).map((o, i) => (
                    <tr key={i}>
                      <td className="h-8 px-3 border-b border-rule caption tabular-nums">
                        {o.delivery_date}
                      </td>
                      <td className="h-8 px-3 border-b border-rule text-ink">{o.product_name}</td>
                      <td className="h-8 px-3 border-b border-rule tabular-nums">
                        {o.sold_quant}
                      </td>
                      <td className="h-8 px-3 border-b border-rule tabular-nums">
                        {formatUsd(o.product_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {tab === "payments" && (
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-body">
                <thead>
                  <tr>
                    {["payment_date", "amount", "payment_method", "payer"].map((k) => (
                      <th
                        key={k}
                        className="h-8 px-3 border-b border-rule eyebrow text-left"
                      >
                        {t(`debt.pay_col.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(detail.data?.payments ?? []).map((p, i) => (
                    <tr key={i}>
                      <td className="h-8 px-3 border-b border-rule caption tabular-nums">
                        {p.payment_date
                          ? new Date(p.payment_date).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="h-8 px-3 border-b border-rule text-good tabular-nums">
                        {formatUsd(p.amount)}
                      </td>
                      <td className="h-8 px-3 border-b border-rule">{p.payment_method}</td>
                      <td className="h-8 px-3 border-b border-rule">{p.payer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </Drawer>
  );
}

function CallsTab({
  personId,
  entries,
  onChange,
}: {
  personId: number;
  entries: ClientDetail["contact_log"];
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);

  const del = useMutation({
    mutationFn: (id: number) =>
      api(`/api/debt/contact/${id}`, { method: "DELETE" }),
    onSuccess: onChange,
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="eyebrow">{t("debt.drawer.calls")}</div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          + {t("debt.drawer.add_contact")}
        </Button>
      </div>
      {entries.length === 0 && (
        <div className="caption text-ink-3 py-4 text-center">
          {t("debt.empty_contact_log")}
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {entries.map((e) => (
          <li key={e.id} className="border-l-2 border-rule pl-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <OutcomeBadge outcome={e.outcome} />
                <span className="caption text-ink-3 tabular-nums">
                  {new Date(e.contacted_at).toLocaleString()}
                </span>
                {e.contacted_by_name && (
                  <span className="caption text-ink-3">
                    · {e.contacted_by_name}
                  </span>
                )}
              </div>
              {(user?.role === "admin" || e.contacted_by === user?.id) && (
                <button
                  onClick={() => {
                    if (confirm(t("debt.drawer.delete_confirm"))) {
                      del.mutate(e.id);
                    }
                  }}
                  className="caption text-risk hover:underline"
                >
                  {t("common.delete")}
                </button>
              )}
            </div>
            {e.promised_amount != null && (
              <div className="caption text-ink-2 mt-1">
                {t("debt.drawer.promised", {
                  amount: formatUsd(e.promised_amount),
                  date: e.promised_by_date ?? "",
                })}
              </div>
            )}
            {e.follow_up_date && (
              <div className="caption text-ink-2 mt-0.5">
                {t("debt.drawer.follow_up")}: {e.follow_up_date}
              </div>
            )}
            {e.note && (
              <div className="text-body text-ink-2 mt-1 whitespace-pre-wrap">
                {e.note}
              </div>
            )}
          </li>
        ))}
      </ul>
      {adding && (
        <AddContactModal
          personId={personId}
          onClose={() => setAdding(false)}
          onSuccess={() => {
            setAdding(false);
            onChange();
          }}
        />
      )}
    </Card>
  );
}

function AddContactModal({
  personId,
  onClose,
  onSuccess,
}: {
  personId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<Outcome>("called");
  const [promisedAmount, setPromisedAmount] = useState("");
  const [promisedBy, setPromisedBy] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      api(`/api/debt/client/${personId}/contact`, {
        method: "POST",
        body: JSON.stringify({
          outcome,
          promised_amount: promisedAmount ? Number(promisedAmount) : null,
          promised_by_date: promisedBy || null,
          follow_up_date: followUp || null,
          note: note || null,
        }),
      }),
    onSuccess,
    onError: (e: Error) => setErr(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    m.mutate();
  }

  return (
    <Modal open onClose={onClose} title={t("debt.drawer.add_contact")}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="grid grid-cols-[120px_1fr] items-center gap-x-4">
          <span className="eyebrow text-right">{t("debt.drawer.outcome")}</span>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as Outcome)}
            className="h-10 bg-paper-2 px-3 rounded-[10px] border border-rule text-body"
          >
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {t(`debt.outcome.${o}`)}
              </option>
            ))}
          </select>
        </label>
        {outcome === "promised" && (
          <>
            <Input
              layout="inline"
              label={t("debt.drawer.promised_amount")}
              type="number"
              step="0.01"
              value={promisedAmount}
              onChange={(e) => setPromisedAmount(e.target.value)}
            />
            <Input
              layout="inline"
              label={t("debt.drawer.promised_by")}
              type="date"
              value={promisedBy}
              onChange={(e) => setPromisedBy(e.target.value)}
            />
          </>
        )}
        <Input
          layout="inline"
          label={t("debt.drawer.follow_up")}
          type="date"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
        />
        <label className="grid grid-cols-[120px_1fr] items-start gap-x-4">
          <span className="eyebrow text-right mt-2">{t("debt.drawer.note")}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="bg-paper-2 px-3 py-2 rounded-[10px] border border-rule text-body outline-none focus:border-mark"
          />
        </label>
        {err && (
          <div className="caption text-risk border-l-2 border-risk pl-3">{err}</div>
        )}
        <div className="flex items-center justify-end gap-5 mt-2">
          <Button variant="link" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" disabled={m.isPending}>
            {m.isPending ? t("admin.form_saving") : t("debt.drawer.save_contact")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
