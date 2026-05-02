# Copying the DashboardVPS frontend into dashboard-kanzec

Source: `C:\Users\Ilhom\Downloads\Projects\DashboardVPS\frontend\`
Target: `c:\Users\Ilhom\Downloads\Projects\dashboard-kanzec\frontend\`

The DashboardVPS frontend is a React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui app talking to a FastAPI backend on port `:8000` with a Bearer JWT in `localStorage`. The kanzec backend is similar in shape but differs in three load-bearing ways:

1. **Port**: kanzec backend runs on `127.0.0.1:8081`, not `:8000`.
2. **Auth model**: kanzec uses **session cookies** (set by `/api/auth/login`), not `Authorization: Bearer …` from `localStorage`. The interceptor that injects `dilmuss_token` must be removed.
3. **Routes & domain language**: completely different endpoints (debt/sales/payments/comparison/dayslice/ops/etc., Uzbek-first IA), different roles (`admin`/`operator`/`viewer` with `scope_rooms`), different reports.

So we are **lifting the scaffolding** (Vite config, Tailwind v4 setup, shadcn/ui wiring, query client, layout, theme/language plumbing, i18n bootstrap, providers) and **discarding the pages, hooks, and API client logic** specific to DILMUSS.

---

## Stack you'll get

- React 19, TypeScript ~5.9, Vite 7
- Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.js`; tokens declared via `@theme` in `index.css`)
- shadcn/ui components in `src/components/ui/` (badge, button, card, select, separator, skeleton, table, tooltip)
- TanStack Query 5 + persist-client (localStorage-backed)
- React Router v7
- axios, lucide-react, plotly.js + react-plotly.js, xlsx + xlsx-js-style, jspdf, html2canvas, html-to-image
- i18next + react-i18next + browser language detector
- `@` → `./src` path alias

---

## Step 1 — copy the scaffolding files

From `DashboardVPS/frontend/` → `dashboard-kanzec/frontend/`, copy:

```
index.html
package.json
package-lock.json
tsconfig.json
tsconfig.app.json
tsconfig.node.json
vite.config.ts
eslint.config.js
components.json        # shadcn/ui config
public/                # favicon, manifest.json, sw.js (delete sw.js if not building a PWA yet)
```

**Do NOT copy** `node_modules/`, `Dockerfile`, `nginx.conf`, `README.md`, or `.env*` — kanzec has its own deploy story (no Docker, nginx is managed at `/etc/nginx/sites-available/kanzec.ilhom.work` on the VPS).

After copying, edit `vite.config.ts` to point the dev proxy at kanzec's backend port:

```ts
server: {
  proxy: {
    '/api': 'http://localhost:8081',   // was :8000 in DashboardVPS
  },
},
```

Edit `package.json` `name` from `frontend` to `dashboard-kanzec-frontend` (cosmetic). Strip `xlsx-js-style`/`jspdf*`/`html2canvas`/`html-to-image`/`plotly.js`/`react-plotly.js` from `dependencies` if you don't need them for the first cut — they're heavy and add ~3 MB to the bundle. You can re-add later when an analytics page actually uses them.

---

## Step 2 — copy the source skeleton

From `DashboardVPS/frontend/src/` copy these files **as-is**:

```
src/main.tsx
src/index.css           # Tailwind v4 + theme tokens (will be replaced with The Almanac palette later)
src/App.css             # only if non-empty
src/i18n.ts             # i18next bootstrap
src/lib/utils.ts        # cn() helper used by every shadcn component
src/components/ui/*     # shadcn primitives
src/charts/PlotlyChart.tsx   # only if you kept plotly in deps
```

Copy these but **expect to rewrite contents**:

```
src/App.tsx             # rip out DILMUSS routes; build kanzec route map (see Step 5)
src/api/queryClient.ts  # rename PERSIST_CACHE_KEY: 'dilmuss-rq-cache' → 'kanzec-rq-cache'
src/api/client.ts       # rewrite — see Step 3, this one's the biggest behavioral change
src/api/hooks.ts        # delete every hook; add kanzec hooks one-by-one as pages need them
src/context/AuthContext.tsx   # rewrite — see Step 4
src/context/DateContext.tsx   # likely usable as-is
src/context/ThemeContext.tsx  # likely usable as-is
src/context/LanguageContext.tsx # adjust the locale list if you only want uz/ru/en (it already is)
src/components/layout/Layout.tsx   # keep the shell; the sidebar inside it gets rewritten
src/components/layout/Sidebar.tsx  # rewrite with the kanzec NAV_GROUPS
src/components/{KpiCard,EmptyState,ErrorState,DateRangePicker,ConfirmDialog,
                ExplainerBlock,GlobalLoadingBar}.tsx   # generic, keep
src/components/InstallPrompt.tsx   # PWA banner — drop unless you wire up the SW
src/locales/{en,ru,uz}.json   # KEEP THE FILE STRUCTURE, replace all DILMUSS keys with kanzec ones
```

**Do NOT copy** these — they are DILMUSS-specific and have no analogue here:

```
src/pages/*                          # all 24 pages
src/components/performance/*         # performance-page-specific
src/api/hooks.ts                     # every hook is DILMUSS-domain
src/lib/exportExcel.ts               # styled-xlsx helper, only if you need it
src/assets/*                         # logos etc. — re-derive
```

---

## Step 3 — rewrite `src/api/client.ts` for cookie auth

Kanzec's backend reads auth from a session cookie set on `/api/auth/login`. The DashboardVPS interceptor that injects `Authorization: Bearer <token>` from `localStorage` must be **removed**. Replace the whole file with something like:

```ts
import axios from 'axios'
import { clearAllCaches } from '@/api/queryClient'

const baseURL = import.meta.env.VITE_API_URL || '/api'
const api = axios.create({
  baseURL,
  withCredentials: true,   // critical: cookie-based auth
})

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      clearAllCaches()
      window.dispatchEvent(new Event('auth-unauthorized'))
    }
    return Promise.reject(error)
  },
)

export default api
```

