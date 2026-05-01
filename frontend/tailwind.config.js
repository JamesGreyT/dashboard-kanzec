import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        mono: ["DM Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        // Mobile Card Stream shadow scale
        card: "0 1px 2px rgba(17,24,39,0.04), 0 8px 24px -8px rgba(17,24,39,0.08)",
        cardlg: "0 2px 4px rgba(17,24,39,0.04), 0 24px 48px -16px rgba(17,24,39,0.12)",
        phone: "0 60px 120px -30px rgba(17,24,39,0.35), 0 30px 60px -20px rgba(17,24,39,0.18)",
        inset: "inset 0 0 0 1px rgba(17,24,39,0.04)",
        press: "0 1px 0 rgba(17,24,39,0.05), 0 0 0 4px rgba(16,185,129,0.08)",
        // Legacy alias kept so call sites that still say `shadow-soft` don't crash
        // before Sessions 3/4 migrate them.
        soft: "0 1px 2px rgba(17,24,39,0.04), 0 8px 24px -8px rgba(17,24,39,0.08)",
      },
      colors: {
        // Literal Mobile Card Stream tokens — addressable as bg-ink, text-mint, etc.
        ink: "#111827",
        ink2: "#374151",
        ink3: "#6B7280",
        ink4: "#9CA3AF",
        paper: "#FAFAFA",
        line: "#EEF0F2",
        mint: "#10B981",
        mintdk: "#059669",
        mintbg: "#ECFDF5",
        coral: "#F87171",
        coraldk: "#DC2626",
        coralbg: "#FEF2F2",
        amber: "#F59E0B",
        amberbg: "#FFFBEB",
        sky: "#0EA5E9",
        violet: "#8B5CF6",

        // CSS-variable-driven tokens — preserved so shadcn/ui primitives keep working
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        phone: "3rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
        drawline: {
          "0%": { strokeDashoffset: "600" },
          "100%": { strokeDashoffset: "0" },
        },
        pulsemint: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: ".55" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        floaty: "floaty 4s ease-in-out infinite",
        drawline: "drawline 2.4s ease-out forwards",
        pulsemint: "pulsemint 1.8s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        rise: "rise .6s ease-out both",
      },
    },
  },
  plugins: [animate],
};
