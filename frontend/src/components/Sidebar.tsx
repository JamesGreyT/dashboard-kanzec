import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Package,
  Wallet,
  Building2,
  BookText,
  FileBarChart,
  Users,
  ShieldCheck,
  LogOut,
  CalendarRange,
  TrendingUp,
  Undo2,
  Crown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import AlertsBell from "./AlertsBell";
import LangToggle from "./LangToggle";
import ThemeToggle from "./ThemeToggle";
import {
  Sidebar as ShadSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type IconKind =
  | "dashboard"
  | "orders"
  | "payments"
  | "people"
  | "ledger"
  | "reports"
  | "users"
  | "audit"
  | "calendar"
  | "trending"
  | "returns"
  | "exec";

interface Item {
  to: string;
  labelKey: string;
  roles: Array<"admin" | "operator" | "viewer">;
  icon?: IconKind;
}

const REGISTRY: Item[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", roles: ["admin", "operator", "viewer"], icon: "dashboard" },
];
const EXECUTIVE: Item[] = [
  { to: "/dayslice",  labelKey: "nav.dayslice",  roles: ["admin"], icon: "calendar" },
];
const DATA: Item[] = [
  { to: "/data/orders", labelKey: "nav.orders", roles: ["admin", "operator", "viewer"], icon: "orders" },
  { to: "/data/payments", labelKey: "nav.payments", roles: ["admin", "operator", "viewer"], icon: "payments" },
  { to: "/data/legal-persons", labelKey: "nav.legal_persons", roles: ["admin", "operator", "viewer"], icon: "people" },
];
const CLIENTS: Item[] = [
  // /collection/worklist is still routed (DebtClient.tsx back-button uses
  // it) but unsurfaced. /clients is the new Mijozlar 360° intelligence
  // view; /collection/clients remains the debt-focused list.
  { to: "/clients",            labelKey: "nav.client_360",   roles: ["admin", "viewer"], icon: "people" },
  { to: "/collection/clients", labelKey: "nav.debt_clients", roles: ["admin", "viewer"], icon: "ledger" },
];
const ANALYTICS: Item[] = [
  { to: "/analytics/sales",    labelKey: "nav.sales",    roles: ["admin", "viewer"], icon: "trending" },
  { to: "/analytics/payments", labelKey: "nav.payments_dash", roles: ["admin", "viewer"], icon: "payments" },
  { to: "/analytics/returns",  labelKey: "nav.returns",  roles: ["admin", "viewer"], icon: "returns" },
  { to: "/analytics/comparison", labelKey: "nav.comparison", roles: ["admin", "viewer"], icon: "trending" },
];
const OPERATIONS: Item[] = [
  { to: "/ops", labelKey: "nav.reports", roles: ["admin"], icon: "reports" },
];
const ADMIN: Item[] = [
  { to: "/admin/alerts", labelKey: "nav.alerts", roles: ["admin", "viewer"], icon: "reports" },
  { to: "/admin/users",  labelKey: "nav.users",  roles: ["admin"], icon: "users" },
  { to: "/admin/audit",  labelKey: "nav.audit",  roles: ["admin"], icon: "audit" },
];

function IconFor({ kind }: { kind: IconKind }) {
  const size = "h-4 w-4";
  switch (kind) {
    case "dashboard": return <LayoutDashboard className={size} />;
    case "orders": return <Package className={size} />;
    case "payments": return <Wallet className={size} />;
    case "people": return <Building2 className={size} />;
    case "ledger": return <BookText className={size} />;
    case "reports": return <FileBarChart className={size} />;
    case "users": return <Users className={size} />;
    case "audit": return <ShieldCheck className={size} />;
    case "calendar": return <CalendarRange className={size} />;
    case "trending": return <TrendingUp className={size} />;
    case "returns": return <Undo2 className={size} />;
    case "exec": return <Crown className={size} />;
  }
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  if (!user) return null;

  return (
    <ShadSidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <Avatar className="h-10 w-10 ring-1 ring-sidebar-border">
            <AvatarFallback className="bg-primary text-primary-foreground font-display italic text-[16px] font-medium !normal-case">
              {user.username.slice(0, 2).toLowerCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[17px] font-medium leading-tight text-sidebar-foreground truncate">
              {user.username}
            </div>
            <div className="eyebrow mt-1 !text-[10px]">
              {t(`roles.${user.role}`)}
            </div>
            {user.scope_rooms.length > 0 && (
              <div
                className="text-xs text-muted-foreground mt-0.5 truncate italic"
                title={user.scope_rooms.map((r) => r.room_name).join(", ")}
              >
                {user.scope_rooms.length === 1
                  ? user.scope_rooms[0].room_name
                  : t("common.rooms_count", { n: user.scope_rooms.length })}
              </div>
            )}
          </div>
          {/* Bell lives next to the user identity, not the bottom row —
              keeps the footer narrow enough that the lang-toggle pills
              never overflow the sidebar's right edge. */}
          <AlertsBell />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <NavGroup titleKey="nav.registry" items={REGISTRY} role={user.role} />
        <NavGroup titleKey="nav.executive_group" items={EXECUTIVE} role={user.role} />
        <CollapsibleNavGroup
          titleKey="nav.data_group"
          items={DATA}
          role={user.role}
          parentIcon="reports"
        />
        <NavGroup titleKey="nav.clients_group" items={CLIENTS} role={user.role} />
        <NavGroup titleKey="nav.analytics" items={ANALYTICS} role={user.role} />
        <NavGroup titleKey="nav.operations" items={OPERATIONS} role={user.role} />
        <NavGroup titleKey="nav.admin" items={ADMIN} role={user.role} />
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="flex items-center justify-between px-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void logout()}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            {t("nav.signout")}
          </Button>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LangToggle />
          </div>
        </div>
      </SidebarFooter>
    </ShadSidebar>
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
  const { pathname } = useLocation();
  const visible = items.filter((i) => i.roles.includes(role));
  if (!visible.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t(titleKey)}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visible.map((i) => {
            const isActive =
              pathname === i.to || pathname.startsWith(i.to + "/");
            return (
              <SidebarMenuItem key={i.to}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link to={i.to}>
                    {i.icon && <IconFor kind={i.icon} />}
                    <span className="truncate">{t(i.labelKey)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function CollapsibleNavGroup({
  titleKey,
  items,
  role,
  parentIcon,
}: {
  titleKey: string;
  items: Item[];
  role: "admin" | "operator" | "viewer";
  parentIcon?: IconKind;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const visible = items.filter((i) => i.roles.includes(role));
  const [open, setOpen] = useState(false);
  if (!visible.length) return null;
  const expanded = open;
  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => setOpen((v) => !v)}
            aria-expanded={expanded}
          >
            {parentIcon && <IconFor kind={parentIcon} />}
            <span className="truncate">{t(titleKey)}</span>
            <ChevronRight
              className={`ml-auto h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </SidebarMenuButton>
          {expanded && (
            <SidebarMenuSub>
              {visible.map((i) => {
                const isActive =
                  pathname === i.to || pathname.startsWith(i.to + "/");
                return (
                  <SidebarMenuSubItem key={i.to}>
                    <SidebarMenuSubButton asChild isActive={isActive}>
                      <Link to={i.to}>
                        {i.icon && <IconFor kind={i.icon} />}
                        <span className="truncate">{t(i.labelKey)}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          )}
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
