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
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground caption italic">
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
    <div className="min-h-screen bg-background grid md:grid-cols-2">
      {/* Left pane — sage-tinted canvas hero. Hidden on mobile, the right
          pane fills the screen there. */}
      <aside className="hidden md:flex flex-col justify-between p-12 bg-secondary relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute bottom-12 left-[-80px] w-[320px] h-[320px] rounded-full bg-destructive/10 blur-3xl" />
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center text-base font-semibold">K</div>
          <div>
            <div className="font-semibold text-foreground">Kanzec</div>
            <div className="text-xs text-muted-foreground">Operations</div>
          </div>
        </div>
        <div className="relative z-10">
          <h2 className="font-display text-5xl font-semibold leading-[1] text-foreground tracking-tight">
            Sales,<br /><span className="text-primary">simply visible.</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-5 max-w-md leading-relaxed">
            A clean dashboard for the wholesale floor. Track what's sold, what's paid, and who's behind — without the spreadsheet.
          </p>
        </div>
        <div className="relative z-10 text-xs text-muted-foreground">Tashkent · since 2022</div>
      </aside>

      {/* Right pane — sign-in form */}
      <div className="flex flex-col">
        <div className="px-6 md:px-10 pt-6 flex justify-end">
          <LangToggle />
        </div>
        <div className="flex-1 flex items-center justify-center px-6 animate-in fade-in-0 slide-in-from-bottom-2">
          <div className="w-full max-w-[380px]">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground leading-[1.04]">
              {t("login.title")}
              <span className="ml-[2px]">👋</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-2">Sign in to your operations desk.</p>

            {err && (
              <div className="mt-6 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                {err}
              </div>
            )}

            <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-foreground font-medium">{t("login.username_label")}</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  required
                  placeholder="sardor-yanvarov"
                  className="h-11 bg-muted rounded-xl px-4 text-sm border border-transparent outline-none transition-colors focus:bg-card focus:border-primary placeholder:text-muted-foreground/60"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-foreground font-medium">{t("login.password_label")}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="h-11 bg-muted rounded-xl px-4 text-sm border border-transparent outline-none transition-colors focus:bg-card focus:border-primary"
                />
              </label>

              <button
                type="submit"
                disabled={busy || !username || !password}
                className="mt-3 h-11 bg-primary text-primary-foreground text-sm font-medium rounded-xl shadow-soft transition-all duration-200 hover:bg-primary/90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? t("login.submitting") : `${t("login.submit")} →`}
              </button>
            </form>

            <div className="text-xs text-muted-foreground text-center mt-6">
              Forgot? Ask an admin to rotate your password.
            </div>
          </div>
        </div>
        <div className="px-6 md:px-10 py-5 flex items-center justify-center">
          <div className="text-xs text-muted-foreground">kanzec.ilhom.work</div>
        </div>
      </div>
    </div>
  );
}
