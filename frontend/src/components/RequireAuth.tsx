import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Role, hasRole, useAuth } from "../lib/auth";

export default function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground caption italic">
        {t("common.reading_the_register")}
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }

  if (roles && !hasRole(user, ...roles)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
