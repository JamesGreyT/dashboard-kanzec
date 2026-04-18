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
      <div className="min-h-screen bg-paper flex items-center justify-center text-ink-3 caption italic">
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
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Top-right language toggle only — no masthead. */}
      <div className="px-6 md:px-10 pt-6 flex justify-end">
        <LangToggle />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 animate-enter-up">
        <div className="w-full max-w-[380px]">
          <h1 className="serif text-heading-lg text-ink leading-none">
            {t("login.title")}
            <span className="mark-stop">.</span>
          </h1>

          {err && (
            <div className="mt-6 caption text-risk border-l-2 border-risk pl-3">
              {err}
            </div>
          )}

          <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
            <label className="flex flex-col gap-2">
              <span className="eyebrow">{t("login.username_label")}</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                required
                className="h-11 bg-paper-2 text-body text-ink px-3 rounded-[10px]
                           border-0 placeholder:italic placeholder:text-ink-3
                           focus:outline-none focus:ring-2 focus:ring-mark/35"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="eyebrow">{t("login.password_label")}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="h-11 bg-paper-2 text-body text-ink px-3 rounded-[10px]
                           border-0 placeholder:italic placeholder:text-ink-3
                           focus:outline-none focus:ring-2 focus:ring-mark/35"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !username || !password}
              className="mt-2 h-11 bg-mark text-[var(--paper)] text-label font-medium
                         rounded-[10px] transition-colors
                         hover:bg-[color-mix(in_srgb,var(--mark)_94%,#000_6%)]
                         active:scale-[0.98]
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="primary-underline-sweep">
                {busy ? t("login.submitting") : t("login.submit")}
              </span>
            </button>
          </form>
        </div>
      </div>

      {/* Single-line footer with just the domain — everything else removed. */}
      <div className="px-6 md:px-10 py-5 flex items-center justify-center">
        <div className="caption text-ink-3 mono">kanzec.ilhom.work</div>
      </div>
    </div>
  );
}
