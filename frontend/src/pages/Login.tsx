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
          {/* One-line editorial anchor above the title — the wordmark in
              eyebrow type, middle-dot separator to echo breadcrumbs. */}
          <div className="eyebrow mb-3">Kanzec · Operations</div>
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
              <div
                className="relative h-11 bg-paper-2 rounded-[10px]
                           focus-within:ring-2 focus-within:ring-mark/35
                           focus-within:before:content-[''] focus-within:before:absolute
                           focus-within:before:inset-y-[8px] focus-within:before:left-0
                           focus-within:before:w-[2px] focus-within:before:bg-mark
                           focus-within:before:rounded-r"
              >
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  required
                  className="w-full h-full bg-transparent text-body text-ink px-3 rounded-[10px]
                             border-0 outline-none placeholder:italic placeholder:text-ink-3"
                />
              </div>
            </label>

            <label className="flex flex-col gap-2">
              <span className="eyebrow">{t("login.password_label")}</span>
              <div
                className="relative h-11 bg-paper-2 rounded-[10px]
                           focus-within:ring-2 focus-within:ring-mark/35
                           focus-within:before:content-[''] focus-within:before:absolute
                           focus-within:before:inset-y-[8px] focus-within:before:left-0
                           focus-within:before:w-[2px] focus-within:before:bg-mark
                           focus-within:before:rounded-r"
              >
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full h-full bg-transparent text-body text-ink px-3 rounded-[10px]
                             border-0 outline-none placeholder:italic placeholder:text-ink-3"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={busy || !username || !password}
              className="mt-2 h-11 bg-mark text-white text-label font-semibold
                         rounded-[10px] shadow-btn transition-all duration-200
                         hover:shadow-btn-hover hover:brightness-[0.95]
                         active:scale-[0.98]
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? t("login.submitting") : t("login.submit")}
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
