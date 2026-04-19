/**
 * Per-client debt dossier — full page at /collection/debt/client/:personId.
 * Replaces the previous in-drawer detail view with a proper route so a
 * collector can deep-link, keep the page open in a tab while they call,
 * and see the full order/payment history without the cramped 640 px
 * drawer width.
 */
import {
  FormEvent,
  ReactNode,
  useEffect,
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
import Input from "../components/Input";

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
  note: "·",
};

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
    aging_0_30: number;
    aging_30_60: number;
    aging_60_90: number;
    aging_90_plus: number;
  };
  orders: Array<Record<string, any>>;
  payments: Array<Record<string, any>>;
  contact_log: ContactLogEntry[];
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

// ---- Atoms --------------------------------------------------------------

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
    <span className={`eyebrow ${tone[outcome]}`} style={{ letterSpacing: "0.14em" }}>
      {t(`debt.outcome.${outcome}`)}
    </span>
  );
}

// ---- Aging display — a proper breakdown, not just a row -----------------

function AgingBreakdown({ aging }: { aging: ClientDetail["aging"] }) {
  const { t } = useTranslation();
  const [showHelp, setShowHelp] = useState(false);
  const total =
    aging.aging_0_30 + aging.aging_30_60 + aging.aging_60_90 + aging.aging_90_plus;
  const rows: Array<{
    key: "0_30" | "30_60" | "60_90" | "90_plus";
    v: number;
    tone: string;
    bar: string;
  }> = [
    { key: "0_30", v: aging.aging_0_30, tone: "text-good", bar: "bg-good/70" },
    { key: "30_60", v: aging.aging_30_60, tone: "text-warn", bar: "bg-warn/70" },
    { key: "60_90", v: aging.aging_60_90, tone: "text-mark", bar: "bg-mark/60" },
    { key: "90_plus", v: aging.aging_90_plus, tone: "text-risk", bar: "bg-risk" },
  ];
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="eyebrow" style={{ letterSpacing: "0.18em" }}>
          {t("debt.aging_title")}
        </div>
        <button
          type="button"
          onClick={() => setShowHelp((h) => !h)}
          className="caption text-ink-3 hover:text-mark hover:underline decoration-mark underline-offset-[3px]"
        >
          {showHelp ? t("debt.aging_hide_help") : t("debt.aging_what")}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-3 text-body text-ink-2 border-l-2 border-mark pl-3"
          >
            <p className="whitespace-pre-wrap">{t("debt.aging_help")}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 flex flex-col gap-2">
        {rows.map((r) => {
          const pct = total > 0 ? r.v / total : 0;
          return (
            <div key={r.key} className="flex items-center gap-3">
              <span
                className={`caption w-20 shrink-0 ${r.v > 0 ? r.tone : "text-ink-3"}`}
                style={{ letterSpacing: "0.08em" }}
              >
                {t(`debt.aging.${r.key}`)}
              </span>
              <div className="flex-1 h-[6px] bg-paper-2 rounded-sm overflow-hidden">
                {pct > 0 && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct * 100}%` }}
                    transition={{
                      duration: 0.5,
                      ease: [0.2, 0.8, 0.2, 1],
                    }}
                    className={`${r.bar} h-full`}
                  />
                )}
              </div>
              <span
                className={`serif tabular-nums text-right w-28 ${r.v > 0 ? "text-ink" : "text-ink-3"}`}
              >
                {r.v > 0 ? formatUsd(r.v) : "·"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="leader mt-5" />

      <div className="grid grid-cols-[1fr_auto] gap-y-1 gap-x-4 text-body">
        <span className="caption text-ink-3">{t("debt.kpi.gross_invoiced")}</span>
        <span className="tabular-nums text-ink text-right">
          {formatUsd(aging.gross_invoiced)}
        </span>
        <span className="caption text-ink-3">{t("debt.kpi.gross_paid")}</span>
        <span className="tabular-nums text-good text-right">
          {formatUsd(aging.gross_paid)}
        </span>
        <span
          className="eyebrow text-ink pt-2 border-t border-rule"
          style={{ letterSpacing: "0.18em" }}
        >
          {t("debt.col.outstanding")}
        </span>
        <span className="serif tabular-nums text-right text-mark text-heading-sm pt-2 border-t border-rule">
          {formatUsd(aging.gross_invoiced - aging.gross_paid)}
        </span>
      </div>
    </div>
  );
}

// ---- Main page ----------------------------------------------------------

export default function DebtClient() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || "en-GB";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = useParams<{ personId: string }>();
  const personId = Number(params.personId);

  const [tab, setTab] = useState<"calls" | "orders" | "payments">("calls");

  const detail = useQuery({
    queryKey: ["debt.client", personId],
    queryFn: () => api<ClientDetail>(`/api/debt/client/${personId}`),
    enabled: Number.isFinite(personId),
  });

  const contact = detail.data?.contact;
  const aging = detail.data?.aging;

  const outstanding =
    aging ? aging.gross_invoiced - aging.gross_paid : 0;

  const notFound =
    detail.isError &&
    (detail.error as ApiError | Error)?.message &&
    ((detail.error as any)?.status === 404 ||
      /not found|outside scope/.test((detail.error as Error).message));

  return (
    <div>
      {/* Breadcrumb */}
      <div className="stagger-0">
        <div className="caption text-ink-3 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate("/collection/debt")}
            className="text-ink-3 hover:text-mark transition-colors inline-flex items-center gap-1"
          >
            <span aria-hidden>←</span>
            <span>{t("debt.back_to_list")}</span>
          </button>
          <span className="text-ink-3/60">·</span>
          <span>{t("nav.collection")}</span>
          <span className="text-ink-3/60">·</span>
          <span>{t("nav.debt")}</span>
          {contact?.name && (
            <>
              <span className="text-ink-3/60">·</span>
              <span className="text-ink-2 truncate max-w-[50ch]">
                {contact.name}
              </span>
            </>
          )}
        </div>
      </div>

      {detail.isLoading && (
        <div className="stagger-1 mt-10 caption text-ink-3 text-center">
          {t("common.loading")}
        </div>
      )}

      {notFound && (
        <Card className="stagger-1 mt-8 py-16">
          <div className="text-center">
            <div className="serif-italic text-heading-md text-ink">
              {t("debt.not_found_title")}
              <span className="mark-stop">.</span>
            </div>
            <div className="text-body text-ink-2 mt-3 max-w-[40ch] mx-auto">
              {t("debt.not_found")}
            </div>
            <div className="mt-6">
              <Button variant="primary" onClick={() => navigate("/collection/debt")}>
                ← {t("debt.back_to_list")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {contact && !notFound && (
        <>
          {/* Masthead */}
          <div className="stagger-1 mt-3 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <h1 className="serif text-heading-lg text-ink leading-[0.95] break-words">
                <span className="serif-italic">{contact.name ?? "—"}</span>
                <span className="mark-stop">.</span>
              </h1>
              <div className="mt-3 caption text-ink-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                {contact.category && (
                  <span>
                    <span className="eyebrow text-ink-3 mr-1">
                      {t("debt.contact.category")}
                    </span>
                    <span className="text-ink-2">{contact.category}</span>
                  </span>
                )}
                {contact.region_name && (
                  <>
                    <span className="text-ink-3/60">·</span>
                    <span>
                      <span className="eyebrow text-ink-3 mr-1">
                        {t("debt.contact.region")}
                      </span>
                      <span className="text-ink-2">{contact.region_name}</span>
                    </span>
                  </>
                )}
                {contact.tin && (
                  <>
                    <span className="text-ink-3/60">·</span>
                    <span className="mono text-mono-xs">TIN {contact.tin}</span>
                  </>
                )}
              </div>
            </div>

            <div className="md:text-right">
              <div
                className="eyebrow text-ink-3"
                style={{ letterSpacing: "0.18em" }}
              >
                {t("debt.col.outstanding")}
              </div>
              <div
                className="serif nums text-[3rem] md:text-[3.6rem] leading-none tabular-nums mt-2"
                style={{
                  color: outstanding > 0 ? "var(--mark)" : "var(--good)",
                }}
              >
                {formatUsd(outstanding)}
              </div>
              {aging && aging.aging_90_plus > 0 && (
                <div className="mt-2 caption text-risk tabular-nums">
                  {t("debt.aging_90_badge", {
                    amount: formatUsd(aging.aging_90_plus),
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="leader mt-8" />

          {/* Two-column body */}
          <div className="stagger-2 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Left rail — contact + aging + totals */}
            <div className="flex flex-col gap-5">
              <Card className="p-5 md:p-6">
                <div className="eyebrow mb-3" style={{ letterSpacing: "0.18em" }}>
                  {t("debt.drawer.contact")}
                </div>
                <dl className="flex flex-col gap-3">
                  {contact.main_phone && (
                    <ContactRow
                      label={t("debt.contact.phone")}
                      value={
                        <CopyableAction
                          kind="phone"
                          href={`tel:${String(contact.main_phone).replace(/[^+\d]/g, "")}`}
                          onCopy={contact.main_phone}
                        >
                          {contact.main_phone}
                        </CopyableAction>
                      }
                    />
                  )}
                  {contact.telegram && (
                    <ContactRow
                      label={t("debt.contact.telegram")}
                      value={
                        <CopyableAction kind="telegram" onCopy={contact.telegram}>
                          {contact.telegram}
                        </CopyableAction>
                      }
                    />
                  )}
                  {contact.address && (
                    <ContactRow
                      label={t("debt.contact.address")}
                      value={<span className="text-body text-ink">{contact.address}</span>}
                    />
                  )}
                  {contact.owner_name && (
                    <ContactRow
                      label={t("debt.contact.owner")}
                      value={<span className="text-body text-ink">{contact.owner_name}</span>}
                    />
                  )}
                  {!contact.main_phone &&
                    !contact.telegram &&
                    !contact.address &&
                    !contact.owner_name && (
                      <div className="caption text-ink-3">
                        {t("debt.no_contact_info")}
                      </div>
                    )}
                </dl>
              </Card>

              {aging && (
                <Card className="p-5 md:p-6">
                  <AgingBreakdown aging={aging} />
                </Card>
              )}
            </div>

            {/* Right — inline add-contact + tabbed history */}
            <div className="flex flex-col gap-5">
              <Card className="p-5 md:p-6">
                <InlineAddContact
                  personId={personId}
                  onSuccess={() => {
                    qc.invalidateQueries({ queryKey: ["debt.client", personId] });
                    qc.invalidateQueries({ queryKey: ["debt.worklist"] });
                  }}
                />
              </Card>

              <Card className="p-0 overflow-hidden">
                <div className="px-5 md:px-6 pt-5 pb-0 flex items-baseline gap-6 border-b border-rule">
                  {(["calls", "orders", "payments"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setTab(k)}
                      className={[
                        "relative pb-3 transition-colors",
                        tab === k ? "text-mark" : "text-ink-2 hover:text-ink",
                      ].join(" ")}
                    >
                      <span className="serif-italic text-heading-sm leading-none">
                        {t(`debt.drawer.${k}`)}
                      </span>
                      {tab === k && (
                        <motion.span
                          layoutId="debt-client-tab"
                          className="absolute left-0 right-0 -bottom-px h-[2px] bg-mark"
                        />
                      )}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <span className="caption text-ink-3 tabular-nums pb-3">
                    {tab === "calls"
                      ? detail.data?.contact_log.length ?? 0
                      : tab === "orders"
                        ? detail.data?.orders.length ?? 0
                        : detail.data?.payments.length ?? 0}
                  </span>
                </div>

                <div className="p-5 md:p-6">
                  {tab === "calls" && (
                    <CallsTimeline
                      entries={detail.data?.contact_log ?? []}
                      locale={locale}
                      onChange={() => {
                        qc.invalidateQueries({
                          queryKey: ["debt.client", personId],
                        });
                        qc.invalidateQueries({ queryKey: ["debt.worklist"] });
                      }}
                    />
                  )}
                  {tab === "orders" && (
                    <OrdersTimeline
                      orders={detail.data?.orders ?? []}
                      locale={locale}
                    />
                  )}
                  {tab === "payments" && (
                    <PaymentsTimeline
                      payments={detail.data?.payments ?? []}
                      locale={locale}
                    />
                  )}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ContactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt
        className="eyebrow text-ink-3 w-16 shrink-0"
        style={{ letterSpacing: "0.14em" }}
      >
        {label}
      </dt>
      <dd className="flex-1 min-w-0">{value}</dd>
    </div>
  );
}

// ---- Timelines ----------------------------------------------------------

function CallsTimeline({
  entries,
  locale,
  onChange,
}: {
  entries: ContactLogEntry[];
  locale: string;
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
      <div className="py-6 text-center caption text-ink-3">
        {t("debt.empty_contact_log")}
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {entries.map((e, i) => (
        <li
          key={e.id}
          className={[
            "py-3 relative pl-4 border-b border-rule last:border-b-0",
            i === 0 ? "pt-0" : "",
          ].join(" ")}
        >
          <span
            aria-hidden
            className="absolute left-0 top-3 bottom-3 w-[2px] bg-rule"
          />
          <div className="flex items-baseline gap-3 flex-wrap">
            <OutcomeKicker outcome={e.outcome} />
            <span className="caption text-ink-3 tabular-nums">
              {renderDateTime(e.contacted_at, locale)}
            </span>
            {e.contacted_by_name && (
              <span className="caption text-ink-3">— {e.contacted_by_name}</span>
            )}
            <span className="flex-1" />
            {(user?.role === "admin" || e.contacted_by === user?.id) && (
              <button
                onClick={() => {
                  if (confirm(t("debt.drawer.delete_confirm"))) {
                    del.mutate(e.id);
                  }
                }}
                className="caption text-ink-3 hover:text-risk hover:underline decoration-risk underline-offset-[3px]"
              >
                {t("common.delete")}
              </button>
            )}
          </div>
          {e.promised_amount != null && (
            <div className="caption text-mark mt-1 serif-italic">
              {t("debt.drawer.promised", {
                amount: formatUsd(e.promised_amount),
                date: renderDate(e.promised_by_date, locale),
              })}
            </div>
          )}
          {e.follow_up_date && e.promised_amount == null && (
            <div className="caption text-ink-2 mt-1">
              {t("debt.drawer.follow_up")}:{" "}
              <span className="serif-italic">
                {renderDate(e.follow_up_date, locale)}
              </span>
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
  );
}

function OrdersTimeline({
  orders,
  locale,
}: {
  orders: Array<Record<string, any>>;
  locale: string;
}) {
  const { t } = useTranslation();
  if (orders.length === 0) {
    return (
      <div className="py-6 text-center caption text-ink-3">
        {t("debt.empty_orders")}
      </div>
    );
  }
  return (
    <ul className="flex flex-col">
      {orders.map((o, i) => (
        <li
          key={i}
          className="py-2 flex items-baseline gap-3 text-body border-b border-rule last:border-b-0"
        >
          <span className="caption text-ink-3 w-24 shrink-0 tabular-nums">
            {renderDate(o.delivery_date, locale)}
          </span>
          <span className="text-ink flex-1 truncate">
            {o.product_name ?? "—"}
          </span>
          {o.sales_manager && (
            <span className="caption text-ink-3 truncate max-w-[8rem] hidden sm:inline">
              {o.sales_manager}
            </span>
          )}
          <span className="mono text-mono-sm text-ink-3 tabular-nums w-14 text-right">
            × {Number(o.sold_quant ?? 0).toLocaleString()}
          </span>
          <span className="serif tabular-nums w-28 text-right text-ink">
            {formatUsd(o.product_amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PaymentsTimeline({
  payments,
  locale,
}: {
  payments: Array<Record<string, any>>;
  locale: string;
}) {
  const { t } = useTranslation();
  if (payments.length === 0) {
    return (
      <div className="py-6 text-center caption text-ink-3">
        {t("debt.empty_payments")}
      </div>
    );
  }
  return (
    <ul className="flex flex-col">
      {payments.map((p, i) => (
        <li
          key={i}
          className="py-2 flex items-baseline gap-3 text-body border-b border-rule last:border-b-0"
        >
          <span className="caption text-ink-3 w-28 shrink-0 tabular-nums">
            {renderDateTime(p.payment_date, locale)}
          </span>
          <span className="text-ink-2 flex-1 truncate caption">
            {p.payer ?? "—"}
          </span>
          {p.payment_method && (
            <span className="caption text-ink-3 truncate hidden sm:inline">
              {p.payment_method}
            </span>
          )}
          <span className="serif tabular-nums w-28 text-right text-good">
            + {formatUsd(p.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---- Inline add contact (replaces the modal) ----------------------------

function InlineAddContact({
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
  const [expanded, setExpanded] = useState(false);

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
      setExpanded(false);
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
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      )
        return;
      const match = (Object.entries(OUTCOME_SHORTCUT) as [Outcome, string][]).find(
        ([, v]) => v.toUpperCase() === e.key.toUpperCase() || v === e.key,
      );
      if (match) {
        e.preventDefault();
        setOutcome(match[0]);
        setExpanded(true);
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="eyebrow" style={{ letterSpacing: "0.18em" }}>
            {t("debt.log_a_call")}
          </div>
          <div className="serif-italic text-heading-sm text-ink mt-1">
            {t("debt.log_a_call_title")}
          </div>
        </div>
        <span className="caption text-ink-3 serif-italic hidden md:inline">
          {t("debt.drawer.shortcut_hint")}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {OUTCOMES.map((o) => {
          const active = o === outcome;
          return (
            <button
              key={o}
              type="button"
              onClick={() => {
                setOutcome(o);
                setExpanded(true);
              }}
              className={[
                "flex flex-col items-center gap-1 py-2 px-2 rounded-[10px] border transition-colors",
                active
                  ? "border-mark bg-mark-bg text-mark"
                  : "border-rule bg-card text-ink-2 hover:border-rule-2 hover:text-ink",
              ].join(" ")}
            >
              <span
                className="caption uppercase"
                style={{ letterSpacing: "0.1em" }}
              >
                {t(`debt.outcome.${o}`)}
              </span>
              <kbd className="mono text-mono-xs text-ink-3 font-medium">
                {OUTCOME_SHORTCUT[o]}
              </kbd>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden flex flex-col gap-4"
          >
            {outcome === "promised" && (
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  layout="inline"
                  label={t("debt.drawer.promised_amount")}
                  type="number"
                  step="0.01"
                  min="0"
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
              </div>
            )}

            <Input
              layout="inline"
              label={t("debt.drawer.follow_up")}
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />

            <label className="grid grid-cols-[100px_1fr] items-start gap-x-4">
              <span
                className="eyebrow text-right mt-2"
                style={{ letterSpacing: "0.14em" }}
              >
                {t("debt.drawer.note")}
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={t("debt.drawer.note_placeholder")}
                className="bg-paper-2 px-3 py-2 rounded-[10px] border border-rule text-body outline-none focus:border-mark resize-none"
              />
            </label>

            {err && (
              <div className="caption text-risk border-l-2 border-risk pl-3">
                {err}
              </div>
            )}

            <div className="flex items-center justify-end gap-5">
              <Button
                variant="link"
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setNote("");
                  setPromisedAmount("");
                  setPromisedBy("");
                  setFollowUp("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button variant="primary" type="submit" disabled={m.isPending}>
                {m.isPending
                  ? t("admin.form_saving")
                  : t("debt.drawer.save_contact")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
