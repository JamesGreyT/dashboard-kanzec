import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, CheckCheck } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface AlertEvent {
  id: number;
  rule_id: number;
  triggered_at: string;
  value: number | null;
  message: string | null;
  read_at: string | null;
  kind: string;
  threshold: number;
  label: string | null;
}

/**
 * Bell icon that sits next to ThemeToggle / LangToggle in the sidebar
 * footer. Shows unread-count badge; clicking opens a popover listing
 * the 10 most recent events with one-click "mark read" actions.
 */
export default function AlertsBell() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["alerts.events"],
    queryFn: () => api<{ rows: AlertEvent[]; unread: number }>("/api/alerts/events?limit=10"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (id: number) => api(`/api/alerts/events/${id}/read`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts.events"] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api(`/api/alerts/events/read-all`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts.events"] }),
  });
  const unread = q.data?.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("alerts.open", { defaultValue: "Open alerts" }) as string}
          className={cn(
            "relative inline-flex items-center justify-center h-8 w-8 rounded-md",
            "hover:bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-mono tabular-nums flex items-center justify-center"
              aria-label={`${unread} unread`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="eyebrow !tracking-[0.14em] text-primary">
            {t("alerts.title", { defaultValue: "Alerts" })}
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
            >
              <CheckCheck className="h-3 w-3" aria-hidden />
              {t("alerts.mark_all_read", { defaultValue: "Mark all read" })}
            </button>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {q.isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm italic">
              {t("ranked.loading")}
            </div>
          ) : q.data && q.data.rows.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm italic">
              {t("alerts.empty", { defaultValue: "No alerts yet. Configure rules in settings." })}
            </div>
          ) : (
            q.data?.rows.map((e) => (
              <div
                key={e.id}
                className={cn(
                  "flex items-start gap-2 p-3 border-b border-border/40 last:border-b-0",
                  !e.read_at && "bg-primary/[0.03]",
                )}
              >
                <div className={cn(
                  "w-1.5 rounded-sm shrink-0 self-stretch",
                  e.read_at ? "bg-muted" : "bg-primary",
                )} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-foreground leading-snug">
                    {e.message ?? "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-[0.08em] mt-0.5">
                    {new Date(e.triggered_at).toLocaleString()}
                  </div>
                </div>
                {!e.read_at && (
                  <button
                    type="button"
                    onClick={() => markRead.mutate(e.id)}
                    aria-label={t("alerts.mark_read", { defaultValue: "Mark as read" }) as string}
                    className="text-muted-foreground hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring rounded p-1"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border">
          <Link
            to="/admin/alerts"
            onClick={() => setOpen(false)}
            className="block text-center text-[11px] uppercase tracking-[0.1em] text-primary hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring rounded py-1"
          >
            {t("alerts.manage", { defaultValue: "Manage rules" })} →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
