import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";

/**
 * Almanac sidebar — user card at top, grouped nav below, no icons (Almanac
 * rule: label type stands on its own). Active row gets --mark-bg wash +
 * --mark text. No right border — sidebar and main column are separated by a
 * paper-tone shift (paper vs paper-2), not by a rule.
 */

interface Item {
  to: string;
  label: string;
  roles: Array<"admin" | "operator" | "viewer">;
}

const REGISTRY: Item[] = [
  { to: "/dashboard", label: "Dashboard", roles: ["admin", "operator", "viewer"] },
  { to: "/data", label: "Data", roles: ["admin", "operator", "viewer"] },
];

const OPERATIONS: Item[] = [
  { to: "/ops", label: "Reports", roles: ["admin", "operator"] },
];

const ADMIN: Item[] = [
  { to: "/admin/users", label: "Users", roles: ["admin"] },
  { to: "/admin/audit", label: "Audit", roles: ["admin"] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <aside className="w-[264px] shrink-0 bg-paper min-h-screen px-7 py-6 flex flex-col">
      {/* User card */}
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "var(--mark-bg)", color: "var(--mark)" }}
        >
          <span className="serif-italic text-[17px]">
            {user.username.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <div className="serif-italic text-[17px] leading-tight text-ink truncate">
            {user.username}
          </div>
          <div className="eyebrow mt-1">{user.role}</div>
        </div>
      </div>

      <div className="rule my-6" />

      <NavGroup title="Registry" items={REGISTRY} role={user.role} />
      {OPERATIONS.some((i) => i.roles.includes(user.role)) && (
        <>
          <div className="rule my-6" />
          <NavGroup title="Operations" items={OPERATIONS} role={user.role} />
        </>
      )}
      {ADMIN.some((i) => i.roles.includes(user.role)) && (
        <>
          <div className="rule my-6" />
          <NavGroup title="Admin" items={ADMIN} role={user.role} />
        </>
      )}

      <div className="flex-1" />

      <div className="rule my-6" />
      <button
        onClick={() => void logout()}
        className="text-label text-ink-2 hover:text-mark transition-colors text-left"
      >
        Sign out
      </button>
    </aside>
  );
}

function NavGroup({
  title,
  items,
  role,
}: {
  title: string;
  items: Item[];
  role: "admin" | "operator" | "viewer";
}) {
  const visible = items.filter((i) => i.roles.includes(role));
  if (!visible.length) return null;
  return (
    <div>
      <div className="eyebrow mb-3">{title}</div>
      <ul className="flex flex-col gap-0.5">
        {visible.map((i) => (
          <li key={i.to}>
            <NavLink
              to={i.to}
              className={({ isActive }) =>
                [
                  "block h-9 px-3 rounded-md text-label leading-[36px] transition-colors",
                  isActive
                    ? "bg-mark-bg text-mark"
                    : "text-ink-2 hover:bg-paper-2 hover:text-ink",
                ].join(" ")
              }
            >
              {i.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
