# Migrate the dashboard to Linen — Soft Pastel / Modern Startup

This guide swaps the current "Quarto" editorial theme (warm ivory + Fraunces serif + amber accent) for **Linen** — a soft pastel palette with sage green primary, terracotta accent, Onest sans throughout, and rounded soft-shadow cards. Linear / Cron / Notion family.

The dashboard already uses shadcn/ui with HSL CSS variables, so most of the work is **redefining tokens** in one file. No component-by-component rewrite required for the bulk of the UI.

---

## 1 · Design tokens

### Palette

| Role | Hex | HSL (for shadcn) | Notes |
|---|---|---|---|
| Canvas (background) | `#fffbf5` | `36 100% 98%` | Warm off-white |
| Canvas-2 (sidebar / hover) | `#f6efe2` | `40 50% 93%` | Slightly deeper paper |
| Canvas-3 (rail / track) | `#ede4d2` | `38 38% 88%` | For aging-bar tracks etc. |
| Sage (primary) | `#5a7a5a` | `120 15% 42%` | Buttons, active nav, links |
| Sage-light (hover) | `#87a187` | `120 14% 58%` | Primary hover |
| Sage-tint (success bg) | `#dde6dd` | `120 13% 88%` | Success pills, positive aging |
| Terra (destructive / aging accent) | `#c47a4f` | `21 50% 54%` | Outstanding KPI, 90+ debtors, errors |
| Terra-tint (warning bg) | `#f3e3d8` | `24 50% 90%` | Terra pills |
| Ink (foreground) | `#2a2620` | `36 14% 14%` | Body copy |
| Muted | `#8b7d6a` | `33 14% 48%` | Captions, placeholders |
| Line | `rgba(90,122,90,0.08)` | — | Card borders, table rules |

### Typography

- **Single font** for everything: **Onest** (Google Fonts).
- Drop Fraunces (display) and JetBrains Mono (data) — Onest with `font-feature-settings: "tnum" on` handles tabular numbers cleanly.

### Shape

- Border radius: bump from `0.375rem` to `0.75rem` (cards) / `999px` (pills).
- Soft shadow utility: `0 1px 0 rgba(90,122,90,0.04), 0 6px 18px -8px rgba(90,122,90,0.10)`.
- **Drop the paper grain** texture (`--grain` SVG, `body::before`).

---

## 2 · Files to change

| File | What |
|---|---|
| `frontend/index.html` | Replace Google Fonts `<link>` with Onest only |
| `frontend/src/styles/globals.css` | Redefine `:root` and `.dark` token blocks (whole rewrite of the `@layer base` section) |
| `frontend/tailwind.config.js` | Set Onest as default sans, drop display/mono families |
| `frontend/src/components/Sidebar.tsx` | Remove the `border-2 border-[var(--ink)]` style if any was hard-coded; rely on tokens |
| `frontend/src/components/MetricCard.tsx` (and any KPI components) | Audit for hard-coded colors |
| `frontend/src/components/AlertsBell.tsx`, `Drawer.tsx`, `Modal.tsx` | Audit for hard-coded shadows / borders |

Most other components (Card, Button, Badge, Input, Table from shadcn) inherit from the CSS variables and need **no source changes** — they pick up the new palette automatically.

---

## 3 · The actual edits

### 3a · `frontend/index.html` — swap the fonts link

