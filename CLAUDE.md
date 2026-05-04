# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Kanzec Operations Dashboard — internal debt-collection ops console for `kanzec.ilhom.work`. Backend reads from the ETL's `smartup_rep.*` schema (shared Postgres on the same VPS as `smartup-kanzec-etl`).

## Stack

- **Backend** — FastAPI on `127.0.0.1:8081`, ~17 routers, ~80 endpoints. See `backend/app/main.py`.
- **Frontend** — React 19 + Vite 7 + TypeScript + Tailwind v4 + shadcn/ui SPA in `frontend/`. The dev server proxies `/api` to the prod backend at `https://kanzec.ilhom.work`; deployed `dist/` is served by nginx from the same domain.

## Dev commands

```powershell
# Frontend
cd frontend
npm install
npm run dev        # http://localhost:5173 (or 5174/5175 if ports taken)
npm run build      # tsc -b && vite build
npm run lint       # eslint .

# Backend (no test suite; no linter configured)
cd backend
python -m venv .venv && .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8081
```

No test suite is wired up — don't claim to have run tests.

## Golden rules

1. **Read-only on ETL data.** The app role has `SELECT` on `smartup.*` and `smartup_rep.*`. Write access is only on `app.*` (users, refresh tokens, audit log). Exception: the Ops endpoint writes one key in `smartup.etl_state` (`report:<key>:backfill_queue`) — the ETL worker pops from it. There are also manual-tag columns on `smartup_rep.legal_person` (see below) that the dashboard PATCH endpoints write.

2. **Every mutation writes an audit row** via `app/audit.py`. Login attempts (ok + fail), user CRUD, backfill enqueues, session revokes.

3. **DataViewer SQL is whitelist-built** from `app/data/catalog.py`. Never interpolate column or operator names into SQL strings; bound parameters only for values.

## Auth architecture

