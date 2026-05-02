/**
 * DebtorCard — phone-view card per debtor.
 * Rendered in a vertical stack on mobile (< md). Hidden at md+.
 *
 * Props:
 *   row     — WorklistRow data
 *   onClick — navigate to client detail
 *   index   — for stagger animation delay
 */
import { Phone, MessageSquare, MapPin } from "lucide-react";

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

/** Deterministic gradient from name — picks from 6 palettes by char sum. */
const GRADIENTS = [
  "linear-gradient(135deg,#7C3AED,#4C1D95)",
  "linear-gradient(135deg,#0EA5E9,#0369A1)",
  "linear-gradient(135deg,#10B981,#047857)",
  "linear-gradient(135deg,#F59E0B,#B45309)",
  "linear-gradient(135deg,#F472B6,#9D174D)",
  "linear-gradient(135deg,#EF4444,#7F1D1D)",
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
  const isUrgent = row.aging_90_plus > 0 && row.aging_90_plus >= (row.outstanding * 0.5);
  const agingTotal =
    row.aging_0_30 + row.aging_30_60 + row.aging_60_90 + row.aging_90_plus;

  // Priority chip label
  const prioLabel = row.priority === 1 ? "P1" : row.priority === 2 ? "P2" : "P3";
  const prioClass = row.priority === 1 ? "prio prio-1" : row.priority === 2 ? "prio prio-2" : "prio prio-3";

  // Days since payment used as "qarz yoshi"
  const daysSince = row.days_since_payment;
  const isOver90 = (daysSince ?? 0) >= 90;

  // Outer is a div with role=button (not <button>) so the inner <a tel:>/<a sms:>
  // anchors remain valid HTML — buttons can't legally contain anchors.
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
        "w-full text-left bg-white rounded-2xl shadow-card p-[14px] relative cursor-pointer",
        "animate-rise focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint",
        "transition-shadow hover:shadow-cardlg",
      ].join(" ")}
      style={{ animationDelay: `${index * 20}ms` }}
    >
      {/* Urgent left edge stripe */}
      {isUrgent && (
        <span
          aria-hidden
          className="absolute left-0 top-[14px] bottom-[14px] w-[3px] rounded-r-[3px]"
          style={{ background: "linear-gradient(180deg,#F87171,#DC2626)" }}
        />
      )}

      {/* TOP ROW: avatar + name/meta + amount */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
          style={{ background: gradientForName(row.name) }}
        >
          <span className="text-white font-bold text-[14px] tracking-tight">
            {initials(row.name)}
          </span>
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={prioClass}>{prioLabel}</span>
            <span className="font-semibold text-ink text-[14px] truncate leading-tight">
              {row.name ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-ink3 mt-0.5 font-mono">
            {daysSince != null && (
              <>
                <span className={isOver90 ? "text-coral" : ""}>{daysSince} kun</span>
                <span className="w-[3px] h-[3px] rounded-full bg-ink4 inline-block" />
              </>
            )}
            {isOver90 ? (
              <span className="text-coral font-semibold">muddati o'tgan</span>
            ) : row.main_phone ? (
              <span className="truncate">{row.main_phone}</span>
            ) : (
              <span>{row.region_name ?? ""}</span>
            )}
          </div>
        </div>

        {/* Outstanding amount */}
        <div className="text-right shrink-0">
          <div className="kpi-num text-[22px] text-ink leading-none">
            {formatUsd(row.outstanding)}
          </div>
          <div className="text-[10px] text-ink3 uppercase font-mono mt-0.5">USD</div>
        </div>
      </div>

      {/* AGING BAR */}
      {agingTotal > 0 ? (
        <div className="age-bar mt-3">
          {row.aging_0_30 > 0 && (
            <span className="age-0" style={{ flex: row.aging_0_30 }} />
          )}
          {row.aging_30_60 > 0 && (
            <span className="age-30" style={{ flex: row.aging_30_60 }} />
          )}
          {row.aging_60_90 > 0 && (
            <span className="age-60" style={{ flex: row.aging_60_90 }} />
          )}
          {row.aging_90_plus > 0 && (
            <span className="age-90" style={{ flex: row.aging_90_plus }} />
          )}
        </div>
      ) : (
        <div className="age-bar mt-3" />
      )}

      {/* LAST CONTACT ROW */}
      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ink3">
        <Phone className="w-3 h-3 shrink-0" />
        {row.last_contact_at ? (
          <>
            <span>{relativeTimeUz(row.last_contact_at)}</span>
            {row.last_contact_by && (
              <>
                <span className="w-[3px] h-[3px] rounded-full bg-ink4 inline-block" />
                <span className="font-semibold text-ink2">{row.last_contact_by}</span>
                <span>
                  {row.last_contact_outcome === "called"
                    ? "qo'ng'iroq qildi"
                    : row.last_contact_outcome === "promised"
                    ? "va'da berdi"
                    : row.last_contact_outcome === "no_answer"
                    ? "javob bermadi"
                    : "aloqa qildi"}
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-coral font-semibold">Hech qachon aloqa qilingan</span>
        )}
      </div>

      {/* ACTION PILLS ROW — stopPropagation so they don't trigger card click */}
      <div className="flex gap-2 mt-3">
        <a
          href={row.main_phone ? `tel:${row.main_phone.replace(/[^+\d]/g, "")}` : "#"}
          onClick={(e) => e.stopPropagation()}
          className="pill-call flex-1 justify-center min-h-[44px]"
          aria-label="Qo'ng'iroq"
        >
          <Phone className="w-4 h-4" />
          Qo'ng'iroq
        </a>
        <a
          href={row.main_phone ? `sms:${row.main_phone.replace(/[^+\d]/g, "")}` : "#"}
          onClick={(e) => e.stopPropagation()}
          className="pill-sms flex-1 justify-center min-h-[44px]"
          aria-label="SMS"
        >
          <MessageSquare className="w-4 h-4" />
          SMS
        </a>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Yo'l"
          className="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0"
          style={{ boxShadow: "inset 0 0 0 1px #E5E7EB" }}
        >
          <MapPin className="w-[18px] h-[18px] text-ink" />
        </button>
      </div>
    </div>
  );
}
