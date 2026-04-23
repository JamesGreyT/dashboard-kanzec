import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, formatDateTime } from "../lib/format";

export default function RelativeTime({ iso }: { iso: string | null | undefined }) {
  const { t } = useTranslation();
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(interval);
  }, []);
  if (!iso) return <span className="text-muted-foreground">—</span>;
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (isNaN(diff)) return <span>—</span>;
  let label: string;
  if (diff < 5) label = t("common.just_now");
  else if (diff < 60) label = t("common.seconds_ago", { n: Math.floor(diff) });
  else if (diff < 3600) label = t("common.minutes_ago", { n: Math.floor(diff / 60) });
  else if (diff < 86400) label = t("common.hours_ago", { n: Math.floor(diff / 3600) });
  else if (diff < 2592000) label = t("common.days_ago", { n: Math.floor(diff / 86400) });
  else label = formatDate(d);
  return (
    <span title={formatDateTime(d)} className="tabular-nums">
      {label}
    </span>
  );
}
