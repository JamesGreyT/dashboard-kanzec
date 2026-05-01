/**
 * Per-client debt dossier at /collection/debt/client/:personId.
 *
 * Layout:
 *   1. Breadcrumb
 *   2. Masthead: name + outstanding
 *   3. Ledger overview strip (opening AR | orders | payments | outstanding)
 *   4. Contact + Aging two-column
 *   5. Tabs bar (Calls · Orders · Payments) pinned high
 *   6. Active tab content
 *      - Calls: flat composer + timeline
 *      - Orders: table + totals footer + pagination when > 50
 *      - Payments: same pattern
 */
import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import Card from "../components/Card";
import Button from "../components/Button";
import Pagination from "../components/Pagination";

type Outcome =
  | "called"
  | "no_answer"
  | "promised"
  | "rescheduled"
  | "refused"
  | "paid"
  | "note";

const OUTCOMES: Outcome[] = [
  "called",
  "no_answer",
  "promised",
  "rescheduled",
  "refused",
  "paid",
  "note",
];

const OUTCOME_SHORTCUT: Record<Outcome, string> = {
  called: "Q",
  no_answer: "N",
  promised: "P",
  rescheduled: "R",
  refused: "X",
  paid: "$",
  note: ".",
};

const PAGE_SIZE = 50;

interface ContactLogEntry {
  id: number;
  contacted_at: string;
  contacted_by: number;
  contacted_by_name: string | null;
  outcome: Outcome;
  promised_amount: number | null;
  promised_by_date: string | null;
  follow_up_date: string | null;
  note: string | null;
}

interface ClientDetail {
  contact: Record<string, any>;
  aging: {
    gross_invoiced: number;
    gross_paid: number;
    opening_debt: number;
    opening_credit: number;
    aging_0_30: number;
    aging_30_60: number;
    aging_60_90: number;
    aging_90_plus: number;
  };
  orders: Array<Record<string, any>>;
  payments: Array<Record<string, any>>;
  contact_log: ContactLogEntry[];
  orders_total?: number;
  payments_total?: number;
  orders_sum?: number;
  payments_sum?: number;
}

// ---- Formatting ----------------------------------------------------------

function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatUsd2(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** DD.MM.YYYY — unambiguous, locale-independent. */
function renderDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

/** DD.MM.YYYY · HH:mm in Asia/Tashkent. */
function renderDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tashkent",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("day")}.${get("month")}.${get("year")} · ${get("hour")}:${get("minute")}`;
  } catch {
    return iso;
  }
}

// ---- Glyphs + contact atoms ---------------------------------------------

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
  onCopy: string;
  children: ReactNode;
  kind: "phone" | "telegram";
}) {
  const [copied, setCopied] = useState(false);
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
      className="group inline-flex items-center gap-2 text-sm text-ink2 hover:text-mintdk transition-colors"
    >
      <Glyph className="shrink-0 text-ink3 group-hover:text-mintdk transition-colors" />
      <span className="font-mono text-xs tabular-nums">{children}</span>
      <AnimatePresence>
        {copied && (
          <motion.span
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="text-xs text-mintdk"
          >
            ✓
          </motion.span>
        )}
      </AnimatePresence>
    </a>
  );
}

function OutcomeKicker({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation();
  const tone: Record<Outcome, string> = {
    called: "text-ink2",
    no_answer: "text-ink3",
    promised: "text-mintdk",
    rescheduled: "text-amber",
    refused: "text-coraldk",
    paid: "text-mintdk",
    note: "text-ink3",
  };
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 font-mono uppercase text-[10.5px] font-semibold tracking-[0.08em]",
        tone[outcome],
      ].join(" ")}
    >
      <span aria-hidden className="w-[5px] h-[5px] rounded-full bg-current" />
      {t(`debt.outcome.${outcome}`)}
    </span>
  );
}

// ---- Ledger overview strip ----------------------------------------------

