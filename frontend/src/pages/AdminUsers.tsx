import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import PageHeading from "../components/PageHeading";
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import Modal from "../components/Modal";
import StatusPill from "../components/StatusPill";
import RelativeTime from "../components/RelativeTime";

type Role = "admin" | "operator" | "viewer";

interface UserRow {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export default function AdminUsers() {
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
        crumb={["Dashboard", "Admin", "Users"]}
        title="Users"
        subtitle="Who's on the register."
      />

      <div className="mt-6 flex items-center justify-end">
        <Button variant="primary" onClick={() => setCreate(true)}>
          + New user
        </Button>
      </div>

      <Card className="mt-4 p-0 overflow-hidden">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {["Username", "Role", "Active", "Last login", "Created", "Actions"].map(
                (h, i) => (
                  <th
                    key={h}
                    className={`h-10 px-4 border-b border-rule sticky top-0 bg-card eyebrow font-semibold text-ink-3 ${
                      i >= 5 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {(q.data?.users ?? []).map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-paper-2">
                <td className="h-[52px] px-4 border-b border-rule text-body text-ink">
                  {u.username}{" "}
                  {u.id === user?.id && (
                    <span className="caption text-ink-3">(you)</span>
                  )}
                </td>
                <td className="h-[52px] px-4 border-b border-rule">
                  <RoleSegmented
                    value={u.role}
                    onChange={(role) => changeRole.mutate({ id: u.id, role })}
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
                      {u.is_active ? "active" : "inactive"}
                    </StatusPill>
                  </button>
                </td>
                <td className="h-[52px] px-4 border-b border-rule caption text-ink-2">
                  <RelativeTime iso={u.last_login_at} />
                </td>
                <td className="h-[52px] px-4 border-b border-rule caption text-ink-3 tabular-nums">
                  {new Date(u.created_at).toLocaleDateString("en-GB", {
                    timeZone: "Asia/Tashkent",
                  })}
                </td>
                <td className="h-[52px] px-4 border-b border-rule text-right">
                  <div className="inline-flex items-center gap-4 text-label">
                    <button
                      className="text-ink hover:text-mark hover:underline decoration-mark"
                      onClick={() => setResetFor(u)}
                    >
                      reset password
                    </button>
                    <button
                      className="text-ink-2 hover:text-mark hover:underline decoration-mark"
                      onClick={() => revoke.mutate(u.id)}
                    >
                      revoke sessions
                    </button>
                    {u.id !== user?.id && (
                      <button
                        className="text-risk hover:underline decoration-risk"
                        onClick={() => {
                          if (confirm(`Delete user "${u.username}"? This cannot be undone.`))
                            del.mutate(u.id);
                        }}
                      >
                        delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {q.isLoading && (
              <tr>
                <td colSpan={6} className="py-10 text-center caption text-ink-3">
                  reading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {create && <NewUserModal onClose={() => setCreate(false)} />}
      {resetFor && (
        <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />
      )}
    </div>
  );
}

const ROLE_CLASSES: Record<Role, string> = {
  admin: "bg-good-bg text-good",
  operator: "bg-warn-bg text-warn",
  viewer: "bg-quiet-bg text-quiet",
};

function RoleSegmented({
  value,
  onChange,
}: {
  value: Role;
  onChange: (r: Role) => void;
}) {
  const opts: Role[] = ["viewer", "operator", "admin"];
  return (
    <div className="inline-flex gap-1">
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => o !== value && onChange(o)}
          className={`h-7 px-3 text-caption rounded-[8px] transition-colors ${
            o === value ? ROLE_CLASSES[o] : "text-ink-3 hover:text-ink"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function NewUserModal({ onClose }: { onClose: () => void }) {
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
    <Modal open onClose={onClose} title="New user">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <label className="flex flex-col gap-2">
          <span className="eyebrow">Role</span>
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
                {r}
              </button>
            ))}
          </div>
        </label>
        {err && <div className="caption text-risk">{err}</div>}
        <div className="flex items-center justify-end gap-3 mt-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!username || password.length < 8 || m.isPending}
          >
            {m.isPending ? "Saving…" : "Create"}
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
    <Modal open onClose={onClose} title={`Reset password · ${user.username}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          autoFocus
        />
        <div className="flex items-center justify-end gap-3 mt-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={password.length < 8 || m.isPending}>
            {m.isPending ? "Saving…" : "Reset"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
