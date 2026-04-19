/**
 * Reestr / Debt Ledger — per-client debt register. Mirrors the "Data"
 * sheet in KanzecAR_CONTINUOUS_FIXED.xlsx column-for-column so an
 * accountant who lives in that spreadsheet can read it without thinking.
 *
 *   ClientName | Nehca kun? | Boshlang'ich qarz | Boshlang'ich kredit
 *   Sotuv      | Vozrat     | To'lov            | TotalCredits
 *   TotalDebt  | Qarz       | Muddati tugamagan | Muddati o'tgan
 *   1-30 | 31-60 | 61-90 | 90+ | Overdue0 | Overdue30 | Overdue60 | Overdue90
 *   Meneger
 *
 * Aging is FIFO with a configurable term_days (default 30 from the Params
 * sheet). Opening balances flow through automatically.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import Card from "../components/Card";
import Input from "../components/Input";
import Pagination from "../components/Pagination";

interface LedgerRow {
  person_id: number;
  client_name: string | null;
  tin: string | null;
  region_name: string | null;
  category: string | null;
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

interface LedgerResp {
  rows: LedgerRow[];
  total: number;
  term_days: number;
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
}

interface Room {
  room_id: string;
  room_code: string | null;
  room_name: string;
}

const PAGE = 100;

function fmtMoney(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
function fmtMoneyGrand(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function DebtLedger() {
  const { t } = useTranslation();
  const nav = useNavigate();

  const [search, setSearch] = useState("");
  const [roomId, setRoomId] = useState<string>("");
  const [termDays, setTermDays] = useState<number>(30);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [offset, setOffset] = useState(0);

  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/api/rooms"),
  });

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    p.set("term_days", String(termDays));
    if (search) p.set("search", search);
    if (roomId) p.set("sales_manager_room_id", roomId);
    if (overdueOnly) p.set("overdue_only", "true");
    return p.toString();
  }, [search, roomId, termDays, overdueOnly, offset]);

  const ledger = useQuery({
    queryKey: ["debt.ledger", qs],
    queryFn: () => api<LedgerResp>(`/api/debt/ledger?${qs}`),
    refetchInterval: 60_000,
  });

  const rows = ledger.data?.rows ?? [];
  const summary = ledger.data?.summary;

  return (
    <div>
      {/* ── Masthead ──────────────────────────────────────────────────── */}
      <div className="stagger-0">
        <div className="caption text-ink-3">
          <button
            type="button"
            className="hover:text-mark"
            onClick={() => nav("/collection/debt")}
          >
            {t("debt.title")}
          </button>{" "}
          / <span className="text-ink-2">{t("ledger.title")}</span>
        </div>
        <h1 className="serif text-heading-lg text-ink mt-2 leading-none">
          {t("ledger.title")}
          <span className="mark-stop">.</span>
        </h1>
        <p className="caption text-ink-3 italic mt-3 max-w-3xl">
          {t("ledger.blurb")}
        </p>
        <div className="leader mt-6" />
      </div>

      {/* ── Summary strip ─────────────────────────────────────────────── */}
      {summary && (
        <div className="stagger-1 mt-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          <SummaryStat
            label={t("ledger.kpi.debtor_count")}
            value={summary.debtor_count.toLocaleString("en-US")}
          />
          <SummaryStat
            label={t("ledger.kpi.total_qarz")}
            value={fmtMoneyGrand(summary.total_qarz)}
            tone="mark"
          />
          <SummaryStat
            label={t("ledger.kpi.total_overdue")}
            value={fmtMoneyGrand(summary.total_overdue)}
            tone={summary.total_overdue > 0 ? "risk" : undefined}
          />
          <SummaryStat
            label={t("ledger.kpi.total_opening")}
            value={fmtMoneyGrand(
              summary.total_opening_debt - summary.total_opening_credit,
            )}
            hint={t("ledger.kpi.opening_hint")}
          />
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────────── */}
      <div className="stagger-2 mt-8 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <div className="flex-1 min-w-0">
          <Input
            placeholder={t("ledger.search_placeholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <select
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
            setOffset(0);
          }}
          className="h-11 px-3 rounded-[10px] bg-paper-2 border-0 caption text-ink focus:outline-none focus:ring-2 focus:ring-mark/35"
        >
          <option value="">{t("ledger.filter.all_managers")}</option>
          {(rooms.data?.rooms ?? []).map((r) => (
            <option key={r.room_id} value={r.room_id}>
              {r.room_name}
            </option>
          ))}
        </select>
        <select
          value={termDays}
          onChange={(e) => {
            setTermDays(Number(e.target.value));
            setOffset(0);
          }}
          className="h-11 px-3 rounded-[10px] bg-paper-2 border-0 caption text-ink focus:outline-none focus:ring-2 focus:ring-mark/35"
          title={t("ledger.filter.term_hint")}
        >
          {[15, 30, 45, 60, 90].map((d) => (
            <option key={d} value={d}>
              {t("ledger.filter.term_option", { n: d })}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 caption text-ink-2 cursor-pointer">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => {
              setOverdueOnly(e.target.checked);
              setOffset(0);
            }}
            className="h-4 w-4 accent-mark"
          />
          <span>{t("ledger.filter.overdue_only")}</span>
        </label>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <Card className="stagger-3 mt-4 p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-body text-ink tabular-nums">
            <thead>
              <tr>
                {LEDGER_COLUMNS.map((c, i) => (
                  <th
                    key={c.key}
                    className={[
                      "h-10 px-3 border-b border-rule sticky top-0 bg-card eyebrow font-semibold text-ink-3 whitespace-nowrap",
                      c.align === "right" ? "text-right" : "text-left",
                      // i===0: the top-left corner is sticky in BOTH axes and
                      // must sit above every other sticky cell so rows sliding
                      // past are fully occluded. z-20 > body sticky (z-5) > row
                      // sticky headers (z-10) > body cells (default).
                      i === 0
                        ? "sticky left-0 z-20 min-w-[220px]"
                        : "z-10",
                    ].join(" ")}
                  >
                    {t(c.labelKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledger.isLoading && (
                <tr>
                  <td colSpan={LEDGER_COLUMNS.length} className="py-12 text-center italic caption text-ink-3">
                    {t("common.loading")}
                  </td>
                </tr>
              )}
              {!ledger.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={LEDGER_COLUMNS.length} className="py-12 text-center italic caption text-ink-3">
                    {t("ledger.empty")}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.person_id}
                  onClick={() => nav(`/collection/debt/client/${r.person_id}`)}
                  className="group cursor-pointer transition-colors hover:bg-paper-2"
                >
                  {LEDGER_COLUMNS.map((c, i) => (
                    <td
                      key={c.key}
                      className={[
                        "h-11 px-3 border-b border-rule whitespace-nowrap",
                        c.align === "right" ? "text-right" : "text-left",
                        c.mono ? "mono text-mono-sm text-ink-2" : "",
                        c.emphasis === "mark" ? "serif text-mark" : "",
                        c.emphasis === "risk" && (r as any)[c.key] > 0 ? "text-risk" : "",
                        // Sticky first column needs an opaque background of its
                        // own (tr hover:bg on its own wouldn't cover — td paints
                        // above tr — so we mirror the row state via group-hover).
                        i === 0
                          ? "sticky left-0 z-[5] bg-card group-hover:bg-paper-2 min-w-[220px]"
                          : "",
                      ].join(" ")}
                    >
                      {renderCell(r, c)}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Totals row — `position: sticky` goes on every td, not the tr
                  (sticky rows are inconsistently supported). The left-bottom
                  corner is sticky in both axes; z-[15] beats the body-sticky
                  first column (z-5) so it sits above while scrolling. */}
              {summary && rows.length > 0 && (
                <tr>
                  {LEDGER_COLUMNS.map((c, i) => (
                    <td
                      key={c.key}
                      className={[
                        "h-11 px-3 border-t-2 border-mark whitespace-nowrap font-medium bg-paper-2 sticky bottom-0",
                        c.align === "right" ? "text-right" : "text-left",
                        i === 0 ? "left-0 z-[15] min-w-[220px]" : "z-[4]",
                      ].join(" ")}
                    >
                      {i === 0
                        ? t("ledger.totals_row")
                        : renderSummaryCell(summary, rows, c)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {ledger.data && (
          <Pagination
            offset={offset}
            limit={PAGE}
            total={ledger.data.total}
            onOffset={setOffset}
          />
        )}
      </Card>
    </div>
  );
}

/* ─── Column definitions ────────────────────────────────────────────── */

type ColumnDef = {
  key: keyof LedgerRow;
  labelKey: string;
  align?: "left" | "right";
  mono?: boolean;
  emphasis?: "mark" | "risk";
  kind?: "money" | "text" | "int" | "date";
};

const LEDGER_COLUMNS: ColumnDef[] = [
  { key: "client_name",     labelKey: "ledger.col.client",         align: "left",  kind: "text" },
  { key: "term_days",       labelKey: "ledger.col.term_days",      align: "right", kind: "int" },
  { key: "opening_debt",    labelKey: "ledger.col.opening_debt",   align: "right", kind: "money" },
  { key: "opening_credit",  labelKey: "ledger.col.opening_credit", align: "right", kind: "money" },
  { key: "sotuv",           labelKey: "ledger.col.sotuv",          align: "right", kind: "money" },
  { key: "vozrat",          labelKey: "ledger.col.vozrat",         align: "right", kind: "money" },
  { key: "tolov",           labelKey: "ledger.col.tolov",          align: "right", kind: "money" },
  { key: "total_credits",   labelKey: "ledger.col.total_credits",  align: "right", kind: "money" },
  { key: "total_debt",      labelKey: "ledger.col.total_debt",     align: "right", kind: "money" },
  { key: "qarz",            labelKey: "ledger.col.qarz",           align: "right", kind: "money", emphasis: "mark" },
  { key: "not_due",         labelKey: "ledger.col.not_due",        align: "right", kind: "money" },
  { key: "overdue",         labelKey: "ledger.col.overdue",        align: "right", kind: "money", emphasis: "risk" },
  { key: "bucket_1_30",     labelKey: "ledger.col.bucket_1_30",    align: "right", kind: "money" },
  { key: "bucket_31_60",    labelKey: "ledger.col.bucket_31_60",   align: "right", kind: "money" },
  { key: "bucket_61_90",    labelKey: "ledger.col.bucket_61_90",   align: "right", kind: "money" },
  { key: "bucket_90_plus",  labelKey: "ledger.col.bucket_90_plus", align: "right", kind: "money", emphasis: "risk" },
  { key: "overdue_0",       labelKey: "ledger.col.overdue_0",      align: "right", kind: "money" },
  { key: "overdue_30",      labelKey: "ledger.col.overdue_30",     align: "right", kind: "money" },
  { key: "overdue_60",      labelKey: "ledger.col.overdue_60",     align: "right", kind: "money" },
  { key: "overdue_90",      labelKey: "ledger.col.overdue_90",     align: "right", kind: "money" },
  { key: "manager",         labelKey: "ledger.col.manager",        align: "left",  kind: "text" },
];

function renderCell(r: LedgerRow, c: ColumnDef) {
  const v = (r as any)[c.key];
  if (c.kind === "money") return fmtMoney(v);
  if (c.kind === "int") return v == null ? "—" : String(v);
  if (c.kind === "text") return v ?? "—";
  return v ?? "—";
}

function renderSummaryCell(
  s: LedgerResp["summary"],
  _rows: LedgerRow[],
  c: ColumnDef,
): string {
  // Map the summary keys we already have back onto column positions.
  // For aging-bucket columns we sum on the client across the visible page
  // (server summary only totals qarz / sotuv / tolov / overdue / 90+).
  const sumAcross = (key: keyof LedgerRow) =>
    _rows.reduce((acc, r) => acc + (Number((r as any)[key]) || 0), 0);

  switch (c.key) {
    case "sotuv":          return fmtMoney(s.total_sotuv);
    case "tolov":          return fmtMoney(s.total_tolov);
    case "qarz":           return fmtMoney(s.total_qarz);
    case "overdue":        return fmtMoney(s.total_overdue);
    case "bucket_90_plus": return fmtMoney(s.total_over_90);
    case "opening_debt":   return fmtMoney(s.total_opening_debt);
    case "opening_credit": return fmtMoney(s.total_opening_credit);
    case "vozrat":
    case "total_credits":
    case "total_debt":
    case "not_due":
    case "bucket_1_30":
    case "bucket_31_60":
    case "bucket_61_90":
    case "overdue_0":
    case "overdue_30":
    case "overdue_60":
    case "overdue_90":
      return fmtMoney(sumAcross(c.key));
    case "term_days":      return "";
    default:                return "";
  }
}

/* ─── Typographic bits ──────────────────────────────────────────────── */

function SummaryStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "mark" | "risk";
}) {
  const toneClass = tone === "mark" ? "text-mark" : tone === "risk" ? "text-risk" : "text-ink";
  return (
    <div>
      <div className="eyebrow text-ink-3">{label}</div>
      <div className={`serif nums tabular-nums text-[26px] leading-none mt-2 ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="caption italic text-ink-3 mt-1">{hint}</div>}
    </div>
  );
}