function LedgerOverview({
  aging,
  ordersSum,
  paymentsSum,
}: {
  aging: ClientDetail["aging"];
  /** Real deal_order total (excludes synthesized opening). Matches the
   *  "Jami savdo" number shown at the top of the Orders tab. */
  ordersSum: number;
  /** Real payment total (excludes synthesized opening_credit). */
  paymentsSum: number;
}) {
  const { t } = useTranslation();
  // Outstanding is derived from the REAL numbers so the four stats add
  // up cleanly:  opening_net + orders − payments = outstanding.
  // This also keeps the card values consistent with what the user sees
  // inside the Orders/Payments tab totals.
  const openingNet = aging.opening_debt - aging.opening_credit;
  const outstanding = openingNet + ordersSum - paymentsSum;
  const items: Array<{
    label: string;
    value: number | null;
    sub?: string;
    tone?: "ink" | "mark" | "good" | "risk";
  }> = [
    {
      label: t("debt.kpi.opening_ar_short"),
      value: openingNet,
      sub:
        aging.opening_debt > 0 || aging.opening_credit > 0
          ? t("debt.ledger.pre_2022")
          : t("debt.ledger.none"),
      tone: openingNet > 0 ? "ink" : openingNet < 0 ? "good" : "ink",
    },
    {
      label: t("debt.ledger.orders"),
      value: ordersSum,
      sub: t("debt.ledger.since_2022"),
      tone: "ink",
    },
    {
      label: t("debt.ledger.payments"),
      value: paymentsSum,
      sub: t("debt.ledger.received"),
      tone: "good",
    },
    {
      label: t("debt.col.outstanding"),
      value: outstanding,
      sub:
        outstanding > 0
          ? t("debt.ledger.net_owed")
          : t("debt.ledger.settled"),
      tone: outstanding > 0 ? "mark" : "good",
    },
  ];
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 md:px-7 pt-5 pb-3">
        <div className="eyebrow">{t("debt.ledger.title")}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {items.map((it, i) => {
          const toneClass =
            it.tone === "mark"
              ? "text-mintdk"
              : it.tone === "good"
                ? "text-mintdk"
                : it.tone === "risk"
                  ? "text-coraldk"
                  : "text-ink";
          return (
            <div
              key={i}
              className={[
                "px-5 md:px-7 py-5 md:py-6",
                i > 0 ? "md:border-l md:border-line" : "",
                i > 1 ? "border-t md:border-t-0 border-line" : "",
                i === 1 ? "border-t md:border-t-0 border-line md:border-none" : "",
              ].join(" ")}
            >
              <div className="eyebrow text-ink3">{it.label}</div>
              <div
                className={`kpi-num text-[28px] md:text-[36px] mt-1 ${toneClass}`}
              >
                {formatUsd(it.value ?? 0)}
              </div>
              {it.sub && (
                <div className="text-xs text-ink3 mt-1">{it.sub}</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---- Contact card (compact) ---------------------------------------------

function ContactCard({ contact }: { contact: Record<string, any> }) {
  const { t } = useTranslation();
  const hasAny =
    contact.main_phone ||
    contact.telegram ||
    contact.address ||
    contact.owner_name;
  return (
    <Card className="p-5 md:p-6">
      <div className="eyebrow mb-3">{t("debt.drawer.contact")}</div>
      {!hasAny && (
        <div className="text-[14px] text-ink3 italic">
          {t("debt.no_contact_info")}
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {contact.main_phone && (
          <CopyableAction
            kind="phone"
            href={`tel:${String(contact.main_phone).replace(/[^+\d]/g, "")}`}
            onCopy={contact.main_phone}
          >
            {contact.main_phone}
          </CopyableAction>
        )}
        {contact.telegram && (
          <CopyableAction kind="telegram" onCopy={contact.telegram}>
            {contact.telegram}
          </CopyableAction>
        )}
        {contact.address && (
          <div className="text-sm text-ink2">
            <span className="text-xs text-ink3 mr-2">
              {t("debt.contact.address")}
            </span>
            {contact.address}
          </div>
        )}
        {contact.owner_name && (
          <div className="text-sm text-ink2">
            <span className="text-xs text-ink3 mr-2">
              {t("debt.contact.owner")}
            </span>
            {contact.owner_name}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---- Aging ---------------------------------------------------------------

function AgingCard({ aging }: { aging: ClientDetail["aging"] }) {
  const { t } = useTranslation();
  const total =
    aging.aging_0_30 +
    aging.aging_30_60 +
    aging.aging_60_90 +
    aging.aging_90_plus;
  const rows: Array<{
    key: "0_30" | "30_60" | "60_90" | "90_plus";
    v: number;
    bar: string;
  }> = [
    { key: "0_30", v: aging.aging_0_30, bar: "bg-mint" },
    { key: "30_60", v: aging.aging_30_60, bar: "bg-amber" },
    { key: "60_90", v: aging.aging_60_90, bar: "bg-amber" },
    { key: "90_plus", v: aging.aging_90_plus, bar: "bg-coraldk" },
  ];
  const dominant = [...rows].sort((a, b) => b.v - a.v)[0];
  const dominantPct =
    total > 0 ? Math.round((dominant.v / total) * 100) : 0;

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-baseline justify-between">
        <div className="eyebrow">{t("debt.aging_title")}</div>
        {total > 0 && dominantPct >= 50 && (
          <span className="text-xs text-ink3 italic">
            {t("debt.aging_dominance", {
              pct: dominantPct,
              bucket: t(`debt.aging.${dominant.key}`),
            })}
          </span>
        )}
      </div>

      <div className="mt-4 flex h-[8px] rounded-full overflow-hidden bg-line">
        {rows.map((r) => {
          const pct = total > 0 ? r.v / total : 0;
          if (pct <= 0) return null;
          return (
            <motion.div
              key={r.key}
              initial={{ width: 0 }}
              animate={{ width: `${pct * 100}%` }}
              transition={{ duration: 0.5, ease: [0.2, 0.85, 0.25, 1] }}
              className={r.bar}
              title={`${t(`debt.aging.${r.key}`)} · ${formatUsd(r.v)}`}
            />
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="eyebrow text-ink3">
              {t(`debt.aging.${r.key}`)}
            </div>
            <div
              className={[
                "font- tabular-nums text-[16px] leading-tight mt-1 font-medium",
                r.v > 0 ? "text-ink" : "text-ink3",
              ].join(" ")}
            >
              {r.v > 0 ? formatUsd(r.v) : "·"}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---- Main page ----------------------------------------------------------

export default function DebtClient() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = useParams<{ personId: string }>();
  const personId = Number(params.personId);

  const [tab, setTab] = useState<"calls" | "orders" | "payments">("calls");
  const [ordersOffset, setOrdersOffset] = useState(0);
  const [paymentsOffset, setPaymentsOffset] = useState(0);

  const detail = useQuery({
    queryKey: ["debt.client", personId, ordersOffset, paymentsOffset],
    queryFn: () => {
      const params = new URLSearchParams();
      if (ordersOffset) params.set("orders_offset", String(ordersOffset));
      if (paymentsOffset) params.set("payments_offset", String(paymentsOffset));
      const qs = params.toString();
      return api<ClientDetail>(
        `/api/debt/client/${personId}${qs ? "?" + qs : ""}`,
      );
    },
    enabled: Number.isFinite(personId),
  });

  const contact = detail.data?.contact;
  const aging = detail.data?.aging;

  const outstanding = aging ? aging.gross_invoiced - aging.gross_paid : 0;

  // Fallback sums when backend doesn't provide them yet: client-side sum of
  // the current page. Real totals need backend support (orders_total,
  // orders_sum) — covered by the companion backend commit.
  const ordersSum = useMemo(
    () =>
      detail.data?.orders_sum ??
      (detail.data?.orders ?? []).reduce(
        (a, o) => a + Number(o.product_amount ?? 0),
        0,
      ),
    [detail.data],
  );
  const paymentsSum = useMemo(
    () =>
      detail.data?.payments_sum ??
      (detail.data?.payments ?? []).reduce(
        (a, p) => a + Number(p.amount ?? 0),
        0,
      ),
    [detail.data],
  );
  const ordersTotal = detail.data?.orders_total ?? (detail.data?.orders.length ?? 0);
  const paymentsTotal =
    detail.data?.payments_total ?? (detail.data?.payments.length ?? 0);

  const notFound =
    detail.isError &&
    (detail.error as ApiError | Error)?.message &&
    ((detail.error as any)?.status === 404 ||
      /not found|outside scope/.test((detail.error as Error).message));

  return (
    <div>
      {/* Breadcrumb */}
      <div className="text-xs text-ink3 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => navigate("/collection/worklist")}
          className="text-ink3 hover:text-mintdk transition-colors inline-flex items-center gap-1"
        >
          <span aria-hidden>←</span>
          <span>{t("debt.back_to_list")}</span>
        </button>
        <span className="text-ink4">·</span>
        <span>{t("nav.collection")}</span>
        <span className="text-ink4">·</span>
        <span>{t("nav.debt")}</span>
        {contact?.name && (
          <>
            <span className="text-ink4">·</span>
            <span className="text-ink2 truncate max-w-[50ch]">
              {contact.name}
            </span>
          </>
        )}
      </div>

      {detail.isLoading && (
        <div className="mt-10 text-ink3 text-center">
          {t("common.loading")}
        </div>
      )}

      {notFound && (
        <Card className="mt-8 py-16">
          <div className="text-center">
            <div className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
              {t("debt.not_found_title")}
            </div>
            <div className="text-sm text-ink3 mt-3 max-w-[40ch] mx-auto">
              {t("debt.not_found")}
            </div>
            <div className="mt-6">
              <Button variant="primary" onClick={() => navigate("/collection/worklist")}>
                ← {t("debt.back_to_list")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {contact && aging && !notFound && (
        <>
          {/* Masthead — full-width hero, no right rail */}
          <div className="mt-4 flex items-end justify-between gap-6 flex-wrap pb-6 border-b border-line">
            <div>
              <h1 className="font-display text-4xl md:text-[44px] font-semibold leading-[1.04] tracking-[-0.04em] text-ink break-words">
                {contact.name ?? "—"}
              </h1>
              <div className="mt-3 text-xs text-ink3 flex flex-wrap items-center gap-x-3 gap-y-1">
                {contact.category && (
                  <span>
                    <span className="eyebrow mr-1.5">
                      {t("debt.contact.category")}
                    </span>
                    <span className="text-ink2">{contact.category}</span>
                  </span>
                )}
                {contact.region_name && (
                  <>
                    <span className="text-ink4">·</span>
                    <span>
                      <span className="eyebrow mr-1.5">
                        {t("debt.contact.region")}
                      </span>
                      <span className="text-ink2">{contact.region_name}</span>
                    </span>
                  </>
                )}
                {contact.tin && (
                  <>
                    <span className="text-ink4">·</span>
                    <span className="font-mono text-xs">TIN {contact.tin}</span>
                  </>
                )}
              </div>
            </div>

            <div className="md:text-right">
              <div className="eyebrow">{t("debt.col.outstanding")}</div>
              <div
                className={`kpi-num text-[44px] md:text-[60px] mt-2 ${outstanding > 0 ? "text-coraldk" : "text-mintdk"}`}
              >
                {formatUsd(outstanding)}
              </div>
              {aging.aging_90_plus > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-coralbg text-coraldk eyebrow !text-[10px]">
                  <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-coral animate-pulsemint" />
                  {t("debt.aging_90_badge", {
                    amount: formatUsd(aging.aging_90_plus),
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Ledger overview — surfaces opening balance. Uses REAL order +
              payment sums (from the meta queries) so the four stats add up
              correctly:  opening + orders − payments = outstanding. */}
          <div className="mt-6">
            <LedgerOverview
              aging={aging}
              ordersSum={ordersSum}
              paymentsSum={paymentsSum}
            />
          </div>

          {/* Contact + Aging */}
          <div className="mt-5 grid gap-5 md:grid-cols-[minmax(260px,1fr)_2fr]">
            <ContactCard contact={contact} />
            <AgingCard aging={aging} />
          </div>

          {/* Tabs + content */}
          <div className="mt-8">
            <TabsBar
              tab={tab}
              onTab={setTab}
              counts={{
                calls: detail.data?.contact_log.length ?? 0,
                orders: ordersTotal,
                payments: paymentsTotal,
              }}
            />

            <div className="mt-5">
              {tab === "calls" && (
                <>
                  <CallComposer
                    personId={personId}
                    onSuccess={() => {
                      qc.invalidateQueries({
                        queryKey: ["debt.client", personId],
                      });
                      qc.invalidateQueries({ queryKey: ["debt.worklist"] });
                    }}
                  />
                  <div className="mt-5">
                    <CallsTimeline
                      entries={detail.data?.contact_log ?? []}
                      onChange={() => {
                        qc.invalidateQueries({
                          queryKey: ["debt.client", personId],
                        });
                        qc.invalidateQueries({ queryKey: ["debt.worklist"] });
                      }}
                    />
                  </div>
                </>
              )}

              {tab === "orders" && (
                <OrdersTable
                  orders={detail.data?.orders ?? []}
                  total={ordersTotal}
                  sum={ordersSum}
                  offset={ordersOffset}
                  onOffset={setOrdersOffset}
                />
              )}

              {tab === "payments" && (
                <PaymentsTable
                  payments={detail.data?.payments ?? []}
                  total={paymentsTotal}
                  sum={paymentsSum}
                  offset={paymentsOffset}
                  onOffset={setPaymentsOffset}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Tabs bar ------------------------------------------------------------

function TabsBar({
  tab,
  onTab,
  counts,
}: {
  tab: "calls" | "orders" | "payments";
  onTab: (t: "calls" | "orders" | "payments") => void;
  counts: { calls: number; orders: number; payments: number };
}) {
  const { t } = useTranslation();
  const items: Array<{
    key: "calls" | "orders" | "payments";
    label: string;
    n: number;
  }> = [
    { key: "calls",    label: t("debt.drawer.calls"),    n: counts.calls },
    { key: "orders",   label: t("debt.drawer.orders"),   n: counts.orders },
    { key: "payments", label: t("debt.drawer.payments"), n: counts.payments },
  ];
  return (
    <div className="flex items-baseline gap-8 border-b border-line">
      {items.map((i) => {
        const active = i.key === tab;
        return (
          <button
            key={i.key}
            onClick={() => onTab(i.key)}
            className={[
              "relative pb-3 inline-flex items-baseline gap-2 transition-colors",
              active ? "text-mintdk" : "text-ink3 hover:text-ink",
            ].join(" ")}
          >
            <span className="font-display text-lg md:text-xl font-semibold tracking-[-0.02em] leading-none">
              {i.label}
            </span>
            <span
              className={[
                "font-mono text-[11px] tabular-nums px-2 py-0.5 rounded-full",
                active ? "bg-mintbg text-mintdk" : "bg-line text-ink3",
              ].join(" ")}
            >
              {i.n}
            </span>
            {active && (
              <motion.span
                layoutId="debt-client-tab"
                className="absolute left-0 right-0 -bottom-px h-[2px] bg-mint rounded-t-full"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---- Call composer — refined for IBM Plex ------------------------------

function CallComposer({
  personId,
  onSuccess,
}: {
  personId: number;
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
          promised_amount:
            outcome === "promised" && promisedAmount
              ? Number(promisedAmount)
              : null,
          promised_by_date:
            outcome === "promised" ? promisedBy || null : null,
          follow_up_date: followUp || null,
          note: note || null,
        }),
      }),
    onSuccess: () => {
      setNote("");
      setPromisedAmount("");
      setPromisedBy("");
      setFollowUp("");
      setOutcome("called");
      onSuccess();
    },
    onError: (e: Error) => setErr(e.message),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      const match = (Object.entries(OUTCOME_SHORTCUT) as [Outcome, string][]).find(
        ([, v]) => v.toUpperCase() === e.key.toUpperCase() || v === e.key,
      );
      if (match) {
        e.preventDefault();
        setOutcome(match[0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    m.mutate();
  }

  return (
    <Card className="p-5 md:p-7">
      <form onSubmit={submit} className="flex flex-col gap-5">
        {/* Single-line header — no doubled eyebrow + title. */}
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-xl font-semibold text-ink font-medium">
            {t("debt.log_a_call_title")}
          </h3>
        </div>

        {/* Note — primary input, takes focus first */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={t("debt.drawer.note_placeholder")}
          className="bg-background px-4 py-3 rounded-xl border border-line text-sm text-ink outline-none focus:border-mint focus:ring-4 focus:ring-mint/15 resize-none placeholder:italic placeholder:text-ink3 transition-colors"
        />

        {/* Outcome chips — compact row, sentence-case labels, kbd on right */}
        <div>
          <div className="eyebrow mb-2">
            {t("debt.composer.outcome_label")}
          </div>
          <div className="flex flex-wrap gap-2">
            {OUTCOMES.map((o) => {
              const active = o === outcome;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  className={[
                    "inline-flex items-center gap-2 h-9 px-3 rounded-[8px] border transition-colors text-[13px] whitespace-nowrap",
                    active
                      ? "border-mint bg-mintbg text-mintdk font-medium"
                      : "border-line bg-card text-ink2 hover:border-mint/40 hover:bg-mintbg/40 hover:text-ink",
                  ].join(" ")}
                >
                  <span>{t(`debt.outcome.${o}`)}</span>
                  <kbd
                    className={[
                      "font-mono text-[10px] font-medium px-1 rounded-sm",
                      active ? "text-mintdk" : "text-ink3",
                    ].join(" ")}
                  >
                    {OUTCOME_SHORTCUT[o]}
                  </kbd>
                </button>
              );
            })}
          </div>
        </div>

        {/* Promised fields — inline row only when outcome=promised */}
        <AnimatePresence initial={false}>
          {outcome === "promised" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid md:grid-cols-2 gap-4 pt-1">
                <label className="flex flex-col gap-1.5">
                  <span className="eyebrow">
                    {t("debt.drawer.promised_amount")}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={promisedAmount}
                    onChange={(e) => setPromisedAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-10 bg-card px-3 rounded-xl border border-line text-sm text-ink outline-none focus:border-mint focus:ring-4 focus:ring-mint/15 tabular-nums transition-colors"
                  />
                </label>
                <DateField
                  label={t("debt.drawer.promised_by")}
                  value={promisedBy}
                  onChange={setPromisedBy}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Follow-up — compact inline row */}
        <div className="grid md:grid-cols-[180px_minmax(0,1fr)] items-center gap-3">
          <span className="eyebrow">{t("debt.drawer.follow_up")}</span>
          <DateField compact value={followUp} onChange={setFollowUp} />
        </div>

        {err && (
          <div className="text-xs text-coraldk border-l-2 border-coral pl-3">
            {err}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setNote("");
              setPromisedAmount("");
              setPromisedBy("");
              setFollowUp("");
              setOutcome("called");
            }}
            disabled={m.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" disabled={m.isPending}>
            {m.isPending
              ? t("admin.form_saving")
              : t("debt.drawer.save_contact")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * Date field — native <input type="date"> styled to match the rest of
 * the form. Label above; the input itself hints "DD.MM.YYYY" via a
 * caption so users know which format to type even if their browser
 * shows mm/dd/yyyy locale chrome.
 */
function DateField({
  label,
  value,
  onChange,
  compact = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={[
        "flex flex-col gap-1.5",
        compact ? "max-w-[220px]" : "",
      ].join(" ")}
    >
      {label && <span className="eyebrow">{label}</span>}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 bg-card px-3 rounded-xl border border-line text-sm text-ink outline-none focus:border-mint focus:ring-4 focus:ring-mint/15 tabular-nums transition-colors"
      />
    </label>
  );
}

// ---- Timelines ----------------------------------------------------------

function CallsTimeline({
  entries,
  onChange,
}: {
  entries: ContactLogEntry[];
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const del = useMutation({
    mutationFn: (id: number) =>
      api(`/api/debt/contact/${id}`, { method: "DELETE" }),
    onSuccess: onChange,
  });

  if (entries.length === 0) {
    return (
      <Card className="py-12">
        <div className="text-center text-[14px] text-ink3 italic">
          {t("debt.empty_contact_log")}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <ul className="flex flex-col">
        {entries.map((e) => (
          <li
            key={e.id}
            className="px-5 md:px-7 py-4 relative border-b border-line last:border-b-0"
          >
            <div className="flex items-baseline gap-3 flex-wrap">
              <OutcomeKicker outcome={e.outcome} />
              <span className="text-xs text-ink3 tabular-nums">
                {renderDateTime(e.contacted_at)}
              </span>
              {e.contacted_by_name && (
                <span className="text-xs text-ink3">
                  — {e.contacted_by_name}
                </span>
              )}
              <span className="flex-1" />
              {(user?.role === "admin" || e.contacted_by === user?.id) && (
                <button
                  onClick={() => {
                    if (confirm(t("debt.drawer.delete_confirm"))) {
                      del.mutate(e.id);
                    }
                  }}
                  className="text-xs text-ink3 hover:text-coraldk hover:underline decoration-risk underline-offset-[3px]"
                >
                  {t("common.delete")}
                </button>
              )}
            </div>
            {e.promised_amount != null && (
              <div className="text-xs text-mintdk mt-1 font-mono tabular-nums">
                {t("debt.drawer.promised", {
                  amount: formatUsd(e.promised_amount),
                  date: renderDate(e.promised_by_date),
                })}
              </div>
            )}
            {e.follow_up_date && e.promised_amount == null && (
              <div className="text-xs text-ink2 mt-1">
                {t("debt.drawer.follow_up")}:{" "}
                <span className="font-display font-semibold">
                  {renderDate(e.follow_up_date)}
                </span>
              </div>
            )}
            {e.note && (
              <div className="text-sm text-ink2 mt-2 whitespace-pre-wrap">
                {e.note}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---- Orders table --------------------------------------------------------

function OrdersTable({
  orders,
  total,
  sum,
  offset,
  onOffset,
}: {
  orders: Array<Record<string, any>>;
  total: number;
  sum: number;
  offset: number;
  onOffset: (o: number) => void;
}) {
  const { t } = useTranslation();
  if (orders.length === 0 && offset === 0) {
    return (
      <Card className="py-12">
        <div className="text-center text-[14px] text-ink3 italic">
          {t("debt.empty_orders")}
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-0 overflow-hidden">
      {/* Totals strip — above the table */}
      <TotalsStrip
        left={{
          label: t("debt.tab_totals.orders_count"),
          value: total.toLocaleString("en-US"),
        }}
        right={{
          label: t("debt.tab_totals.orders_sum"),
          value: formatUsd2(sum),
          tone: "ink",
        }}
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>{t("debt.orders_col.delivery_date")}</Th>
              <Th>{t("debt.orders_col.product_name")}</Th>
              <Th className="hidden md:table-cell">
                {t("debt.orders_col.sales_manager")}
              </Th>
              <Th align="right">{t("debt.orders_col.sold_quant")}</Th>
              <Th align="right">{t("debt.orders_col.product_amount")}</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={i} className="hover:bg-mintbg/40 transition-colors">
                <Td className="tabular-nums w-[120px]">
                  <span className="text-ink2">
                    {renderDate(o.delivery_date)}
                  </span>
                </Td>
                <Td>
                  <span className="text-ink">{o.product_name ?? "—"}</span>
                </Td>
                <Td className="hidden md:table-cell">
                  <span className="text-xs text-ink3 truncate">
                    {o.sales_manager ?? "—"}
                  </span>
                </Td>
                <Td align="right" className="font-mono text-xs tabular-nums">
                  {Number(o.sold_quant ?? 0).toLocaleString("en-US")}
                </Td>
                <Td
                  align="right"
                  className="tabular-nums font-medium text-ink w-[140px]"
                >
                  {formatUsd2(o.product_amount)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > PAGE_SIZE && (
        <Pagination
          offset={offset}
          limit={PAGE_SIZE}
          total={total}
          onOffset={onOffset}
        />
      )}
    </Card>
  );
}

// ---- Payments table ------------------------------------------------------

function PaymentsTable({
  payments,
  total,
  sum,
  offset,
  onOffset,
}: {
  payments: Array<Record<string, any>>;
  total: number;
  sum: number;
  offset: number;
  onOffset: (o: number) => void;
}) {
  const { t } = useTranslation();
  if (payments.length === 0 && offset === 0) {
    return (
      <Card className="py-12">
        <div className="text-center text-[14px] text-ink3 italic">
          {t("debt.empty_payments")}
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-0 overflow-hidden">
      <TotalsStrip
        left={{
          label: t("debt.tab_totals.payments_count"),
          value: total.toLocaleString("en-US"),
        }}
        right={{
          label: t("debt.tab_totals.payments_sum"),
          value: formatUsd2(sum),
          tone: "good",
        }}
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>{t("debt.pay_col.payment_date")}</Th>
              <Th>{t("debt.pay_col.payer")}</Th>
              <Th className="hidden md:table-cell">
                {t("debt.pay_col.payment_method")}
              </Th>
              <Th align="right">{t("debt.pay_col.amount")}</Th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={i} className="hover:bg-mintbg/40 transition-colors">
                <Td className="tabular-nums w-[180px]">
                  <span className="text-ink2">
                    {renderDateTime(p.payment_date)}
                  </span>
                </Td>
                <Td>
                  <span className="text-ink">{p.payer ?? "—"}</span>
                </Td>
                <Td className="hidden md:table-cell">
                  <span className="text-xs text-ink3">
                    {p.payment_method ?? "—"}
                  </span>
                </Td>
                <Td
                  align="right"
                  className="tabular-nums font-medium text-mintdk w-[140px]"
                >
                  + {formatUsd2(p.amount)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > PAGE_SIZE && (
        <Pagination
          offset={offset}
          limit={PAGE_SIZE}
          total={total}
          onOffset={onOffset}
        />
      )}
    </Card>
  );
}

// ---- Table atoms --------------------------------------------------------

function Th({
  children,
  align,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={[
        "px-5 md:px-7 py-3 border-b-[1.5px] border-ink eyebrow bg-card whitespace-nowrap",
        align === "right" ? "text-right" : "text-left",
        className,
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={[
        "px-5 md:px-7 py-3 border-b border-line last:border-b-0 text-[14px]",
        align === "right" ? "text-right" : "text-left",
        className,
      ].join(" ")}
    >
      {children}
    </td>
  );
}

function TotalsStrip({
  left,
  right,
}: {
  left: { label: string; value: string };
  right: { label: string; value: string; tone?: "ink" | "good" | "mark" };
}) {
  const toneClass =
    right.tone === "good"
      ? "text-mintdk"
      : right.tone === "mark"
        ? "text-mintdk"
        : "text-ink";
  return (
    <div className="px-5 md:px-7 py-4 bg-muted/60 border-b border-line flex items-baseline justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <span className="eyebrow">{left.label}</span>
        <span className="tabular-nums text-[20px] font-medium text-ink">
          {left.value}
        </span>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="eyebrow">{right.label}</span>
        <span
          className={` tabular-nums text-[22px] font-medium ${toneClass}`}
        >
          {right.value}
        </span>
      </div>
    </div>
  );
}
