import { useTranslation } from "react-i18next";

export interface AsOfPickerValue {
  asOf: string;       // ISO yyyy-mm-dd
  years: number;      // 2..6
}

export default function AsOfPicker({
  value,
  onChange,
}: {
  value: AsOfPickerValue;
  onChange: (next: AsOfPickerValue) => void;
}) {
  const { t } = useTranslation();
  const asOfDate = new Date(value.asOf + "T00:00:00");
  const monthName = asOfDate.toLocaleDateString("en-US", { month: "long" });
  const monthDays = new Date(
    asOfDate.getFullYear(),
    asOfDate.getMonth() + 1,
    0,
  ).getDate();

  const stepYears = (delta: number) => {
    const next = Math.max(2, Math.min(6, value.years + delta));
    if (next !== value.years) onChange({ ...value, years: next });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
          {t("dayslice.as_of")}
          <input
            type="date"
            value={value.asOf}
            onChange={(e) => onChange({ ...value, asOf: e.target.value })}
            className="border border-border/60 rounded px-2 py-1 text-[13px] font-mono tabular-nums text-foreground bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("dayslice.as_of") as string}
          />
        </label>
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
      </div>
      <div className="text-[11px] italic text-muted-foreground font-mono">
        {t("dayslice.slice_eyebrow", {
          defaultValue: "Slice: 1 {{month}} → {{day}} {{month}} {{year}} · day {{day}} of {{total}}",
          month: monthName,
          day: asOfDate.getDate(),
          year: asOfDate.getFullYear(),
          total: monthDays,
        })}
      </div>
    </div>
  );
}
