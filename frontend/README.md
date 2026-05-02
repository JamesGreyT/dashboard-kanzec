# dashboard-kanzec frontend

**Wiped 2026-05-02 for full rebuild.** Stack TBD.

The previous frontend (React + Vite + TypeScript + Tailwind + shadcn/ui, "editorial restraint" Mobile Card Stream design) was deleted in commit on branch `wipe/frontend-rebuild`. Backend (`../backend/`, FastAPI on `:8081`) is untouched and continues to serve `/api/*`.

## Information architecture (locked, must be respected by the rebuild)

The nav groups and page→endpoint contract live in the project memory:
`C:\Users\Ilhom\.claude\projects\c--Users-Ilhom-Downloads-Projects-smartup-kanzec-etl\memory\reference_dashboard_kanzec_ia.md`

Quick summary of nav groups (Uzbek):
- **Asosiy** → Boshqaruv paneli (`/dashboard`)
- **Strategik** → Kunlik kesim (`/dayslice`, admin)
- **ETL hisobotlari / Ma'lumotlar** → Buyurtmalar, To'lovlar, Yuridik shaxslar (`/data/*`)
- **Qarzlar** → Qarz mijozlar ro'yxati (`/collection/worklist`)
- **Analitika** → Sotuv, To'lovlar, Qaytarishlar, Taqqoslash (`/analytics/*`)
- **Operatsiyalar** → Hisobotlar (`/ops`, admin)
- **Administratsiya** → Ogohlantirishlar, Foydalanuvchilar, Audit (`/admin/*`)

Roles: `admin`, `operator`, `viewer`. Auth via FastAPI session cookie.

## Backend contract
- FastAPI on `127.0.0.1:8081`. Dev frontend should proxy `/api/*` to it.
- All routes return JSON. Auth: `POST /api/auth/login`, `GET /api/auth/me`.
- Three i18n locales: uz (default), ru, en.

## Deploy
GitHub Actions (`.github/workflows/deploy.yml`) runs `cd frontend && npm ci && npm run build` on the VPS. **The deploy will fail until this directory has a working `npm run build` again.**

## Status
- [ ] Stack chosen
- [ ] Project scaffolded
- [ ] Auth flow + API client
- [ ] i18n (uz / ru / en)
- [ ] Sidebar nav with role gates
- [ ] Page rebuilds (one per route)
- [ ] Build green
- [ ] Deploy green
