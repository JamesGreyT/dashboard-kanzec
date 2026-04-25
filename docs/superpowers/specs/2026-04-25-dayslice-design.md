# Day-slice scoreboard — design

**Status:** draft (pending user review)
**Author:** brainstorming pair, 2026-04-25
**Implementation skill:** writing-plans (next)

---

## Why

The operator's working `Kanzeckun.xlsx` spreadsheet has a `Dashborad` sheet
that is the founder's primary scoreboard. It is a parametric "as-of day-N"
view: pick a date, and the sheet shows manager × year revenue for the
calendar slice **(month-of-date, day 1) → (month-of-date, day-of-date)**
replayed across each year. The same slice across 2023/2024/2025/2026
makes year-over-year comparison trivial without extra mental arithmetic
and without the muddiness of picking arbitrary date ranges.

The existing Sales / Payments / Debt / Returns / Executive dashboards in
the dashboard-kanzec app cover everything *except* this day-N replay
shape. This page recreates it natively in Postgres, adds a planning
overlay, and renders it in the same editorial Quarto aesthetic the rest
of the app uses.

## Out of scope

- Multi-currency (data is single-currency)
- Per-day plan granularity — plans are monthly per manager
- Audit log for plan edits (only `updated_at` + `updated_by` recorded)
- The operator's wider Excel ecosystem (Plan mart, muammolilar, etc.)

## Architecture

### Page route
- `/dayslice` — admin only
- Mounted in the existing **Executive** sidebar group (alongside `/executive`)

### Backend feature folder

```
backend/app/dayslice/
  __init__.py
  router.py     ← 4 endpoints
  service.py    ← 3 query functions + plan CRUD
```

Wired into `backend/app/main.py` via `app.include_router(dayslice_router)`.

### Endpoints

```
GET  /api/dayslice/scoreboard      ?as_of=YYYY-MM-DD&years=N&direction=...
GET  /api/dayslice/projection      ?as_of=YYYY-MM-DD&years=N&direction=...
GET  /api/dayslice/region-pivot    ?as_of=YYYY-MM-DD&direction=...
GET  /api/dayslice/plan            ?year=Y&month=M
PUT  /api/dayslice/plan            ?year=Y&month=M
```

All endpoints respect `ScopedUser.room_ids` via the existing `_analytics.filters.clause()` helper. PUT requires admin.

### Schema

One new table:

```sql
CREATE TABLE IF NOT EXISTS app.dayslice_plan (
  year       INT  NOT NULL,
  month      INT  NOT NULL,
  manager    TEXT NOT NULL,
  plan_sotuv NUMERIC(14,2),
  plan_kirim NUMERIC(14,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  PRIMARY KEY (year, month, manager),
  CHECK (month BETWEEN 1 AND 12)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON app.dayslice_plan TO dashboard_api;
```

Append to `backend/schema_sql/app.sql`.

## Endpoint specifications

### `GET /api/dayslice/scoreboard`

**Query params:**
- `as_of` (required, ISO date)
- `years` (default 4, min 2, max 6)
- `direction` (default empty → server applies `B2B,Export`; explicit value overrides)

**Response shape:**
```json
{
  "slice": {
    "month_start": "2026-03-01",
    "as_of": "2026-03-22",
    "day_n": 22,
    "month_days": 31
  },
  "year_columns": [2023, 2024, 2025, 2026],
  "sotuv": {
    "rows": [
      {
        "manager": "Sardor Yanvarov",
        "by_year": [60963, 55817, 63214, 84500],
        "yoy_pct": 0.337
      }
    ],
    "totals": {
      "by_year": [207914, 178335, 205014, 264403],
      "yoy_pct": 0.290
    }
  },
  "kirim": { "rows": [...], "totals": {...} }
}
```

Rows sorted by current-year revenue desc, then alphabetic. Empty/whitespace `sales_manager` collapsed into `'(—)'`. `yoy_pct` = current ÷ prior − 1, `null` when prior is 0.

**SQL strategy** — single GROUP BY per measure, anchored on a `generate_series` of years:

