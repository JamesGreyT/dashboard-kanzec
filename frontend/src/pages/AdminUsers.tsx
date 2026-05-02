import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
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

interface Room {
  room_id: string;
  room_code: string | null;
  room_name: string;
}

interface UserRow {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  scope_room_ids: string[];
}

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
        "text-xs leading-none px-2.5 py-1 transition-colors underline-offset-[3px]",
        danger
          ? "text-coraldk hover:underline decoration-risk"
          : "text-ink2 hover:text-mintdk hover:underline decoration-primary",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ActionDot() {
  return (
    <span aria-hidden className="text-xs text-ink3/60 select-none">
      ·
    </span>
  );
}

function RoomsCell({
  ids,
  roomsById,
  onEdit,
}: {
  ids: string[];
  roomsById: Record<string, Room>;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  if (ids.length === 0) {
    return (
      <button
        onClick={onEdit}
        className="caption text-ink3 hover:text-mintdk transition-colors"
      >
        {t("admin.rooms_unscoped")}
      </button>
    );
  }
  const names = ids.map((id) => roomsById[id]?.room_name ?? id);
  const label =
    names.length === 1
      ? names[0]
      : t("admin.rooms_n", { n: names.length });
  return (
    <button
      onClick={onEdit}
      title={names.join(", ")}
      className="caption text-ink2 hover:text-mintdk underline decoration-primary underline-offset-[3px] truncate max-w-[200px] inline-block"
    >
      {label}
    </button>
  );
}

export default function AdminUsers() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin.users"],
    queryFn: () => api<{ users: UserRow[] }>("/api/admin/users"),
  });
  const roomsQ = useQuery({
    queryKey: ["admin.rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/api/admin/rooms"),
  });
  const roomsById = useMemo(() => {
    const out: Record<string, Room> = {};
    for (const r of roomsQ.data?.rooms ?? []) out[r.room_id] = r;
    return out;
  }, [roomsQ.data]);

  const [create, setCreate] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [editRoomsFor, setEditRoomsFor] = useState<UserRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

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

  const rooms = roomsQ.data?.rooms ?? [];

  return (
    <div>
      <div className="">
        <PageHeading
          crumb={[
            t("dashboard.crumb_dashboard"),
            t("admin.crumb"),
            t("admin.users_crumb"),
          ]}
          title={t("admin.users_title")}
          subtitle={t("admin.users_subtitle")}
        />
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button onClick={() => setBulkOpen(true)}>
          {t("admin.bulk_from_rooms")}
        </Button>
        <Button variant="primary" onClick={() => setCreate(true)}>
          {t("admin.new_user")}
        </Button>
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        <div className="hidden md:block">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {[
                  { key: "admin.col_username", last: false },
                  { key: "admin.col_role", last: false },
                  { key: "admin.col_rooms", last: false },
                  { key: "admin.col_active", last: false },
                  { key: "admin.col_last_login", last: false },
                  { key: "admin.col_created", last: false },
                  { key: "admin.col_actions", last: true },
                ].map((h) => (
                  <th
                    key={h.key}
                    className={`h-10 px-4 border-b border-line sticky top-0 bg-card text-xs text-ink3 uppercase tracking-wider font-medium font-semibold text-ink3 ${
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
                <tr key={u.id} className="transition-colors hover:bg-muted">
                  <td className="h-[52px] px-4 border-b border-line text-sm text-ink">
                    {u.username}{" "}
                    {u.id === user?.id && (
                      <span className="caption text-ink3">
                        ({t("common.you")})
                      </span>
                    )}
                  </td>
                  <td className="h-[52px] px-4 border-b border-line">
                    <RolePicker
                      value={u.role}
                      onChange={(role) => changeRole.mutate({ id: u.id, role })}
                      disabled={u.id === user?.id}
                    />
                  </td>
                  <td className="h-[52px] px-4 border-b border-line">
                    <RoomsCell
                      ids={u.scope_room_ids}
                      roomsById={roomsById}
                      onEdit={() => setEditRoomsFor(u)}
                    />
                  </td>
                  <td className="h-[52px] px-4 border-b border-line">
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
                  <td className="h-[52px] px-4 border-b border-line caption text-ink2">
                    <RelativeTime iso={u.last_login_at} />
                  </td>
                  <td className="h-[52px] px-4 border-b border-line caption text-ink3 tabular-nums">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="h-[52px] px-4 border-b border-line text-right">
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
                  <td colSpan={7}><Phrase /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <ul className="md:hidden flex flex-col">
          {(q.data?.users ?? []).map((u) => (
            <li key={u.id} className="border-b border-line last:border-b-0 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-ink truncate">
                    {u.username}
                    {u.id === user?.id && (
                      <span className="caption text-ink3"> ({t("common.you")})</span>
                    )}
                  </div>
                  <div className="mt-1 caption text-ink3 tabular-nums">
                    {formatDate(u.created_at)}
                    {" · "}
                    <RelativeTime iso={u.last_login_at} />
                  </div>
                  <div className="mt-2">
                    <RoomsCell
                      ids={u.scope_room_ids}
                      roomsById={roomsById}
                      onEdit={() => setEditRoomsFor(u)}
                    />
                  </div>
                </div>
                <button
                  onClick={() =>
                    toggleActive.mutate({ id: u.id, is_active: !u.is_active })
                  }
                  disabled={u.id === user?.id}
                  className="shrink-0"
                >
                  <StatusPill tone={u.is_active ? "live" : "quiet"}>
                    {u.is_active ? t("admin.active") : t("admin.inactive")}
                  </StatusPill>
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <RolePicker
                  value={u.role}
                  onChange={(role) => changeRole.mutate({ id: u.id, role })}
                  disabled={u.id === user?.id}
                />
              </div>
              <div className="mt-3 flex items-center flex-wrap gap-x-1 gap-y-1 -mx-1">
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
            </li>
          ))}
          {q.isLoading && <Phrase />}
        </ul>
      </Card>

      {create && (
        <EnrollUserModal rooms={rooms} onClose={() => setCreate(false)} />
      )}
      {resetFor && (
        <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />
      )}
      {editRoomsFor && (
        <EditRoomsModal
          user={editRoomsFor}
          rooms={rooms}
          onClose={() => setEditRoomsFor(null)}
        />
      )}
      {bulkOpen && <BulkFromRoomsModal onClose={() => setBulkOpen(false)} />}
    </div>
  );
}

function RoomChecklist({
  rooms,
  value,
  onChange,
  single = false,
}: {
  rooms: Room[];
  value: string[];
  onChange: (ids: string[]) => void;
  single?: boolean;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const filtered = q
    ? rooms.filter((r) =>
        r.room_name.toLowerCase().includes(q.trim().toLowerCase()),
      )
    : rooms;
  const toggle = (id: string) => {
    if (single) {
      onChange(value[0] === id ? [] : [id]);
      return;
    }
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <div className="flex flex-col gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("admin.rooms_search_placeholder")}
      />
      <div className="max-h-[260px] overflow-y-auto border border-line rounded-[10px]">
        {filtered.length === 0 && (
          <div className="caption text-ink3 px-3 py-4 text-center">
            {t("admin.rooms_no_matches")}
          </div>
        )}
        {filtered.map((r) => {
          const checked = value.includes(r.room_id);
          return (
            <button
              key={r.room_id}
              type="button"
              onClick={() => toggle(r.room_id)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted transition-colors border-b border-line last:border-b-0"
            >
              <span
                aria-hidden
                className={`shrink-0 inline-block h-4 w-4 rounded-sm border ${
                  checked ? "bg-mint border-mint" : "border-ink3/40"
                }`}
              />
              <span className="flex-1 text-sm text-ink">{r.room_name}</span>
              <span className="caption text-ink3 font-mono tabular-nums">{r.room_id}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EnrollUserModal({
  rooms,
  onClose,
}: {
  rooms: Room[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [scope, setScope] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          role,
          scope_room_ids: role === "admin" ? [] : scope,
        }),
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
          <span className="text-xs text-ink3 uppercase tracking-wider font-medium text-right">{t("admin.form_role")}</span>
          <div className="flex gap-2">
            {(["viewer", "operator", "admin"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 h-10 rounded-[10px] text-sm transition-colors ${
                  role === r
                    ? "bg-mintbg text-mintdk"
                    : "bg-muted text-ink2 hover:text-ink"
                }`}
              >
                {t(`roles.${r}`)}
              </button>
            ))}
          </div>
        </label>
        {role !== "admin" && (
          <label className="grid grid-cols-[100px_1fr] items-start gap-x-4">
            <span className="text-xs text-ink3 uppercase tracking-wider font-medium text-right mt-2">{t("admin.form_rooms")}</span>
            <RoomChecklist rooms={rooms} value={scope} onChange={setScope} />
          </label>
        )}
        {err && (
          <div className="caption text-coraldk border-l-2 border-red-500 pl-3">{err}</div>
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

function EditRoomsModal({
  user,
  rooms,
  onClose,
}: {
  user: UserRow;
  rooms: Room[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [scope, setScope] = useState<string[]>(user.scope_room_ids);
  const m = useMutation({
    mutationFn: () =>
      api(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ scope_room_ids: scope }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.users"] });
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t("admin.rooms_modal_title", { username: user.username })}
    >
      <div className="flex flex-col gap-5">
        {user.role === "admin" ? (
          <div className="caption text-ink3 border-l-2 border-line pl-3">
            {t("admin.rooms_admin_notice")}
          </div>
        ) : (
          <RoomChecklist rooms={rooms} value={scope} onChange={setScope} />
        )}
        <div className="flex items-center justify-end gap-5 mt-2">
          <Button variant="link" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => m.mutate()}
            disabled={m.isPending || user.role === "admin"}
          >
            {m.isPending ? t("admin.form_saving") : t("admin.form_submit_save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface BulkCred {
  username: string;
  temp_password: string;
  room_id: string;
  room_name: string;
}

function BulkFromRoomsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [creds, setCreds] = useState<BulkCred[] | null>(null);
  const m = useMutation({
    mutationFn: () =>
      api<BulkCred[]>("/api/admin/users/bulk-from-rooms", {
        method: "POST",
        body: JSON.stringify({ role: "operator" }),
      }),
    onSuccess: (data) => {
      setCreds(data);
      qc.invalidateQueries({ queryKey: ["admin.users"] });
    },
  });

  function copyAll() {
    if (!creds) return;
    const lines = creds.map(
      (c) => `${c.room_name}\t${c.username}\t${c.temp_password}`,
    );
    const tsv = [
      "Room\tUsername\tTemp password",
      ...lines,
    ].join("\n");
    navigator.clipboard.writeText(tsv).catch(() => {});
  }

  return (
    <Modal open onClose={onClose} title={t("admin.bulk_modal_title")}>
      {creds === null ? (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink2">{t("admin.bulk_modal_blurb")}</p>
          <div className="flex items-center justify-end gap-5 mt-2">
            <Button variant="link" type="button" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={() => m.mutate()}
              disabled={m.isPending}
            >
              {m.isPending ? t("admin.form_saving") : t("admin.bulk_modal_go")}
            </Button>
          </div>
        </div>
      ) : creds.length === 0 ? (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink2">{t("admin.bulk_none_to_create")}</p>
          <div className="flex items-center justify-end">
            <Button variant="primary" type="button" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="caption text-coraldk border-l-2 border-red-500 pl-3">
            {t("admin.bulk_warning")}
          </div>
          <div className="border border-line rounded-[10px] max-h-[340px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 bg-card">
                  <th className="text-xs text-ink3 uppercase tracking-wider font-medium text-left px-3 py-2 border-b border-line">
                    {t("admin.col_rooms")}
                  </th>
                  <th className="text-xs text-ink3 uppercase tracking-wider font-medium text-left px-3 py-2 border-b border-line">
                    {t("admin.col_username")}
                  </th>
                  <th className="text-xs text-ink3 uppercase tracking-wider font-medium text-left px-3 py-2 border-b border-line">
                    {t("admin.bulk_col_password")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {creds.map((c) => (
                  <tr key={c.username} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 text-ink">{c.room_name}</td>
                    <td className="px-3 py-2 font-mono text-ink">{c.username}</td>
                    <td className="px-3 py-2 font-mono text-ink tabular-nums">{c.temp_password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-5">
            <Button variant="ghost" type="button" onClick={copyAll}>
              {t("admin.bulk_copy_all")}
            </Button>
            <Button variant="primary" type="button" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      )}
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
