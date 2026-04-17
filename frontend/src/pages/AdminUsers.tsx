import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import PageHeading from "../components/PageHeading";
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import Modal from "../components/Modal";
import StatusPill from "../components/StatusPill";
import RolePicker from "../components/RolePicker";
import RelativeTime from "../components/RelativeTime";
import { Phrase } from "../components/Loader";

type Role = "admin" | "operator" | "viewer";

/**
 * Compact action link for table rows. Caption-size typography is set
 * explicitly here because Tailwind preflight's `font-size: 100%` on
 * <button> collapses back to the 15px root when the parent uses a
 * `text-caption` utility, giving us oversized action links otherwise.
 */
function ActionLink({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "text-caption leading-none px-2.5 py-1 transition-colors underline-offset-[3px]",
        danger
          ? "text-risk hover:underline decoration-risk"
          : "text-ink-2 hover:text-mark hover:underline decoration-mark",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ActionDot() {
  return (
    <span aria-hidden className="text-caption text-ink-3/60 select-none">
      ·
    </span>
  );
}

interface UserRow {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export default function AdminUsers() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin.users"],
    queryFn: () => api<{ users: UserRow[] }>("/api/admin/users"),
  });
  const [create, setCreate] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin.users"] }),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) =>
      api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin.users"] }),
  });

  const revoke = useMutation({
    mutationFn: (id: number) =>
      api(`/api/admin/users/${id}/revoke-sessions`, { method: "POST" }),
  });

  const del = useMutation({
    mutationFn: (id: number) =>
      api(`/api/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin.users"] }),
  });

  return (
    <div>
      <PageHeading
        crumb={[
          t("dashboard.crumb_dashboard"),
          t("admin.crumb"),
          t("admin.users_crumb"),
        ]}
        title={t("admin.users_title")}
        subtitle={t("admin.users_subtitle")}
      />

      <div className="mt-6 flex items-center justify-end">
        <Button variant="primary" onClick={() => setCreate(true)}>
          {t("admin.new_user")}
        </Button>
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {[
                { key: "admin.col_username", last: false },
                { key: "admin.col_role", last: false },
                { key: "admin.col_active", last: false },
                { key: "admin.col_last_login", last: false },
                { key: "admin.col_created", last: false },
                { key: "admin.col_actions", last: true },
              ].map((h) => (
                <th
                  key={h.key}
                  className={`h-10 px-4 border-b border-rule sticky top-0 bg-card eyebrow font-semibold text-ink-3 ${
                    h.last ? "text-right" : "text-left"
                  }`}
                >
                  {t(h.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(q.data?.users ?? []).map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-paper-2">
                <td className="h-[52px] px-4 border-b border-rule text-body text-ink">
                  {u.username}{" "}
                  {u.id === user?.id && (
                    <span className="caption text-ink-3">
                      ({t("common.you")})
                    </span>
                  )}
                </td>
                <td className="h-[52px] px-4 border-b border-rule">
                  <RolePicker
                    value={u.role}
                    onChange={(role) => changeRole.mutate({ id: u.id, role })}
                    disabled={u.id === user?.id}
                  />
                </td>
                <td className="h-[52px] px-4 border-b border-rule">
                  <button
                    onClick={() =>
                      toggleActive.mutate({ id: u.id, is_active: !u.is_active })
                    }
                    disabled={u.id === user?.id}
                    className="text-left"
                  >
                    <StatusPill tone={u.is_active ? "live" : "quiet"}>
                      {u.is_active ? t("admin.active") : t("admin.inactive")}
                    </StatusPill>
                  </button>
                </td>
                <td className="h-[52px] px-4 border-b border-rule caption text-ink-2">
                  <RelativeTime iso={u.last_login_at} />
                </td>
                <td className="h-[52px] px-4 border-b border-rule caption text-ink-3 tabular-nums">
                  {new Date(u.created_at).toLocaleDateString(
                    i18n.resolvedLanguage || "en-GB",
                    { timeZone: "Asia/Tashkent" },
                  )}
                </td>
                <td className="h-[52px] px-4 border-b border-rule text-right">
                  <div className="inline-flex items-center whitespace-nowrap leading-none">
                    <ActionLink onClick={() => setResetFor(u)}>
                      {t("admin.reset_password")}
                    </ActionLink>
                    <ActionDot />
                    <ActionLink onClick={() => revoke.mutate(u.id)}>
                      {t("admin.revoke_sessions")}
                    </ActionLink>
                    {u.id !== user?.id && (
                      <>
                        <ActionDot />
                        <ActionLink
                          danger
                          onClick={() => {
                            if (
                              confirm(
                                t("admin.delete_confirm", { username: u.username }),
                              )
                            )
                              del.mutate(u.id);
                          }}
                        >
                          {t("admin.delete")}
                        </ActionLink>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {q.isLoading && (
              <tr>
                <td colSpan={6}><Phrase /></td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {create && <EnrollUserModal onClose={() => setCreate(false)} />}
      {resetFor && (
        <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />
      )}
    </div>
  );
}

function EnrollUserModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ username, password, role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.users"] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    m.mutate();
  }

  return (
    <Modal open onClose={onClose} title={t("admin.enroll_modal_title")}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Input
          layout="inline"
          label={t("admin.form_username")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
        <Input
          layout="inline"
          label={t("admin.form_password")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <label className="grid grid-cols-[100px_1fr] items-center gap-x-4">
          <span className="eyebrow text-right">{t("admin.form_role")}</span>
          <div className="flex gap-2">
            {(["viewer", "operator", "admin"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 h-10 rounded-[10px] text-label transition-colors ${
                  role === r
                    ? "bg-mark-bg text-mark"
                    : "bg-paper-2 text-ink-2 hover:text-ink"
                }`}
              >
                {t(`roles.${r}`)}
              </button>
            ))}
          </div>
        </label>
        {err && (
          <div className="caption text-risk border-l-2 border-risk pl-3">{err}</div>
        )}
        <div className="flex items-center justify-end gap-5 mt-2">
          <Button variant="link" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!username || password.length < 8 || m.isPending}
          >
            {m.isPending
              ? t("admin.form_saving")
              : t("admin.form_submit_enroll")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
}: {
  user: UserRow;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () =>
      api(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      }),
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t("admin.reset_modal_title", { username: user.username })}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <Input
          layout="inline"
          label={t("admin.form_new_password")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          autoFocus
        />
        <div className="flex items-center justify-end gap-5 mt-2">
          <Button variant="link" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" disabled={password.length < 8 || m.isPending}>
            {m.isPending ? t("admin.form_saving") : t("admin.form_submit_reset")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