Auth is **Bearer JWT** in `Authorization: Bearer <token>` headers (from `/api/auth/login`'s `access_token`) with an httpOnly `kanzec_refresh` cookie used only by `/api/auth/refresh` for token rotation.

- Access token lives **in-memory only** (`frontend/src/api/tokenStore.ts`) — never localStorage.
- `<BootstrapGate>` in `App.tsx` holds the route tree until `AuthContext` resolves the initial `/auth/refresh` call, preventing N concurrent 401s from racing the refresh cookie.
- 401 interceptor in `frontend/src/api/client.ts` calls `/auth/refresh`, deduplicates concurrent requests, and retries the original request once before clearing auth state.
- `/api/auth/me` returns `{ role, scope_rooms }`. Three roles: `admin`, `operator`, `viewer`.

## Frontend architecture

**State**: URL is the source of truth for all filters (via `useSearchParams`). TanStack Query v5 with `placeholderData: (prev) => prev` for smooth filter transitions. All API hooks live in `frontend/src/api/hooks.ts`.

**Design system** (Almanac — locked, do not invent new tokens):
- Colors: cream `#FAF8F5`, gold `#D4A843`, saddle-brown `#2C2418`. No blue CTAs, no purple.
- Fonts: Playfair Display (H1/H2 + currency numerics), DM Sans (body/table cells), IBM Plex Mono (IDs/timestamps/codes)
- CSS classes in `frontend/src/index.css`: `.glass-card`, `.kpi-glow`, `.premium-table`, `.action-badge.{critical,urgent,markdown,plan,monitor}`, `.month-btn`, `.shimmer-skeleton`, `.section-title`, `animate-fade-up-delay-{1..6}`

**Key patterns**:
- Date/range pickers use `MonthPicker` component (portaled via `createPortal` to `document.body` to escape `overflow:auto` containers). Types from `components/datePresets.ts`.
- Multi-select `EnumSelectFilter` in `FilterBar.tsx` serializes as `f=col:in:val1|val2|val3` matching the backend's pipe-delimited `in` operator.
- Plotly is lazy-loaded (`React.lazy`) — only analytics and Dayslice pages pull the large bundle.
- Sidebar collapses to icon-rail (`Ctrl+\`); state persisted in localStorage.

## Backend architecture

- `backend/app/main.py` — FastAPI entrypoint. Two background tasks in `lifespan`: 10-min rooms-refresh + 30-min alert evaluator. Both swallow transient DB errors.
- `backend/app/<domain>/` — one subpackage per feature (auth, dashboard, data, debt, payments, sales, returns, comparison, dayslice, ops, alerts, annotations, preferences, rooms, snapshots, users, admin_audit).
- `backend/app/db.py` — async SQLAlchemy engine + `SessionLocal`.
- `backend/app/scope.py` — role/scope_rooms enforcement.
- `backend/schema_sql/app.sql` — idempotent DDL for `app.*` tables, applied on every deploy.

**Manual-tag columns on `smartup_rep.legal_person`** (survive ETL re-ingest because they're excluded from the ETL's upsert columns):
- `direction` / `direction_source` / `direction_updated_at`
- `instalment_days` / `instalment_days_source` / `instalment_days_updated_at`
- `client_group` (5-token: `NORMAL` | `PROBLEM_DEADLINE` | `PROBLEM_MONTHLY` | `PROBLEM_UNDEFINED` | `CLOSED`) / `client_group_source` / `client_group_updated_at`
- `deal_deadline_start` / `deal_monthly_amount` / `deal_meta_updated_at`

When any PATCH endpoint writes one of these columns, it also sets `*_source = 'manual'` so the overlay loader (`smartup-kanzec-etl/scripts/load_kelishuv.py`) will skip that row on the next re-run.

## Data flow for client_group / deal status

1. `smartup-kanzec-etl/scripts/load_kelishuv.py` reads `KELISHUV KLENT.xlsx` (committed to `scripts/excels/`), classifies each client into one of the 5 groups, and bulk-UPDATEs `smartup_rep.legal_person` via temp table.
2. The loader is re-triggered via GitHub Actions `workflow_dispatch` with `run_kelishuv=true` after any DB rebuild.
3. The frontend computes `deal_status` per-row **client-side** in `ClientsDebts.computeDealStatus()` (not SQL) from `client_group`, `qarz`, `overdue`, `deal_deadline_start`, `term_days`. This was moved out of SQL because a multi-table JOIN ambiguity in `compute_ledger` caused 500s on prod that were hard to debug remotely.

## Deploy

Push to `main` → GitHub Actions SSHes to VPS (`51.195.110.155`, user `smartup-etl`, `/opt/dashboard-kanzec`) and runs `deploy/deploy.sh`:

1. `flock` on `/tmp/dashboard-kanzec-deploy.lock` to serialize concurrent runs
2. `git reset --hard origin/main`
3. `pip install` against `backend/.venv`
4. `cd frontend && rm -rf node_modules && npm ci && npm run build` → nginx serves `frontend/dist/`
5. `psql ... -f backend/schema_sql/app.sql` (idempotent)
6. `python -m app.auth.bootstrap` (creates admin only on first run)
7. Workflow restarts `smartup-dashboard-api.service`

## Environment

`.env` on VPS (git-ignored):
- `DATABASE_URL=postgresql+asyncpg://dashboard_api:...@127.0.0.1:5432/kanzec`
- `KANZEC_JWT_SECRET=<openssl rand -hex 32>`
- `KANZEC_ADMIN_USERNAME` / `KANZEC_ADMIN_PASSWORD` — only read on first deploy
- `KANZEC_ACCESS_TOKEN_TTL_SECONDS=900`
- `KANZEC_REFRESH_TOKEN_TTL_SECONDS=604800`
- `KANZEC_COOKIE_DOMAIN=kanzec.ilhom.work`
- `KANZEC_ALLOWED_ORIGINS=https://kanzec.ilhom.work`
- `TZ=Asia/Tashkent`
