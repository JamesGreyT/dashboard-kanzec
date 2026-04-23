import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, getAccessToken } from "../lib/api";
import PageHeading from "../components/PageHeading";
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import Modal from "../components/Modal";
import Drawer from "../components/Drawer";
import StatusPill, { StatusTone } from "../components/StatusPill";
import RelativeTime from "../components/RelativeTime";
import { Phrase } from "../components/Loader";

interface Report {
  key: string;
  is_reference: boolean;
  systemd_active: string;
  last_recent_at: string | null;
  last_recent_label: string | null;
  last_recent_rows: number | null;
  last_recent_ms: number | null;
  last_deep_at: string | null;
  last_deep_label: string | null;
  last_deep_rows: number | null;
  last_all_at: string | null;
  last_all_rows: number | null;
  last_error: string | null;
  backfill_queue_len: number;
}

export default function Ops() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["ops.reports"],
    queryFn: () => api<{ reports: Report[] }>("/api/ops/reports"),
    refetchInterval: 15_000,
  });

  const [backfillFor, setBackfillFor] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);

  return (
    <div>
      <div className="">
        <PageHeading
          crumb={[t("dashboard.crumb_dashboard"), t("ops.crumb")]}
          title={t("ops.title")}
          subtitle={t("ops.subtitle")}
        />
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {q.isLoading && (
          <Card>
            <Phrase />
          </Card>
        )}
        {(q.data?.reports ?? []).map((r, i) => (
          <div key={r.key} className={`stagger-${Math.min(i + 1, 5)}`}>
            <ReportCard
              r={r}
              onBackfill={() => setBackfillFor(r.key)}
              onLogs={() => setLogFor(r.key)}
            />
          </div>
        ))}
      </div>

      {backfillFor && (
        <BackfillModal
          reportKey={backfillFor}
          onClose={() => setBackfillFor(null)}
        />
      )}
      {logFor && <LogsDrawer reportKey={logFor} onClose={() => setLogFor(null)} />}
    </div>
  );
}

