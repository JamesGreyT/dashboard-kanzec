# dashboard-kanzec

Kanzec Operations Dashboard — an internal ops console for the XLSX ETL. Served at
`https://kanzec.ilhom.work`. Deployed on the same VPS as the ETL it reads.

Aesthetic: **The Almanac** — warm paper, Newsreader serif for every numeric,
Fustat body, IBM Plex Mono for machine identifiers. One vermilion accent.

## Stack

- **Backend**: FastAPI · Uvicorn · SQLAlchemy 2 async · asyncpg · PyJWT · bcrypt
- **Frontend**: React 19 · TypeScript · Vite · Tailwind · TanStack Query · React Router
- **DB**: Postgres (schema `app.*` owned; `smartup.*` and `smartup_rep.*` read-only)

## Local dev

```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8081

cd ../frontend
npm install
npm run dev    # proxies /api to :8081
```

## Deploy

Push to `main`. GitHub Actions SSHes to the VPS and runs `deploy/deploy.sh`,
then restarts `smartup-dashboard-api.service`.

## Structure

See `CLAUDE.md` for conventions, phases, and invariants.
