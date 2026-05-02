/**
 * DebtorRow — desktop dense-grid row per debtor.
 * Rendered inside a card-wrapped 12-col grid at md+. Hidden on mobile.
 *
 * Grid columns:
 *   col-span-1  P (priority chip)
 *   col-span-4  Mijoz (avatar + name + manager + phone)
 *   col-span-2  Summa (outstanding, right-aligned)
 *   col-span-2  Yosh (aging bar + days)
 *   col-span-2  Oxirgi aloqa (last contact + outcome)
 *   col-span-1  Aksiya (call btn + SMS btn)
 */
import { Phone, MessageSquare } from "lucide-react";
import { gradientForName, WorklistRow } from "./DebtorCard";

// ---- Helpers ----------------------------------------------------------------

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

function outcomeLabel(outcome: string | null): string {
  switch (outcome) {
    case "called":      return "qo'ng'iroq";
    case "no_answer":   return "javob yo'q";
    case "promised":    return "va'da berdi";
    case "rescheduled": return "keyinga qoldirildi";
    case "refused":     return "rad etdi";
    case "paid":        return "to'ladi";
    case "note":        return "izoh";
    default:            return "aloqa";
  }
}

// ---- Component --------------------------------------------------------------

export default function DebtorRow({
  row,
  onClick,
}: {
  row: WorklistRow;
  onClick: () => void;
}) {
  const isUrgent = row.aging_90_plus > 0 && row.aging_90_plus >= (row.outstanding * 0.5);
  const agingTotal =
    row.aging_0_30 + row.aging_30_60 + row.aging_60_90 + row.aging_90_plus;

  const prioLabel = row.priority === 1 ? "P1" : row.priority === 2 ? "P2" : "P3";
  const prioClass = row.priority === 1 ? "prio prio-1" : row.priority === 2 ? "prio prio-2" : "prio prio-3";

  const daysSince = row.days_since_payment;
  const isOver90 = (daysSince ?? 0) >= 90;
  const isAmber  = (daysSince ?? 0) >= 61 && (daysSince ?? 0) < 90;

  const daysColor = isOver90
    ? "text-coral font-semibold"
    : isAmber
    ? "font-semibold"
    : "text-mintdk font-semibold";

  return (
    <div
      onClick={onClick}
      className="grid grid-cols-12 items-center px-4 py-3 border-b border-line cursor-pointer hover:bg-paper transition-colors relative"
      role="row"
    >
      {/* Urgent left edge stripe */}
      {isUrgent && (
        <span
          aria-hidden
          className="absolute left-0 top-[8px] bottom-[8px] w-[3px] rounded-r-[3px]"
          style={{ background: "linear-gradient(180deg,#F87171,#DC2626)" }}
        />
      )}

      {/* P — priority */}
      <div className="col-span-1 flex justify-center">
        <span className={prioClass}>{prioLabel}</span>
      </div>

      {/* Mijoz — avatar + name + owner + phone */}
      <div className="col-span-4 flex items-center gap-3">
        <div
          className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 text-white"
          style={{ background: gradientForName(row.name), fontSize: 11, fontWeight: 700 }}
        >
          {initials(row.name)}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-ink text-[13px] truncate leading-tight">
            {row.name ?? "—"}
          </div>
          <div className="text-[11px] text-ink3 font-mono truncate">
            {[row.owner_name, row.main_phone].filter(Boolean).join(" · ") || row.region_name || ""}
          </div>
        </div>
      </div>

      {/* Summa — outstanding */}
      <div className="col-span-2 text-right">
        <div className="kpi-num text-[18px] text-ink leading-none">
          {formatUsd(row.outstanding)}
        </div>
        <div className="text-[10px] text-ink3 font-mono">USD</div>
      </div>

      {/* Yosh — aging bar + days */}
      <div className="col-span-2">
        {agingTotal > 0 ? (
          <div className="age-bar">
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
          <div className="age-bar" />
        )}
        {daysSince != null && (
          <div
            className={`text-[11px] mt-1 font-mono ${daysColor}`}
            style={isAmber ? { color: "#B45309" } : undefined}
          >
            {daysSince} kun
          </div>
        )}
      </div>

      {/* Oxirgi aloqa */}
      <div className="col-span-2 text-[12px]">
        {row.last_contact_at ? (
          <>
            <div className="text-ink2">{relativeTimeUz(row.last_contact_at)}</div>
            <div className="text-[10px] text-ink3">
              {outcomeLabel(row.last_contact_outcome)}
            </div>
          </>
        ) : (
          <>
            <div className="text-coral font-semibold">Hech qachon</div>
            <div className="text-[10px] text-ink3">aloqa yo'q</div>
          </>
        )}
      </div>

      {/* Aksiya — call + SMS */}
      <div className="col-span-1 flex items-center justify-end gap-1">
        <a
          href={row.main_phone ? `tel:${row.main_phone.replace(/[^+\d]/g, "")}` : "#"}
          onClick={(e) => e.stopPropagation()}
          aria-label="Qo'ng'iroq"
          className="btn-ic mint"
        >
          <Phone className="w-[14px] h-[14px]" />
        </a>
        <a
          href={row.main_phone ? `sms:${row.main_phone.replace(/[^+\d]/g, "")}` : "#"}
          onClick={(e) => e.stopPropagation()}
          aria-label="SMS"
          className="btn-ic"
        >
          <MessageSquare className="w-[14px] h-[14px]" />
        </a>
      </div>
    </div>
  );
}