Replace the existing `<link href="https://fonts.googleapis.com/...">` with:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
```

### 3b · `frontend/src/styles/globals.css`

Replace the entire `@layer base { :root { … } .dark { … } }` block with:

```css
@layer base {
  :root {
    /* Linen — sage primary, terra accent, soft cream canvas */
    --background: 36 100% 98%;
    --foreground: 36 14% 14%;
    --card: 0 0% 100%;
    --card-foreground: 36 14% 14%;
    --popover: 0 0% 100%;
    --popover-foreground: 36 14% 14%;

    --primary: 120 15% 42%;
    --primary-foreground: 36 100% 98%;

    --secondary: 40 50% 93%;
    --secondary-foreground: 36 14% 14%;

    --muted: 40 50% 93%;
    --muted-foreground: 33 14% 48%;

    --accent: 120 13% 88%;
    --accent-foreground: 120 15% 32%;

    --destructive: 21 50% 54%;
    --destructive-foreground: 36 100% 98%;

    --border: 120 15% 88%;
    --input: 40 50% 93%;
    --ring: 120 15% 42%;

    --radius: 0.75rem;

    /* Charts — sage primary, terra warning, then natural earth tones */
    --chart-1: 120 15% 42%;   /* sage */
    --chart-2: 21 50% 54%;    /* terra */
    --chart-3: 40 60% 60%;    /* honey */
    --chart-4: 200 25% 55%;   /* dusty blue */
    --chart-5: 340 30% 60%;   /* dusty rose */

    /* Sidebar — slightly warmer than canvas, no border highlight */
    --sidebar-background: 40 50% 96%;
    --sidebar-foreground: 36 14% 18%;
    --sidebar-primary: 120 15% 42%;
    --sidebar-primary-foreground: 36 100% 98%;
    --sidebar-accent: 40 50% 90%;
    --sidebar-accent-foreground: 120 15% 32%;
    --sidebar-border: 120 15% 90%;
    --sidebar-ring: 120 15% 42%;

    --font-sans: "Onest", ui-sans-serif, system-ui, sans-serif;
    --font-display: "Onest", ui-sans-serif, system-ui, sans-serif;
    --font-mono: "Onest", ui-sans-serif, system-ui, sans-serif;
  }

  .dark {
    /* Linen dark — deep mossy ink + softer sage accent */
    --background: 36 14% 8%;
    --foreground: 36 30% 92%;
    --card: 36 14% 11%;
    --card-foreground: 36 30% 92%;
    --popover: 36 14% 11%;
    --popover-foreground: 36 30% 92%;

    --primary: 120 22% 62%;
    --primary-foreground: 36 14% 8%;

    --secondary: 36 10% 16%;
    --secondary-foreground: 36 30% 92%;

    --muted: 36 10% 14%;
    --muted-foreground: 36 12% 62%;

    --accent: 36 10% 18%;
    --accent-foreground: 120 22% 72%;

    --destructive: 21 60% 60%;
    --destructive-foreground: 36 14% 8%;

    --border: 36 10% 18%;
    --input: 36 10% 18%;
    --ring: 120 22% 62%;

    --chart-1: 120 22% 62%;
    --chart-2: 21 60% 60%;
    --chart-3: 40 60% 60%;
    --chart-4: 200 30% 65%;
    --chart-5: 340 35% 65%;

    --sidebar-background: 36 16% 6%;
    --sidebar-foreground: 36 18% 80%;
    --sidebar-primary: 120 22% 62%;
    --sidebar-primary-foreground: 36 14% 8%;
    --sidebar-accent: 36 10% 14%;
    --sidebar-accent-foreground: 120 22% 72%;
    --sidebar-border: 36 10% 14%;
    --sidebar-ring: 120 22% 62%;
  }
}
```

Then **remove** the `body::before { background-image: var(--grain); … }` rule and any `.grain` utility — Linen has no paper texture.

### 3c · `frontend/tailwind.config.js`

Inside `theme.extend.fontFamily`, set:

```js
fontFamily: {
  sans: ['Onest', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  display: ['Onest', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  mono: ['Onest', 'ui-sans-serif', 'system-ui', 'sans-serif'],
},
```

In `theme.extend.boxShadow`, add:

```js
boxShadow: {
  // existing entries…
  soft: '0 1px 0 rgba(90,122,90,0.04), 0 6px 18px -8px rgba(90,122,90,0.10)',
},
```

so cards can use `className="shadow-soft"` instead of inline styles.

### 3d · Audit hard-coded colors (one grep, one pass)

Run from `frontend/src/`:

```bash
grep -rn "Fraunces\|JetBrains Mono\|--grain\|grain\|font-display\|font-mono" frontend/src --include='*.tsx' --include='*.css'
```

Anywhere `font-display` is used in JSX (`className="font-display"`), it's now identical to `font-sans` — no functional break, but you can leave or remove. `font-mono` was used for tabular numbers; with Onest's `tnum` feature on, those should switch to `font-sans num-tabular` (using `font-variant-numeric: tabular-nums`). Add a Tailwind plugin or utility:

```css
.num-tabular { font-variant-numeric: tabular-nums; }
```

then replace `font-mono` with `num-tabular` in MetricCard, table cells, etc.

### 3e · Pills / badges

shadcn's `Badge` component supports variants. Linen uses **rounded-full pills with tinted backgrounds**, not the solid-color shadcn default. Edit `frontend/src/components/ui/badge.tsx` (if it exists — shadcn's standard location) variants to:

```ts
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        sage: "bg-accent text-accent-foreground",                // success / paid
        terra: "bg-[hsl(24,50%,90%)] text-[hsl(21,50%,40%)]",     // overdue / 90+
        warning: "bg-[hsl(45,80%,90%)] text-[hsl(35,60%,30%)]",   // aging / pending
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)
```

### 3f · Optional: decorative blobs on dashboard

The Linen mockup had soft sage / terra blobs blurred behind the dashboard. Add to `pages/Dashboard.tsx` or `Layout.tsx` as an absolutely-positioned `<div>` set behind everything:

```tsx
{/* Linen ambience — fixed soft blobs */}
<div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
  <div className="absolute -top-24 right-[-100px] w-[500px] h-[500px] rounded-full bg-[hsl(120,14%,58%)] opacity-30 blur-3xl" />
  <div className="absolute bottom-40 left-[-100px] w-[400px] h-[400px] rounded-full bg-[hsl(21,50%,54%)] opacity-15 blur-3xl" />
</div>
```

Skip this if it feels too "marketing site" for a daily ops tool.

---

## 4 · Rollout order (so nothing breaks)

Do these as **one commit per step** so any visual regression is easy to bisect:

1. **Token swap** — `globals.css` whole rewrite. Most of the app picks up the new palette here. Verify dashboard, login, data table, drawer all render and are usable.
2. **Font swap** — `index.html` + `tailwind.config.js`. Visual change is the typeface only.
3. **Drop grain** — remove `body::before` rule and the `--grain` variable.
4. **Badge variants** — update `badge.tsx` and use the new variants in DataTable cells (direction pill, aging pill).
5. **`font-mono` → `num-tabular`** — search-and-replace across `MetricCard.tsx`, `DataTable.tsx`, anywhere numbers render. ~20 sites max.
6. **Optional blobs** — add only after the rest looks right.
7. **Bump Sidebar polish** — make the active-link state use the new sage, drop any hard-coded oxblood/amber that was theme-specific.

Each step should compile and ship independently. If step 1 looks 90% right, you're done — the rest is polish.

---

## 5 · Verification

After each step:

```bash
cd frontend && npm run build   # type-check + bundle
```

Then deploy to VPS (the existing flow):

```bash
ssh 51.195.110.155 'sudo -u smartup-etl bash -c "cd /opt/dashboard-kanzec && git pull && cd frontend && npm run build" && sudo systemctl restart smartup-dashboard-api.service'
```

Hard-refresh https://kanzec.ilhom.work and walk these pages:

- `/login` — sage primary button, soft form fields
- `/dashboard` — KPI cards with soft shadow + rounded corners, pills are tinted-bg rounded-full
- `/data/orders` — table with hover rows, pagination buttons sage when active
- `/collection/worklist` — drawer header / log-contact form / aging bars use sage + terra correctly
- Toggle dark mode — confirm sage shifts to the lighter `120 22% 62%` and bg goes to mossy ink

If a chart still shows the old amber primary, check that the chart component reads `var(--chart-1)` not a hard-coded color.

---

## 6 · What you keep from the current build

- All routing, scope guard, auth, alerts plumbing stays as-is.
- All data tables, queries, DataViewer, AdminUsers, AdminAudit pages stay as-is — they read from CSS variables and re-paint automatically.
- The component library structure (`components/ui/*` from shadcn, `components/*` for domain) stays as-is.
- i18n locale files stay as-is.

This is purely a re-skin: theme tokens, fonts, one badge component, optional decorative layer. ~6 files touched, 0 logic changes.
