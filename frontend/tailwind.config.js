/** @type {import('tailwindcss').Config}
 *  Almanac aesthetic — warm paper, vermilion mark, Newsreader + Fustat + IBM Plex Mono.
 *  All colour tokens point at CSS vars in styles/globals.css so we can swap in
 *  future themes without rebuilding the utility classes.
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
        serif: ['"Newsreader"', "ui-serif", "Georgia", "serif"],
        sans: ['"Fustat"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      fontSize: {
        "heading-xl": ["3.5rem", { lineHeight: "1.05", letterSpacing: "-0.01em" }],
        "heading-lg": ["2.75rem", { lineHeight: "1.08", letterSpacing: "-0.01em" }],
        "heading-md": ["2rem", { lineHeight: "1.15" }],
        "heading-sm": ["1.25rem", { lineHeight: "1.25" }],
        "stat-xl": ["3rem", { lineHeight: "1" }],
        "stat-md": ["1.75rem", { lineHeight: "1.1" }],
        body: ["0.9375rem", { lineHeight: "1.55" }],
        label: ["0.8125rem", { lineHeight: "1.4" }],
        caption: ["0.75rem", { lineHeight: "1.4" }],
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.16em" }],
        "mono-sm": ["0.75rem", { lineHeight: "1.4" }],
        "mono-xs": ["0.6875rem", { lineHeight: "1.4" }],
      },
      boxShadow: {
        card: "0 1px 0 rgba(26,23,19,0.04)",
        "card-hover": "0 2px 8px rgba(26,23,19,0.05)",
      },
      borderRadius: {
        card: "12px",
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
        "enter-up": "enter-up 260ms cubic-bezier(0.2,0.8,0.2,1) both",
        "live-pulse": "live-pulse 700ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
