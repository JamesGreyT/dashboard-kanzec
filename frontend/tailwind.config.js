/** @type {import('tailwindcss').Config}
 *  Folio Amber (lighter) — pale cream, navy ink, burnt-orange accent.
 *  Fraunces italic + Inter + JetBrains Mono. All colour tokens point at
 *  CSS vars in styles/globals.css so we can swap themes without rebuilding.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        "paper-2": "var(--paper-2)",
        card: "var(--card)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        rule: "var(--rule)",
        "rule-2": "var(--rule-2)",
        mark: "var(--mark)",
        "mark-2": "var(--mark-2)",
        "mark-bg": "var(--mark-bg)",
        good: "var(--good)",
        "good-bg": "var(--good-bg)",
        warn: "var(--warn)",
        "warn-bg": "var(--warn-bg)",
        risk: "var(--risk)",
        "risk-bg": "var(--risk-bg)",
        quiet: "var(--quiet)",
        "quiet-bg": "var(--quiet-bg)",
      },
      fontFamily: {
        serif: ['"Fraunces"', "ui-serif", "Georgia", "serif"],
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      fontSize: {
        "heading-xl": ["3.5rem", { lineHeight: "1.05", letterSpacing: "-0.015em" }],
        "heading-lg": ["2.75rem", { lineHeight: "1.08", letterSpacing: "-0.015em" }],
        "heading-md": ["2rem", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        "heading-sm": ["1.25rem", { lineHeight: "1.25" }],
        "stat-xl": ["3rem", { lineHeight: "1", letterSpacing: "-0.02em" }],
        "stat-md": ["1.75rem", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        body: ["0.9375rem", { lineHeight: "1.55" }],
        label: ["0.8125rem", { lineHeight: "1.4" }],
        caption: ["0.75rem", { lineHeight: "1.4" }],
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.12em" }],
        "mono-sm": ["0.75rem", { lineHeight: "1.4" }],
        "mono-xs": ["0.6875rem", { lineHeight: "1.4" }],
      },
      boxShadow: {
        card:         "0 1px 3px rgba(14, 27, 58, 0.04), 0 0 0 1px rgba(14, 27, 58, 0.04)",
        "card-hover": "0 4px 14px rgba(14, 27, 58, 0.07), 0 0 0 1px rgba(14, 27, 58, 0.08)",
        btn:          "0 1px 3px rgba(194, 84, 27, 0.25)",
        "btn-hover":  "0 3px 8px rgba(194, 84, 27, 0.3)",
        popover:      "0 20px 60px -20px rgba(14, 27, 58, 0.2)",
      },
      borderRadius: {
        card: "12px",
        chip: "6px",
      },
      backdropBlur: {
        drawer: "4px",
      },
      transitionTimingFunction: {
        folio: "cubic-bezier(0.2, 0.85, 0.25, 1)",
      },
      keyframes: {
        "enter-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "live-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(0.85)" },
        },
      },
      animation: {
        "enter-up": "enter-up 260ms cubic-bezier(0.2,0.85,0.25,1) both",
        "live-pulse": "live-pulse 700ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
