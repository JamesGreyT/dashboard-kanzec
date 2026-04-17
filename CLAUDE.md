# CLAUDE.md — dashboard-kanzec

Kanzec Operations Dashboard at `kanzec.ilhom.work`. Reads from the ETL's
`smartup_rep.*` schema (shared Postgres on the same VPS as `smartup-kanzec-etl`).

## Golden rules

1. **Read-only on ETL data.** This app has `SELECT` on `smartup.*` and
   `smartup_rep.*`. Write access is only on `app.*` (users, refresh tokens,
   audit log). Exception: the Ops page writes one key in `smartup.etl_state`
   (`report:<key>:backfill_queue`) — the ETL worker pops from it.

2. **Every mutation writes an audit row** via `app/audit.py`. Login
   attempts (ok + fail), user CRUD, backfill enqueues, session revokes.

3. **DataViewer SQL is whitelist-built** from `app/data/catalog.py`.
   Never interpolate column or operator names into SQL strings; bound
   parameters only for values.

4. **Aesthetic: The Almanac.** Newsreader serif + Fustat body + IBM Plex
   Mono, warm paper palette, one vermilion accent. See plan file /
   `frontend/src/styles/globals.css` for tokens. No Inter. No default
   dashboard blue. No drop shadows or glassmorphism.

## Architecture

- `backend/app/` — FastAPI. One subpackage per feature domain.
- `backend/schema_sql/app.sql` — idempotent DDL, applied on every deploy.
- `frontend/src/` — React + TypeScript + Vite + Tailwind.
- `deploy/` — `deploy.sh` + systemd unit + nginx configs.
- `.github/workflows/deploy.yml` — ssh-deploy on push to main.

## Environment

`.env` on VPS (git-ignored):
- `DATABASE_URL=postgresql+asyncpg://dashboard_api:...@127.0.0.1:5432/kanzec`
- `KANZEC_JWT_SECRET=<openssl rand -hex 32>`
- `KANZEC_ADMIN_USERNAME`/`KANZEC_ADMIN_PASSWORD` — only read on first deploy
- `KANZEC_ACCESS_TOKEN_TTL_SECONDS=900`
- `KANZEC_REFRESH_TOKEN_TTL_SECONDS=604800`
- `KANZEC_COOKIE_DOMAIN=kanzec.ilhom.work`
- `KANZEC_ALLOWED_ORIGINS=https://kanzec.ilhom.work`
- `TZ=Asia/Tashkent`

## Deploy

Push to main → GH Actions ssh-deploys to the VPS, which runs
`deploy/deploy.sh` (git pull, pip install, npm ci+build, apply schema) and
restarts the `smartup-dashboard-api.service` unit.
