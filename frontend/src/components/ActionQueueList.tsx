import { Link } from "react-router-dom";
import { Phone, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fmtNum } from "./MetricCard";

export interface ActionItem {
  person_id: string;
  name: string;
  ltv: number;
  days_overdue_for_repeat: number;
  phone: string | null;
  predicted_next_buy: string | null;
}

/**
 * The "this week's call list" panel. Compact rows so 10 items fit in the
 * same vertical band as the heatmaps next to it. Each row carries the
 * tap-to-call affordance + a click-through to the dossier.
 *
 * The ordering is decided server-side by `(days_overdue × LTV)` — high
 * value AND structurally overdue. The operator never has to hunt for
 * "who deserves my attention right now."
 */
export default function ActionQueueList({
  items,
  loading,
  error,
}: {
  items: ActionItem[];
  loading?: boolean;
  error?: boolean;
}) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="space-y-1.5">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-7 bg-muted/30 rounded animate-pulse" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-[12px] italic text-red-700 dark:text-red-400 py-2">
        {t("clients360.queue_error", { defaultValue: "Failed to load queue" })}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="text-[12px] italic text-muted-foreground py-6 text-center">
        {t("clients360.queue_empty", { defaultValue: "No customers overdue for repeat" })}
      </div>
    );
  }
  return (
    <ol className="divide-y divide-border/40">
      {items.map((it) => (
        <li
          key={it.person_id}
          className="flex items-center gap-3 py-2 hover:bg-muted/30 transition-colors"
        >
          <Link
            to={`/collection/debt/client/${it.person_id}`}
            className="flex-1 min-w-0 group"
          >
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[13px] text-foreground truncate group-hover:text-primary transition-colors">
                {it.name}
              </span>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" aria-hidden />
            </div>
            <div className="flex items-baseline gap-2 mt-0.5 text-[11px] tabular-nums">
              <span className="font-mono text-red-700 dark:text-red-400">
                {it.days_overdue_for_repeat}d {t("clients360.overdue_short", { defaultValue: "overdue" })}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">
                LTV ${fmtNum(it.ltv, true)}
              </span>
            </div>
          </Link>
          {it.phone && (
            <a
              href={`tel:${it.phone}`}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
              title={`${t("clients360.action_call", { defaultValue: "Call" })} ${it.phone}`}
              aria-label={`call ${it.name}`}
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
