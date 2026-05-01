import { CalendarRange } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type WindowAlias =
  | "today" | "last7" | "last30" | "last90"
  | "mtd" | "qtd" | "ytd" | "fy"
  | "custom";

export interface WindowState {
  /** ISO yyyy-mm-dd */
  from: string;
  /** ISO yyyy-mm-dd */
  to: string;
  /** Which preset chip is currently active; `custom` if the dates were hand-edited. */
  alias: WindowAlias;
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Window produced by a given alias at `today`. */
export function windowFor(alias: WindowAlias, today = new Date()): WindowState {
  const t = new Date(today);
  switch (alias) {
    case "today":
      return { from: iso(t), to: iso(t), alias };
    case "last7":
      return { from: iso(addDays(t, -6)), to: iso(t), alias };
    case "last30":
      return { from: iso(addDays(t, -29)), to: iso(t), alias };
    case "last90":
      return { from: iso(addDays(t, -89)), to: iso(t), alias };
    case "mtd": {
      const s = new Date(t.getFullYear(), t.getMonth(), 1);
      return { from: iso(s), to: iso(t), alias };
    }
    case "qtd": {
      const qStart = Math.floor(t.getMonth() / 3) * 3;
      const s = new Date(t.getFullYear(), qStart, 1);
      return { from: iso(s), to: iso(t), alias };
    }
    case "ytd": {
      const s = new Date(t.getFullYear(), 0, 1);
      return { from: iso(s), to: iso(t), alias };
    }
    case "fy": {
      // fiscal year ends 31 March. today >= April → FY runs this Apr-1 → today; else previous Apr-1 → today
      const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
      const s = new Date(y, 3, 1); // April = month 3 (0-indexed)
      return { from: iso(s), to: iso(t), alias };
    }
    case "custom":
    default:
      return { from: iso(addDays(t, -89)), to: iso(t), alias: "last90" };
  }
}

export function defaultWindow(): WindowState {
  return windowFor("last90");
}

const PRESETS: Array<{ alias: WindowAlias; key: string }> = [
  { alias: "today", key: "window.today" },
  { alias: "last7", key: "window.last7" },
  { alias: "last30", key: "window.last30" },
  { alias: "last90", key: "window.last90" },
  { alias: "mtd", key: "window.mtd" },
  { alias: "qtd", key: "window.qtd" },
  { alias: "ytd", key: "window.ytd" },
  { alias: "fy", key: "window.fy" },
];

/**
 * Editorial-styled window picker.
 * - From/To native date inputs in a JBM-mono row
 * - Preset chips: today · 7d · 30d · 90d · MTD · QTD · YTD · FY
 * - Selecting a preset updates both dates; hand-editing a date flips alias to "custom"
 */
export default function WindowPicker({
  value,
  onChange,
}: {
  value: WindowState;
  onChange: (next: WindowState) => void;
}) {
  const { t } = useTranslation();
  const today = iso(new Date());

  const setDates = (from: string, to: string) =>
    onChange({ from, to, alias: "custom" });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <CalendarRange className="h-3.5 w-3.5 text-ink3" />
        <input
          type="date"
          value={value.from}
          max={value.to || today}
          onChange={(e) => setDates(e.target.value, value.to)}
          className="h-9 px-3 bg-card border border-line rounded-lg text-[13px] font-mono tabular-nums outline-none focus-visible:border-mint focus-visible:ring-2 focus-visible:ring-mint/15"
          aria-label={t("window.from") as string}
        />
        <span className="text-ink3">—</span>
        <input
          type="date"
          value={value.to}
          min={value.from}
          max={today}
          onChange={(e) => setDates(value.from, e.target.value)}
          className="h-9 px-3 bg-card border border-line rounded-lg text-[13px] font-mono tabular-nums outline-none focus-visible:border-mint focus-visible:ring-2 focus-visible:ring-mint/15"
          aria-label={t("window.to") as string}
        />
      </div>
      <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={t("window.presets", { defaultValue: "Date range presets" }) as string}>
        {PRESETS.map((p) => {
          const active = value.alias === p.alias;
          return (
            <button
              key={p.alias}
              type="button"
              onClick={() => onChange(windowFor(p.alias))}
              aria-pressed={active}
              className={cn(
                "eyebrow !text-[10px] !font-medium px-2.5 py-1 rounded-full transition outline-none",
                "focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2",
                active
                  ? "bg-mintbg text-mintdk"
                  : "text-ink3 hover:text-ink hover:bg-mintbg/40",
              )}
            >
              {t(p.key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
