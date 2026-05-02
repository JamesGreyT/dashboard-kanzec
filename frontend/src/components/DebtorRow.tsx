/**
 * DebtorRow — desktop editorial magazine row.
 *
 * Design:
 *   No card chrome. Each row is a single typographic line separated
 *   by a hairline rule. Hover slides the row 2px right and draws in
 *   a thin mint accent under the name (or a coral one if urgent).
 *   Aging is a single hairline-thin bar that draws in.
 *
 * Grid (12-col):
 *   col-span-1   priority chip
 *   col-span-4   avatar + name + manager/phone
 *   col-span-2   outstanding (Fraunces, right-aligned)
 *   col-span-2   aging bar + days label
 *   col-span-2   last contact (italic Fraunces)
 *   col-span-1   call + SMS buttons
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
  index = 0,
}: {
  row: WorklistRow;
  onClick: () => void;
  index?: number;
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
  const isAmber = (daysSince ?? 0) >= 61 && (daysSince ?? 0) < 90;

  const animDelay = Math.min(index * 18, 540);

  return (
    <div
      onClick={onClick}
      className={[
        "row-editorial reveal-up",
        isUrgent ? "is-urgent" : "",
        "grid grid-cols-12 items-center px-7 py-5 cursor-pointer",
        "border-b border-line/60",
      ]
        .filter(Boolean)
        .join(" ")}
      role="row"
      style={{ animationDelay: `${animDelay}ms` }}
    >
      {/* P — priority chip, slightly tighter than mobile */}
      <div className="col-span-1 flex justify-center">
        <span className={prioClass} style={{ width: 26, height: 26, fontSize: 10 }}>
          {prioLabel}
        </span>
      </div>

      {/* Mijoz — avatar (refined) + name + meta */}
      <div className="col-span-4 flex items-center gap-3.5 pr-4">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white"
          style={{
            background: gradientForName(row.name),
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {initials(row.name)}
        </div>
        <div className="min-w-0">
          <div className="font-sans font-semibold text-ink text-[14px] truncate leading-[1.2] tracking-[-0.005em]">
            {row.name ?? "—"}
          </div>
          <div className="text-[11px] text-ink3 font-mono truncate mt-0.5 tracking-[0.02em]">
            {[row.owner_name, row.main_phone].filter(Boolean).join("  ·  ") ||
              row.region_name ||
              ""}
          </div>
        </div>
      </div>

      {/* Summa — Fraunces serif, right-aligned, generous */}
      <div className="col-span-2 text-right pr-4">
        <div className="hero-num text-[20px] text-ink leading-none">
          {formatUsd(row.outstanding)}
        </div>
        <div className="text-[9px] text-ink4 font-mono mt-1.5 tracking-[0.16em] uppercase">
          USD
        </div>
      </div>

      {/* Yosh — aging bar (thin) + days label inline */}
      <div className="col-span-2 min-w-0 pr-6">
        <div className="w-[110px]">
          <div className="age-bar" style={{ height: 3 }}>
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
        </div>
        {daysSince != null && (
          <div
            className="text-[11px] mt-2 font-mono tracking-[0.02em]"
            style={{
              color: isOver90 ? "#DC2626" : isAmber ? "#B45309" : "#6B7280",
              fontWeight: isOver90 || isAmber ? 600 : 500,
            }}
          >
            {daysSince} kun
          </div>
        )}
      </div>

      {/* Oxirgi aloqa — italic Fraunces, refined */}
      <div className="col-span-2 pr-4">
        {row.last_contact_at ? (
          <>
            <div className="font-display italic text-[13px] text-ink2 leading-tight">
              {relativeTimeUz(row.last_contact_at)}
            </div>
            <div className="text-[10px] text-ink3 font-mono mt-1 tracking-[0.04em]">
              {outcomeLabel(row.last_contact_outcome)}
            </div>
          </>
        ) : (
          <div className="font-display italic text-[13px] text-ink4 leading-tight">
            —
          </div>
        )}
      </div>

      {/* Aksiya — call + SMS */}
      <div className="col-span-1 flex items-center justify-end gap-1.5">
        <a
          href={
            row.main_phone ? `tel:${row.main_phone.replace(/[^+\d]/g, "")}` : "#"
          }
          onClick={(e) => e.stopPropagation()}
          aria-label="Qo'ng'iroq"
          className="btn-ic mint"
          style={{ width: 34, height: 34, borderRadius: 10 }}
        >
          <Phone className="w-[14px] h-[14px]" />
        </a>
        <a
          href={
            row.main_phone ? `sms:${row.main_phone.replace(/[^+\d]/g, "")}` : "#"
          }
          onClick={(e) => e.stopPropagation()}
          aria-label="SMS"
          className="btn-ic"
          style={{ width: 34, height: 34, borderRadius: 10 }}
        >
          <MessageSquare className="w-[14px] h-[14px]" />
        </a>
      </div>
    </div>
  );
}