```sql
WITH years AS (SELECT generate_series(:y_start, :y_end) AS y),
slices AS (
  SELECT y,
         make_date(y, :month, 1)      AS s,
         make_date(y, :month, :day_n) AS e
    FROM years
)
SELECT COALESCE(NULLIF(TRIM(d.sales_manager), ''), '(—)') AS manager,
       sl.y AS year,
       SUM(d.product_amount)::numeric(18,2) AS revenue
  FROM slices sl
  JOIN smartup_rep.deal_order d
    ON d.delivery_date BETWEEN sl.s AND sl.e
   AND d.product_amount > 0
  JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
 WHERE TRUE
   {direction filter}
   {scope filter}
 GROUP BY 1, 2;
```

The kirim half uses `smartup_rep.payment` joined to `legal_person`, with `payment_date` substituted for `delivery_date` and `amount` for `product_amount`. Direction filter joins via `legal_person.direction`. Both halves run in parallel with `asyncio.gather()`.

The Python layer pivots the `(manager, year, revenue)` tuples into row-major shape, fills missing year cells with 0, computes totals + YoY.

**Edge cases:**
- If `as_of` falls before the data floor (`2022-09-14`), trim `year_columns` and emit a `notice` field.
- If a year has no data at all, the column still appears with all zeros (so the grid stays rectangular).
- `make_date(y, mo, d)` may fail for Feb 29 in non-leap years — clamp `day_n` to `LEAST(day_n, EXTRACT(DAY FROM (date_trunc('month', s) + interval '1 month - 1 day')))` per year.

### `GET /api/dayslice/projection`

**Response shape:**
```json
{
  "slice": { ... },
  "history": [
    { "year": 2023, "mtd": 120000, "month_total": 162000, "ratio": 0.741 },
    { "year": 2024, "mtd": 145000, "month_total": 181000, "ratio": 0.801 },
    { "year": 2025, "mtd": 178000, "month_total": 218000, "ratio": 0.816 }
  ],
  "current_mtd": { "sotuv": 198000, "kirim": 175000 },
  "projection": {
    "sotuv": { "min": 241463, "mean": 247500, "max": 267567 },
    "kirim": { "min": 213140, "mean": 218600, "max": 235910 }
  }
}
```

Method: for each prior year (excluding current), compute MTD-through-day-N and full-month total, derive `ratio = mtd / month_total`. Apply `min/mean/max` of those ratios as denominators against `current_mtd` to get min/mean/max projections.

If the current month is incomplete in the data (typical case), `current_mtd` uses the actual cutoff; `month_total` lookups for prior years use the full month. If a prior year is missing the same month entirely, drop it from history.

### `GET /api/dayslice/region-pivot`

Current-year only, current slice. Direction filter applied. Returns:

```json
{
  "row_labels": ["Toshkent", "Andijon", ...],
  "col_labels": ["Sardor Yanvarov", "Abdug'ani", ...],
  "values": [[12000, 0, 8000, ...], ...],
  "manager_totals": [...],
  "manager_share": [...],
  "grand_total": 8430000
}
```

Single GROUP BY (region, manager), pivoted server-side. Regions and managers sorted by their respective totals desc. Excludes `(—)` and rows that sum to zero from the matrix; they still count in `grand_total`.

### Plan endpoints

`GET /api/dayslice/plan?year=2026&month=3`:
```json
{
  "year": 2026, "month": 3,
  "rows": [
    {
      "manager": "Sardor Yanvarov",
      "plan_sotuv": 70000,
      "plan_kirim": 65000,
      "updated_at": "2026-04-12T11:30:00Z",
      "updated_by": "admin"
    }
  ]
}
```

`PUT /api/dayslice/plan?year=2026&month=3` (admin only):
```json
{ "rows": [{ "manager": "...", "plan_sotuv": 70000, "plan_kirim": 65000 }, ...] }
```

Server upserts rows, deletes any existing rows for that (year, month) not in the payload, sets `updated_by = current_user.username`. Returns the persisted state.

## Frontend components

### `frontend/src/pages/DaySlice.tsx`

Main page. Holds three React Query hooks (one per GET endpoint), the as-of state, the years state, and the direction filter state. Uses `usePreferences` to seed defaults from the user's saved preferences.

