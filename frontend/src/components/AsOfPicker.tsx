import { useTranslation } from "react-i18next";

/**
 * Two slice modes:
 *
 *  - "anchor" — month-start → as_of date. Excel default. Fields: asOf.
 *  - "custom" — explicit start + end (replayed across years).
 *               Fields: sliceStart, sliceEnd (year ignored).
 */
export type SliceMode = "anchor" | "custom";

export interface AsOfPickerValue {
  mode: SliceMode;
  asOf: string;          // ISO yyyy-mm-dd — used in both modes (anchor uses it as end; custom uses its year for the current-year column)
  sliceStart: string;    // ISO — used only in custom mode
  sliceEnd: string;      // ISO — used only in custom mode
  years: number;         // 2..6
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoOffset(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function monthStart(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function quarterStart(): string {
  const d = new Date();
  const qm = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qm, 1).toISOString().slice(0, 10);
}

function yearStart(): string {
  return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
}

function fyStart(): string {
  // Operator's fiscal year starts 1 April
  const d = new Date();
  const fy = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(fy, 3, 1).toISOString().slice(0, 10);
}

function monthEnd(asOf: string): string {
  const d = new Date(asOf + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

interface Preset {
  id: string;
  labelKey: string;
  defaultLabel: string;
  apply: (cur: AsOfPickerValue) => AsOfPickerValue;
}

const PRESETS: Preset[] = [
  {
    id: "today",
    labelKey: "dayslice.preset_today",
    defaultLabel: "BUGUN",
    apply: (c) => ({ ...c, mode: "anchor", asOf: todayIso() }),
  },
  {
    id: "yesterday",
    labelKey: "dayslice.preset_yesterday",
    defaultLabel: "KECHA",
    apply: (c) => ({ ...c, mode: "anchor", asOf: isoOffset(-1) }),
  },
  {
    id: "month_end",
    labelKey: "dayslice.preset_month_end",
    defaultLabel: "OY OXIRI",
    apply: (c) => ({ ...c, mode: "anchor", asOf: monthEnd(c.asOf) }),
  },
  {
    id: "mtd",
    labelKey: "dayslice.preset_mtd",
    defaultLabel: "OY",
    apply: (c) => ({
      ...c,
      mode: "custom",
      sliceStart: monthStart(),
      sliceEnd: todayIso(),
      asOf: todayIso(),
    }),
  },
  {
    id: "qtd",
    labelKey: "dayslice.preset_qtd",
    defaultLabel: "CHORAK",
    apply: (c) => ({
      ...c,
      mode: "custom",
      sliceStart: quarterStart(),
      sliceEnd: todayIso(),
      asOf: todayIso(),
    }),
  },
  {
    id: "ytd",
    labelKey: "dayslice.preset_ytd",
    defaultLabel: "YIL",
    apply: (c) => ({
      ...c,
      mode: "custom",
      sliceStart: yearStart(),
      sliceEnd: todayIso(),
      asOf: todayIso(),
    }),
  },
  {
    id: "fy",
    labelKey: "dayslice.preset_fy",
    defaultLabel: "MOLIYA YIL",
    apply: (c) => ({
      ...c,
      mode: "custom",
      sliceStart: fyStart(),
      sliceEnd: todayIso(),
      asOf: todayIso(),
    }),
  },
];

export default function AsOfPicker({
  value,
  onChange,
}: {
  value: AsOfPickerValue;
  onChange: (next: AsOfPickerValue) => void;
}) {
  const { t } = useTranslation();
  const stepYears = (delta: number) => {
    const next = Math.max(2, Math.min(6, value.years + delta));
    if (next !== value.years) onChange({ ...value, years: next });
  };

  // Eyebrow that describes the active slice in plain language.
  const eyebrow = (() => {
    if (value.mode === "anchor") {
      const d = new Date(value.asOf + "T00:00:00");
      const monthName = d.toLocaleDateString("en-US", { month: "long" });
      const monthDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return t("dayslice.slice_eyebrow", {
        defaultValue: "Slice: 1 {{month}} → {{day}} {{month}} {{year}} · day {{day}} of {{total}}",
        month: monthName,
        day: d.getDate(),
        year: d.getFullYear(),
        total: monthDays,
      }) as string;
    }
    const s = new Date(value.sliceStart + "T00:00:00");
    const e = new Date(value.sliceEnd + "T00:00:00");
    const fmtSimple = (dd: Date) =>
      `${dd.getDate()} ${dd.toLocaleDateString("en-US", { month: "long" })}`;
    return t("dayslice.custom_eyebrow", {
      defaultValue: "Custom slice: {{s}} → {{e}}, replayed across {{n}} years",
      s: fmtSimple(s),
      e: fmtSimple(e),
      n: value.years,
    }) as string;
  })();

  // Detect which preset (if any) is currently active
  const activePresetId = (() => {
    for (const p of PRESETS) {
      const next = p.apply(value);
      if (next.mode === value.mode &&
          next.asOf === value.asOf &&
          (value.mode === "anchor" ||
           (next.sliceStart === value.sliceStart && next.sliceEnd === value.sliceEnd))) {
        return p.id;
      }
    }
    return null;
  })();

  return (
    <div className="flex flex-col gap-2">
      {/* Top row — date inputs + years stepper */}
      <div className="flex items-center gap-3 flex-wrap">
        {value.mode === "anchor" ? (
          <label className="flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("dayslice.as_of")}
            <input
              type="date"
              value={value.asOf}
              onChange={(e) =>
                onChange({ ...value, asOf: e.target.value })
              }
              className="border border-border/60 rounded px-2 py-1 text-[13px] font-mono tabular-nums text-foreground bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("dayslice.as_of") as string}
            />
          </label>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
              {t("dayslice.from", { defaultValue: "From" })}
              <input
                type="date"
                value={value.sliceStart}
                onChange={(e) =>
                  onChange({ ...value, sliceStart: e.target.value })
                }
                className="border border-border/60 rounded px-2 py-1 text-[13px] font-mono tabular-nums text-foreground bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <span className="text-muted-foreground">→</span>
            <label className="flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
              {t("dayslice.to", { defaultValue: "To" })}
              <input
                type="date"
                value={value.sliceEnd}
                onChange={(e) =>
                  onChange({
                    ...value,
                    sliceEnd: e.target.value,
                    asOf: e.target.value,
                  })
                }
                className="border border-border/60 rounded px-2 py-1 text-[13px] font-mono tabular-nums text-foreground bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
        )}

        <div className="flex items-center gap-1 text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
          {t("dayslice.years")}
          <button
            type="button"
            onClick={() => stepYears(-1)}
            disabled={value.years <= 2}
            aria-label="decrease years"
            className="px-1.5 py-0.5 border border-border/60 rounded text-foreground hover:bg-muted/40 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >−</button>
          <span className="font-mono tabular-nums text-foreground w-5 text-center">
            {value.years}
          </span>
          <button
            type="button"
            onClick={() => stepYears(1)}
            disabled={value.years >= 6}
            aria-label="increase years"
            className="px-1.5 py-0.5 border border-border/60 rounded text-foreground hover:bg-muted/40 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >+</button>
        </div>

        {/* Mode toggle */}
        <div
          className="flex items-center gap-1 ml-auto"
          role="group"
          aria-label={t("dayslice.slice_mode", { defaultValue: "Slice mode" }) as string}
        >
          <button
            type="button"
            aria-pressed={value.mode === "anchor"}
            onClick={() => onChange({ ...value, mode: "anchor" })}
            className={
              "px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
              (value.mode === "anchor"
                ? "border-foreground/70 bg-background ring-2 ring-foreground/30 text-foreground font-medium"
                : "border-border/60 bg-muted/40 hover:bg-muted/60 text-muted-foreground")
            }
          >
            {t("dayslice.mode_anchor", { defaultValue: "Anchor" })}
          </button>
          <button
            type="button"
            aria-pressed={value.mode === "custom"}
            onClick={() => {
              // Preserve the user's selections — switching to custom uses asOf as the end
              const eAsCustom = value.asOf;
              const dStart = new Date(eAsCustom + "T00:00:00");
              dStart.setDate(1);
              onChange({
                ...value,
                mode: "custom",
                sliceStart: value.sliceStart || dStart.toISOString().slice(0, 10),
                sliceEnd: value.sliceEnd || eAsCustom,
              });
            }}
            className={
              "px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
              (value.mode === "custom"
                ? "border-foreground/70 bg-background ring-2 ring-foreground/30 text-foreground font-medium"
                : "border-border/60 bg-muted/40 hover:bg-muted/60 text-muted-foreground")
            }
          >
            {t("dayslice.mode_custom", { defaultValue: "Custom" })}
          </button>
        </div>
      </div>

      {/* Preset chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {PRESETS.map((p) => {
          const active = activePresetId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(p.apply(value))}
              className={
                "px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (active
                  ? "border-primary/60 bg-primary/10 text-primary font-medium"
                  : "border-border/60 bg-background hover:bg-muted/40 text-muted-foreground")
              }
            >
              {t(p.labelKey, { defaultValue: p.defaultLabel })}
            </button>
          );
        })}
      </div>

      {/* Eyebrow */}
      <div className="text-[11px] italic text-muted-foreground font-mono">
        {eyebrow}
      </div>
    </div>
  );
}
