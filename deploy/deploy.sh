#!/usr/bin/env bash
# Runs on the VPS as smartup-etl, invoked by the GitHub Actions deploy workflow.
set -euo pipefail

# Serialize deploys. The script does `rm -rf node_modules && npm ci` which
# does not survive being raced — a concurrent deploy will pull files out
# from under tsc/vite mid-build and fail. Hold an exclusive flock for the
# whole run; a second invocation waits (up to 10 min) or exits non-zero.
LOCK_FD=9
LOCK_PATH="/tmp/dashboard-kanzec-deploy.lock"
exec 9>"$LOCK_PATH"
if ! flock -x -w 600 "$LOCK_FD"; then
    echo "[$(date -Is)] another deploy is holding $LOCK_PATH — giving up after 10 min" >&2
    exit 1
fi

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
# Force a fully clean node_modules before `npm ci`. We've hit the
# occasional "Rollup failed to resolve transitive dep" error when a
# partial install gets inherited between runs; wiping the tree costs
# ~20 s and makes deploys deterministic.
rm -rf node_modules
if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
else
    npm install --no-audit --no-fund
fi
npm run build

# -----------------------------------------------------------------------------
# Migrations — idempotent on every deploy
# -----------------------------------------------------------------------------
cd "$APP"
# Load .env AND export everything in it so the python bootstrap subprocess
# picks up DATABASE_URL, KANZEC_JWT_SECRET, etc. Plain `source .env` leaves
# them shell-local, which is invisible to child processes.
set -a
set +u
# shellcheck disable=SC1091
source "$APP/.env"
set -u
set +a

# Strip SQLAlchemy driver prefix to get a plain psql DSN.
PSQL_DSN="${DATABASE_URL/postgresql+asyncpg:/postgresql:}"
echo "[$(date -Is)] applying schema_sql/app.sql"
psql "$PSQL_DSN" -v ON_ERROR_STOP=1 -f "$APP/backend/schema_sql/app.sql" >/dev/null

echo "[$(date -Is)] bootstrapping admin (no-op if one already exists)"
cd "$APP/backend"
PYTHONPATH="$APP/backend" "$APP/backend/.venv/bin/python" -m app.auth.bootstrap

echo "[$(date -Is)] dashboard deploy @ $(git rev-parse --short HEAD); restart handled by workflow"
