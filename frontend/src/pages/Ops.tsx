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
      <PageHeading
        crumb={[t("dashboard.crumb_dashboard"), t("ops.crumb")]}
        title={t("ops.title")}
        subtitle={t("ops.subtitle")}
      />

      <div className="mt-8 flex flex-col gap-6">
        {q.isLoading && (
          <Card>
            <Phrase />
          </Card>
        )}
        {(q.data?.reports ?? []).map((r) => (
          <ReportCard
            key={r.key}
            r={r}
            onBackfill={() => setBackfillFor(r.key)}
            onLogs={() => setLogFor(r.key)}
          />
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
  const tone: StatusTone =
    r.systemd_active === "active" && !isStale(r.last_recent_at, 2 * 60 * 60)
      ? "live"
      : r.systemd_active === "failed"
      ? "failed"
      : r.last_recent_at
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
        <div className="eyebrow">
          smartup-kanzec-etl-report@{r.key}.service
        </div>
        <StatusPill tone={tone}>{toneLabel}</StatusPill>
      </div>

      {/* Article title + subline */}
      <div className="mt-6">
        <h2 className="serif nums text-heading-md text-ink leading-none">
          {r.key}
          <span className="mark-stop">.</span>
        </h2>
        {subline && (
          <div className="serif-italic text-body text-ink-2 mt-2">{subline}</div>
        )}
      </div>

      <div className="leader" />

      {/* Two-column stat block — RECENT | DEEP */}
      <div className="grid grid-cols-1 md:grid-cols-2 relative">
        <div className="md:pr-8">
          <div className="eyebrow text-ink-3">{t("ops.recent_window")}</div>
          <div className="mt-2 mono text-mono-sm text-ink-2 tabular-nums">
            {r.last_recent_label ?? "—"}
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="serif nums text-[44px] text-ink leading-none tabular-nums">
              {r.last_recent_rows != null
                ? r.last_recent_rows.toLocaleString()
                : "—"}
            </span>
            <span className="caption text-ink-3">{t("common.rows")}</span>
          </div>
          <div className="mt-3 caption text-ink-3 tabular-nums">
            {r.last_recent_ms != null
              ? `${(r.last_recent_ms / 1000).toFixed(1)} s`
              : "—"}
            {" · "}
            <RelativeTime iso={r.last_recent_at ?? r.last_all_at} />
          </div>
        </div>

        <div
          aria-hidden
          className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-rule"
        />

        <div className="md:pl-8 mt-6 md:mt-0">
          <div className="eyebrow text-ink-3">{t("ops.deep_window")}</div>
          <div className="mt-2 mono text-mono-sm text-ink-2 tabular-nums">
            {r.last_deep_label ?? "—"}
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="serif nums text-[44px] text-ink leading-none tabular-nums">
              {r.last_deep_rows != null
                ? r.last_deep_rows.toLocaleString()
                : "—"}
            </span>
            <span className="caption text-ink-3">{t("common.rows")}</span>
          </div>
          <div className="mt-3 caption text-ink-3 tabular-nums">
            <RelativeTime iso={r.last_deep_at} />
          </div>
        </div>
      </div>

      <div className="leader" />

      {/* Metadata strip */}
      <div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-4 items-baseline">
        <div className="eyebrow">{t("ops.queue")}</div>
        <div className="text-body text-ink">
          {r.backfill_queue_len === 0 ? (
            <span className="text-ink-3">{t("common.no_pending")}</span>
          ) : (
            <>
              <span className="serif nums tabular-nums">
                {r.backfill_queue_len}
              </span>{" "}
              <span className="text-ink-2">
                {r.backfill_queue_len === 1
                  ? t("common.chunk_singular")
                  : t("common.chunk_plural")}{" "}
                {t("common.pending")}
              </span>
            </>
          )}
        </div>
        <div className="eyebrow">{t("ops.errors")}</div>
        <div className="text-body">
          {r.last_error ? (
            <span className="block border-l-2 border-risk pl-3 caption text-risk">
              {r.last_error}
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </div>
      </div>

      <div className="leader" />

      {/* Action line */}
      <div className="flex items-center flex-wrap gap-x-7 gap-y-3">
        <button
          onClick={onBackfill}
          className="group inline-flex items-center gap-2 text-label text-ink hover:text-mark transition-colors"
        >
          <Calendar
            size={14}
            strokeWidth={1.25}
            className="text-ink-3 group-hover:text-mark transition-colors"
          />
          <span className="group-hover:underline decoration-mark underline-offset-[3px]">
            {t("ops.enqueue_backfill")}
          </span>
        </button>
        <button
          onClick={onLogs}
          className="text-label text-ink-2 hover:text-mark hover:underline decoration-mark underline-offset-[3px] transition-colors"
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
          <div className="text-body text-ink">
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
            <span className="eyebrow text-right">{t("ops.backfill_chunk")}</span>
            <div className="flex gap-2">
              {(["year", "month", "week"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setChunk(v)}
                  className={`flex-1 h-10 rounded-[10px] text-label transition-colors ${
                    chunk === v
                      ? "bg-mark-bg text-mark"
                      : "bg-paper-2 text-ink-2 hover:text-ink"
                  }`}
                >
                  {t(`ops.backfill_${v}`)}
                </button>
              ))}
            </div>
          </label>
          {err && (
            <div className="caption text-risk border-l-2 border-risk pl-3">
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
        className="h-full overflow-auto bg-paper-2 mono text-mono-xs leading-[1.6] p-4 rounded-[8px] whitespace-pre-wrap"
      >
        {lines.length === 0 && (
          <div className="text-ink-3 italic">{t("common.awaiting_wire")}</div>
        )}
        {lines.map((l, i) => {
          const tone = /ERROR|CRITICAL/.test(l)
            ? "text-risk"
            : /WARN/.test(l)
            ? "text-warn"
            : "text-ink-2";
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
