import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Bell, BellOff } from "lucide-react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import PageHeading from "../components/PageHeading";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Kind =
  | "dso_gt"
  | "debt_total_gt"
  | "single_debtor_gt"
  | "over_90_count_gt"
  | "revenue_drop_pct"
  | "deal_count_drop_pct";

interface Rule {
  id: number;
  user_id: number | null;
  owner: string | null;
  kind: Kind;
  threshold: number;
  label: string | null;
  enabled: boolean;
  created_at: string;
}

const KIND_LABELS: Record<Kind, { en: string; uz: string; ru: string }> = {
  dso_gt:              { en: "DSO exceeds (days)",                    uz: "DSO oshsa (kun)",                ru: "DSO превышает (дней)" },
  debt_total_gt:       { en: "Total outstanding exceeds ($)",         uz: "Umumiy qarz oshsa ($)",          ru: "Общий долг превышает ($)" },
  single_debtor_gt:    { en: "Any single debtor exceeds ($)",         uz: "Bitta qarzdor oshsa ($)",        ru: "Один должник превышает ($)" },
  over_90_count_gt:    { en: "# of debtors over 90 days exceeds",     uz: "90+ qarzdorlar soni oshsa",      ru: "Кол-во 90+ должников превышает" },
  revenue_drop_pct:    { en: "Revenue drop (30d vs prior) exceeds (%)", uz: "Sotuv pasaytishi (30k) oshsa (%)", ru: "Падение выручки (30д) превышает (%)" },
  deal_count_drop_pct: { en: "Deal count drop (30d vs prior) exceeds (%)", uz: "Shartnoma soni pasayishi (30k) oshsa (%)", ru: "Падение сделок (30д) превышает (%)" },
};

export default function AdminAlerts() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const lang = (i18n.language?.split("-")[0] ?? "en") as "en" | "uz" | "ru";

  const rulesQ = useQuery({
    queryKey: ["alerts.rules"],
    queryFn: () => api<{ rows: Rule[] }>("/api/alerts/rules"),
    staleTime: 60_000,
  });

  const [kind, setKind] = useState<Kind>("dso_gt");
  const [threshold, setThreshold] = useState<string>("100");
  const [label, setLabel] = useState<string>("");
  const [shared, setShared] = useState<boolean>(false);

  const create = useMutation({
    mutationFn: () =>
      api("/api/alerts/rules", {
        method: "POST",
        body: JSON.stringify({
          kind,
          threshold: Number(threshold),
          label: label || null,
          enabled: true,
          shared,
        }),
      }),
    onSuccess: () => {
      setThreshold("100");
      setLabel("");
      qc.invalidateQueries({ queryKey: ["alerts.rules"] });
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api(`/api/alerts/rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts.rules"] }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api(`/api/alerts/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts.rules"] }),
  });
  const evalNow = useMutation({
    mutationFn: () => api<{ created: number }>("/api/alerts/evaluate", { method: "POST" }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["alerts.events"] });
      window.alert(
        t("alerts_admin.eval_done", { defaultValue: "Evaluator ran. New events: {{n}}", n: r.created }) as string,
      );
    },
  });

  return (
    <div>
      <PageHeading
        crumb={[t("nav.admin"), t("alerts_admin.title", { defaultValue: "Alert rules" })]}
        title={t("alerts_admin.title", { defaultValue: "Alert rules" })}
        subtitle={t("alerts_admin.subtitle", {
          defaultValue: "Subscribe to threshold breaches. Events appear in the bell icon in the sidebar. Evaluator runs every 30 minutes automatically.",
        })}
      />

      <section className="stagger-2 mb-10">
        <div className="eyebrow !tracking-[0.18em] text-primary mb-3">
          {t("alerts_admin.new_rule", { defaultValue: "New rule" })}
        </div>
        <div className="flex flex-wrap items-end gap-3 max-w-[880px]">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-1">
              {t("alerts_admin.kind", { defaultValue: "Kind" })}
            </label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger className="h-9 w-[290px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABELS[k][lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-1">
              {t("alerts_admin.threshold", { defaultValue: "Threshold" })}
            </label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              min={0}
              className="h-9 w-[140px] px-2 bg-background border border-input rounded-md text-[13px] font-mono tabular-nums focus-within:ring-2 focus-within:ring-ring/30 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-1">
              {t("alerts_admin.label_optional", { defaultValue: "Label (optional)" })}
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-9 w-[200px] px-2 bg-background border border-input rounded-md text-[13px] focus-within:ring-2 focus-within:ring-ring/30 outline-none"
            />
          </div>
          {user?.role === "admin" && (
            <label className="inline-flex items-center gap-1.5 text-[12px] text-foreground/80 h-9">
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
                className="rounded border-input"
              />
              {t("alerts_admin.shared", { defaultValue: "Shared (all users)" })}
            </label>
          )}
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !threshold}
          >
            {t("alerts_admin.create", { defaultValue: "Create" })}
          </Button>
          <Button
            variant="outline"
            onClick={() => evalNow.mutate()}
            disabled={evalNow.isPending}
          >
            {t("alerts_admin.eval_now", { defaultValue: "Run evaluator now" })}
          </Button>
        </div>
      </section>

      <hr className="mark-rule mb-8" aria-hidden />

      <section className="stagger-3">
        <div className="eyebrow !tracking-[0.18em] text-primary mb-3">
          {t("alerts_admin.existing", { defaultValue: "Existing rules" })}
        </div>
        {rulesQ.data && rulesQ.data.rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground italic text-sm border border-border/60 rounded-md">
            {t("alerts_admin.no_rules", { defaultValue: "No rules yet. Create your first above." })}
          </div>
        ) : (
          <div className="overflow-x-auto border border-border/60 rounded-md bg-background/70">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    {t("alerts_admin.col_kind", { defaultValue: "Kind" })}
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    {t("alerts_admin.col_threshold", { defaultValue: "Threshold" })}
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    {t("alerts_admin.col_label", { defaultValue: "Label" })}
                  </th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    {t("alerts_admin.col_owner", { defaultValue: "Owner" })}
                  </th>
                  <th className="text-center px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                    {t("alerts_admin.col_enabled", { defaultValue: "Enabled" })}
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium" />
                </tr>
              </thead>
              <tbody>
                {rulesQ.data?.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="px-3 py-2">{KIND_LABELS[r.kind][lang]}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {Number(r.threshold).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground italic">
                      {r.label ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.user_id === null ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium uppercase tracking-[0.06em]">
                          Shared
                        </span>
                      ) : (
                        r.owner ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-[0.06em]",
                          r.enabled
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground",
                          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                      >
                        {r.enabled ? <Bell className="h-3 w-3" aria-hidden /> : <BellOff className="h-3 w-3" aria-hidden />}
                        {r.enabled ? t("alerts_admin.on", { defaultValue: "On" }) : t("alerts_admin.off", { defaultValue: "Off" })}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(t("alerts_admin.confirm_delete", { defaultValue: "Delete this rule?" }) as string)) {
                            del.mutate(r.id);
                          }
                        }}
                        aria-label={t("alerts_admin.delete", { defaultValue: "Delete rule" }) as string}
                        className="text-muted-foreground hover:text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring rounded p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stagger-4 mt-12">
        <PreferencesPanel />
      </section>
    </div>
  );
}