```
<PageHeading … />
<ControlBar>     {AsOfPicker, DirectionMultiSelect, ScopeChip}
<YearMatrix title="Sotuv" … />
<YearMatrix title="Kirim" … />
<hr.mark-rule />
<ProjectionStrip kind="sotuv" … />
<ProjectionStrip kind="kirim" … />
<hr.mark-rule />
<PlanGridEditable year={…} month={…} sotuv={…} kirim={…} />
<hr.mark-rule />
<RegionPivotHeatmap data={pivotData} />
```

Stagger-1..stagger-5 entrance classes (already in app CSS).

### `frontend/src/components/AsOfPicker.tsx`

```tsx
interface AsOfPickerProps {
  asOf: Date;
  years: number;
  onChange: (next: { asOf: Date; years: number }) => void;
}
```

Single calendar input + small "N years" stepper (− / number input / +), bounded `2..6`. Emits one `onChange` per change. Eyebrow line below shows the derived slice in localised format.

### `frontend/src/components/YearMatrix.tsx`

The repeated table primitive. Props:

```ts
interface YearMatrixRow {
  manager: string;
  by_year: number[];
  yoy_pct: number | null;
}
interface YearMatrixProps {
  title: string;
  yearColumns: number[];
  rows: YearMatrixRow[];
  totals: { by_year: number[]; yoy_pct: number | null };
  currentYear: number;
}
```

- Editorial table — no card chrome
- Right-aligned mono numerics; em-dash for zero (uses existing `fmtNum`)
- Current-year column: `bg-primary/[0.04]` tint
- Last data column = sparkline (year-by-year mini-bar via existing `Sparkline`) + YoY chip (reuses Sales `yoyChip` pattern)
- Footer row "Jami" pinned at bottom with hairline rule