Drop the whole demo-mode `scrambleData` block — it's a DashboardVPS feature for hiding numbers in screenshots.

For dev to work without CORS issues, the Vite proxy in step 1 forwards `/api` → `:8081`. Cookies on the proxied path will be same-origin, so `withCredentials: true` is enough.

For production, the kanzec backend already sets `KANZEC_COOKIE_DOMAIN=kanzec.ilhom.work` and `KANZEC_ALLOWED_ORIGINS=https://kanzec.ilhom.work`, so no extra config needed when frontend and backend share the domain.

---

## Step 4 — rewrite `src/context/AuthContext.tsx`

DashboardVPS stores a JWT in `localStorage('dilmuss_token')` and calls `GET /users/me`. Kanzec stores nothing in `localStorage`, hits `GET /api/auth/me`, and trusts the cookie. Sketch:

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import api from '@/api/client'
import { clearAllCaches } from '@/api/queryClient'

export type Role = 'admin' | 'operator' | 'viewer'

export type UserInfo = {
  id: number
  username: string
  role: Role
  scope_rooms: string[]
}

type AuthContextType = {
  user: UserInfo | null
  isAuthenticated: boolean
  isLoading: boolean
  login(username: string, password: string): Promise<void>
  logout(): Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.get('/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))

    const onUnauth = () => setUser(null)
    window.addEventListener('auth-unauthorized', onUnauth)
    return () => window.removeEventListener('auth-unauthorized', onUnauth)
  }, [])

  const login = async (username: string, password: string) => {
    await api.post('/auth/login', { username, password })
    const me = await api.get('/auth/me')
    setUser(me.data)
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    setUser(null)
    clearAllCaches()
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

Verify the actual login/logout endpoint paths and request bodies against `backend/app/auth/router.py` before wiring this up — `username`/`password` field names and whether logout exists may differ.

---

## Step 5 — rewrite `src/App.tsx` route map

DashboardVPS has 24+ pages organized around DILMUSS retail BI; kanzec has a different IA. The wiped frontend's planned route map (preserved in CLAUDE.md / project memory) was:

```
/login
/dashboard
/dayslice                       (admin only)
/data/orders
/data/payments
/data/legal-persons
/collection/worklist
/collection/debt/client/:personId
/analytics/sales
/analytics/payments
/analytics/returns
/analytics/comparison
/ops                            (admin only)
/admin/alerts
/admin/users                    (admin only)
/admin/audit                    (admin only)
```

Replace `PermissionRoute` with kanzec's role logic. DashboardVPS gates by `user.allowed_reports.includes(location.pathname) || user.is_admin`; kanzec gates by `user.role === 'admin'` for admin-only pages and otherwise allows any authenticated user (refine per page as you implement them). `scope_rooms` filtering happens server-side, so the frontend just needs the role check.

---

## Step 6 — copy the design verbatim

**Bring the DashboardVPS aesthetic over as-is.** Don't substitute "The Almanac" tokens. The gold-on-warm-paper visual identity is the point: Playfair Display display face, DM Sans body, gold (`#D4A843`) accent, cream-paper background (`#FAF8F5`), saddle-brown text (`#2C2418`), gold-left-rail active nav, gradient pills, no-shadow elevation, sticky-header premium tables.

Copy `src/index.css` from DashboardVPS into kanzec **byte-for-byte**. Every token, every keyframe, every utility class (`.glass-card`, `.kpi-glow`, `.nav-active`, `.section-title`, `.month-btn`, `.premium-table`, `.toggle-pill`, `.action-badge`, `.perf-section`, `.perf-kpi`, the health ring, the shimmer skeleton, the gold scrollbar) carries weight in the look. Stripping any one of them makes the dashboard look generic.

Also copy `index.html` and keep these load-bearing bits:

```html
<meta name="theme-color" content="#D4A843" />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
```

Change only the brand-name strings:

- `<title>DILMUSS Analytics</title>` → `<title>Kanzec Operations</title>`
- `<meta name="description" content="DILMUSS retail analytics ...">` → kanzec-appropriate copy
- `<meta name="apple-mobile-web-app-title" content="DILMUSS" />` → `"Kanzec"`
- The `DILMUSS` text in `Layout.tsx`'s mobile header → `Kanzec`
- Favicon files in `public/` (`dilmuss.svg`, `apple-touch-icon.png`, `favicon-*.png`) — replace later or use a kanzec-branded vermilion-on-cream `K`

Keep the gold (`#D4A843`) — don't try to retint to vermilion. The whole CSS uses the gold + brown + cream triad with hairline gradients (`linear-gradient(135deg, rgba(212, 168, 67, 0.15), rgba(212, 168, 67, 0.05))` for active nav, `linear-gradient(180deg, #D4A843, #B8922E)` for accent rails, `linear-gradient(135deg, #D4A843, #B8922E)` for toggle sliders). Shifting the hue mid-copy means relabeling 30+ rgba literals, which is exactly the kind of design-debt bug that makes a "redesign" look amateurish.

A full design-fidelity guide — every token, font weight, animation, micro-pattern — is in **Appendix A** below. Use it as the checklist when reviewing the copy.

---

## Step 7 — i18n keys

Keep `i18n.ts` as-is. Replace the contents of `src/locales/{en,ru,uz}.json` with kanzec's namespaces:

```
nav.* (group_main, group_strategic, group_data, group_collection,
       group_analytics, group_operations, group_admin, plus item labels)
common.*  (loading, error, accessDenied, etc.)
roles.*  (admin, operator, viewer)
dashboard.* debt.* comparison.* dayslice.* sales.*
payments.* returns.* ops.* admin.*
```

Default locale is `uz`. The DashboardVPS bootstrap already supports three locales — just swap the catalog content.

---

## Step 8 — remove DashboardVPS-specific cruft

After copying, search for and remove:

- `dilmuss_token` / `dilmuss_demo` / `dilmuss-rq-cache` (rename to `kanzec_*`)
- `VITE_API_URL` references — kanzec's prod URL is `https://kanzec.ilhom.work`, dev uses the proxy; keep the env var as an escape hatch but no `.env` files are required
- `manifest.json` `name`/`short_name`/`description` strings — keep `theme_color: #D4A843`
- `sw.js` if you're not building a PWA (keep `index.html` clean of SW registration)
- The `InstallPrompt` component and its mount in `App.tsx`

---

## Step 9 — install + smoke test

```powershell
cd c:\Users\Ilhom\Downloads\Projects\dashboard-kanzec\frontend
npm install
npm run dev
```

In a separate shell, the backend must be running on `:8081`:

```powershell
cd c:\Users\Ilhom\Downloads\Projects\dashboard-kanzec\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8081
```

Hit `http://localhost:5173`, attempt login with admin creds, confirm `/api/auth/me` returns `{ role, scope_rooms }`, and that the cookie is set + sent on subsequent requests (DevTools → Application → Cookies).

`npm run build` should pass (`tsc -b && vite build`). Once it does, the deploy script on the VPS will pick up `frontend/package.json` automatically and run the build.

---

## Step 10 — update CLAUDE.md and project memory

Once the frontend exists:

- Remove the "backend-only project" section from `CLAUDE.md`; reintroduce the API contract table as the ongoing implementation list.
- Update [project_no_frontend.md](C:/Users/Ilhom/.claude/projects/c--Users-Ilhom-Downloads-Projects-dashboard-kanzec/memory/project_no_frontend.md) — either delete it or rewrite it as `project_frontend_stack.md` recording the chosen stack (React 19 + Vite + Tailwind v4 + shadcn/ui, lifted from DashboardVPS).

---

## Step 11 — copy the components

Lift the entire component library from DashboardVPS. Below is every file and what to do with it. The categories are:

- **Verbatim** — copy as-is. No code change.
- **Verbatim + brand strings** — copy as-is, swap `DILMUSS` text and one or two strings.
- **Adapt (small)** — same logic, change a few prop names or i18n keys.
- **Adapt (large)** — same shape, but rewrite the role/permission logic for kanzec's `role`/`scope_rooms` model.
- **Drop** — DashboardVPS-specific, doesn't apply to kanzec.

### `src/components/ui/` — shadcn primitives (verbatim)

All eight files are stock shadcn/ui generated against the project's `components.json`. They reference CSS variables (`bg-card`, `border-border`, `text-foreground`, etc.) that already match — copy without touching:

| File | Lines | Notes |
|---|---|---|
| `badge.tsx` | 48 | `cva` variants: default, secondary, destructive, outline |
| `button.tsx` | 64 | `cva` variants: default, destructive, outline, secondary, ghost, link |
| `card.tsx` | 92 | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` |
| `select.tsx` | 190 | Radix-backed select with kanzec-styled trigger/content |
| `separator.tsx` | 26 | Radix Separator wrapper |
| `skeleton.tsx` | 13 | Plain `bg-accent` pulse — **prefer `.shimmer-skeleton` over this** for the gold sweep |
| `table.tsx` | 114 | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` |
| `tooltip.tsx` | 57 | Radix Tooltip with provider wrapper |

Make sure `radix-ui` and `class-variance-authority` are in `package.json` (they are, from step 1). Don't try to substitute these with `@radix-ui/react-*` packages individually — DashboardVPS uses the meta-package `radix-ui` import, and the shadcn files import accordingly.

### `src/components/` — generic chrome (mostly verbatim)

| File | Lines | Action | Notes |
|---|---|---|---|
| `KpiCard.tsx` | 65 | **Verbatim** | The signature card: top gold rail (`.kpi-glow`), Playfair Display value with `animate-count-up`, optional lucide icon in a tinted square, optional sub-caption. Color prop accepts a Tailwind text class (`text-emerald-500`, `text-red-500`, etc.) and the `--glow-color` CSS var resolves to a matching hex. Use everywhere a number lives. |
| `EmptyState.tsx` | 21 | **Verbatim + i18n** | `Inbox` icon in a circle, title + description. Uses `t('common.noData')` — make sure that key exists in kanzec's locale files. |
| `ErrorState.tsx` | 29 | **Verbatim + i18n** | `AlertTriangle` in a red-tinted circle, retry button. Uses `t('common.error')`, `t('errors.tryAgainHint')`, `t('common.retry')`. |
| `ConfirmDialog.tsx` | 68 | **Verbatim + i18n** | Modal with backdrop blur, two-tone (`danger`/`warning`) variants, focus-trap on cancel, Escape to close. Uses `t('common.cancel')`, `t('common.confirm')`. Don't replace with shadcn's `Dialog` — this one matches the aesthetic. |
| `ExplainerBlock.tsx` | 52 | **Verbatim** | Collapsible "what does this metric mean" block with `Info` icon, animated grid-rows expansion. Use it under every analytics page header. Items support inline HTML (`dangerouslySetInnerHTML`) for bolding. |
| `GlobalLoadingBar.tsx` | 26 | **Verbatim** | Top-edge `0.5` bar that animates left-to-right while `useIsFetching() > 0`. Uses `bg-primary` (the `#9E7B2F` gold-brown) — color survives the copy without change. Already mounted in `Layout.tsx`. |
| `DateRangePicker.tsx` | 169 | **Adapt (small)** | Preset pills + month-grid + custom-range input. Uses `useDateRange()` from `DateContext`. Reads `t('dateRange.*')` keys — add those to kanzec's locale catalog. The hardcoded `MONTH_ABBRS` array is English-only (`'Jan', 'Feb', ...`) — replace with i18n if you want Uzbek month abbreviations (`Yan, Fev, Mar, Apr, May, Iyn, Iyl, Avg, Sen, Okt, Noy, Dek`). |
| `InstallPrompt.tsx` | 167 | **Drop** | iOS/Android PWA install banner. Skip until you actually wire up `sw.js` + `manifest.json`. |

### `src/components/layout/` — shell

| File | Lines | Action | Notes |
|---|---|---|---|
| `Layout.tsx` | 64 | **Verbatim + brand string** | Sidebar drawer + main pane, mobile header with `DILMUSS` brand mark (change to `Kanzec`), `/` keyboard shortcut to open drawer, `Escape` to close. Mounts `<GlobalLoadingBar />`, `<Sidebar />`, `<Outlet />`. |
| `Sidebar.tsx` | 223 | **Adapt (large)** | See subsection below — biggest rewrite in the copy. |

#### `Sidebar.tsx` — the role-gate rewrite

DashboardVPS gates each nav item with `user?.is_admin || user?.allowed_reports?.includes(item.to)`. Kanzec doesn't have `allowed_reports`; instead it has `role` (`admin`/`operator`/`viewer`) and `scope_rooms[]`. Replace the filter (around line 105) with:

```tsx
type NavItem = { to: string; labelKey: string; icon: React.ElementType; adminOnly?: boolean }

const filteredGroups = NAV_GROUPS
  .map(group => ({
    ...group,
    items: group.items.filter(item =>
      !item.adminOnly || user?.role === 'admin'
    ),
  }))
  .filter(group => group.items.length > 0)
```

Then mark `dayslice`, `ops`, `users`, and `audit` as `adminOnly: true` in `NAV_GROUPS`. Operators and viewers see the rest; backend `scope_rooms` filtering handles per-row visibility — no frontend gating needed for that.

Other Sidebar adaptations:

- Replace `DILMUSS` brand mark with `Kanzec` (line ~121) — keep Playfair Display.
- Change the `<aside>` width from `w-56` if you want more room for Uzbek labels — they tend to run longer.
- Drop the **demo mode toggle block** (lines ~192-210). It reads `dilmuss_demo` from `localStorage` and reloads the page — DashboardVPS-only feature.
- Rewrite the **admin panel link** (lines ~138-152). DashboardVPS has a single `/admin` page; kanzec has three (`/admin/alerts`, `/admin/users`, `/admin/audit`). Either drop the standalone admin link entirely (the three pages are already in the nav groups) or keep one bottom-pinned link to `/admin/users` as the de-facto admin landing.
- Update the **user info card** (lines ~158-168). Show `user.role` translated via `t('roles.<role>')`, not the boolean admin/viewer split.
- Keep the **language switcher** (EN/RU/UZ pills) — already supports three locales. Default selection should be UZ.
- Keep the **sign-out button** with `LogOut` icon, red-tinted hover — verbatim.

The 3-language footer pill toggle uses inline gold `bg-[#D4A843] text-black` for the active state — that arbitrary hex literal repeats a few times; leave it (don't refactor to a CSS variable, the consistency check in step 6 specifies this is fine).

### `src/components/performance/` — Performance page widgets

These are all designed for DashboardVPS's `/performance` page (a multi-section retail performance scorecard). They are **highly tailored** — they assume specific data shapes from `useShopRanking`, `useDimensionWaterfall`, `useShopAlerts`, etc. **Don't blanket-copy them.**

| File | Lines | Action | Notes |
|---|---|---|---|
| `CollapsibleSection.tsx` | 59 | **Verbatim** | Generic wrapper using `.perf-section` styling. The icon-pill header + gold left rail + collapse animation. Reusable across kanzec analytics pages. |
| `KpiStrip.tsx` | 117 | **Adapt as a pattern** | A row of 4 large KPI cards with a "primary" emphasis. Useful as a template — copy the JSX shape, replace data props with kanzec equivalents (debt overview, payments overview, sales scoreboard). |
| `AlertBanner.tsx` | 123 | **Adapt as a pattern** | The `.perf-alert` card with `pulse-dot` indicator. Useful for the `/admin/alerts` page — same component shape, different data. |
| `RevenueWaterfall.tsx` | 108 | **Drop or defer** | Plotly waterfall chart specific to dimension-level revenue decomposition. Recreate later for kanzec's comparison/sales pages with the same Plotly + theme. |
| `TrendChart.tsx` | 74 | **Adapt** | Generic line/area trend chart, very thin Plotly wrapper. Copy and use under any time-series block. |
| `CategoryPnL.tsx` | 125 | **Drop** | DILMUSS-specific category P&L breakdown. |
| `CompetitiveRanking.tsx` | 131 | **Drop** | DILMUSS shop-vs-shop ranking with `.perf-medal-{1,2,3}` styling. The `.perf-medal` CSS is reusable for kanzec sales-manager rankings later. |
| `ConversionFunnel.tsx` | 145 | **Drop** | DILMUSS retail conversion funnel (visitors → buyers). Doesn't apply. |
| `ShopQuadrant.tsx` | 96 | **Drop** | DILMUSS shop performance quadrant scatter. |
| `StaffSection.tsx` | 137 | **Drop** | DILMUSS staff performance block. |

**Recommendation:** copy `CollapsibleSection.tsx` and `KpiStrip.tsx` and `AlertBanner.tsx` and `TrendChart.tsx` into `src/components/performance/` (or rename the folder to `src/components/blocks/` since "performance" is DILMUSS framing). Skip the rest until you have a kanzec page that needs the same shape.

### `src/charts/PlotlyChart.tsx` — chart wrapper

**Verbatim.** A thin `react-plotly.js` wrapper that injects the theme tokens (cream paper for light, `#0F0F17` for dark, gold hover-label border `#D4A843`, DM Sans 11 px font). 52 lines. Use this for every chart instead of raw `<Plot>` so the theme stays consistent. The `dark` prop must be wired to `useTheme()` at the call site:

```tsx
const { theme } = useTheme()
<PlotlyChart data={data} dark={theme === 'dark'} />
```

### `src/lib/utils.ts` — verbatim

Single-file `cn()` helper using `clsx` + `tailwind-merge`. Required by every shadcn primitive.

### `src/lib/exportExcel.ts` — defer

Styled XLSX export helper using `xlsx-js-style` (gold headers, alternating rows, borders). Useful eventually — kanzec has Excel export endpoints (`/api/payments/export/payers.xlsx`) that the backend already serves directly, so the frontend version is a backup not a primary path. Copy when you need client-side Excel generation, not before.

### Component-copy quick command

From the kanzec repo root, you can lift the bulk in one shot (PowerShell):

```powershell
$src = "C:\Users\Ilhom\Downloads\Projects\DashboardVPS\frontend\src"
$dst = "C:\Users\Ilhom\Downloads\Projects\dashboard-kanzec\frontend\src"

# UI primitives — verbatim
Copy-Item -Recurse "$src\components\ui" "$dst\components\ui"

# Generic chrome — verbatim (then adapt brand strings + i18n keys)
@('KpiCard.tsx','EmptyState.tsx','ErrorState.tsx','ConfirmDialog.tsx',
  'ExplainerBlock.tsx','GlobalLoadingBar.tsx','DateRangePicker.tsx') | ForEach-Object {
  Copy-Item "$src\components\$_" "$dst\components\$_"
}

# Layout — verbatim, then rewrite Sidebar role gate
Copy-Item -Recurse "$src\components\layout" "$dst\components\layout"

# Reusable performance blocks
New-Item -ItemType Directory -Force "$dst\components\blocks"
@('CollapsibleSection.tsx','KpiStrip.tsx','AlertBanner.tsx','TrendChart.tsx') | ForEach-Object {
  Copy-Item "$src\components\performance\$_" "$dst\components\blocks\$_"
}

# Charts wrapper + utils
Copy-Item -Recurse "$src\charts" "$dst\charts"
Copy-Item "$src\lib\utils.ts" "$dst\lib\utils.ts"
```

After running, do a project-wide search for `dilmuss` (case-insensitive) — anything left is a brand string or feature flag that needs renaming or removing.

### Post-copy fix list

After copying, these will fail to compile until you rewrite them. Address in order:

1. **`Sidebar.tsx`** — rewrite role gate (see above), drop demo-mode block, swap brand string, replace NAV_GROUPS with kanzec's.
2. **`DateRangePicker.tsx`** — make sure `useDateRange`, `getMonthRange`, `getPresets` exist in your `DateContext.tsx` (DashboardVPS exports them; kanzec needs the same).
3. **All copied components reference `t('common.*')` and `t('errors.*')` keys** — add these to your locale catalog before they crash.
4. **`KpiCard.tsx`** — no changes needed, but its `delay` prop maps to `.animate-fade-up-delay-{1..6}`. If you put more than 6 KPIs in a row, the stagger caps at delay-6. That's fine — adding more delay classes in `index.css` if needed is a one-line addition.
5. **`PlotlyChart.tsx`** — make sure `react-plotly.js` and `plotly.js` are in `package.json`. Heavy deps (~3 MB minified). If you stripped them in step 1, re-add them only when you build the first chart.

### Component dependency graph

So you know what depends on what before deleting anything:

```
Layout.tsx ─── Sidebar.tsx ─── (NavLink, useTheme, useAuth, useLang)
            └── GlobalLoadingBar.tsx ── useIsFetching

KpiCard.tsx ──── ui/card.tsx
DateRangePicker.tsx ──── DateContext.tsx, ui? (no — uses raw HTML)
ConfirmDialog.tsx ──── (i18next only)
ExplainerBlock.tsx ──── (lucide-react only)

PlotlyChart.tsx ──── react-plotly.js (heavy)

performance/CollapsibleSection.tsx ──── (lucide only)
performance/KpiStrip.tsx ──── KpiCard, CollapsibleSection
performance/AlertBanner.tsx ──── ui/badge
performance/TrendChart.tsx ──── PlotlyChart
```

If you don't ship Plotly in v1, the `PlotlyChart.tsx` and `TrendChart.tsx` files can sit on disk uncompiled — Vite tree-shakes unused entry points. But TypeScript will complain about missing `@types/react-plotly.js` until you install the dep. Either delete the files until needed or install the deps.

---

## Cheatsheet of differences

| Concern | DashboardVPS | Kanzec |
|---|---|---|
| Backend port | 8000 | **8081** |
| Auth | Bearer JWT in `localStorage('dilmuss_token')` | **Session cookie** (`withCredentials: true`) |
| `/me` endpoint | `GET /users/me` | `GET /auth/me` |
| Roles | `is_admin` + `allowed_reports[]` | `role: admin\|operator\|viewer` + `scope_rooms[]` |
| Default locale | en | **uz** |
| Brand color | gold `#D4A843` | **gold `#D4A843` (kept)** |
| Display font | Playfair Display | **Playfair Display (kept)** |
| Body font | DM Sans | **DM Sans (kept)** |
| Persist cache key | `dilmuss-rq-cache` | `kanzec-rq-cache` |
| Schema (backend) | `billz.*` | `smartup.*`, `smartup_rep.*` (read-only) + `app.*` (write) |
| Deploy unit | `dashboard-backend` (port 8000, user `ubuntu`) | `smartup-dashboard-api` (port 8081, user `smartup-etl`) |

---

# Appendix A — Design fidelity reference

This appendix is the design spec for the lifted look, distilled from `DashboardVPS/frontend/src/index.css` (820 lines) and the layout/sidebar components. **Match these exactly.** Where the original CSS uses a literal hex or rgba, copy the literal — don't replace with a token unless the token already exists.

## A.1 — Visual identity in one sentence

A warm, editorial, light-mode dashboard. Cream paper background, saddle-brown body text, antique-gold accents. Display copy in Playfair Display (a high-contrast didone serif) gives KPIs an almanac/magazine feel; UI chrome is in DM Sans (geometric humanist sans) for legibility. Elevation is communicated through hairline borders and warm-tinted hover states rather than drop shadows. The single bold accent is a 2 px gold rail on active surfaces (left edge of active nav, top edge of KPI cards, bottom of perf-grade cards).

## A.2 — Color system

Light mode (default) — the warm-paper palette:

| Role | Hex | Use |
|---|---|---|
| `--background` | `#FAF8F5` | page canvas |
| `--foreground` | `#2C2418` | body text, headings |
| `--card` | `#FFFFFF` | KPI cards, table surfaces |
| `--popover` | `#FFFFFF` | dropdowns, tooltips |
| `--primary` | `#9E7B2F` | primary buttons, links — a desaturated gold that reads on white |
| `--primary-foreground` | `#FFFFFF` | text on primary |
| `--secondary` | `#F3EDE4` | secondary surfaces, button backgrounds |
| `--muted` | `#F3EDE4` | input backgrounds |
| `--muted-foreground` | `#8A7D6B` | metadata, captions, axis labels |
| `--accent` | `#F0E9DD` | subtle hover surfaces |
| `--destructive` | `#DC4A4A` | warning/error states |
| `--border` | `#E6DFD3` | hairline dividers, card outlines |
| `--input` | `#F3EDE4` | input fields |
| `--ring` | `#B8922E` | focus rings — deeper gold |
| `--sidebar` | `#F5F1EB` | sidebar background — slightly darker than canvas |
| `--sidebar-foreground` | `#2C2418` | sidebar text |
| `--sidebar-primary` | `#9E7B2F` | active sidebar item color |
| `--sidebar-accent` | `#EDE7DC` | sidebar hover surface |
| `--sidebar-border` | `#E6DFD3` | sidebar divider |

Brand constants (used directly, not via tokens):

| Name | Hex | Where |
|---|---|---|
| Brand gold | `#D4A843` | `theme-color`, KPI top rails, gold-medal rank, toggle slider, scrollbar accent |
| Brand gold deep | `#B8922E` | gradient pair end, ring color in dark mode |
| Brand gold soft | `#F5D27A` | score-bar gradient end |
| Gold glow | `#D4A84340` | brand-glow overlay |

Chart palette (multi-series):

| | Light | Dark |
|---|---|---|
| chart-1 | `#B8922E` (deep gold) | `#D4A843` |
| chart-2 | `#1E8A5E` (forest) | `#34D399` (mint) |
| chart-3 | `#5B5FD6` (indigo) | `#818CF8` |
| chart-4 | `#C94E8A` (rose) | `#F472B6` |
| chart-5 | `#2A8EC5` (steel) | `#38BDF8` (sky) |

Status colors (used in `.action-badge.*`, `.transfer-card.capital-*`, sentiment text):

| Status | Hex |
|---|---|
| critical / negative | `#F87171` (coral) |
| urgent | `#FB923C` (amber) |
| warning / markdown | `#FBBF24` (saffron) |
| info / plan | `#60A5FA` (azure) |
| positive / monitor | `#34D399` (mint) |
| neutral | `var(--muted-foreground)` |

Dark mode is fully wired (every `:root` token has a `.dark` counterpart at lines 96-128 of `index.css`). Background flips to `#0A0A0F` (near-black with a violet tint), card to `#111118`, sidebar to `#08080C`. Brand gold stays `#D4A843` and gains a subtle glow on hover. Don't drop dark mode — it's the same theming, just different hex values, and `ThemeContext` already toggles it.

## A.3 — Typography

Two faces, both Google-served:

```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
```

- **Playfair Display** — display face. Used for `h1`, `h2`, `h3`, the `DILMUSS` brand mark, KPI value numerics (`.kpi-value`), `section-header-inv h3`. Weights: 400 / 600 / 700 / 800. Italic available but not used. Falls back to Georgia.
- **DM Sans** — body face. Everything else: nav labels, table cells, captions, buttons. Weights: 300 / 400 / 500 / 600 / 700. Falls back to system-ui.

Type scale (no formal scale; these are the literals that recur):

| Use | Size | Weight | Notes |
|---|---|---|---|
| Brand mark in sidebar / mobile header | inherits | 700 | Playfair Display |
| Page H1 | ~`text-2xl`/`text-3xl` | 700 | Playfair Display |
| KPI value (`perf-kpi-primary .kpi-value`) | `1.5rem` desktop / `1.25rem` mobile | 600 | Playfair Display, line-height 1.2 |
| Section header (`.section-header-inv h3`) | `16px` | 600 | Playfair Display |
| Body / nav item | `text-sm` (`14px`) | 400-500 | DM Sans |
| Section label (`.section-title`) | `0.6875rem` (`11px`) | 600 | DM Sans, `letter-spacing: 0.1em`, uppercase |
| Group label in sidebar | `10px` | 600 | DM Sans, uppercase, `tracking-wider` |
| Toggle pill button | `11px` | 600 | DM Sans, `letter-spacing: 0.02em` |
| Action badge | `10px` | 600 | DM Sans, uppercase, `letter-spacing: 0.03em` |
| Caption / metadata | `text-xs` (`12px`) | 400 | DM Sans, color `--muted-foreground` |

The capital-letter, wide-tracked `11px` section labels with a fade-line on the right (`linear-gradient(90deg, #E6DFD3, transparent)`) are a signature device — they appear above every grouped section. Don't drop them.

## A.4 — Layout shell

Two regions: a fixed-width sidebar on the left (drawer on mobile, fixed on desktop ≥ `md`) and a scrollable main pane on the right.

```
┌─────────────────────────────────────────────────────────────┐
│ ┌──────────┐                                                │
│ │ DILMUSS  │  GlobalLoadingBar (top, 2px)                   │
│ │          │                                                │
│ │ [GROUP]  │   <Outlet />                                   │
│ │  · item  │                                                │
│ │  · item  │   p-4 pt-20 md:p-6 lg:p-8 pb-20                │
│ │          │                                                │
│ │ [GROUP]  │                                                │
│ │  · item  │                                                │
│ │ ────     │                                                │
│ │ Theme/Lo │                                                │
│ └──────────┘                                                │
└─────────────────────────────────────────────────────────────┘
```

- Sidebar background: `var(--sidebar)` (`#F5F1EB`)
- Right border: `1px solid var(--sidebar-border)`
- Width: typical shadcn sidebar (~`w-60`/`w-64`); read the actual value from `Sidebar.tsx`
- Mobile: hidden by default, slides in (`translate-x-full` → `translate-x-0`, `transition-transform duration-300 ease-in-out`), backdrop `bg-black/50 backdrop-blur-sm`
- Mobile header: `border-b`, sidebar-tinted, brand mark in Playfair Display, hamburger toggle
- Keyboard shortcut: pressing `/` opens the sidebar drawer on mobile, `Esc` closes it (already in `Layout.tsx`)
- Main content: `overflow-y-auto`, padded `p-4 pt-20 md:p-6 lg:p-8 pb-20`. The `relative z-10` and `grain-overlay` class on the parent leave room for an optional film-grain background overlay — keep the class even if you don't ship the texture in v1.

`GlobalLoadingBar` is a thin gold bar at the top edge that animates while any TanStack Query is fetching. Keep it.

## A.5 — Sidebar nav (the gold-rail device)

Nav items are grouped under uppercase `10px` group labels with a chevron toggle (`ChevronDown`/`ChevronRight` from lucide). Default open/closed varies per group. Each item is a `NavLink` — when active, it gets the `.nav-active` class which is **the** signature interaction:

```css
.nav-active {
  background: linear-gradient(135deg, rgba(212, 168, 67, 0.15), rgba(212, 168, 67, 0.05));
  color: #D4A843 !important;
  font-weight: 600;
}
.nav-active::before {
  content: '';
  position: absolute;
  left: 0; top: 4px; bottom: 4px;
  width: 3px;
  background: #D4A843;
  border-radius: 0 3px 3px 0;
}
```

A 3 px gold left rail and a diagonal gold-tinted background gradient. Inactive items: `text-sm`, lucide icon (16-18 px) + label, `gap-3 px-3 py-2 rounded-lg`. Hover: `hover:text-foreground`. The DashboardVPS Sidebar uses lucide-react throughout — copy its imports. For kanzec map roughly:

```ts
const NAV_GROUPS: NavGroup[] = [
  { labelKey: 'main',        items: [
    { to: '/dashboard',       labelKey: 'dashboard', icon: LayoutDashboard },
  ]},
  { labelKey: 'strategic',   items: [
    { to: '/dayslice',        labelKey: 'dayslice',  icon: Target },     // admin only
  ]},
  { labelKey: 'data',        items: [
    { to: '/data/orders',         labelKey: 'orders',         icon: ShoppingBag },
    { to: '/data/payments',       labelKey: 'payments',       icon: Coins },
    { to: '/data/legal-persons',  labelKey: 'legalPersons',   icon: Building2 },
  ]},
  { labelKey: 'collection',  items: [
    { to: '/collection/worklist', labelKey: 'worklist', icon: ClipboardList },
  ]},
  { labelKey: 'analytics',   items: [
    { to: '/analytics/sales',      labelKey: 'sales',      icon: BarChart2 },
    { to: '/analytics/payments',   labelKey: 'payments',   icon: Wallet },
    { to: '/analytics/returns',    labelKey: 'returns',    icon: Undo2 },
    { to: '/analytics/comparison', labelKey: 'comparison', icon: GitCompare },
  ]},
  { labelKey: 'operations',  items: [
    { to: '/ops',             labelKey: 'reports',   icon: Activity },   // admin only
  ]},
  { labelKey: 'admin',       items: [
    { to: '/admin/alerts',    labelKey: 'alerts',    icon: Bell },
    { to: '/admin/users',     labelKey: 'users',     icon: Users },      // admin only
    { to: '/admin/audit',     labelKey: 'audit',     icon: Shield },     // admin only
  ]},
]
```

Sidebar bottom: a `<Separator />`, the theme toggle (sun/moon), the language toggle (uz/ru/en pills using `.month-btn` styling), and a "logout" row with `LogOut` icon. The user's name + role can sit above the controls if you want (DashboardVPS shows it as a small caption).

## A.6 — Card vocabulary

Three card flavors. Pick the right one for the situation.

### `.glass-card` — the default container

```css
.glass-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);   /* almost imperceptible */
}
.glass-card:hover {
  border-color: rgba(158, 123, 47, 0.25);      /* gold tint on hover */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
```

Use for every grouped block: KPI cards (with `.kpi-glow`), tables, chart panels, filter bars, alert cards. **Never use a heavier shadow.** The whole aesthetic depends on this almost-flat elevation.

### `.kpi-glow` / `.perf-kpi` — KPI cards with top rail

Same as glass-card plus a 2 px gold rail at the top edge. `.perf-kpi` adds a subtle `translateY(-1px)` on hover and a gold-shadow lift. KPI value uses Playfair Display, `1.5rem`, weight 600. The accent color is variable per card via `--kpi-accent` — defaults to `#D4A843` but lets you tag a card as red/green/etc.

### `.perf-section` — collapsible section

A glass-card with a left-edge gradient rail (`linear-gradient(180deg, #D4A843, #B8922E)`) that fades in on `.is-open` state and a faint gold shadow when open. Header has a 28×28 rounded-square icon container with `rgba(212, 168, 67, 0.08)` fill, the icon itself in gold. Click to toggle.

## A.7 — Tables (`.premium-table`)

Sticky header (white in light, `#111118` in dark, z-index 2). Striped rows: even rows get `rgba(44, 36, 24, 0.02)`. Hover: `rgba(158, 123, 47, 0.06)` — that gold-tinted hover is what makes them feel premium. Keep the class verbatim.

## A.8 — Form chrome

### `.month-btn` — pill-toggle buttons

```css
.month-btn {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  background: #EDE7DC;
  color: #8A7D6B;
  border: 1px solid transparent;
}
.month-btn.active {
  background: rgba(158, 123, 47, 0.12);
  color: #9E7B2F;
  border-color: rgba(158, 123, 47, 0.35);
  font-weight: 600;
}
```

Tiny, dense, rounded `6px`. Use for date-range presets, language toggle, view-mode toggles. The active state is the gold-on-cream we use everywhere.

### `.toggle-pill` — segmented slider

A pill-shaped container with a sliding gradient thumb (`linear-gradient(135deg, #D4A843, #B8922E)`) and a `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot easing. The thumb has a soft gold shadow `0 2px 8px rgba(212, 168, 67, 0.3)`. Use for binary or 3-way toggles inside cards (e.g., "retail / cost / both").

### `.inv-filter` — select dropdowns

Custom-rendered chevron via inline SVG `data:` URL, `8px` border-radius, focus ring `0 0 0 3px rgba(212, 168, 67, 0.08)`. Replaces the browser's default select chrome.

## A.9 — Status badges (`.action-badge`)

Pill-shaped, `10px` text, uppercase, with a colored background (12% opacity), matching colored text, and a colored hairline border (20% opacity). Variants: `liquidate`, `markdown`, `transfer`, `monitor`, `urgent`, `critical`, `soon`, `plan`. Map to kanzec semantics:

| DashboardVPS | Kanzec analogue |
|---|---|
| `.action-badge.critical` | overdue debt > 90 days |
| `.action-badge.urgent` | overdue 60-90 |
| `.action-badge.markdown` | overdue 30-60 |
| `.action-badge.plan` | promised-to-pay |
| `.action-badge.monitor` | current/healthy |

## A.10 — Animations & motion

The motion vocabulary, in order of importance:

1. **Page-load stagger** — `.animate-fade-up` (`fadeSlideUp` keyframe: `translateY(12px)→0`, `opacity 0→1`, `0.5s ease-out`) with `.animate-fade-up-delay-{1..8}` modifiers stepping by 50 ms. Apply to the children of a page in DOM order. This is the single most distinctive motion in the app — every page has it.
2. **Count-up** — `.animate-count-up` on KPI numerics, 600 ms delayed by 200 ms.
3. **Shimmer skeleton** — `.shimmer-skeleton` with a gold-tinted gradient sweep (`rgba(158, 123, 47, 0.08)` light, `rgba(212, 168, 67, 0.06)` dark), 1.8 s loop. Use **everywhere** loading is async, not the default shadcn skeleton.
4. **Health ring reveal** — `ringReveal` (`stroke-dashoffset 283→0`, 1.5 s, overshoot easing `cubic-bezier(0.34, 1.56, 0.64, 1)`) for circular score rings. The score number then fades+scales in on a 600 ms delay (`scoreCount`).
5. **Alert pulse** — `alertPulse` on critical alert dots, 2 s ease-in-out infinite, `opacity 0.4↔1`, `scale 1↔1.3`.
6. **Score-bar fill** — `width 0→%`, 600 ms ease, gradient `linear-gradient(90deg, #D4A843, #F5D27A)`.
7. **Hover micro-lifts** — `.perf-kpi:hover { transform: translateY(-1px) }`, `.perf-alert:hover { transform: translateX(2px) }`. 1-2 px only — never more.
8. **`prefers-reduced-motion` opt-out** — the CSS already disables every animation when the OS asks. Keep this block.

## A.11 — Scrollbars

Custom `5px` width, `transparent` track, `#D5CDBE` thumb (light) / `#2E2E3E` (dark), 3 px border-radius. The narrow gold-tan scrollbar is part of the look — don't let a browser-default scrollbar leak in.

## A.12 — Skip link

`Layout.tsx` keeps an a11y skip link at the top. When focused it appears as a gold pill at top-left:

```html
<a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-9999 focus:bg-[#D4A843] focus:text-black focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold">Skip to content</a>
```

Keep verbatim.

## A.13 — Don't-do list

These would break the aesthetic — flag any of them in code review:

- ❌ Drop shadows above `0 4px 20px` opacity. The whole system uses hairline borders + gold-tinted hovers for elevation.
- ❌ Pure-white backgrounds (`#FFFFFF`) for the page canvas. The canvas is always `#FAF8F5`. White is *only* for cards.
- ❌ Replacing Playfair Display with another serif. The didone contrast is the look.
- ❌ Adding a second accent color besides gold (no purple, no blue CTAs). Status colors are status-only — never use them as brand color.
- ❌ Sharp 90° corners. Card radius is `0.75rem` (12 px), button radius `8-10 px`, badge radius `9999px`.
- ❌ Flat-design borderless cards. Every card has `1px solid var(--border)`.
- ❌ Heavy SaaS-style gradients on backgrounds. The only gradient surfaces are the `.nav-active` background and the toggle slider — both gold-on-gold-tinted.
- ❌ Replacing the `.shimmer-skeleton` with shadcn's grey-pulse. The gold-tinted shimmer is signature.
- ❌ Centering the layout in a max-width container. The dashboard fills the viewport; only inner content wraps.

## A.14 — Verification checklist

After copying, eyeball these to confirm fidelity:

- [ ] Page background renders cream (`#FAF8F5`), not white
- [ ] Sidebar is a slightly darker cream (`#F5F1EB`)
- [ ] H1/H2 render in Playfair Display (look for the pronounced contrast between thick verticals and hairline serifs)
- [ ] Body text in DM Sans (geometric, even rhythm, no awkward `g` tail)
- [ ] Active nav item has a 3 px gold rail on its left edge AND a gold-tinted background gradient
- [ ] KPI cards have a 2 px gold rail at the top edge
- [ ] Cards have a thin warm-grey border (`#E6DFD3`), almost no shadow
- [ ] Hovering a card shifts its border to a faint gold (`rgba(158, 123, 47, 0.25)`)
- [ ] Section labels above grouped content are `11px` uppercase with letter-spacing and a fade-line trailing right
- [ ] Loading skeletons have a gold shimmer sweep, not a grey pulse
- [ ] Scrollbar is `5px` wide and tan, not the browser default
- [ ] Page-load animations stagger top-to-bottom in roughly 50 ms steps
- [ ] Dark mode swaps to near-black `#0A0A0F` canvas with the gold accent unchanged
- [ ] No element uses Inter, Roboto, Arial, or system-ui as its primary face
