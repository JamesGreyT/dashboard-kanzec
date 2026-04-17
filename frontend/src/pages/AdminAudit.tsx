import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import PageHeading from "../components/PageHeading";
import Card from "../components/Card";
import Drawer from "../components/Drawer";
import JsonBlock from "../components/JsonBlock";
import Input from "../components/Input";
import Pagination from "../components/Pagination";
import RelativeTime from "../components/RelativeTime";
import { Phrase } from "../components/Loader";

interface Row {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  target: string | null;
  details: unknown;
  ip_address: string | null;
  created_at: string;
}

export default function AdminAudit() {
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const q = useQuery({
    queryKey: ["admin.audit", action, offset],
    queryFn: () =>
      api<{ rows: Row[]; total: number }>(
        `/api/admin/audit?limit=${limit}&offset=${offset}` +
          (action ? `&action=${encodeURIComponent(action)}` : ""),
      ),
    refetchInterval: 30_000,
  });

  const [openRow, setOpenRow] = useState<Row | null>(null);

  return (
    <div>
      <PageHeading
        crumb={["Dashboard", "Admin", "Audit"]}
        title="Audit"
        subtitle="Every mutation lands here."
      />

      <div className="mt-6 flex items-center gap-4 max-w-md">
        <div className="flex-1">
          <Input
            placeholder="filter by action — e.g. backfill_enqueue"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setOffset(0);
            }}
          />
        </div>
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {["When", "Who", "Action", "Target", "IP"].map((h) => (
                <th
                  key={h}
                  className="h-10 px-4 border-b border-rule sticky top-0 bg-card eyebrow font-semibold text-ink-3 text-left"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(q.data?.rows ?? []).map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpenRow(r)}
                className="cursor-pointer transition-colors hover:bg-paper-2"
              >
                <td className="h-[52px] px-4 border-b border-rule caption text-ink-2">
                  <RelativeTime iso={r.created_at} />
                </td>
                <td className="h-[52px] px-4 border-b border-rule text-body text-ink">
                  {r.username ?? <span className="text-ink-3">—</span>}
                </td>
                <td className="h-[52px] px-4 border-b border-rule">
                  <span className="mono text-mono-sm text-mark">{r.action}</span>
                </td>
                <td className="h-[52px] px-4 border-b border-rule mono text-mono-sm text-ink-2">
                  {r.target ?? <span className="text-ink-3">—</span>}
                </td>
                <td className="h-[52px] px-4 border-b border-rule mono text-mono-sm text-ink-3">
                  {r.ip_address ?? "—"}
                </td>
              </tr>
            ))}
            {(q.data?.rows.length ?? 0) === 0 && !q.isLoading && (
              <tr>
                <td colSpan={5}>
                  <div className="py-14 text-center caption italic text-ink-3">
                    — no dispatches on record —
                  </div>
                </td>
              </tr>
            )}
            {q.isLoading && (
              <tr>
                <td colSpan={5}><Phrase /></td>
              </tr>
            )}
          </tbody>
        </table>
        {q.data && (
          <Pagination
            offset={offset}
            limit={limit}
            total={q.data.total}
            onOffset={setOffset}
          />
        )}
      </Card>

      <Drawer open={!!openRow} onClose={() => setOpenRow(null)} title="Audit entry">
        {openRow && (
          <div>
            <dl className="grid grid-cols-[140px_1fr] gap-y-3 gap-x-4">
              <dt className="eyebrow">When</dt>
              <dd className="text-body text-ink tabular-nums">
                {new Date(openRow.created_at).toLocaleString("en-GB", {
                  timeZone: "Asia/Tashkent",
                })}
              </dd>
              <dt className="eyebrow">Who</dt>
              <dd className="text-body text-ink">{openRow.username ?? "—"}</dd>
              <dt className="eyebrow">Action</dt>
              <dd className="mono text-mono-sm text-mark">{openRow.action}</dd>
              <dt className="eyebrow">Target</dt>
              <dd className="mono text-mono-sm text-ink-2">{openRow.target ?? "—"}</dd>
              <dt className="eyebrow">IP</dt>
              <dd className="mono text-mono-sm text-ink-3">{openRow.ip_address ?? "—"}</dd>
            </dl>
            <div className="mt-8">
              <div className="eyebrow mb-3">Details</div>
              <JsonBlock value={openRow.details ?? {}} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
