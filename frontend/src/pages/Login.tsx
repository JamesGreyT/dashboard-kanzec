import { FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError, useAuth } from "../lib/auth";
import LangToggle from "../components/LangToggle";

export default function Login() {
  const { user, loading, login } = useAuth();
  const { t } = useTranslation();
  const loc = useLocation() as { state?: { from?: { pathname?: string } } };
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="page-bg grain min-h-screen flex items-center justify-center text-ink3 italic">
        {t("common.loading")}
      </div>
    );
  }
  if (user) {
    const to = loc.state?.from?.pathname ?? "/dashboard";
    return <Navigate to={to} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(username, password);
    } catch (ex) {
      if (ex instanceof ApiError && ex.status === 401) {
        setErr(t("login.invalid_credentials"));
      } else {
        setErr(t("login.network_error"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-bg grain min-h-screen relative">
      <div className="absolute top-5 right-5 z-10">
        <LangToggle />
      </div>

      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px] bg-card rounded-2xl shadow-cardlg p-8 sm:p-10 animate-rise">
          <div className="flex flex-col items-center text-center gap-3 mb-8">
            <div
              aria-hidden
              className="w-14 h-14 rounded-2xl bg-mint text-white grid place-items-center text-2xl font-display font-semibold shadow-[0_8px_20px_-8px_rgba(16,185,129,0.55)]"
            >
              K
            </div>
            <div className="font-display text-3xl font-semibold tracking-[-0.04em] text-ink leading-none">
              Kanzec
            </div>
          </div>

          {err && (
            <div
              role="alert"
              className="mb-5 text-sm text-coraldk bg-coralbg border border-coral/30 rounded-xl px-4 py-3"
            >
              {err}
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-ink2 font-medium">
                {t("login.username_label")}
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                required
                placeholder="sardor-yanvarov"
                className="h-11 bg-muted rounded-xl px-4 text-sm border border-transparent outline-none transition-colors focus:bg-card focus:border-mint focus:ring-4 focus:ring-mint/15 placeholder:text-ink4"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-ink2 font-medium">
                {t("login.password_label")}
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="h-11 bg-muted rounded-xl px-4 text-sm border border-transparent outline-none transition-colors focus:bg-card focus:border-mint focus:ring-4 focus:ring-mint/15"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !username || !password}
              className="btn-mint mt-3 h-11 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {busy ? t("login.submitting") : t("login.submit")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
