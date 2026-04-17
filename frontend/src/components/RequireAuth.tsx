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
      <div className="min-h-screen flex items-center justify-center text-ink-3 caption italic">
        {t("common.reading_the_register")}
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }

  if (roles && !hasRole(user, ...roles)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="eyebrow text-risk">{t("common.forbidden_code")}</div>
          <div className="serif text-heading-md text-ink mt-2">
            {t("common.forbidden_title")}
          </div>
          <div className="caption text-ink-3 mt-3">
            {t("common.forbidden_body")}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
