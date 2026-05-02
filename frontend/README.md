# Kanzec Operations Dashboard — Frontend

React 19 + Vite 7 + TypeScript + Tailwind v4 + shadcn/ui SPA that consumes
the FastAPI backend at [`kanzec.ilhom.work`](https://kanzec.ilhom.work).
Aesthetic is the warm-paper Almanac system (Playfair Display + DM Sans + IBM
Plex Mono on antique gold over cream); see [`src/index.css`](src/index.css).

## Dev setup

```powershell
npm install
npm run dev    # http://localhost:5173, proxies /api → kanzec.ilhom.work
npm run build  # tsc -b && vite build → dist/
npm run lint   # eslint .
```

The dev server proxies `/api` to the **production backend** (not localhost).
This is intentional — see [`vite.config.ts`](vite.config.ts):

- Real production data is the only way to verify scope filtering and role
  gates. Spinning up a local Postgres + ETL is not worth it for frontend
  work.
- The backend is read-only against ETL data; only `/contact`, `/admin/*`,
  `/dayslice/plan`, `/ops/.../backfill`, `/alerts/*`, and `/annotations`
  mutate prod state. Be deliberate when testing those.
- The httpOnly refresh cookie (`kanzec_refresh`) is rewritten to `localhost`
  via `cookieDomainRewrite` so it survives the proxy.

**Test credentials** (prod admin): `Xurshid` / `Kanzec100`.

## Auth flow

The backend uses **Bearer JWT** in the `Authorization` header for normal API
calls, with an httpOnly refresh cookie for token rotation. This is **not**
the cookie-only setup the original copy-guide assumed — see
[`src/api/client.ts`](src/api/client.ts) for the implementation:

1. `POST /api/auth/login` → `{ access_token, user }`. Token goes into the
   in-memory store at [`src/api/tokenStore.ts`](src/api/tokenStore.ts), user
   into AuthContext.
2. Every request gets `Authorization: Bearer <token>` injected by the axios
   request interceptor.
3. On 401, the response interceptor calls `POST /api/auth/refresh`
   (cookie-based, no body) → new access token → retries the original
   request once. Concurrent 401s share a single in-flight refresh promise.
4. If refresh fails, the token store is cleared and the app emits
   `auth-unauthorized` → redirect to `/login`.

Token storage is **in-memory only** by design — a hard refresh loses the
access token, but `AuthContext` calls `/auth/refresh` on mount to recover
silently using the httpOnly cookie. No XSS-readable token ever exists.

`<BootstrapGate>` in [`src/App.tsx`](src/App.tsx) renders the route tree
only after the bootstrap refresh has resolved, which prevents N concurrent
401 → /refresh races on cold load.

## Architecture

- **`src/api/`** — axios instance, token store, TanStack Query hooks (one
  module-level `hooks.ts` with ~80 hooks, organised by domain).
- **`src/context/`** — `AuthContext`, `ThemeContext` (dark/light), and
  `LanguageContext` (i18next, default `uz`).
- **`src/components/`** — `layout/Layout.tsx` (sidebar + main outlet),
  `ui/` (shadcn primitives), `blocks/` (reusable composed pieces:
  `KpiCard`, `RankedTable`, `MatrixTable`, `CollapsibleSection`,
  `AlertBanner`, `TrendChart`, `ConfirmDialog`, `EmptyState`, `ErrorState`),
  `charts/PlotlyChart.tsx` (lazy-loaded ~4.9 MB Plotly chunk).
- **`src/pages/`** — one file per route. Heavy chart pages (`Dayslice`,
  `analytics/*`) are lazy-imported in `App.tsx`.
- **`src/locales/{uz,ru,en}.json`** — three-locale catalog. Default is `uz`.

## Bundle layout

After `npm run build`:

| Chunk         | Size       | Loaded on               |
|---------------|------------|--------------------------|
| `index`       | ~600 kB / 177 kB gz | Every page              |
| `PlotlyChart` | ~4.9 MB / 1.48 MB gz | Analytics + Dayslice    |
| `RankedTable` | ~13 kB / 4 kB gz    | Analytics ranked sections |
| `MatrixTable` | ~3 kB / 1 kB gz     | Comparison + Dayslice + RFM |

Plotly is split via `React.lazy()` — the dashboard / data-viewer / debt
collection workflows that don't need charts never download it.

## Design system (locked)

Don't invent tokens. The vocabulary lives in [`src/index.css`](src/index.css):

- Colors: warm cream paper `#FAF8F5`, saddle-brown text `#2C2418`, antique
  gold `#D4A843`. No blue CTAs, no purple, no heavy shadows.
- Fonts: Playfair Display (h1/h2 + currency numerics), DM Sans (body/UI),
  IBM Plex Mono (id columns, timestamps, log lines).
- Card vocabulary: `.glass-card`, `.kpi-glow`, `.premium-table` (sticky
  white header, even-row stripe, gold-tinted hover), `.action-badge` with
  variants `.critical`, `.urgent`, `.markdown`, `.plan`, `.monitor`.
- Filter chrome: `.month-btn`, `.toggle-pill`, `.inv-filter`,
  `.section-title` (uppercase tracking).
- Motion: `animate-fade-up-delay-{1..6}` stagger on page mount,
  `.shimmer-skeleton` for loading rows.
- Active nav state: `.nav-active` (gold-on-cream pill).

## Routes

- `/login` — public.
- `/dashboard` — hero overview (4 KPIs + worklist preview + comparison).
- `/data/{orders,payments,legal-persons}` — generic table viewer +
  inline-edit drawer (legal-persons only, operator/admin scope).
- `/collection/worklist` — debt triage (worklist | prepayments | aging).
- `/collection/debt/client/:personId` — client dossier + contact log CRUD.
- `/analytics/{sales,payments,returns,comparison}` — Plotly-heavy.
- `/admin/alerts` — rules + events.
- `/dayslice` *(admin)* — scoreboard + projection + plan editor.
- `/ops` *(admin)* — report progress + queue + SSE log stream + backfill.
- `/admin/{users,audit}` *(admin)* — user CRUD + bulk-from-rooms;
  forensic timeline.

## Verification

There is no automated test suite. Verification is in-browser against the
prod backend:

1. `npm run dev` → open `http://localhost:5173` in **Chrome with DevTools
   docked**.
2. Sign in as `Xurshid` / `Kanzec100`.
3. **Network tab**: every authenticated request carries
   `Authorization: Bearer ...`. The 401 → `/auth/refresh` → retry sequence
   is observable.
4. **Application → Cookies**: `kanzec_refresh` is `HttpOnly`, `Secure`,
   `SameSite=Strict`, scoped to `/api/auth`.
5. **Console**: must be clean (no React warnings, no missing-i18n keys).
6. **Device toolbar (`Ctrl+Shift+M`)**: every page renders at 375 px,
   768 px, 1280 px without overflow.

## Deploy

Push to `main` → GitHub Actions SSHes to the VPS, runs `deploy/deploy.sh`,
which `npm ci && npm run build` here and lets nginx serve `dist/`. The
backend lives in the same repo at `backend/`. See top-level
[`CLAUDE.md`](../CLAUDE.md) and [`deploy/nginx-kanzec.conf`](../deploy/nginx-kanzec.conf).
