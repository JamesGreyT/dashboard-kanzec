/**
 * Per-client debt dossier at /collection/debt/client/:personId.
 *
 * Layout (Folio rewrite):
 *   1. Breadcrumb
 *   2. Masthead: italic Fraunces name + outstanding number (right-aligned)
 *   3. Ledger-overview strip: opening AR | orders | payments | outstanding
 *      — surfaces pre-2022 carryover prominently.
 *   4. Contact + Aging — two compact cards side-by-side.
 *   5. Tabs bar: Calls · Orders · Payments — pinned below the strip so
 *      the user sees all three the moment the page loads.
 *   6. Active tab content.
 *      - On Calls, a flat contact-log composer sits above the timeline.
 *        Single form, note first, outcome chips in one row, no expand.
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
    <span className={`eyebrow-mono ${tone[outcome]}`}>
      {t(`debt.outcome.${outcome}`)}
    </span>
  );
}

// ---- Ledger overview strip ----------------------------------------------

function LedgerOverview({
  aging,
  locale: _locale,
}: {
  aging: ClientDetail["aging"];
  locale: string;
}) {
  const { t } = useTranslation();
  const outstanding = aging.gross_invoiced - aging.gross_paid;
  const openingNet = aging.opening_debt - aging.opening_credit;
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
      value: aging.gross_invoiced,
      sub: t("debt.ledger.since_2022"),
      tone: "ink",
    },
    {
      label: t("debt.ledger.payments"),
      value: aging.gross_paid,
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
      <div className="px-5 md:px-7 pt-5 pb-4">
        <div className="eyebrow-mono">{t("debt.ledger.title")}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {items.map((it, i) => {
          const toneClass =
            it.tone === "mark"
              ? "text-mark"
              : it.tone === "good"
                ? "text-good"
                : it.tone === "risk"
                  ? "text-risk"
                  : "text-ink";
          return (
            <div
              key={i}
              className={[
                "px-5 md:px-7 py-5 md:py-6",
                i > 0 ? "md:border-l md:border-rule" : "",
                i > 1 ? "border-t md:border-t-0 border-rule" : "",
                i === 1 ? "border-t md:border-t-0 border-rule md:border-none" : "",
              ].join(" ")}
            >
              <div className="eyebrow-mono text-ink-3">{it.label}</div>
              <div
                className={`serif nums tabular-nums text-[2rem] md:text-[2.4rem] leading-[1.05] mt-1 ${toneClass} font-medium`}
              >
                {formatUsd(it.value ?? 0)}
              </div>
              {it.sub && (
                <div className="caption italic text-ink-3 mt-1 font-serif">
                  {it.sub}
                </div>
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
      <div className="eyebrow-mono mb-3">{t("debt.drawer.contact")}</div>
      {!hasAny && (
        <div className="font-serif italic text-ink-3 text-[14px]">
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
          <div className="text-body text-ink-2">
            <span className="caption text-ink-3 mr-2">
              {t("debt.contact.address")}
            </span>
            {contact.address}
          </div>
        )}
        {contact.owner_name && (
          <div className="text-body text-ink-2">
            <span className="caption text-ink-3 mr-2">
              {t("debt.contact.owner")}
            </span>
            {contact.owner_name}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---- Aging breakdown (inline, no separate help modal) --------------------

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
    { key: "0_30", v: aging.aging_0_30, bar: "bg-good/80" },
    { key: "30_60", v: aging.aging_30_60, bar: "bg-warn/80" },
    { key: "60_90", v: aging.aging_60_90, bar: "bg-mark/70" },
    { key: "90_plus", v: aging.aging_90_plus, bar: "bg-risk" },
  ];
  const dominant = [...rows].sort((a, b) => b.v - a.v)[0];
  const dominantPct =
    total > 0 ? Math.round((dominant.v / total) * 100) : 0;

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-baseline justify-between">
        <div className="eyebrow-mono">{t("debt.aging_title")}</div>
        {total > 0 && dominantPct >= 50 && (
          <span className="caption font-serif italic text-ink-3">
            {t("debt.aging_dominance", {
              pct: dominantPct,
              bucket: t(`debt.aging.${dominant.key}`),
            })}
          </span>
        )}
      </div>

      {/* Horizontal stacked bar */}
      <div className="mt-4 flex h-[8px] rounded-full overflow-hidden bg-paper-2">
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

      {/* Row per bucket */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="eyebrow-mono text-ink-3">
              {t(`debt.aging.${r.key}`)}
            </div>
            <div
              className={[
                "font-serif tabular-nums text-[16px] leading-tight mt-1 font-medium",
                r.v > 0 ? "text-ink" : "text-ink-3",
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

  const outstanding = aging ? aging.gross_invoiced - aging.gross_paid : 0;

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
              <span className="text-ink-2 truncate max-w-[50ch]">{contact.name}</span>
            </>
          )}
        </div>
      </div>

      {detail.isLoading && (
        <div className="stagger-1 mt-10 font-serif italic text-ink-3 text-center">
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

      {contact && aging && !notFound && (
        <>
          {/* Masthead */}
          <div className="stagger-1 mt-3 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <h1 className="serif-italic text-heading-lg text-ink leading-[0.95] break-words">
                {contact.name ?? "—"}
                <span className="mark-stop">.</span>
              </h1>
              <div className="mt-3 caption text-ink-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                {contact.category && (
                  <span>
                    <span className="eyebrow-mono mr-1.5">
                      {t("debt.contact.category")}
                    </span>
                    <span className="text-ink-2">{contact.category}</span>
                  </span>
                )}
                {contact.region_name && (
                  <>
                    <span className="text-ink-3/60">·</span>
                    <span>
                      <span className="eyebrow-mono mr-1.5">
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
              <div className="eyebrow-mono">{t("debt.col.outstanding")}</div>
              <div
                className="serif nums text-[3rem] md:text-[3.6rem] leading-none tabular-nums mt-2 font-medium"
                style={{
                  color: outstanding > 0 ? "var(--mark)" : "var(--good)",
                }}
              >
                {formatUsd(outstanding)}
              </div>
              {aging.aging_90_plus > 0 && (
                <div className="mt-2 caption text-risk tabular-nums font-mono uppercase tracking-[0.05em]">
                  {t("debt.aging_90_badge", {
                    amount: formatUsd(aging.aging_90_plus),
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="leader mt-8" />

          {/* Ledger overview — surfaces opening balance prominently */}
          <div className="stagger-2 mt-6">
            <LedgerOverview aging={aging} locale={locale} />
          </div>

          {/* Contact + Aging, side by side */}
          <div className="stagger-3 mt-5 grid gap-5 md:grid-cols-[minmax(260px,1fr)_2fr]">
            <ContactCard contact={contact} />
            <AgingCard aging={aging} />
          </div>

          {/* Tabs bar — pinned high, visible from first scroll */}
          <div className="stagger-4 mt-8">
            <TabsBar
              tab={tab}
              onTab={setTab}
              counts={{
                calls: detail.data?.contact_log.length ?? 0,
                orders: detail.data?.orders.length ?? 0,
                payments: detail.data?.payments.length ?? 0,
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
                      locale={locale}
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
  const items: Array<{ key: "calls" | "orders" | "payments"; label: string; n: number }> = [
    { key: "calls",    label: t("debt.drawer.calls"),    n: counts.calls },
    { key: "orders",   label: t("debt.drawer.orders"),   n: counts.orders },
    { key: "payments", label: t("debt.drawer.payments"), n: counts.payments },
  ];
  return (
    <div className="relative flex items-baseline gap-8 border-b border-rule">
      {items.map((i) => {
        const active = i.key === tab;
        return (
          <button
            key={i.key}
            onClick={() => onTab(i.key)}
            className={[
              "group relative pb-3 inline-flex items-baseline gap-2 transition-colors",
              active ? "text-mark" : "text-ink-2 hover:text-ink",
            ].join(" ")}
          >
            <span className="serif-italic text-heading-sm leading-none">
              {i.label}
            </span>
            <span
              className={[
                "mono text-[11px] tabular-nums px-1.5 py-0.5 rounded-chip",
                active ? "bg-mark-bg text-mark" : "bg-paper-2 text-ink-3",
              ].join(" ")}
            >
              {i.n}
            </span>
            {active && (
              <motion.span
                layoutId="debt-client-tab"
                className="absolute left-0 right-0 -bottom-px h-[2px] bg-mark"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---- Call composer — flat, single form, no expand/collapse --------------

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

  // Keyboard shortcuts: one keypress to pick outcome (when not typing
  // into an input). No auto-expand — form is flat now.
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
        {/* Header */}
        <div>
          <div className="eyebrow-mono">{t("debt.log_a_call")}</div>
          <div className="serif-italic text-heading-sm text-ink mt-1">
            {t("debt.log_a_call_title")}
          </div>
        </div>

        {/* Note — primary input, takes focus first */}
        <label className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t("debt.drawer.note_placeholder")}
            className="bg-card px-4 py-3 rounded-[10px] border border-rule-2 text-body text-ink outline-none focus:border-mark focus:ring-2 focus:ring-mark/30 resize-none placeholder:italic placeholder:font-serif placeholder:text-ink-3 transition-colors"
          />
        </label>

        {/* Outcome chips — compact radio row */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="eyebrow-mono">{t("debt.composer.outcome_label")}</span>
            <span className="caption font-serif italic text-ink-3 hidden md:inline">
              {t("debt.composer.shortcut_hint")}
            </span>
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
                    "inline-flex items-center gap-1.5 h-8 px-3 rounded-pill border text-[12.5px] font-medium transition-colors",
                    active
                      ? "border-mark bg-mark-bg text-mark"
                      : "border-rule bg-card text-ink-2 hover:border-ink-3 hover:text-ink",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className={[
                      "w-[6px] h-[6px] rounded-full",
                      active ? "bg-mark" : "bg-ink-3/50",
                    ].join(" ")}
                  />
                  <span>{t(`debt.outcome.${o}`)}</span>
                  <kbd className="mono text-[10px] text-ink-3 ml-0.5">
                    {OUTCOME_SHORTCUT[o]}
                  </kbd>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conditional detail row — promised amount + date, inline */}
        <AnimatePresence initial={false}>
          {outcome === "promised" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid md:grid-cols-2 gap-4 pt-1">
                <ComposerField label={t("debt.drawer.promised_amount")}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={promisedAmount}
                    onChange={(e) => setPromisedAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-10 bg-card px-3 rounded-[10px] border border-rule-2 text-body text-ink outline-none focus:border-mark focus:ring-2 focus:ring-mark/30 tabular-nums transition-colors"
                  />
                </ComposerField>
                <ComposerField label={t("debt.drawer.promised_by")}>
                  <input
                    type="date"
                    value={promisedBy}
                    onChange={(e) => setPromisedBy(e.target.value)}
                    className="h-10 bg-card px-3 rounded-[10px] border border-rule-2 text-body text-ink outline-none focus:border-mark focus:ring-2 focus:ring-mark/30 tabular-nums transition-colors"
                  />
                </ComposerField>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Follow-up — always visible, compact */}
        <div className="grid md:grid-cols-[200px_minmax(0,1fr)] items-center gap-3">
          <span className="eyebrow-mono">{t("debt.drawer.follow_up")}</span>
          <input
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            className="h-10 bg-card px-3 rounded-[10px] border border-rule-2 text-body text-ink outline-none focus:border-mark focus:ring-2 focus:ring-mark/30 tabular-nums transition-colors max-w-[200px]"
          />
        </div>

        {err && (
          <div className="caption text-risk border-l-2 border-risk pl-3 font-serif italic">
            {err}
          </div>
        )}

        <div className="flex items-center justify-end gap-5 pt-2 border-t border-rule">
          <Button
            variant="link"
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

function ComposerField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow-mono">{label}</span>
      {children}
    </label>
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
      <Card className="py-12">
        <div className="text-center font-serif italic text-[14px] text-ink-3">
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
            className="px-5 md:px-7 py-4 relative border-b border-rule last:border-b-0"
          >
            <div className="flex items-baseline gap-3 flex-wrap">
              <OutcomeKicker outcome={e.outcome} />
              <span className="caption text-ink-3 tabular-nums">
                {renderDateTime(e.contacted_at, locale)}
              </span>
              {e.contacted_by_name && (
                <span className="caption text-ink-3">
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
              <div className="text-body text-ink-2 mt-2 whitespace-pre-wrap">
                {e.note}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
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
      <Card className="py-12">
        <div className="text-center font-serif italic text-[14px] text-ink-3">
          {t("debt.empty_orders")}
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-0 overflow-hidden">
      <ul className="flex flex-col">
        {orders.map((o, i) => (
          <li
            key={i}
            className="px-5 md:px-7 py-3 flex items-baseline gap-4 text-body border-b border-rule last:border-b-0"
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
            <span className="serif tabular-nums w-28 text-right text-ink font-medium">
              {formatUsd(o.product_amount)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
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
      <Card className="py-12">
        <div className="text-center font-serif italic text-[14px] text-ink-3">
          {t("debt.empty_payments")}
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-0 overflow-hidden">
      <ul className="flex flex-col">
        {payments.map((p, i) => (
          <li
            key={i}
            className="px-5 md:px-7 py-3 flex items-baseline gap-4 text-body border-b border-rule last:border-b-0"
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
            <span className="serif tabular-nums w-28 text-right text-good font-medium">
              + {formatUsd(p.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
