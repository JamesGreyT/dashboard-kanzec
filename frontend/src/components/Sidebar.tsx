import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import LangToggle from "./LangToggle";

type Glyph = "dashboard" | "orders" | "payments" | "people" | "scales";

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
const COLLECTION: Item[] = [
  { to: "/collection/debt", labelKey: "nav.debt", roles: ["admin", "operator", "viewer"], glyph: "scales" },
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
            {user.scope_rooms.length > 0 && (
              <div
                className="caption mt-1 text-ink-3 truncate"
                title={user.scope_rooms.map((r) => r.room_name).join(", ")}
              >
                {user.scope_rooms.length === 1
                  ? user.scope_rooms[0].room_name
                  : t("common.rooms_count", { n: user.scope_rooms.length })}
              </div>
            )}
          </div>
        </div>

        <div className="leader" />

        <NavGroup titleKey="nav.registry" items={REGISTRY} role={user.role} onNavigate={onClose} />
        <div className="leader" />
        <NavGroup titleKey="nav.data_group" items={DATA} role={user.role} onNavigate={onClose} />
        <div className="leader" />
        <NavGroup titleKey="nav.collection" items={COLLECTION} role={user.role} onNavigate={onClose} />
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
  return (
    <GlyphSvg
      kind={kind}
      size={16}
      className={`shrink-0 transition-colors ${className}`}
    />
  );
}

/**
 * Editorial line-art glyphs shared between the sidebar (16px) and the
 * locked-mode page header disc (22px). Single source keeps link + page
 * visually tied together.
 *
 *   dashboard — bar chart with baseline (data-viz)
 *   orders    — isometric parcel / shipping box
 *   payments  — stack of coins in perspective
 *   people    — classical columned building (courthouse) — signals
 *               "registered legal entity" better than a generic person glyph
 */
export function GlyphSvg({
  kind,
  size = 16,
  className = "",
}: {
  kind: Glyph;
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true as const,
    className,
  };
  if (kind === "dashboard") {
    return (
      <svg {...common}>
        <path
          d="M4 20V12M9 20V7M14 20V14M19 20V4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M3.5 20.5h17"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    );
  }
  if (kind === "orders") {
    return (
      <svg {...common}>
        <path
          d="M12 3.5 4 7l8 3.5L20 7l-8-3.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M4 7v10l8 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M20 7v10l-8 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M12 10.5v10"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    );
  }
  if (kind === "payments") {
    return (
      <svg {...common}>
        <ellipse cx="12" cy="6" rx="7" ry="2.4" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5 6v3.5c0 1.33 3.13 2.4 7 2.4s7-1.07 7-2.4V6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M5 11.5V15c0 1.33 3.13 2.4 7 2.4s7-1.07 7-2.4v-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M5 17v1.2c0 1.33 3.13 2.4 7 2.4s7-1.07 7-2.4V17"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "people") {
    return (
      <svg {...common}>
        <path
          d="M3.5 9.5h17L12 4 3.5 9.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M6 10.5v7M10 10.5v7M14 10.5v7M18 10.5v7"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M3 20.5h18M3.5 18h17"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "scales") {
    // Balance scale — the collection / receivables metaphor.
    return (
      <svg {...common}>
        <path d="M12 4v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4 20h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5 6h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M6 6 3.5 12h5L6 6ZM18 6l-2.5 6h5L18 6Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return null;
}
