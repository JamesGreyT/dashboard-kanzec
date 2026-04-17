import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import LangToggle from "./LangToggle";

interface Item {
  to: string;
  labelKey: string;
  roles: Array<"admin" | "operator" | "viewer">;
}

const REGISTRY: Item[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", roles: ["admin", "operator", "viewer"] },
  { to: "/data", labelKey: "nav.data", roles: ["admin", "operator", "viewer"] },
];
const OPERATIONS: Item[] = [
  { to: "/ops", labelKey: "nav.reports", roles: ["admin", "operator"] },
];
const ADMIN: Item[] = [
  { to: "/admin/users", labelKey: "nav.users", roles: ["admin"] },
  { to: "/admin/audit", labelKey: "nav.audit", roles: ["admin"] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  if (!user) return null;

  return (
    <aside className="w-[264px] shrink-0 bg-paper min-h-screen px-7 py-6 flex flex-col">
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
          <div className="eyebrow mt-1">{t(`roles.${user.role}`)}</div>
        </div>
      </div>

      <div className="leader" />

      <NavGroup titleKey="nav.registry" items={REGISTRY} role={user.role} />
      {OPERATIONS.some((i) => i.roles.includes(user.role)) && (
        <>
          <div className="leader" />
          <NavGroup titleKey="nav.operations" items={OPERATIONS} role={user.role} />
        </>
      )}
      {ADMIN.some((i) => i.roles.includes(user.role)) && (
        <>
          <div className="leader" />
          <NavGroup titleKey="nav.admin" items={ADMIN} role={user.role} />
        </>
      )}

      <div className="flex-1" />

      <div className="leader" />
      <div className="flex items-center justify-between">
        <button
          onClick={() => void logout()}
          className="group inline-flex items-center gap-2 text-label text-ink-2 hover:text-mark transition-colors text-left"
        >
          <span>{t("nav.signout")}</span>
          <span
            aria-hidden
            className="serif text-[15px] text-ink-3 group-hover:text-mark transition-[color,transform] translate-x-0 group-hover:translate-x-0.5"
          >
            ›
          </span>
        </button>
        <LangToggle />
      </div>
    </aside>
  );
}

function NavGroup({
  titleKey,
  items,
  role,
}: {
  titleKey: string;
  items: Item[];
  role: "admin" | "operator" | "viewer";
}) {
  const { t } = useTranslation();
  const visible = items.filter((i) => i.roles.includes(role));
  if (!visible.length) return null;
  return (
    <div>
      <div className="eyebrow mb-3">{t(titleKey)}</div>
      <ul className="flex flex-col gap-0.5">
        {visible.map((i) => (
          <li key={i.to}>
            <NavLink
              to={i.to}
              className={({ isActive }) =>
                [
                  "nav-sweep relative block h-9 px-3 rounded-md text-label leading-[36px] transition-colors",
                  isActive
                    ? "bg-mark-bg text-mark"
                    : "text-ink-2 hover:bg-paper-2 hover:text-ink",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <span
                  data-active={isActive ? "true" : "false"}
                  className="nav-sweep"
                >
                  {t(i.labelKey)}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