function ReportCard({
  r,
  onBackfill,
  onLogs,
}: {
  r: Report;
  onBackfill: () => void;
  onLogs: () => void;
}) {
  const { t } = useTranslation();
  // Reference reports (legal_person) do `all:*` pulls, not recent/deep.
  // Their cadence is 6 h; give a 7 h tolerance. Transactional reports
  // run hourly so 2 h of slack is still healthy.
  const liveSrc = r.is_reference ? r.last_all_at : r.last_recent_at;
  const staleSec = r.is_reference ? 7 * 60 * 60 : 2 * 60 * 60;
  const tone: StatusTone =
    r.systemd_active === "active" && !isStale(liveSrc, staleSec)
      ? "live"
      : r.systemd_active === "failed"
      ? "failed"
      : liveSrc
      ? "staged"
      : "quiet";
  const toneLabel =
    tone === "live"
      ? t("ops.status_live")
      : r.systemd_active === "failed"
      ? t("ops.status_failed")
      : r.systemd_active === "active"
      ? t("ops.status_staged")
      : r.systemd_active;

  const sublineKey = `ops.subline_${r.key}`;
  const subline = t(sublineKey, { defaultValue: "" });

  return (
    <Card accent={tone === "live"} className="p-5 md:p-8">
      {/* Dateline — systemd unit + status pill */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          smartup-kanzec-etl-report@{r.key}.service
        </div>
        <StatusPill tone={tone}>{toneLabel}</StatusPill>
      </div>

      {/* Article title + subline */}
      <div className="mt-6">
        <h2 className="nums text-2xl font-semibold tracking-tight text-foreground leading-none">
          {r.key}
          <span className="">.</span>
        </h2>
        {subline && (
          <div className="font-semibold italic text-sm text-foreground/80 mt-2">{subline}</div>
        )}
      </div>

      <div className="border-t border-border my-3" />

      {r.is_reference ? (
        /* Reference report — single-column "Full list" block. No deep. */
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium text-muted-foreground">{t("ops.full_pull_window")}</div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="nums text-[44px] text-foreground leading-none tabular-nums">
              {r.last_all_rows != null
                ? r.last_all_rows.toLocaleString()
                : "—"}
            </span>
            <span className="caption text-muted-foreground">{t("common.rows")}</span>
          </div>
          <div className="mt-3 caption text-muted-foreground tabular-nums">
            <RelativeTime iso={r.last_all_at} />
          </div>
        </div>
      ) : (
        /* Transactional report — two-column RECENT | DEEP. */
        <div className="grid grid-cols-1 md:grid-cols-2 relative">
          <div className="md:pr-8">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium text-muted-foreground">{t("ops.recent_window")}</div>
            <div className="mt-2 font-mono text-xs text-foreground/80 tabular-nums">
              {r.last_recent_label ?? "—"}
            </div>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="nums text-[44px] text-foreground leading-none tabular-nums">
                {r.last_recent_rows != null
                  ? r.last_recent_rows.toLocaleString()
                  : "—"}
              </span>
              <span className="caption text-muted-foreground">{t("common.rows")}</span>
            </div>
            <div className="mt-3 caption text-muted-foreground tabular-nums">
              {r.last_recent_ms != null
                ? `${(r.last_recent_ms / 1000).toFixed(1)} s`
                : "—"}
              {" · "}
              <RelativeTime iso={r.last_recent_at} />
            </div>
          </div>

          <div
            aria-hidden
            className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-rule"
          />

          <div className="md:pl-8 mt-6 md:mt-0">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium text-muted-foreground">{t("ops.deep_window")}</div>
            <div className="mt-2 font-mono text-xs text-foreground/80 tabular-nums">
              {r.last_deep_label ?? "—"}
            </div>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="nums text-[44px] text-foreground leading-none tabular-nums">
                {r.last_deep_rows != null
                  ? r.last_deep_rows.toLocaleString()
                  : "—"}
              </span>
              <span className="caption text-muted-foreground">{t("common.rows")}</span>
            </div>
            <div className="mt-3 caption text-muted-foreground tabular-nums">
              <RelativeTime iso={r.last_deep_at} />
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-border my-3" />

      {/* Metadata strip */}
      <div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-4 items-baseline">
        <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("ops.queue")}</div>
        <div className="text-sm text-foreground">
          {r.backfill_queue_len === 0 ? (
            <span className="text-muted-foreground">{t("common.no_pending")}</span>
          ) : (
            <>
              <span className="nums tabular-nums">
                {r.backfill_queue_len}
              </span>{" "}
              <span className="text-foreground/80">
                {r.backfill_queue_len === 1
                  ? t("common.chunk_singular")
                  : t("common.chunk_plural")}{" "}
                {t("common.pending")}
              </span>
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("ops.errors")}</div>
        <div className="text-sm">
          {r.last_error ? (
            <span className="block border-l-2 border-red-500 pl-3 caption text-red-700 dark:text-red-400">
              {r.last_error}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </div>

      <div className="border-t border-border my-3" />

      {/* Action line. Reference reports have no date range to backfill — the
          worker always pulls the full list — so we drop that button for them. */}
      <div className="flex items-center flex-wrap gap-x-7 gap-y-3">
        {!r.is_reference && (
          <button
            onClick={onBackfill}
            className="group inline-flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
          >
            <Calendar
              size={14}
              strokeWidth={1.25}
              className="text-muted-foreground group-hover:text-primary transition-colors"
            />
            <span className="group-hover:underline decoration-primary underline-offset-[3px]">
              {t("ops.enqueue_backfill")}
            </span>
          </button>
        )}
        <button
          onClick={onLogs}
          className="text-sm text-foreground/80 hover:text-primary hover:underline decoration-primary underline-offset-[3px] transition-colors"
        >
          {t("ops.read_dispatches")}
        </button>
      </div>
    </Card>
  );
}

function isStale(iso: string | null, seconds: number) {
  if (!iso) return true;
  const age = (Date.now() - new Date(iso).getTime()) / 1000;
  return age > seconds;
}

function BackfillModal({
  reportKey,
  onClose,
}: {
  reportKey: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chunk, setChunk] = useState<"year" | "month" | "week">("year");
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  const m = useMutation({
    mutationFn: () =>
      api<{ queued: number }>(
        `/api/ops/reports/${reportKey}/backfill`,
        { method: "POST", body: JSON.stringify({ from, to, chunk }) },
      ),
    onSuccess: (res) => {
      setCount(res.queued);
      qc.invalidateQueries({ queryKey: ["ops.reports"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setCount(null);
    m.mutate();
  }

  return (
    <Modal open onClose={onClose} title={t("ops.backfill_title", { key: reportKey })}>
      {count != null ? (
        <div>
          <div className="text-sm text-foreground">
            {count === 1
              ? t("ops.backfill_queued_singular")
              : t("ops.backfill_queued_plural", { n: count.toLocaleString() })}
          </div>
          <div className="mt-6 flex justify-end">
            <Button variant="primary" onClick={onClose}>
              {t("ops.backfill_done")}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5">
          <Input
            layout="inline"
            label={t("ops.backfill_from")}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
          <Input
            layout="inline"
            label={t("ops.backfill_to")}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
          <label className="grid grid-cols-[100px_1fr] items-center gap-x-4">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium text-right">{t("ops.backfill_chunk")}</span>
            <div className="flex gap-2">
              {(["year", "month", "week"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setChunk(v)}
                  className={`flex-1 h-10 rounded-[10px] text-sm transition-colors ${
                    chunk === v
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-foreground/80 hover:text-foreground"
                  }`}
                >
                  {t(`ops.backfill_${v}`)}
                </button>
              ))}
            </div>
          </label>
          {err && (
            <div className="caption text-red-700 dark:text-red-400 border-l-2 border-red-500 pl-3">
              {err}
            </div>
          )}
          <div className="flex items-center justify-end gap-5 mt-2">
            <Button variant="link" onClick={onClose} type="button">
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!from || !to || m.isPending}
            >
              {m.isPending
                ? t("ops.backfill_queueing")
                : t("ops.backfill_submit")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function LogsDrawer({
  reportKey,
  onClose,
}: {
  reportKey: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = getAccessToken();
    const ctrl = new AbortController();
    (async () => {
      try {
        const resp = await fetch(`/api/ops/reports/${reportKey}/logs?lines=300`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: ctrl.signal,
        });
        if (!resp.ok || !resp.body) return;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split("\n\n");
          buf = events.pop() ?? "";
          for (const ev of events) {
            const data = ev.split("\n").find((l) => l.startsWith("data:"));
            if (!data) continue;
            try {
              const parsed = JSON.parse(data.replace(/^data:\s*/, ""));
              if (parsed.line != null) {
                setLines((prev) => {
                  const next = [...prev, parsed.line as string];
                  return next.length > 1000 ? next.slice(-1000) : next;
                });
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* aborted */
      }
    })();
    return () => ctrl.abort();
  }, [reportKey]);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [lines]);

  return (
    <Drawer
      open
      onClose={onClose}
      title={t("ops.dispatches_heading", { key: reportKey })}
      width={720}
    >
      <div
        ref={boxRef}
        className="h-full overflow-auto bg-muted font-mono text-xs leading-[1.6] p-4 rounded-[8px] whitespace-pre-wrap"
      >
        {lines.length === 0 && (
          <div className="text-muted-foreground italic">{t("common.awaiting_wire")}</div>
        )}
        {lines.map((l, i) => {
          const tone = /ERROR|CRITICAL/.test(l)
            ? "text-red-700 dark:text-red-400"
            : /WARN/.test(l)
            ? "text-amber-700 dark:text-amber-400"
            : "text-foreground/80";
          return (
            <div key={i} className={tone}>
              {l}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
