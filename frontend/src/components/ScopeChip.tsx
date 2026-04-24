import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { useAuth } from "../lib/auth";

/**
 * Small visual affordance shown on every analytical dashboard when the
 * current user is scoped to one or more rooms. Tells them "you are
 * seeing a slice, not everything", without being click-to-disable
 * (they can't — the scope is enforced server-side).
 *
 * Admins (unscoped) get nothing. Scoped users see e.g.
 *    🔒 SCOPE  Sergeli 3/3/13 · Farxod bozori
 */
export default function ScopeChip() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  const rooms = user.scope_rooms ?? [];
  if (rooms.length === 0) return null;
  return (
    <div
      className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-primary/30 bg-primary/[0.04] text-primary"
      title={t("scope.tooltip", {
        defaultValue: "Your view is restricted to these rooms by your admin",
      }) as string}
    >
      <Lock className="h-3 w-3" aria-hidden />
      <span className="text-[10px] uppercase tracking-[0.12em] font-medium">
        {t("scope.label", { defaultValue: "Scope" })}
      </span>
      <span className="text-[12px] font-medium">
        {rooms.length <= 2
          ? rooms.map((r) => r.room_name).join(" · ")
          : `${rooms[0].room_name} +${rooms.length - 1}`}
      </span>
    </div>
  );
}
