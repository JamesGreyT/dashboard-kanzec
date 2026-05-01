import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "./Modal";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";

/**
 * Inline "log a contact" dialog reachable from a row 📝 action button on
 * the Mijozlar 360° page. Wraps POST /api/debt/client/{id}/contact —
 * same endpoint the per-client dossier uses, so entries land in the
 * existing Calls timeline and the page's "last contact" column refreshes
 * on next refetch.
 *
 * Outcome chips mirror the dossier's composer (called / no_answer /
 * promised / rescheduled / refused / paid / note). When promised, the
 * promised-amount and by-date fields appear; otherwise they're hidden
 * to keep the form tight.
 */
type Outcome = "called" | "no_answer" | "promised" | "rescheduled" | "refused" | "paid" | "note";

const OUTCOMES: Outcome[] = [
  "called", "no_answer", "promised", "rescheduled", "refused", "paid", "note",
];

export default function QuickContactDialog({
  open,
  onClose,
  personId,
  personName,
  onLogged,
}: {
  open: boolean;
  onClose: () => void;
  personId: string;
  personName: string;
  onLogged?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome>("called");
  const [note, setNote] = useState("");
  const [promisedAmount, setPromisedAmount] = useState<string>("");
  const [promisedByDate, setPromisedByDate] = useState<string>("");

  const reset = () => {
    setOutcome("called");
    setNote("");
    setPromisedAmount("");
    setPromisedByDate("");
  };

  const m = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { outcome };
      if (note.trim()) body.note = note.trim();
      if (outcome === "promised") {
        if (promisedAmount.trim()) body.promised_amount = parseFloat(promisedAmount);
        if (promisedByDate.trim()) body.promised_by_date = promisedByDate;
      }
      return api(`/api/debt/client/${personId}/contact`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients.intelligence"] });
      qc.invalidateQueries({ queryKey: ["clients.analytics"] });
      reset();
      onLogged?.();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={t("clients360.quick_log_title", { defaultValue: "Log contact" }) + " · " + personName}
      width={480}
    >
      <div className="space-y-4 pt-1">
        {/* Outcome chip row */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2">
            {t("clients360.outcome", { defaultValue: "Outcome" })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOMES.map((o) => {
              const active = outcome === o;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  className={
                    "px-2 py-1 rounded-md text-[11px] uppercase tracking-[0.08em] border transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:bg-muted")
                  }
                >
                  {t(`debt.outcome.${o}`, { defaultValue: o.replace("_", " ") })}
                </button>
              );
            })}
          </div>
        </div>

        {/* Promised-only fields */}
        {outcome === "promised" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {t("clients360.promised_amount", { defaultValue: "Promised $" })}
              </span>
              <input
                type="number"
                step="0.01"
                value={promisedAmount}
                onChange={(e) => setPromisedAmount(e.target.value)}
                className="mt-1 w-full h-9 px-2 rounded-md border border-border bg-background text-[13px] font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {t("clients360.promised_by", { defaultValue: "By date" })}
              </span>
              <input
                type="date"
                value={promisedByDate}
                onChange={(e) => setPromisedByDate(e.target.value)}
                className="mt-1 w-full h-9 px-2 rounded-md border border-border bg-background text-[13px] font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
        )}

        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("clients360.note", { defaultValue: "Note (optional)" })}
          </span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("clients360.note_placeholder", { defaultValue: "Free-text context" }) as string}
            className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-background text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {m.error && (
          <div className="text-[12px] text-red-700 dark:text-red-400 italic">
            {t("clients360.log_failed", { defaultValue: "Failed to log contact" })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={m.isPending}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending
              ? (t("clients360.logging", { defaultValue: "Logging…" }) as string)
              : (t("clients360.log", { defaultValue: "Log contact" }) as string)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
