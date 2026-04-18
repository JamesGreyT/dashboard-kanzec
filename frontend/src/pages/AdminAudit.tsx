import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
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
      <div className="stagger-0">
        <PageHeading
          crumb={[
            t("dashboard.crumb_dashboard"),
            t("admin.crumb"),
            t("admin.audit_crumb"),
          ]}
          title={t("admin.audit_title")}
          subtitle={t("admin.audit_subtitle")}
        />
      </div>

      <div className="stagger-1 mt-6 flex items-center gap-4 max-w-md">
        <div className="flex-1">
          <Input
            placeholder={t("admin.audit_filter_placeholder")}
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setOffset(0);
            }}
          />
        </div>
      </div>

      <Card className="stagger-2 mt-4 p-0 overflow-hidden">
        {/* Desktop: real table. */}
        <div className="hidden md:block">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {[
                  "admin.audit_col_when",
                  "admin.audit_col_who",
                  "admin.audit_col_action",
                  "admin.audit_col_target",
                  "admin.audit_col_ip",
                ].map((key) => (
                  <th
                    key={key}
                    className="h-10 px-4 border-b border-rule sticky top-0 bg-card eyebrow font-semibold text-ink-3 text-left"
                  >
                    {t(key)}
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
                      {t("common.no_dispatches")}
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
        </div>

        {/* Mobile: card list. */}
        <ul className="md:hidden flex flex-col">
          {(q.data?.rows ?? []).map((r) => (
            <li key={r.id} className="border-b border-rule last:border-b-0">
              <button
                type="button"
                onClick={() => setOpenRow(r)}
                className="w-full text-left px-4 py-3 active:bg-paper-2 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="mono text-mono-sm text-mark truncate">{r.action}</span>
                  <span className="caption text-ink-3 shrink-0">
                    <RelativeTime iso={r.created_at} />
                  </span>
                </div>
                <div className="mt-1 text-body text-ink truncate">
                  {r.username ?? <span className="text-ink-3">—</span>}
                </div>
                {r.target && (
                  <div className="mt-0.5 mono text-mono-xs text-ink-2 truncate">
                    {r.target}
                  </div>
                )}
              </button>
            </li>
          ))}
          {(q.data?.rows.length ?? 0) === 0 && !q.isLoading && (
            <li className="py-14 text-center caption italic text-ink-3">
              {t("common.no_dispatches")}
            </li>
          )}
          {q.isLoading && <Phrase />}
        </ul>

        {q.data && (
          <Pagination
            offset={offset}
            limit={limit}
            total={q.data.total}
            onOffset={setOffset}
          />
        )}
      </Card>

      <Drawer
        open={!!openRow}
        onClose={() => setOpenRow(null)}
        title={t("admin.audit_drawer_title")}
      >
        {openRow && (
          <div>
            <dl className="grid grid-cols-[140px_1fr] gap-y-3 gap-x-4">
              <dt className="eyebrow">{t("admin.audit_drawer_when")}</dt>
              <dd className="text-body text-ink tabular-nums">
                {new Date(openRow.created_at).toLocaleString(
                  i18n.resolvedLanguage || "en-GB",
                  { timeZone: "Asia/Tashkent" },
                )}
              </dd>
              <dt className="eyebrow">{t("admin.audit_drawer_who")}</dt>
              <dd className="text-body text-ink">{openRow.username ?? "—"}</dd>
              <dt className="eyebrow">{t("admin.audit_drawer_action")}</dt>
              <dd className="mono text-mono-sm text-mark">{openRow.action}</dd>
              <dt className="eyebrow">{t("admin.audit_drawer_target")}</dt>
              <dd className="mono text-mono-sm text-ink-2">{openRow.target ?? "—"}</dd>
              <dt className="eyebrow">{t("admin.audit_drawer_ip")}</dt>
              <dd className="mono text-mono-sm text-ink-3">{openRow.ip_address ?? "—"}</dd>
            </dl>
            <div className="mt-8">
              <div className="eyebrow mb-3">{t("admin.audit_drawer_details")}</div>
              <JsonBlock value={openRow.details ?? {}} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
