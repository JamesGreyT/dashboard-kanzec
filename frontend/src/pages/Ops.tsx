import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getAccessToken } from "../lib/api";
import PageHeading from "../components/PageHeading";
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import Modal from "../components/Modal";
import Drawer from "../components/Drawer";
import StatusPill, { StatusTone } from "../components/StatusPill";
import RelativeTime from "../components/RelativeTime";

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
        crumb={["Dashboard", "Operations"]}
        title="Operations"
        subtitle="Report workers, their last pulls, and the backfill queue."
      />

      <div className="mt-8 flex flex-col gap-6">
        {(q.data?.reports ?? []).map((r) => (
          <ReportCard
            key={r.key}
            r={r}
            onBackfill={() => setBackfillFor(r.key)}
            onLogs={() => setLogFor(r.key)}
          />
        ))}
        {q.isLoading && (
          <Card>
            <div className="caption text-ink-3">reading the workers…</div>
          </Card>
        )}
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
  const tone: StatusTone =
    r.systemd_active === "active" && !isStale(r.last_recent_at, 2 * 60 * 60)
      ? "live"
      : r.systemd_active === "failed"
      ? "failed"
      : r.last_recent_at
      ? "staged"
      : "quiet";
  const toneLabel =
    r.systemd_active === "active" && tone === "live"
      ? "live"
      : r.systemd_active === "failed"
      ? "failed"
      : r.systemd_active === "active"
      ? "staged"
      : r.systemd_active;

  return (
    <Card accent={tone === "live"}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="eyebrow">SMARTUP-KANZEC-ETL-REPORT@{r.key}</div>
          <div className="serif-italic text-heading-sm text-ink mt-1">{r.key}</div>
        </div>
        <StatusPill tone={tone}>{toneLabel}</StatusPill>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="eyebrow">Recent window</div>
          <div className="mt-2 text-body text-ink">
            {r.last_recent_label ?? "—"}
          </div>
          <div className="mt-1 caption text-ink-3 tabular-nums">
            {r.last_recent_rows != null
              ? `${r.last_recent_rows.toLocaleString()} rows`
              : "—"}
            {" · "}
            {r.last_recent_ms != null
              ? `${(r.last_recent_ms / 1000).toFixed(1)} s`
              : "—"}
            {" · "}
            <RelativeTime iso={r.last_recent_at ?? r.last_all_at} />
          </div>
        </div>
        <div>
          <div className="eyebrow">Deep window</div>
          <div className="mt-2 text-body text-ink">
            {r.last_deep_label ?? "—"}
          </div>
          <div className="mt-1 caption text-ink-3 tabular-nums">
            {r.last_deep_rows != null
              ? `${r.last_deep_rows.toLocaleString()} rows`
              : "—"}
            {" · "}
            <RelativeTime iso={r.last_deep_at} />
          </div>
        </div>
      </div>

      {r.last_error && (
        <div className="mt-6 p-3 rounded-[8px] bg-risk-bg caption text-risk">
          <span className="eyebrow mr-2 text-risk">LAST ERROR</span>
          {r.last_error}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <div className="caption text-ink-3">
          backfill queue:{" "}
          <span className="serif text-ink nums tabular-nums">
            {r.backfill_queue_len}
          </span>{" "}
          chunk{r.backfill_queue_len === 1 ? "" : "s"}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={onBackfill}>+ Enqueue backfill</Button>
          <Button onClick={onLogs}>View log tail</Button>
        </div>
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
        {
          method: "POST",
          body: JSON.stringify({ from, to, chunk }),
        },
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
    <Modal open onClose={onClose} title={`Enqueue backfill · ${reportKey}`}>
      {count != null ? (
        <div>
          <div className="text-body text-ink">
            Queued {count} chunk{count === 1 ? "" : "s"}. The worker will drain
            them at its next cycle.
          </div>
          <div className="mt-6 flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="From"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
            />
            <Input
              label="To"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </div>
          <label className="flex flex-col gap-2">
            <span className="eyebrow">Chunk</span>
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
                  {v}
                </button>
              ))}
            </div>
          </label>
          {err && <div className="caption text-risk">{err}</div>}
          <div className="flex items-center justify-end gap-3 mt-2">
            <Button onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!from || !to || m.isPending}>
              {m.isPending ? "Queueing…" : "Queue backfill"}
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
    <Drawer open onClose={onClose} title={`LOG · ${reportKey}`} width={720}>
      <div
        ref={boxRef}
        className="h-full overflow-auto bg-paper-2 mono text-mono-xs leading-[1.6] p-4 rounded-[8px] whitespace-pre-wrap"
      >
        {lines.length === 0 && (
          <div className="text-ink-3">streaming…</div>
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
