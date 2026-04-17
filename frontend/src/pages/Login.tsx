/**
 * Phase A placeholder. Real login wiring (JWT + auth context) lands in Phase B.
 * Visual language locked in here so the aesthetic is visible on first deploy.
 */
export default function Login() {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Masthead — sits as a running head across the top of the page */}
      <div className="px-12 py-6 flex items-baseline justify-between">
        <div className="eyebrow">Kanzec · Operations</div>
        <div className="eyebrow text-ink-3">
          Tashkent · An Almanac for the trade
        </div>
      </div>

      <div className="rule mx-12" />

      {/* Centre column */}
      <div className="flex-1 flex items-center justify-center px-6 animate-enter-up">
        <div className="w-[420px]">
          <h1 className="serif text-heading-xl text-ink leading-none">
            Log-in<span className="text-mark">.</span>
          </h1>
          <p className="text-body text-ink-2 mt-3 max-w-[380px]">
            A record of the trade — deliveries, payments, and ledgers, kept
            daily. Sign in to read the register.
          </p>

          <form className="mt-12 flex flex-col gap-6" noValidate>
            <label className="flex flex-col gap-2">
              <span className="eyebrow">Name</span>
              <input
                autoFocus
                autoComplete="username"
                className="h-11 bg-paper-2 text-body text-ink px-3 rounded-[10px]
                           border-0 placeholder:italic placeholder:text-ink-3
                           focus:outline-none focus:ring-2 focus:ring-mark/35"
                placeholder="e.g. ilhom"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="eyebrow">Key</span>
              <input
                type="password"
                autoComplete="current-password"
                className="h-11 bg-paper-2 text-body text-ink px-3 rounded-[10px]
                           border-0 placeholder:italic placeholder:text-ink-3
                           focus:outline-none focus:ring-2 focus:ring-mark/35"
              />
            </label>

            <button
              type="submit"
              disabled
              className="mt-2 h-11 bg-mark text-[var(--paper)] text-label font-medium
                         rounded-[10px] transition-colors
                         hover:bg-[color-mix(in_srgb,var(--mark)_94%,#000_6%)]
                         active:scale-[0.98]
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Enter the register
            </button>
          </form>

          <p className="mt-8 caption text-ink-3">
            This is an internal tool. The register closes when you close the
            window; your session is kept only by your own browser.
          </p>
        </div>
      </div>

      {/* Colophon */}
      <div className="rule mx-12" />
      <div className="px-12 py-5 flex items-center justify-between">
        <div className="caption text-ink-3">
          Vol. I · Issue 01 · Set in Newsreader &amp; Fustat
        </div>
        <div className="caption text-ink-3 mono">
          kanzec.ilhom.work
        </div>
      </div>
    </div>
  );
}
