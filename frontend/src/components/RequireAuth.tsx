import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Role, hasRole, useAuth } from "../lib/auth";

/** Gate that requires login, plus optional role check. */
export default function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-3 caption">
        reading the register…
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
          <div className="eyebrow text-risk">403 · out of scope</div>
          <div className="serif text-heading-md text-ink mt-2">Not for this desk.</div>
          <div className="caption text-ink-3 mt-3">
            Your role doesn't include this page. Ask an administrator to
            adjust access.
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
