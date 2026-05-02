# Mobile Card Stream — Component & Page Rebuild Plan (Round 2)

## Why this exists

Round 1 (PRs #1–#11, May 2026) was a re-skin disguised as a redesign. PRs #3, #4, #6, #7, #8, #9, #10, #11 swapped Tailwind tokens (sage→mint, Onest→DM Sans) but kept the JSX structure of every page and component identical to the pre-redesign code. The mockups under [design-explorations/10-mobile-card-stream/](../design-explorations/10-mobile-card-stream/) describe fundamentally different component anatomies — none of that shipped.

Those eight PRs were reverted in PR #12. **Kept** from round 1: PR #1 (foundation tokens), PR #2 (layout/sidebar/login real rewrite), PR #5 (sidebar nav fix).

This plan governs Round 2 — actually rebuilding components and pages to match the mockups.

---

## Hard rules (non-negotiable, no matter how many compactions away the session is)

1. **One page per PR. No "component kit" PRs.** Round 1 used 22-file class-swap PRs to fake progress. Banned. Each PR rebuilds exactly one page; if that page needs a new component, the component is built inside that PR.
2. **JSX must structurally change.** A real rebuild adds and removes DOM nodes. A re-skin only edits attributes. Before opening a PR, run:
   ```
   git diff main...HEAD -- frontend/src/pages/<Page>.tsx | grep -E '^[+-]\s*<' | wc -l
   ```
   Floor: **≥40 added/removed JSX-tag lines** for a page rebuild PR. Below that, it's a re-skin and must not be opened.
3. **Mockup-as-spec.** Every page rebuild PR description must include: (a) the mockup HTML path being implemented, (b) screenshot of the rendered page at 390px width, (c) screenshot of the rendered page at 1280px width, (d) screenshot of the corresponding mockup section. Side-by-side. If they don't visually match, the PR is rejected.
4. **Stop after each PR for review.** After opening a page rebuild PR, do not start the next page until the user reviews and merges. One PR wasted is fine; ten in a row is what happened in round 1.
5. **No global page-level grid splits.** No `<div className="grid md:grid-cols-2">` at the top of a page. Widget rails from the mockups become stacked full-width sections below the primary content.
6. **Login screen** stays as it is (PR #2 already correct): single centered card, no marketing, no manager info.
7. **Don't touch:** backend (`backend/`), routes (`App.tsx`), i18n catalogs (`frontend/src/i18n/locales/`), sidebar nav structure (the Item array order/role-visibility), shadcn primitives in `frontend/src/components/ui/` unless directly broken.

---

## Design tokens (already shipped, do not touch)

These came from PR #1 and are the design system foundation:

- Fonts: **DM Sans** (body, sans), **Fraunces** (display — only for hero KPI numbers), **DM Mono** (numerics, eyebrows)
- Palette: paper `#FAFAFA`, ink `#111827 / #374151 / #6B7280 / #9CA3AF`, mint `#10B981` (dk `#059669`, bg `#ECFDF5`), coral `#F87171` (dk `#DC2626`, bg `#FEF2F2`), amber `#F59E0B` (bg `#FFFBEB`), line `#EEF0F2`
- Radii: `rounded-2xl` = 1.25rem, `rounded-3xl` = 1.75rem
- Shadows: `shadow-card`, `shadow-cardlg`, `shadow-phone`, `shadow-inset`, `shadow-press`, `shadow-soft`
- Animations: `animate-floaty`, `animate-drawline`, `animate-pulsemint`, `animate-shimmer`, `animate-rise`
- Utility classes (in [globals.css](../frontend/src/styles/globals.css)): `.page-bg`, `.grain`, `.kpi-num`, `.eyebrow`, `.btn-mint`, `.btn-mint-soft`, `.pill-call`, `.pill-sms`, `.spark-path`, `.pull-handle`, `.caption`

The mockups in [design-explorations/10-mobile-card-stream/dashboard.html lines 13–200](../design-explorations/10-mobile-card-stream/dashboard.html) are the canonical reference for how these tokens compose.

---

## Order of work

PRs are sequential. Each is its own branch off `main`, squash-merged, deploy verified green before the next starts. Fail fast — if PR-A reveals the rebuild contract is too vague or too strict, fix the contract before PR-B.

### PR-A — DebtWorklist rebuild

**Mockup:** [design-explorations/10-mobile-card-stream/debt-worklist.html](../design-explorations/10-mobile-card-stream/debt-worklist.html)

**Why first:** highest-impact page (operators stare at it daily), fully fleshed-out mockup, biggest structural delta from current JSX → best proof I can do real rebuilds.

**Required structural changes from current state:**
- Remove the current `<table>` + `<tr>`/`<td>` debtor list → replace with a vertical stack of phone-style debtor cards. Each card is a `<button>` (full-width, left-aligned, mint focus ring) containing:
  - Top row: avatar/initials disc + debtor name (DM Sans 16/600) + outstanding amount in `.kpi-num` (Fraunces, coraldk if 90+ days)
  - Aging strip inline (4-segment `AgingBar`, full bleed of card width)
  - Meta row: last contact (DM Mono), days since (caption), region (caption)
  - Action pills row (right-aligned): `.pill-call` + `.pill-sms` if phone present
  - Pull-handle indicator at right edge (`.pull-handle` rotated; tappable to expand inline)
- KPI strip (4 mini cards) above the list — keep, but use `.kpi-num` for the values, eyebrow above each
- "By collector" rollup → stacked section *below* the debtor list (admin only), not a sidebar
- "Quick win" callout → dismissible mint banner above the list
- Remove the right-side sotuvchi rollup rail entirely
- Filter bar at top: one row of chip-style toggles (region / aging bucket / collector) + search input

**Components built/touched in this PR:**
- New: `components/DebtorCard.tsx` (replaces table-row anatomy)
- Touched: `pages/DebtWorklist.tsx` (rewrite top-to-bottom)
- Possibly new: `components/CollectorRollup.tsx` if extraction makes sense

**Verification:**
- JSX-tag-line floor: ≥40 added/removed (run the grep one-liner from rule 2)
- Live at https://kanzec.ilhom.work/collection/worklist matches the mockup at both 390px and 1280px
- Click a card → existing drilldown navigation still works (no route changes)
- Scope filter still works (operator scoping logic unchanged)
- Build green, deploy green

**PR title:** `redesign: rebuild DebtWorklist (Mobile Card Stream)`

---

### PR-B — Dashboard rebuild

**Mockup:** [design-explorations/10-mobile-card-stream/dashboard.html](../design-explorations/10-mobile-card-stream/dashboard.html)

**Required structural changes:**
- Drop current 12-col grid masthead → single-column PageHeading + AsOfPicker
- Hero KPI strip: 4 cards in one horizontal row, each value in `.kpi-num` at 60–80px Fraunces (NOT the cramped 28px the current `MetricCard` uses). On mobile, 2×2 grid
- Spotlight (sotuv vs kirim): ONE full-width card with two halves inside it; not a 2-col page-level grid
- Secondary tiles (projection / debt / RFM): 3-card horizontal row, stack on mobile
- Trend chart: full-width card, mint stroke + gradient fill, 1px dashed grid
- No right-side widget rail. If the mockup shows one, render below as a stacked section

**Components built/touched:**
- New: `components/HeroKpiCard.tsx` (replaces MetricCard for hero strip — bigger, Fraunces, sparkline strip)
- Touched: `pages/Dashboard.tsx` (rewrite)
- Touched: `components/MetricCard.tsx` only if needed for secondary tiles

**Verification floor:** ≥40 JSX-tag-line delta on Dashboard.tsx. Visual diff vs mockup at 390/1280px.

**PR title:** `redesign: rebuild Dashboard (Mobile Card Stream)`

---

### PR-C — DebtClient rebuild

**Mockup:** [design-explorations/10-mobile-card-stream/debt-client.html](../design-explorations/10-mobile-card-stream/debt-client.html)

**Required structural changes:**
- Hero card: full-width, client name (Fraunces 44px), outstanding (`.kpi-num` 60px coraldk), contact pills row (`.pill-call`, `.pill-sms`, "Log contact" mint button)
- Inline below hero: priority score banner (full width)
- Aging strip (4-cell row) + Ledger strip (4-cell row) — horizontal cell rows, not page split
- Tabs (Calls / Orders / Payments) — full width, segmented-control look
- Active tab content fills the column
- Below tabs as stacked sections: sotuvchi handoff / recovery odds / hujjatlar
- No right rail

**Components:** likely a new `components/HeroCard.tsx` for the masthead pattern, reusable on DebtClient + future detail pages.

**Verification floor:** ≥40 JSX-tag-line delta.

**PR title:** `redesign: rebuild DebtClient (Mobile Card Stream)`

---

### PR-D — DataViewer rebuild

**Mockup:** [design-explorations/10-mobile-card-stream/data-viewer.html](../design-explorations/10-mobile-card-stream/data-viewer.html)

**Required structural changes:**
- Sub-tabs (orders / payments / legal-persons) at top — segmented control
- Toolbar row (filters / density / columns / export) below tabs — chip toggles
- Desktop: dense data grid with sticky header, DM Mono uppercase column labels, `tabular-nums` numeric cells, mint left-edge stripe on selected row, density toggle 40px / 56px row heights
- **Mobile (< md)**: card-fallback per row (each row → a card with primary cell highlighted), NOT a horizontally-scrolling table
- Drawer slides in from right when row clicked (overlay, not page split)
- Pagination at bottom

**Components built/touched:**
- Heavy rewrite of `components/DataTable.tsx` — has to grow a `mobileFallback={true}` mode that renders cards instead of `<table>` below `md` breakpoint
- Touched: `pages/DataViewer.tsx`

**Verification:** test on 390px viewport — must render as cards, not a scroll-clipped table. JSX-tag-line floor ≥40 across `DataTable.tsx` + `DataViewer.tsx`.

**PR title:** `redesign: rebuild DataViewer (Mobile Card Stream)`

---

### PR-E — Analytics suite rebuild (Sales / Payments / Returns / Comparison)

**Mockup:** [design-explorations/10-mobile-card-stream/analytics.html](../design-explorations/10-mobile-card-stream/analytics.html)

These four pages share structure; rebuild Sales first, replicate structure to the other three within the same PR (they're thin wrappers).

**Required structural changes per page:**
- PageHeading + WindowPicker + DirectionMultiSelect at top (filter bar)
- KPI strip (5 cards horizontal row, Fraunces values)
- TimeSeriesChart full-width card with ChartAnnotations (mint stroke, gradient fill)
- 5 ranked-table tabs (Clients / Managers / Brands / Regions / RFM) — full-width section, segmented tabs
- Right-rail content from mockup (Heatmap / RFM segment counts / Projection / Top hududlar) → stacked full-width sections at bottom of page
- Auto-narrative paragraph at the very bottom

**Components built/touched:**
- Possibly new: `components/SegmentedTabs.tsx` (reusable for the ranked-table tab strip and elsewhere)
- Heavy rewrite of `components/RankedTable.tsx` to match mockup (rank #, avatar/name+meta cell, mono numerics right-aligned, sparkline column, footer total row in `bg-mintbg`)
- Touched: `pages/Sales.tsx`, `pages/Payments.tsx`, `pages/Returns.tsx`, `pages/Comparison.tsx`

**Verification:** ≥40 JSX-tag-line delta on Sales.tsx alone. The other three should mostly inherit from shared components, but each must be visibly different from the current state.

**PR title:** `redesign: rebuild analytics suite (Mobile Card Stream)`

---

### PR-F — DaySlice + Ops rebuild

**Mockups:**
- [design-explorations/10-mobile-card-stream/dayslice.html](../design-explorations/10-mobile-card-stream/dayslice.html)
- (Ops doesn't have a dedicated mockup — adapt the components.html admin patterns)

**DaySlice required changes:**
- Header: Fraunces title + AsOfPicker + DirectionMultiSelect on one line
- ProjectionStrip: full-bleed hero card (NOT the cramped current row)
- YearMatrix (Sotuv): full-width card, mint cell-fill heat scale (opacity 0.06 → 0.85), DM Mono year headers
- YearMatrix (Kirim): same structure
- PlanGridEditable: full-width section with "Edit plan" eyebrow (the mockup put it in a right rail; flatten)
- Tarix + Quick actions: 2-card horizontal row at the bottom (both fully visible, not a split)
- DrillPanel: stays an overlay popover when a cell is clicked

**Ops required changes:**
- PageHeading + refresh button
- 3-card KPI row (workers / pending chunks / room totals)
- Worker grid: full-width card list (one card per worker, not a table row)
- Live wire queue table: full-width card (table inside is fine, Ops is admin-only)
- Backfill queue table: full-width card

**Components built/touched:**
- Heavy rewrite of `YearMatrix.tsx` (cell-fill heat scale, new header anatomy)
- Heavy rewrite of `PlanGridEditable.tsx` (mint focus on inputs, amber-tinted dirty cells)
- Heavy rewrite of `ProjectionStrip.tsx` (hero card, not horizontal strip)
- Touched: `pages/DaySlice.tsx`, `pages/Ops.tsx`

**Verification:** ≥40 JSX-tag-line delta on DaySlice.tsx + ≥40 on Ops.tsx.

**PR title:** `redesign: rebuild DaySlice + Ops (Mobile Card Stream)`

---

### PR-G — Admin trio rebuild (AdminUsers, AdminAlerts, AdminAudit)

**Mockup:** [design-explorations/10-mobile-card-stream/admin.html](../design-explorations/10-mobile-card-stream/admin.html)

**Required structural changes:**
- AdminUsers: full-width user card list (NOT a table) — each user a card with avatar, name + role, room scope, last-seen, actions row. "+Bulk from rooms" + "+New user" buttons in toolbar
- AdminAlerts: full-width rule cards — each rule a card with metric, threshold, channels (chip row), edit/delete actions
- AdminAudit: full-width timeline grouped by day (the current row-per-event table → time-grouped sections, each section a card with day header + event entries inside, expandable for JSON details via JsonBlock)

**Components built/touched:**
- New: `components/UserCard.tsx`, `components/RuleCard.tsx`
- Heavy rewrite of `pages/AdminAudit.tsx` to render time-grouped sections instead of a flat table

**Verification:** ≥40 JSX-tag-line delta on each of the three admin pages.

**PR title:** `redesign: rebuild admin trio (Mobile Card Stream)`

---

### PR-H — Polish + dark mode + a11y

After all 7 page rebuilds are merged, do a real polish pass:
- Dark mode token audit per page
- Keyboard focus rings (mint, 2px offset, 2px ring) on every interactive element
- Mobile breakpoints — every page works at 390px (Mobile Card Stream's reference width)
- Animation rhythm — staggered `rise` entrance on cards, `drawline` on charts, `pulsemint` on live dots, `shimmer` on skeletons
- Final visual diff against [components.html gallery](../design-explorations/10-mobile-card-stream/components.html)
- Accessibility: contrast WCAG AA, `aria-*` on toggles, skip link works
- Tag release `v2.0.0-redesign` after merge

**PR title:** `redesign: polish + dark mode + a11y`

---

## Files NOT to touch (deliberately, same as Round 1)

- [frontend/src/App.tsx](../frontend/src/App.tsx) — routes
- Backend (`backend/`) — pure visual redesign, no API changes
- i18n catalogs in [frontend/src/i18n/locales/](../frontend/src/i18n/locales)
- Sidebar nav `Item` array in [Sidebar.tsx](../frontend/src/components/Sidebar.tsx) — keep groups, order, role visibility
- [RequireAuth.tsx](../frontend/src/components/RequireAuth.tsx)
- Foundation tokens (PR #1) — already done

## How to verify before opening any PR (the checklist)

1. `cd frontend && npm run build` — passes
2. `cd frontend && npm run dev` — open the page in browser, both at 390px and 1280px viewport
3. Visual side-by-side with the mockup HTML — match ≥80%
4. `git diff main...HEAD -- frontend/src/pages/<page>.tsx | grep -E '^[+-]\s*<' | wc -l` — ≥40
5. PR description includes the mockup path + 3 screenshots (page at 390px, page at 1280px, mockup section)
6. Smoke-test the user flow on the page (filters, drilldowns, navigation)

If any step fails, fix before pushing. Don't open a PR that fails its own verification.

## Recovery / "where am I?"

If a future session loses context, the source of truth is:
- This file
- The mockups under [design-explorations/10-mobile-card-stream/](../design-explorations/10-mobile-card-stream/)
- `git log --oneline main` — the last `redesign: rebuild *` commit tells you the next PR letter to do

Tokens (PR #1), layout/login (PR #2), nav fix (PR #5) are the locked-in foundation. Everything else under `pages/` and `components/` (excluding `components/ui/`) is fair game for rebuilding.
