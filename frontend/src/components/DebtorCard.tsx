/**
 * DebtorCard — phone-view editorial card per debtor.
 *
 * Design:
 *   The list reads like a magazine column — each card is a single
 *   "paragraph" with a hairline rule beneath rather than a boxed
 *   container. The amount anchors the right edge in Fraunces serif;
 *   the name anchors the left edge in DM Sans. The aging bar is a
 *   single thin line that draws in. Action pills sit on a second
 *   row, right-aligned, smaller than before.
 *
 * Props:
 *   row     — WorklistRow data
 *   onClick — navigate to client detail
 *   index   — for stagger animation delay
 */
import { Phone, MessageSquare } from "lucide-react";

// ---- Types (mirrored from DebtWorklist.tsx — keep in sync) -----------------

type Outcome =
  | "called"
  | "no_answer"
  | "promised"
  | "rescheduled"
  | "refused"
  | "paid"
  | "note";

export interface WorklistRow {
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

// ---- Helpers ----------------------------------------------------------------

/**
 * Deterministic gradient from name — picks from a refined editorial palette.
 * Tones are muted, ink-leaning. No saturated rainbow avatars.
 */
const GRADIENTS = [
  "linear-gradient(135deg,#1F2937,#374151)",   // ink
  "linear-gradient(135deg,#0E7490,#155E75)",   // teal-ink
  "linear-gradient(135deg,#7E22CE,#581C87)",   // muted plum
  "linear-gradient(135deg,#0F766E,#115E59)",   // pine
  "linear-gradient(135deg,#9F1239,#881337)",   // burgundy
  "linear-gradient(135deg,#92400E,#78350F)",   // umber
  "linear-gradient(135deg,#1E3A8A,#1E40AF)",   // ink-blue
  "linear-gradient(135deg,#365314,#3F6212)",   // moss
];

export function gradientForName(name: string | null): string {
  if (!name) return GRADIENTS[0];
  const sum = Array.from(name).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return GRADIENTS[sum % GRADIENTS.length];
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function relativeTimeUz(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diffMs = Date.now() - d;
  if (diffMs < 0) return "hozirgina";
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "hozirgina";
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 30) return `${days} kun oldin`;
  const months = Math.floor(days / 30);
  return `${months} oy oldin`;
}

// ---- Component --------------------------------------------------------------

export default function DebtorCard({
  row,
  onClick,
  index,
}: {
  row: WorklistRow;
  onClick: () => void;
  index: number;
}) {
  const isUrgent =
    row.priority <= 2 &&
    row.aging_90_plus > 0 &&
    row.aging_90_plus >= row.outstanding * 0.5;
  const agingTotal =
    row.aging_0_30 + row.aging_30_60 + row.aging_60_90 + row.aging_90_plus;

  const prioLabel = row.priority === 1 ? "P1" : row.priority === 2 ? "P2" : "P3";
  const prioClass =
    row.priority === 1 ? "prio prio-1" : row.priority === 2 ? "prio prio-2" : "prio prio-3";

  const daysSince = row.days_since_payment;
  const isOver90 = (daysSince ?? 0) >= 90;

  // Animation delay caps at 600ms so a long list doesn't feel sluggish.
  const animDelay = Math.min(index * 24, 600);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={[
        "card-editorial reveal-up",
        isUrgent ? "is-urgent" : "",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      {/* TOP ROW — name + meta on left, amount anchored right. */}
      <div className="flex items-start gap-3">
        {/* Avatar — refined ink palette, smaller, more typographic. */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: gradientForName(row.name) }}
        >
          <span className="text-white font-semibold text-[12px] tracking-[0.02em]">
            {initials(row.name)}
          </span>
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={prioClass} style={{ width: 22, height: 22, fontSize: 9 }}>
              {prioLabel}
            </span>
            <h3 className="font-sans font-semibold text-ink text-[15px] truncate leading-[1.2] tracking-[-0.005em]">
              {row.name ?? "—"}
            </h3>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink3 mt-1.5 font-mono tracking-[0.02em]">
            {daysSince != null ? (
              <>
                <span className={isOver90 ? "text-coral font-semibold" : "text-ink3"}>
                  {daysSince} kun
                </span>
                {row.main_phone && (
                  <>
                    <span className="w-[3px] h-[3px] rounded-full bg-ink4 inline-block" />
                    <span className="truncate">{row.main_phone}</span>
                  </>
                )}
              </>
            ) : row.main_phone ? (
              <span className="truncate">{row.main_phone}</span>
            ) : (
              <span>{row.region_name ?? "—"}</span>
            )}
          </div>
        </div>

        {/* Outstanding — Fraunces serif, anchored right. */}
        <div className="text-right shrink-0">
          <div className="hero-num text-[24px] text-ink leading-none">
            {formatUsd(row.outstanding)}
          </div>
          <div className="text-[9px] text-ink4 uppercase font-mono mt-1 tracking-[0.16em]">
            USD
          </div>
        </div>
      </div>

      {/* AGING BAR — single hairline-thin line, full bleed. */}
      <div className="age-bar mt-3.5" style={{ height: 3 }}>
        {agingTotal > 0 ? (
          <>
            {row.aging_0_30 > 0 && (
              <span className="age-0 draw-in-w" style={{ flex: row.aging_0_30 }} />
            )}
            {row.aging_30_60 > 0 && (
              <span
                className="age-30 draw-in-w"
                style={{ flex: row.aging_30_60, animationDelay: "60ms" }}
              />
            )}
            {row.aging_60_90 > 0 && (
              <span
                className="age-60 draw-in-w"
                style={{ flex: row.aging_60_90, animationDelay: "120ms" }}
              />
            )}
            {row.aging_90_plus > 0 && (
              <span
                className="age-90 draw-in-w"
                style={{ flex: row.aging_90_plus, animationDelay: "180ms" }}
              />
            )}
          </>
        ) : null}
      </div>

      {/* META + ACTIONS — single row. Last contact on left in italic Fraunces,
          pills anchored right. */}
      <div className="flex items-center justify-between mt-3 gap-3">
        <div className="text-[12px] text-ink3 min-w-0 truncate">
          {row.last_contact_at ? (
            <span className="font-display italic">
              {relativeTimeUz(row.last_contact_at)}
              {row.last_contact_by && (
                <>
                  {" — "}
                  <span className="not-italic font-sans font-semibold text-ink2">
                    {row.last_contact_by}
                  </span>
                </>
              )}
            </span>
          ) : (
            <span className="font-display italic text-ink3">aloqa qilinmagan</span>
          )}
        </div>

        <div className="flex gap-1.5 shrink-0">
          <a
            href={
              row.main_phone ? `tel:${row.main_phone.replace(/[^+\d]/g, "")}` : "#"
            }
            onClick={(e) => e.stopPropagation()}
            className="pill-call-sm"
            aria-label="Qo'ng'iroq"
          >
            <Phone className="w-3 h-3" />
            <span className="hidden xs:inline">Qo'ng'iroq</span>
            <span className="xs:hidden">Tel</span>
          </a>
          <a
            href={
              row.main_phone ? `sms:${row.main_phone.replace(/[^+\d]/g, "")}` : "#"
            }
            onClick={(e) => e.stopPropagation()}
            className="pill-sms-sm"
            aria-label="SMS"
          >
            <MessageSquare className="w-3 h-3" />
            SMS
          </a>
        </div>
      </div>
    </div>
  );
}
