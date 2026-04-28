import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
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
  const { t } = useTranslation();
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
      <div className="">
        <PageHeading
          crumb={[
            t("nav.dashboard"),
            t("admin.crumb"),
            t("admin.audit_crumb"),
          ]}
          title={t("admin.audit_title")}
          subtitle={t("admin.audit_subtitle")}
        />
      </div>

      <div className="mt-6 flex items-center gap-4 max-w-md">
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

      <Card className="mt-4 p-0 overflow-hidden">
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
                    className="h-10 px-4 border-b border-border sticky top-0 bg-card text-xs text-muted-foreground uppercase tracking-wider font-medium font-semibold text-muted-foreground text-left"
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
                  className="cursor-pointer transition-colors hover:bg-muted"
                >
                  <td className="h-[52px] px-4 border-b border-border caption text-foreground/80">
                    <RelativeTime iso={r.created_at} />
                  </td>
                  <td className="h-[52px] px-4 border-b border-border text-sm text-foreground">
                    {r.username ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="h-[52px] px-4 border-b border-border">
                    <span className="font-mono text-xs text-primary">{r.action}</span>
                  </td>
                  <td className="h-[52px] px-4 border-b border-border font-mono text-xs text-foreground/80">
                    {r.target ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="h-[52px] px-4 border-b border-border font-mono text-xs text-muted-foreground">
                    {r.ip_address ?? "—"}
                  </td>
                </tr>
              ))}
              {(q.data?.rows.length ?? 0) === 0 && !q.isLoading && (
                <tr>
                  <td colSpan={5}>
                    <div className="py-14 text-center caption italic text-muted-foreground">
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
            <li key={r.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setOpenRow(r)}
                className="w-full text-left px-4 py-3 active:bg-muted transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs text-primary truncate">{r.action}</span>
                  <span className="caption text-muted-foreground shrink-0">
                    <RelativeTime iso={r.created_at} />
                  </span>
                </div>
                <div className="mt-1 text-sm text-foreground truncate">
                  {r.username ?? <span className="text-muted-foreground">—</span>}
                </div>
                {r.target && (
                  <div className="mt-0.5 font-mono text-xs text-foreground/80 truncate">
                    {r.target}
                  </div>
                )}
              </button>
            </li>
          ))}
          {(q.data?.rows.length ?? 0) === 0 && !q.isLoading && (
            <li className="py-14 text-center caption italic text-muted-foreground">
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
              <dt className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("admin.audit_drawer_when")}</dt>
              <dd className="text-sm text-foreground tabular-nums">
                {formatDateTime(openRow.created_at)}
              </dd>
              <dt className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("admin.audit_drawer_who")}</dt>
              <dd className="text-sm text-foreground">{openRow.username ?? "—"}</dd>
              <dt className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("admin.audit_drawer_action")}</dt>
              <dd className="font-mono text-xs text-primary">{openRow.action}</dd>
              <dt className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("admin.audit_drawer_target")}</dt>
              <dd className="font-mono text-xs text-foreground/80">{openRow.target ?? "—"}</dd>
              <dt className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{t("admin.audit_drawer_ip")}</dt>
              <dd className="font-mono text-xs text-muted-foreground">{openRow.ip_address ?? "—"}</dd>
            </dl>
            <div className="mt-8">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">{t("admin.audit_drawer_details")}</div>
              <JsonBlock value={openRow.details ?? {}} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
