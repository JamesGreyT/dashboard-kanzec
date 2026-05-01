import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtNum } from "./MetricCard";
import { useAuth } from "../lib/auth";

interface PlanRow {
  manager: string;
  plan_sotuv: number | null;
  plan_kirim: number | null;
  updated_at?: string | null;
  updated_by?: string | null;
}

interface PlanResp {
  year: number;
  month: number;
  rows: PlanRow[];
}

/**
 * Admin-editable plan-vs-fakt grid. PUT-debounced 600ms after the last
 * keystroke; whole-month replace semantics. Non-admin users see the
 * grid read-only. Empty `plan` cells render as "—" and the index chip
 * is hidden until a plan number exists.
 */
export default function PlanGridEditable({
  year,
  month,
  managers,
  factSotuv,
  factKirim,
}: {
  year: number;
  month: number;
  managers: string[];
  factSotuv: Record<string, number>;
  factKirim: Record<string, number>;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();
  const planKey = ["dayslice.plan", year, month];

  const planQ = useQuery({
    queryKey: planKey,
    queryFn: () =>
      api<PlanResp>(`/api/dayslice/plan?year=${year}&month=${month}`),
    staleTime: 30_000,
  });

  const [edits, setEdits] = useState<
    Record<string, { plan_sotuv: number | null; plan_kirim: number | null }>
  >({});

  useEffect(() => {
    if (planQ.data) {
      const next: typeof edits = {};
      for (const m of managers) {
        const row = planQ.data.rows.find((r) => r.manager === m);
        next[m] = {
          plan_sotuv: row?.plan_sotuv ?? null,
          plan_kirim: row?.plan_kirim ?? null,
        };
      }
      setEdits(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planQ.data, managers.join(",")]);

  const lastEdit = useMemo(() => {
    if (!planQ.data?.rows.length) return null;
    const sorted = [...planQ.data.rows].sort((a, b) =>
      (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
    );
    return sorted[0];
  }, [planQ.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const rows = managers
        .map((m) => ({
          manager: m,
          plan_sotuv: edits[m]?.plan_sotuv ?? null,
          plan_kirim: edits[m]?.plan_kirim ?? null,
        }))
        .filter((r) => r.plan_sotuv !== null || r.plan_kirim !== null);
      return api<PlanResp>(
        `/api/dayslice/plan?year=${year}&month=${month}`,
        {
          method: "PUT",
          body: JSON.stringify({ rows }),
        },
      );
    },
    onSuccess: (data) => qc.setQueryData(planKey, data),
  });

  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty || !isAdmin) return;
    const id = window.setTimeout(() => {
      mutation.mutate();
      setDirty(false);
    }, 600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, dirty, isAdmin]);

  const setCell = (
    mgr: string,
    key: "plan_sotuv" | "plan_kirim",
    v: string,
  ) => {
    const trimmed = v.trim();
    let num: number | null = null;
    if (trimmed !== "") {
      const parsed = Number(trimmed.replace(/[^0-9.\-]/g, ""));
      num = Number.isFinite(parsed) ? parsed : null;
    }
    setEdits((p) => ({
      ...p,
      [mgr]: {
        plan_sotuv: p[mgr]?.plan_sotuv ?? null,
        plan_kirim: p[mgr]?.plan_kirim ?? null,
        [key]: num,
      },
    }));
    setDirty(true);
  };

  const indexChip = (plan: number | null, fakt: number) => {
    if (plan === null || plan === 0) {
      return <span className="text-muted-foreground/60">—</span>;
    }
    const ratio = fakt / plan;
    const cls =
      ratio >= 1
        ? "text-mintdk"
        : ratio >= 0.7
        ? "text-amber"
        : "text-coraldk";
    return <span className={cls}>{(ratio * 100).toFixed(0)}%</span>;
  };

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-display text-[22px] md:text-[26px] font-semibold tracking-[-0.02em] text-ink">
          {t("dayslice.section_plan")}
        </h2>
        <div className="flex items-center gap-3">
          {lastEdit?.updated_at && (
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {t("dayslice.last_edit", { defaultValue: "last edit" })}: {lastEdit.updated_by} ·{" "}
              {new Date(lastEdit.updated_at).toLocaleString()}
            </div>
          )}
          {mutation.isPending && (
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground italic">
              {t("dayslice.saving", { defaultValue: "saving…" })}
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto border border-line rounded-2xl bg-card shadow-card">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {t("dayslice.col_manager")}
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {t("dayslice.plan_sotuv", { defaultValue: "Plan Sotuv" })}
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {t("dayslice.fakt_label")}
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {t("dayslice.index_label")}
              </th>
              <th className="px-2 border-l border-border/40" />
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {t("dayslice.plan_kirim", { defaultValue: "Plan Kirim" })}
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {t("dayslice.fakt_label")}
              </th>
              <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {t("dayslice.index_label")}
              </th>
            </tr>
          </thead>
          <tbody>
            {managers.map((m) => {
              const e = edits[m] ?? { plan_sotuv: null, plan_kirim: null };
              const fs = factSotuv[m] ?? 0;
              const fk = factKirim[m] ?? 0;
              return (
                <tr key={m} className="border-t border-border/40">
                  <td className="px-3 py-1.5 text-foreground">{m}</td>
                  <td className="px-3 py-1 text-right">
                    {isAdmin ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={e.plan_sotuv ?? ""}
                        onChange={(ev) =>
                          setCell(m, "plan_sotuv", ev.target.value)
                        }
                        className="w-24 text-right border border-line rounded-md px-2 py-1 font-mono tabular-nums bg-card focus-visible:outline-none focus-visible:border-mint focus-visible:ring-2 focus-visible:ring-mint/15 focus-visible:bg-amberbg/40"
                        aria-label={`Plan Sotuv ${m}`}
                      />
                    ) : (
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {e.plan_sotuv === null ? "—" : "$" + fmtNum(e.plan_sotuv)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                    {fs === 0 ? "—" : "$" + fmtNum(fs)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {indexChip(e.plan_sotuv, fs)}
                  </td>
                  <td className="px-2 border-l border-border/40" />
                  <td className="px-3 py-1 text-right">
                    {isAdmin ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={e.plan_kirim ?? ""}
                        onChange={(ev) =>
                          setCell(m, "plan_kirim", ev.target.value)
                        }
                        className="w-24 text-right border border-line rounded-md px-2 py-1 font-mono tabular-nums bg-card focus-visible:outline-none focus-visible:border-mint focus-visible:ring-2 focus-visible:ring-mint/15 focus-visible:bg-amberbg/40"
                        aria-label={`Plan Kirim ${m}`}
                      />
                    ) : (
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {e.plan_kirim === null ? "—" : "$" + fmtNum(e.plan_kirim)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                    {fk === 0 ? "—" : "$" + fmtNum(fk)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {indexChip(e.plan_kirim, fk)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
