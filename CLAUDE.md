# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Kanzec Operations Dashboard backend at `kanzec.ilhom.work`. Internal ops console
that reads from the ETL's `smartup_rep.*` schema (shared Postgres on the same
VPS as `smartup-kanzec-etl`).

## Backend-only project

This repo is a **FastAPI backend**. There is no frontend in this project.
`frontend/` on disk holds only `preview/` HTML mockups, a stale
`tsconfig.tsbuildinfo`, and `README.md` — no `package.json`, no `src/`, no
chosen stack.

Don't run `npm`/`vite`/`tsc`, don't suggest frontend edits, and don't carry
forward references to the old React/Vite/Tailwind setup. `deploy/deploy.sh`
already skips the frontend build when `frontend/package.json` is missing, so
backend changes ship freely.

## Golden rules

1. **Read-only on ETL data.** The app role has `SELECT` on `smartup.*` and
   `smartup_rep.*`. Write access is only on `app.*` (users, refresh tokens,
   audit log). Exception: the Ops endpoint writes one key in
   `smartup.etl_state` (`report:<key>:backfill_queue`) — the ETL worker pops
   from it.

2. **Every mutation writes an audit row** via `app/audit.py`. Login attempts
   (ok + fail), user CRUD, backfill enqueues, session revokes.

3. **DataViewer SQL is whitelist-built** from `app/data/catalog.py`. Never
   interpolate column or operator names into SQL strings; bound parameters
   only for values.

## Architecture

- `backend/app/main.py` — FastAPI entrypoint. Includes ~17 routers, runs two
  background tasks in `lifespan`: a 10-min rooms-refresh loop (keeps
  `app.room` in sync with `smartup_rep.deal_order`) and a 30-min alert
  evaluator. Both swallow transient DB errors so the app stays up.
- `backend/app/<domain>/` — one subpackage per feature (auth, dashboard,
  data, debt, payments, sales, returns, comparison, dayslice, ops, alerts,
  annotations, preferences, rooms, snapshots, users, admin_audit).
- `backend/app/db.py` — async SQLAlchemy engine + `SessionLocal`.
- `backend/app/scope.py` — role/scope_rooms enforcement (operators with one
  room see only their data; team-leads see multiple; admins see everything).
  Three roles: `admin`, `operator`, `viewer`.
- `backend/schema_sql/app.sql` — idempotent DDL, applied on every deploy by
  `deploy.sh` after `pip install`.
- `deploy/` — `deploy.sh`, `smartup-dashboard-api.service` systemd unit,
  nginx configs.
- `.github/workflows/deploy.yml` — ssh-deploys on push to `main`.

Auth is session-cookie based (cookie set by `/api/auth/login`).
`/api/auth/me` returns the current user `{ role, scope_rooms }`. Excel
exports are served as `*.xlsx` GET endpoints. Healthcheck: `/api/healthz`.

## Local dev

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8081
```

The repo has no test suite or linter wired up — there is nothing like
`pytest` or `ruff` configured, so don't claim to have run tests.

## Environment

`.env` on VPS (git-ignored):
- `DATABASE_URL=postgresql+asyncpg://dashboard_api:...@127.0.0.1:5432/kanzec`
- `KANZEC_JWT_SECRET=<openssl rand -hex 32>`
- `KANZEC_ADMIN_USERNAME` / `KANZEC_ADMIN_PASSWORD` — only read on first deploy
  (`app.auth.bootstrap` is a no-op if an admin already exists)
- `KANZEC_ACCESS_TOKEN_TTL_SECONDS=900`
- `KANZEC_REFRESH_TOKEN_TTL_SECONDS=604800`
- `KANZEC_COOKIE_DOMAIN=kanzec.ilhom.work`
- `KANZEC_ALLOWED_ORIGINS=https://kanzec.ilhom.work`
- `TZ=Asia/Tashkent`

## Deploy

Push to `main` → GitHub Actions SSHes to the VPS (`51.195.110.155`, user
`smartup-etl`, `/opt/dashboard-kanzec`) and runs `deploy/deploy.sh`:

1. `flock` on `/tmp/dashboard-kanzec-deploy.lock` to serialize concurrent runs
2. `git reset --hard origin/main`
3. `pip install` against `backend/.venv`
4. Frontend build is skipped (no `frontend/package.json`)
5. `psql ... -f backend/schema_sql/app.sql` (idempotent)
6. `python -m app.auth.bootstrap` (creates admin only on first run)
7. Workflow restarts `smartup-dashboard-api.service`
