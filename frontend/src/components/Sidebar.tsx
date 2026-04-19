import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import LangToggle from "./LangToggle";

type Glyph = "dashboard" | "orders" | "payments" | "people";

interface Item {
  to: string;
  labelKey: string;
  roles: Array<"admin" | "operator" | "viewer">;
  glyph?: Glyph;
}

const REGISTRY: Item[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", roles: ["admin", "operator", "viewer"], glyph: "dashboard" },
];
const DATA: Item[] = [
  { to: "/data/orders", labelKey: "nav.orders", roles: ["admin", "operator", "viewer"], glyph: "orders" },
  { to: "/data/payments", labelKey: "nav.payments", roles: ["admin", "operator", "viewer"], glyph: "payments" },
  { to: "/data/legal-persons", labelKey: "nav.legal_persons", roles: ["admin", "operator", "viewer"], glyph: "people" },
];
const OPERATIONS: Item[] = [
  { to: "/ops", labelKey: "nav.reports", roles: ["admin", "operator"] },
];
const ADMIN: Item[] = [
  { to: "/admin/users", labelKey: "nav.users", roles: ["admin"] },
  { to: "/admin/audit", labelKey: "nav.audit", roles: ["admin"] },
];

/**
 * Static column on md+; slide-out drawer on mobile.
 * On mobile the parent <Layout> tracks `open` and renders a backdrop below us.
 */
export default function Sidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  if (!user) return null;

  return (
    <>
      {/* Backdrop (mobile only, only when open). */}
      <div
        aria-hidden
        onClick={onClose}
        className={[
          "md:hidden fixed inset-0 z-40 bg-ink/20 transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      <aside
        className={[
          "w-[264px] shrink-0 bg-paper px-7 py-6 flex flex-col",
          // Mobile: full-viewport drawer that slides in from the left.
          "fixed inset-y-0 left-0 z-50 h-screen transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          // md+: sticky column pinned to the viewport so the footer
          // (logout + lang) stays visible regardless of page scroll.
          "md:sticky md:top-0 md:h-screen md:translate-x-0 md:transition-none",
        ].join(" ")}
      >
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

        <NavGroup titleKey="nav.registry" items={REGISTRY} role={user.role} onNavigate={onClose} />
        <div className="leader" />
        <NavGroup titleKey="nav.data_group" items={DATA} role={user.role} onNavigate={onClose} />
        {OPERATIONS.some((i) => i.roles.includes(user.role)) && (
          <>
            <div className="leader" />
            <NavGroup titleKey="nav.operations" items={OPERATIONS} role={user.role} onNavigate={onClose} />
          </>
        )}
        {ADMIN.some((i) => i.roles.includes(user.role)) && (
          <>
            <div className="leader" />
            <NavGroup titleKey="nav.admin" items={ADMIN} role={user.role} onNavigate={onClose} />
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
          {/* LangToggle hidden on mobile since it's already in the top bar. */}
          <div className="hidden md:block">
            <LangToggle />
          </div>
        </div>
      </aside>
    </>
  );
}

function NavGroup({
  titleKey,
  items,
  role,
  onNavigate,
}: {
  titleKey: string;
  items: Item[];
  role: "admin" | "operator" | "viewer";
  onNavigate?: () => void;
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
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  "group relative flex items-center gap-3 h-9 pl-3 pr-3 rounded-md text-label transition-colors",
                  isActive
                    ? "bg-mark-bg text-mark before:content-[''] before:absolute before:inset-y-[6px] before:left-0 before:w-[2px] before:bg-mark before:rounded-r"
                    : "text-ink-2 hover:bg-paper-2 hover:text-ink",
                ].join(" ")
              }
            >
              {({ isActive }: { isActive: boolean }) => (
                <>
                  {i.glyph && (
                    <SidebarGlyph
                      kind={i.glyph}
                      className={
                        isActive
                          ? "text-mark"
                          : "text-ink-3 group-hover:text-ink-2"
                      }
                    />
                  )}
                  <span className="truncate">{t(i.labelKey)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarGlyph({ kind, className = "" }: { kind: Glyph; className?: string }) {
  const cls = `shrink-0 transition-colors ${className}`;
  if (kind === "dashboard") {
    return (
      <svg className={cls} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="3" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="3" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="11" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="15" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === "orders") {
    return (
      <svg className={cls} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 4h10l3 3v13H5V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 10h8M8 14h8M8 18h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "payments") {
    return (
      <svg className={cls} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 9v6M18 9v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "people") {
    return (
      <svg className={cls} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 20v-1.5a4.5 4.5 0 0 1 4.5-4.5h4a4.5 4.5 0 0 1 4.5 4.5V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10.5" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M17 11a3 3 0 0 0 0-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M20 20v-1a3.5 3.5 0 0 0-2.5-3.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}