/** User-preferences form embedded on the Alerts page for convenience
 *  (one admin surface for "how am I notified and what do I see"). */
function PreferencesPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["user.preferences"],
    queryFn: () => api<{ default_window?: string; default_directions?: string[] }>("/api/preferences"),
  });
  const dirsQ = useQuery({
    queryKey: ["snapshots.directions"],
    queryFn: () => api<{ directions: string[] }>("/api/snapshots/directions"),
    staleTime: 5 * 60_000,
  });
  const save = useMutation({
    mutationFn: (body: any) => api("/api/preferences", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user.preferences"] }),
  });
  const [window, setWindow] = useState<string>(q.data?.default_window ?? "last90");
  const [dirs, setDirs] = useState<string[]>(q.data?.default_directions ?? []);
  // Hydrate once
  if (q.data && q.data.default_window && window === "last90") setWindow(q.data.default_window);

  const toggleDir = (d: string) =>
    setDirs((curr) => curr.includes(d) ? curr.filter((x) => x !== d) : [...curr, d]);

  return (
    <div>
      <div className="eyebrow !tracking-[0.18em] text-primary mb-3">
        {t("alerts_admin.prefs_title", { defaultValue: "My dashboard defaults" })}
      </div>
      <div className="flex flex-wrap items-end gap-3 max-w-[880px] mb-3">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-1">
            {t("alerts_admin.default_window", { defaultValue: "Default window" })}
          </label>
          <Select value={window} onValueChange={setWindow}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["today","last7","last30","last90","mtd","qtd","ytd","fy"].map((w) => (
                <SelectItem key={w} value={w}>{t(`window.${w}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[260px]">
          <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-1">
            {t("alerts_admin.default_directions", { defaultValue: "Default directions" })}
          </label>
          <div className="flex flex-wrap gap-1 py-1">
            {dirsQ.data?.directions.map((d) => {
              const on = dirs.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleDir(d)}
                  className={cn(
                    "px-2 py-1 rounded-full border text-[11px] uppercase tracking-[0.06em]",
                    on
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "text-muted-foreground border-input hover:text-foreground",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          onClick={() => save.mutate({ default_window: window, default_directions: dirs })}
          disabled={save.isPending}
        >
          {t("alerts_admin.save_prefs", { defaultValue: "Save preferences" })}
        </Button>
      </div>
    </div>
  );
}