Mobile fallback (under `lg:`): becomes one card per row, year columns stacked inside the card (matches `RankedTable`'s mobile pattern).

### `frontend/src/components/ProjectionStrip.tsx`

Three `MetricCard`s side-by-side. Used twice (once for Sotuv, once for Kirim — stacked, not toggled).

```ts
interface ProjectionStripProps {
  kind: "sotuv" | "kirim";
  current_mtd: number;
  projection: { min: number; mean: number; max: number };
  history: Array<{ year: number; ratio: number }>;
}
```

Each card shows compact-formatted projected month-end + a hint reading "by day-N we typically captured X% of the month (N years history)". Full-precision tooltip on hover.

### `frontend/src/components/PlanGridEditable.tsx`

```ts
interface PlanGridProps {
  year: number;
  month: number;
  managers: string[];                                // from scoreboard rows
  factSotuv: Record<string, number>;                 // manager → MTD
  factKirim: Record<string, number>;
  isAdmin: boolean;
}
```

Compact table:

| Manager | Plan Sotuv | Fakt MTD | Index | · | Plan Kirim | Fakt MTD | Index |

- Internal `useQuery(['dayslice.plan', year, month])` → seeds from server
- Internal `useMutation` → debounced 600ms whole-month PUT
- Inline-edit on Plan cells when `isAdmin`. Click → input → save on blur or Enter
- Index % chip: green ≥ 1.0, amber 0.7–1.0, red < 0.7. `—` when plan is null
- Tiny eyebrow above grid: "last edit: admin · 2 days ago" if any row has `updated_at`

### Region heatmap

Reuses existing `Heatmap.tsx` directly — no new component. Page-level wrapper renders a caption strip below: per-manager total + share-of-total chip.

### `frontend/src/App.tsx`

Add admin-gated route:
```tsx
<Route path="/dayslice"
       element={<RequireAuth roles={["admin"]}><DaySlice /></RequireAuth>} />
```

### `frontend/src/components/Sidebar.tsx`

Add to existing `EXECUTIVE` group:
```ts
{ to: "/dayslice", labelKey: "nav.dayslice", roles: ["admin"], icon: "calendar" }
```
The `calendar` icon is already in the icon map — no new lucide import needed.

### i18n

New `dayslice.*` namespace per locale (uz/ru/en). Keys:
- `dayslice.title`, `dayslice.subtitle`, `dayslice.crumb`
- `dayslice.section_sotuv`, `dayslice.section_kirim`, `dayslice.section_projection`,
  `dayslice.section_plan`, `dayslice.section_region`
- `dayslice.col_manager`, `dayslice.col_jami`, `dayslice.col_yoy`
- `dayslice.proj_min`, `dayslice.proj_mean`, `dayslice.proj_max`, `dayslice.proj_hint`
- `dayslice.plan_label`, `dayslice.fakt_label`, `dayslice.index_label`
- `dayslice.as_of`, `dayslice.years`, `dayslice.slice_eyebrow`
- `nav.dayslice` (in `nav.*` block)

## Visual language

- Warm ivory background, umber primary accent (existing CSS vars)
- Fraunces display for section headers (e.g. "Sotuv", "Forecast")
- JetBrains Mono for every number cell and the slice-eyebrow line
- `.mark-rule` hairline between each section (existing utility)
- Current-year column tinted `bg-primary/[0.04]`
- Compact format on projection cards (`$248k`); full grid uses regular `fmtNum`
- Section entrance: `.stagger-1` through `.stagger-5` (already-existing CSS)

## Defaults

| Setting | Default |
|---|---|
| As-of date | today |
| Years | 4 |
| Direction filter | `B2B,Export` (server-applied if no explicit value) |
| Page size for matrices | all managers (typically 6–10 rows) |
| Projection layout | stacked Sotuv on top, Kirim below |

## Phased delivery

Single phase — three endpoints + four components + plan persistence in one ship. If the plan UI runs over budget during implementation, the fallback is to land it read-only first and add the editable PUT in a follow-up.

### Steps
1. Schema migration: append to `backend/schema_sql/app.sql`, deploy via the existing `psql -f` flow on the VPS.
2. Backend: `dayslice/` folder, register router in `main.py`.
3. Frontend: page + 4 components + i18n + sidebar + route.
4. Verify totals: pick a manager × year cell from the deployed page and counter-check with a hand-written `SUMIFS`-equivalent SQL in psql.
5. `npx tsc --noEmit` clean · `npm run build` clean.
6. Playwright screenshot at 1440w + 390w + dark mode.
7. Deploy via the established SSH flow (`git pull`, `npm ci`, `npm run build`, `systemctl restart smartup-dashboard-api.service`).

## Verification plan

Before shipping:

1. **Hand-checked numbers** — pick three (manager, year) cells from
   the deployed page, run the equivalent psql query, confirm
   exact match within rounding.
2. **Plan round-trip** — open page as admin, edit a plan cell, refresh,
   confirm value persisted; verify `updated_by` and `updated_at`.
3. **Type-check + build** clean.
4. **Visual** — screenshot at 1440w desktop, 390w mobile, dark + light;
   confirm matrices fit, mobile card fallback renders, mark-rules
   align, current-year tint visible but subtle.
5. **WCAG** — keyboard navigation through plan-edit cells works;
   focus rings visible; `aria-sort` on year column headers.
6. **Smoke** — non-admin user gets 403 on PUT, page route 404→/dashboard.

## Open follow-ups (backlog, not blocking)

- Plan history panel (full audit, not just last edit)
- Per-day plan granularity for fine-grained pacing
- Export the day-slice scoreboard to xlsx (low priority — operator
  can copy from the screen)
- Annotate the projection bands (mark a "miss" or "hit" in the
  history) — would mirror the chart-annotations system used elsewhere

## Files touched

```
backend/app/dayslice/__init__.py                          (new)
backend/app/dayslice/router.py                            (new, ~140 lines)
backend/app/dayslice/service.py                           (new, ~350 lines)
backend/app/main.py                                       (+1 include_router)
backend/schema_sql/app.sql                                (+1 CREATE TABLE)

frontend/src/pages/DaySlice.tsx                           (new, ~400 lines)
frontend/src/components/AsOfPicker.tsx                    (new, ~80 lines)
frontend/src/components/YearMatrix.tsx                    (new, ~140 lines)
frontend/src/components/ProjectionStrip.tsx               (new, ~80 lines)
frontend/src/components/PlanGridEditable.tsx              (new, ~180 lines)
frontend/src/App.tsx                                      (+1 route)
frontend/src/components/Sidebar.tsx                       (+1 nav item)
frontend/src/i18n/locales/{uz,ru,en}.json                 (+dayslice.* block each)
```

No changes to: existing dashboards, existing analytics service code,
existing components other than icon usage in Sidebar.
