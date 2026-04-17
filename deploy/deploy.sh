#!/usr/bin/env bash
# Runs on the VPS as smartup-etl, invoked by the GitHub Actions deploy workflow.
set -euo pipefail

APP=/opt/dashboard-kanzec
BRANCH="${BRANCH:-main}"
cd "$APP"

echo "[$(date -Is)] fetching $BRANCH"
git fetch --quiet origin "$BRANCH"
git reset --hard "origin/$BRANCH"

# -----------------------------------------------------------------------------
# Backend
# -----------------------------------------------------------------------------
echo "[$(date -Is)] installing backend deps"
"$APP/backend/.venv/bin/pip" install --quiet --disable-pip-version-check \
  -r "$APP/backend/requirements.txt"

# -----------------------------------------------------------------------------
# Frontend
# -----------------------------------------------------------------------------
echo "[$(date -Is)] building frontend"
cd "$APP/frontend"
# Use ci when lockfile exists, install otherwise (first deploy).
if [ -f package-lock.json ]; then
    npm ci --silent
else
    npm install --silent
fi
npm run build

# -----------------------------------------------------------------------------
# Migrations — idempotent on every deploy
# -----------------------------------------------------------------------------
cd "$APP"
set +u
source "$APP/.env"
set -u

# Strip SQLAlchemy driver prefix to get a plain psql DSN.
PSQL_DSN="${DATABASE_URL/postgresql+asyncpg:/postgresql:}"
echo "[$(date -Is)] applying schema_sql/app.sql"
psql "$PSQL_DSN" -v ON_ERROR_STOP=1 -f "$APP/backend/schema_sql/app.sql" >/dev/null

echo "[$(date -Is)] dashboard deploy @ $(git rev-parse --short HEAD); restart handled by workflow"
