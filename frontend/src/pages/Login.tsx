import { FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiError, useAuth } from "../lib/auth";

export default function Login() {
  const { user, loading, login } = useAuth();
  const loc = useLocation() as { state?: { from?: { pathname?: string } } };
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center text-ink-3 caption">
        reading the register…
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
        setErr("Those credentials aren't right.");
      } else {
        setErr("Couldn't reach the register. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <div className="px-12 py-6 flex items-baseline justify-between">
        <div className="eyebrow">Kanzec · Operations</div>
        <div className="eyebrow text-ink-3">
          Tashkent · An Almanac for the trade
        </div>
      </div>

      <div className="rule mx-12" />

      <div className="flex-1 flex items-center justify-center px-6 animate-enter-up">
        <div className="w-[420px]">
          <h1 className="serif text-heading-xl text-ink leading-none">
            Log&#8209;in<span className="mark-stop">.</span>
          </h1>
          <p className="text-body text-ink-2 mt-3 max-w-[380px]">
            A record of the trade — deliveries, payments, and ledgers, kept
            daily. Sign in to read the register.
          </p>

          {err && (
            <div className="mt-8 caption text-risk border-l-2 border-risk pl-3">
              {err}
            </div>
          )}

          <form onSubmit={submit} className="mt-8 flex flex-col gap-6" noValidate>
            <label className="flex flex-col gap-2">
              <span className="eyebrow">Name</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                required
                className="h-11 bg-paper-2 text-body text-ink px-3 rounded-[10px]
                           border-0 placeholder:italic placeholder:text-ink-3
                           focus:outline-none focus:ring-2 focus:ring-mark/35"
                placeholder="e.g. admin"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="eyebrow">Key</span>
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
                {busy ? "Opening the register…" : "Enter the register."}
              </span>
            </button>
          </form>

          <div className="mt-10 caption text-ink-3 text-right italic">
            Kanzec · Internal · Volume I
          </div>
        </div>
      </div>

      <div className="leader mx-12" />
      <div className="px-12 py-5 flex items-center justify-between">
        <div
          className="caption text-ink-3 uppercase"
          style={{ letterSpacing: "0.12em" }}
        >
          Set in Newsreader &amp; Fustat
        </div>
        <div className="caption text-ink-3 mono">kanzec.ilhom.work</div>
      </div>
    </div>
  );
}
