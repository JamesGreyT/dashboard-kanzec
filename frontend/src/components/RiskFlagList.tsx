import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, AlertCircle, ArrowRight } from "lucide-react";

export interface RiskFlag {
  kind: string;
  severity: "warn" | "high";
  message_uz: string;
  message_ru: string;
  message_en: string;
  drill_to: string | null;
  metric: number | null;
}

export default function RiskFlagList({ flags }: { flags: RiskFlag[] }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || "uz").split("-")[0] as "uz" | "ru" | "en";

  if (!flags.length) {
    return (
      <div className="text-muted-foreground italic text-sm py-6">
        {t("executive.no_risks", { defaultValue: "No risks flagged. Healthy book." })}
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {flags.map((f, i) => {
        const message =
          lang === "ru" ? f.message_ru :
          lang === "en" ? f.message_en :
          f.message_uz;
        const Icon = f.severity === "high" ? AlertTriangle : AlertCircle;
        const tone =
          f.severity === "high"
            ? "text-red-700 dark:text-red-400"
            : "text-amber-700 dark:text-amber-400";
        const dot =
          f.severity === "high"
            ? "bg-red-600 dark:bg-red-500"
            : "bg-amber-500 dark:bg-amber-400";
        return (
          <li
            key={i}
            className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0"
          >
            <span
              className={"mt-1.5 inline-block w-2 h-2 rounded-full shrink-0 " + dot}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <Icon className={"h-3.5 w-3.5 " + tone} aria-hidden />
                <span className={"text-[10px] uppercase tracking-[0.14em] font-medium " + tone}>
                  {t(`executive.severity_${f.severity}`, { defaultValue: f.severity })}
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
                  · {t(`executive.kind_${f.kind}`, { defaultValue: f.kind })}
                </span>
              </div>
              <div className="text-[14px] text-foreground leading-snug">{message}</div>
            </div>
            {f.drill_to && (
              <Link
                to={f.drill_to}
                className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                aria-label={t("executive.drill_through", { defaultValue: "Open detail" }) as string}
              >
                {t("executive.open", { defaultValue: "Open" })}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
