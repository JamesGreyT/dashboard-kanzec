# Kanzec Frontend — 100 Design Improvements

A fresh design audit of the rebuilt SPA at `http://localhost:5175`, signed in as `Xurshid`. Walked Login, Dashboard, Orders (data viewer), Worklist, Sales analytics, Comparison matrix, Dayslice, plus admin pages (Audit, Users, Alerts, Ops) at 1440 px and 375 px. Screenshots in [`audit/`](../audit/).

The aesthetic direction is good — restrained warm-paper Almanac, Playfair + DM Sans, gold-on-cream — but the system is **applied unevenly**, breaking when content gets dense (Comparison, Dayslice, ranked tables) and feeling generic in dead zones (empty states, the dashboard's right-hand mini-cards, login). This list separates *system gaps* (rules that should be enforced everywhere) from *page-specific* compositional fixes from *missing affordances* (things users will reach for that don't exist yet).

Numbers are flat for ease of reference, not priority — see the **P0/P1/P2** column.

---

## I. Sidebar / Layout chrome (1–10)

| #  | Pri | Issue | Fix |
|----|-----|-------|-----|
| 1  | P1 | Sidebar has **no top brand divider** — the wordmark sits flush against `ASOSIY` group label, looks like crowding. | Add a 1px horizontal rule under the brand at `~24px` margin, matching the Almanac's printed-page horizontal rules. |
| 2  | P0 | Sidebar groups (`ASOSIY`, `STRATEGIK`, `MA'LUMOTLAR`…) all render as **active by default** with `−` collapse caret — none are collapsed. The caret reads as decoration, not a control. | Either make groups genuinely collapsible (persist state in localStorage) or remove the `+`/`−` carets entirely. The current state is the worst of both. |
| 3  | P1 | The bottom user-card (`Xurshid · Administrator`) has **no visual divider** from the nav above. The "Chiqish" (logout) link blends with the avatar block. | Add a hairline border-top above the user card; pull "Chiqish" further down with a 12 px gap. |
| 4  | P2 | Theme toggle `☾` and language pills `UZ / RU / EN` sit on the same row as the user identity — competes for attention. | Move theme + locale to a settings popover triggered from the avatar; only show the user identity in the rail by default. |
| 5  | P1 | Sidebar width (`240 px`) is fixed; in dense pages (Comparison, Dayslice) the main column gets squeezed. **No collapse-to-icon-rail mode.** | Add a `Ctrl+\` shortcut + chevron to collapse to `~64 px` icon rail, persisting in localStorage. |
| 6  | P1 | Top date stamp `BUGUN · 02 MAY 2026 · 15:05 GMT+5` is **shown on every page**. Reads as repetitive header noise, not editorial signature. | Render the stamp **only on the dashboard** (where temporal context matters). Other pages get just the breadcrumb / page title. |
| 7  | P2 | The skip-to-content link (`Skip to content`) is invisible (`sr-only`) — but the underlying main has no `id="main"` landmark on every route, only some. | Audit `<main id="main">` is set on every page (`Layout.tsx`); add one if missing. |
| 8  | P1 | No **breadcrumb** anywhere. After 3 clicks into `/collection/debt/client/:id` the user has no orientation back to `/collection/worklist`. | Add a 1-line breadcrumb above the page title on detail pages: `Qarzlar › Qarz mijozlar › Цех Ламинатция`. |
| 9  | P2 | Mobile drawer toggle (`☰`) on top-right has **no visible state when open**. The hamburger doesn't morph to ✕. | Animate to `X` icon when sidebar drawer is open (Lucide `Menu` → `X`). |
| 10 | P2 | The "ADMINISTRATOR" badge in the top header bar at the user's name uses `pink/red` background — reads as a **warning**, not status. | Use the same neutral `action-badge` pattern as the role column in Users (`critical` for admin, `plan` for operator, `monitor` for viewer) — but specifically a **smaller** weight, and inline w/ name as text + dot, not a pill. |

---

## II. Login (11–18)

| #  | Pri | Issue | Fix |
|----|-----|-------|-----|
| 11 | P0 | Login card is **vertically centered but visually anchored too high** — at 1440 px there's a giant cream void below it. The card sits at ~30% from top instead of ~45%. | Adjust `min-h-screen flex items-center` placement; pad bottom less than top. |
| 12 | P1 | The brand reads `Kanzec / OPERATSION BOSHQARUV` at the top of the card with **two horizontal rules** flanking the kicker — but the rules end abruptly mid-air. Looks unfinished. | Either extend rules to card edges or remove them — the kicker alone is enough. |
| 13 | P1 | Form inputs are **same color as page background** (`bg-input` ≈ `#EFE5D8`). At first glance the text-fields disappear into the canvas. | Slightly lower input bg-tone (`#E8DCC8`) or add a 1px inner border. |
| 14 | P1 | Submit button (`Kirish`) fills 100% of the card. Looks like a banner, not a CTA. | Pull to `width: auto`, right-align under the password field, with `min-w-32`. Or keep full-width but **add a leading icon** (lucide `ArrowRight`) to make it feel like an action, not a label. |
| 15 | P2 | "Faqat ichki foydalanish uchun" + "Parolni unutdingizmi?" is a **single-line footer** that wraps awkwardly at narrow widths. | Split: kicker on one line, "Parolni unutdingizmi?" as right-aligned ghost link below. |
| 16 | P1 | **No password visibility toggle.** Operators on phones will mis-type. | Add lucide `Eye` / `EyeOff` toggle inside the password input. |
| 17 | P2 | **No "remember me / stay signed in" affordance.** Cookie expires; users re-login daily. | Either auto-extend (cookie + refresh) silently or add a checkbox if you want the user to control it. |
| 18 | P1 | Login has **zero brand storytelling** — could be any SaaS. The Almanac aesthetic is barely visible (just one gold rule). | Add a subtle decorative engraving / monogram behind the card (very low opacity), or quote a one-line operational mantra in the kicker space ("Daftar boshqaruv · 2026"). |

---

## III. Dashboard (19–32)

| #  | Pri | Issue | Fix |
|----|-----|-------|-----|
| 19 | P0 | The **left hero card (`Qarz qoldigi · 788,356`)** dominates ~60% width, while the right column has 4 mini-cards stacked. The mini-cards feel like afterthoughts — Yangi Ogohlantirishlar shows just `—` (dash). | Right-column cards need either real content or a different treatment — make the dashboard a **2-row layout** (hero strip → content) instead of left-half/right-half. |
| 20 | P1 | Hero card has **MTD KIRIM `858 UZS`** as a footer line but `858 UZS` reads as a tiny number — actually plausibly correct (low MTD), but visually it looks like an error vs the `788,356`. | Add unit-scaling: render `858` with same prominence ratio as `788k`; or visually subordinate `858 UZS` as caption-only with a dimmer weight. |
| 21 | P1 | The hero `▲ 577,339 90+ kun kechikkan · 73%` red-arrow line sits **between** the big number and the MTD section, **without visual hierarchy**. Looks like a grep result. | Treat as a delta-pill (red badge), pull below the big number with margin, then a rule, then MTD. |
| 22 | P1 | Mini-card `MTD KIRIM` (right) has `↗` icon button top-right but **no title-link path** — clicking goes where? | Make the entire card clickable to `/data/payments?filter=mtd` and add a hover state. The `↗` should hint at "open detail." |
| 23 | P0 | `YANGI OGOHLANTIRISHLAR` card shows just a dash `—` when empty. **Dead UI.** | Render an editorial empty state: lucide `Bell` icon + "Hammasi joyida" italic + small link "Qoidalar →". Same treatment as Alerts page. |
| 24 | P1 | `BIRINCHI MUROJAAT` (today's first call) card title is uppercase + small — easy to miss. **The most actionable card on the page** deserves more weight. | Promote section title to Playfair regular case (`Bugungi birinchi qo'ng'iroq`), pull-quote treatment. |
| 25 | P1 | `BIRINCHI MUROJAAT` card uses **Cyrillic name** (`Цех Ламинатция`) followed by Latin manager name. Mixed scripts always feel jarring; the Cyrillic comes from the data, but the **typographic treatment** doesn't acknowledge it. | When client name is Cyrillic, swap to Playfair Cyrillic-tested fallback (Lora supports Cyrillic) and ensure ascender height matches the manager line. |
| 26 | P1 | Right-hand `KO'TARILGAN OLDINDAN TO'LOVLAR` — name `Donabay material`, ` 627,825 UZS`, `ortiqcha to'lov`, `yuk yetkazib berilishi kutilmoqda`, `Hammasini ko'rish`. **Five lines, no rhythm.** Reads as bullet list. | Lead with manager + rooms in section-title weight, then the number, then a single italic caption. Drop the kicker `ortiqcha to'lov`. |
| 27 | P2 | The lonely diamond `◆` glyph next to `Donabay material` is decorative-only — and not echoed anywhere else. | Either commit to a "diamond bullet" pattern across editorial cards or remove. |
| 28 | P1 | `Mijoz hujjatini ochish →` is the dashboard's primary affordance for the worklist preview, but it's **bottom-left of the card, low contrast**. | Promote to outline-button weight + move to right-edge. |
| 29 | P2 | The dashboard has **no time-of-day greeting** ("Xayrli kun, Xurshid"). Currently feels like a report, not a workspace. | Add one — cheap warmth, sets tonal register. |
| 30 | P1 | No **MIJOZLAR** section title typography matches the editorial Almanac: section labels use uppercase tracking but the **rule beside them is missing**. | Add the same horizontal hairline beside section titles as in registers (e.g. orders viewer). |
| 31 | P2 | The KPI delta arrows (`▲ 577,339`, `▼ 23.5% MoM`, `▲ 2.0% YoY`) **mix red/green semantically right** but the **font is the body weight** — they should be tabular numerals to align column-wise across cards. | Apply `font-variant-numeric: tabular-nums` globally to delta numbers. |
| 32 | P1 | At desktop, the dashboard scroll is **way too tall** — ~3 viewport heights. After the hero you scroll for paragraphs of muted small cards. | Cut scope: dashboard is hero KPIs + 1 worklist preview + 1 prepayment preview + 1 alert preview. Move RFM, segment matrices, MIJOZLAR list to `/dashboard/details`. |

---

## IV. Data viewer (Orders / Payments / Legal-persons) (33–44)

| #  | Pri | Issue | Fix |
|----|-----|-------|-----|
| 33 | P0 | Search input is rendered as **italic placeholder text** (`ushbu daftarda qidiring…`) without any input chrome — no border, no icon, no lozenge. It's invisible until you click. | Restore lucide `Search` glyph in a pill at left + visible input boundary. The "manuscript" metaphor doesn't justify breaking discoverability. |
| 34 | P1 | Filter chips are **3 narrow pills** (`Date`, `Group`, `Room`) with chevron carets. The carets read as collapse, not dropdown. Use lucide `ChevronDown` distinct from group-collapse `Minus`. | Distinguish the dropdown caret from the sidebar group caret — different glyphs avoid overload. |
| 35 | P1 | The `↓ XLSX` export button sits **far top-right** with no boundary. Reads as caption, not button. Easy to miss. | Lift to `outline-button` style (gold border on hover), pin next to the page title in a subtle button-group. |
| 36 | P0 | The right-edge whisper "ustun nomini bosib filtrlang" is **too discreet** — users miss the column-header chevron filter affordance entirely. | Move that hint **inline next to the FILTRLAR label** AND ensure chevrons render at non-hovered state (currently hover-only). |
| 37 | P1 | All `DATE`, `ROOM`, `DEAL`, `CLIENT`, `PRODUCT`, `GROUP`, `QTY`, `AMOUNT` headers are **uppercase tracking** — reads as a label band, but loses scan ability. Lowercase + small-caps would feel more editorial AND more scannable. | Use `font-variant: small-caps` + sentence-case strings: `Date`, `Room`, `Deal`. |
| 38 | P1 | Currency cells use **lowercase** `usd` while the column header is `AMOUNT`. Numbers look like footnotes. | Right-align currency, add `font-variant-numeric: tabular-nums`, render code as small-caps suffix in muted color. |
| 39 | P1 | Row hover is **nearly invisible** (gold-tint at `5%` opacity is below perceptual threshold on cream). Operators won't know which row their cursor is on. | Bump hover-row to `12-15%` opacity gold OR add a 2-px gold left-rail on hover (matches the active-nav pattern). |
| 40 | P1 | Repeating cells (e.g., `Davron · Davron · Davron · Davron · ...` in ROOM column) create heavy visual noise. **No grouping treatment.** | Optional: enable "Hide repeats" toggle that ditto-marks repeat values to a thin `〃` glyph. Or default-collapse to grouped headers. |
| 41 | P2 | `DEAL` column has IDs like `243114007` — these are **wider than CLIENT names** at the same column width. Numbers eat readability budget. | Apply `font-feature-settings: 'tnum'` and reduce font-size by 1pt; consider truncating with copy-to-clipboard hover. |
| 42 | P1 | Pagination is **invisible from the screenshot** — no "Page 1 of N" footer is rendered above the fold. User scrolls 1000 rows looking for it. | Add a sticky pagination bar at the bottom of the table viewport (not the page). Show row range + page indicator + prev/next pills. |
| 43 | P1 | Empty-state for filtered-result-zero: the spec says "manuscript metaphor"; in practice it's just "Hech narsa topilmadi" plain. | Render an editorial empty state: a centered framed monogram + "No rows match · Clear filters" with a button. |
| 44 | P0 | **No mobile card-list view.** At 375 px the table overflows horizontally with no affordance hint. | Implement card-per-row mode at < `sm` breakpoint: each row becomes a stacked card with primary fields visible. |

---

## V. Worklist / Debt collection (45–56)

| #  | Pri | Issue | Fix |
|----|-----|-------|-----|
| 45 | P1 | Tabs (`Qarz mijozlar` / `Qarz tahlili` / `Oldindan to'lovlar`) are **gold-underlined** + small-icon. The tab icons (`📋 📊 📥`) are emoji-style — feels childish next to the editorial brand. | Replace with consistent lucide outline-stroke icons (`ClipboardList`, `BarChart2`, `Inbox`); reduce icon size to `12px`, slightly muted color. |
| 46 | P0 | **KPI strip values render as `0` for `MUDDATI O'TGAN VA'DALAR` (overdue promises)** — but unclear if "0" means literal zero or "data missing." | Distinguish: if backend returned 0 → show "0 ta · hammasi tushum" with monitor badge. If null → render skeleton. |
| 47 | P1 | The **`90+` aging badges repeat every row** (98% are `90+`) — column becomes wallpaper. | Sort default-DESC by overdue-days so the worst float to top; bucket-color the badge gradient (90+ darker, 60-90 lighter) to make the **few non-90+ rows visually pop**. |
| 48 | P1 | `OXIRGI ALOQA` (last contact) column is **all dashes** in the screenshot — the data exists for some rows but the empty state crushes scanning. | When 50%+ of a column is empty, hide it on default view; surface in the row-drawer instead. |
| 49 | P1 | `MIJOZ` column has **mixed scripts** (Cyrillic `Цех Ламинатция` + Latin `Bichuv seh Polik`) without typographic acknowledgment. | Same fix as #25 — Cyrillic-aware Playfair fallback + locked line height. |
| 50 | P1 | The four KPI cards across the top use **different rule colors** — UMUMIY QARZ (no rule), 90+ KECHIKKAN (no rule), QARZDORLAR (no rule), MUDDATI O'TGAN (gold rule). Inconsistent. | Apply the same gold top-rail to all 4, or remove all 4. Pick one. |
| 51 | P0 | Filter pills (Manager, Yo'nalish, Aging guruhi, Natija, Faqat muddati) — **none have visible focus rings**. Keyboard users will get lost. | Add a 2 px gold focus-ring matching the brand. |
| 52 | P2 | The "Mijoz, INN yoki telefon bo'yicha" search is the **only multi-criteria affordance** — but its placeholder text is so long it overflows. | Shorten to "Qidiruv…" with a tooltip explaining the search scope. |
| 53 | P1 | Aging badge `90+` color (rose/pink) competes with the `ADMINISTRATOR` badge in the header (also rose). | Either differentiate aging badge to `crimson/wine` or change admin-badge color (per #10). |
| 54 | P1 | No **bulk action affordances** (mark contacted, export selected) on rows. Collectors will want to triage in batches. | Add row checkboxes + a sticky bulk-action bar that appears when ≥1 row selected. |
| 55 | P2 | **Client detail page** (`/collection/debt/client/:id`) wasn't captured but the plan called for a 3-column dossier composition. Verify the audit screenshots include it next pass. | Walk it; confirm three-column reads top-down then left-to-right per spec. |
| 56 | P1 | Worklist row-clicks navigate away **instantly** without a confirm or lazy-prefetch. After detail-view, going back loses scroll position. | Use TanStack Query `placeholderData: keepPreviousData` and `react-router-dom` scroll-restore. |

---

## VI. Analytics: Sales / Payments / Returns (57–66)

| #  | Pri | Issue | Fix |
|----|-----|-------|-----|
| 57 | P0 | The **Sales time-series chart** has a hideous straight-line drop at the right edge (data ends 1-2 May, MTD only). Looks like a bug (revenue cliff). | Truncate the chart's x-axis to the last **completed** period or render the partial period with a dashed line + "MTD" annotation. |
| 58 | P1 | Plotly chart background is **white**, breaks the warm-cream surface of the page. | Override Plotly `paper_bgcolor` and `plot_bgcolor` to the cream `#FAF8F5` token. Already lifted but verify it's wired. |
| 59 | P1 | Chart legend (`Tushum` / `Yil avval`) renders top-right inside the chart frame, **inside the warm-paper boundary** — but uses Plotly default sans-serif, not DM Sans. | Set Plotly `font.family = "DM Sans, system-ui"` globally. |
| 60 | P1 | KPI cards `TUSHUM`, `BUYURTMALAR`, `MIJOZLAR SONI`, `O'RTACHA BUYURTMA` show **MoM ▼ + YoY ▲** stacked — but the arrows are the same size + weight. Hard to tell which is the headline metric. | Pull MoM forward as the headline delta (large), demote YoY to a caption beside it. Or vice versa, but **pick one as primary**. |
| 61 | P1 | Filter strip (`Sana oralig'i`, `Yo'nalish`, `Hudud`, `Manager`) is **horizontal-only** — at narrow widths it wraps awkwardly. | Wrap into a `.glass-card` with rules between fields, OR collapse all but the active filter into "+ N more" pill. |
| 62 | P1 | Granularity toggle (`Kun`, `Hafta`, `Oy`, `Chorak`) uses `.month-btn` style — **active state is a gold fill, inactive is muted** — but there's no transition. Click feels jarring. | Add a 200ms cubic-bezier slide for the gold pill across positions. |
| 63 | P2 | Ranked tables below the chart (`ENG YIRIK MIJOZLAR`) use **different column treatment** than the Orders viewer (different padding, no zebra). | Unify: lift `.premium-table` everywhere or define `.ranked-table` once. |
| 64 | P1 | The 12-month sparkline column on ranked tables is **monochrome gold** — no positive/negative signal. | Color sparkline path by trend: green (positive YoY) / rose (negative) / gold (flat). |
| 65 | P1 | YoY column (`▼ 18.2%`) renders right-aligned but in **different position from BUYURTMALAR / O'RTACHA columns** — visual misalignment. | Lock currency/percent columns to a fixed width and right-align consistently. |
| 66 | P1 | No **"Compare to" presets** (vs prior period / prior year) on the Sales page. The user has to manually shift date ranges. | Add a small dropdown or pill row beside the date picker: "vs Yil avval / Choragi avval / Oyi avval". |

---

## VII. Comparison matrix (67–74)

| #  | Pri | Issue | Fix |
|----|-----|-------|-----|
| 67 | P0 | Heatmap palette is a **single beige gradient** — high values and missing values both look cream. **No visual differentiation.** | Use a diverging palette (cool-light to gold-saturated) so the eye instinctively reads "small to big." |
| 68 | P0 | The matrix column for **2024** has empty cells rendered as just dashes that read as "missing" — but row totals include them. Confusing. | Render missing cells with hatched fill or italic `—` AND a tooltip "Ma'lumot yo'q". |
| 69 | P1 | Manager names on the left are **left-aligned default-weight** — no hierarchy. The longest names (`Yusupov Davron Dostonovich`) overflow into the data area. | Truncate at column boundary with ellipsis + tooltip; right-align names if matrix mode is "manager × year" (so the boundary touches the data). |
| 70 | P1 | The total column (`Σ`) is the **only one with a different background** but has no header label. | Label `Σ` as `Jami` with the same uppercase tracking as years. |
| 71 | P1 | Filter strip puts `Yillik / Oylik / Kunlik` toggle next to `Manager / Yo'nalish` selectors — but **`Reja bilan` checkbox** is on the same row as a different visual weight. | Group: mode-toggle on one row, dimension + plan checkbox on another. |
| 72 | P2 | Tabs (`Sotuv / Kirim`) at top use the same gold-underline as Worklist tabs but **smaller** — feels like a sub-tab. | Match tab weight across pages. Pick one canonical `<Tabs>` block. |
| 73 | P0 | **No drill modal triggered on cell click** in the screenshot; the spec says click → drill. Need to verify the wiring isn't visually broken (no hover affordance shown on cells). | Add subtle 1 px gold border on hover; cursor:pointer; click → drill modal per spec. |
| 74 | P1 | Negative values (`-1,579`, `-620`, `-190`) render in **same color as positives** — buried. | Render negatives in rose-red (matches the delta convention from KPI cards). |

---

## VIII. Dayslice (75–82)

| #  | Pri | Issue | Fix |
|----|-----|-------|-----|
| 75 | P0 | **`OY OXIRI PROGNOZI`** (month-end projection) renders as a stacked bar chart with `Min / O'rtacha / Max` legend — but the **bars are stacked**, which means visually `Max = Min + O'rtacha + Max`. **Mathematically wrong as visualization.** | Switch to a **range chart**: a vertical line from Min to Max with O'rtacha tick + diamond glyph for current MTD. Or three discrete dots at each value. |
| 76 | P1 | The two projection cards (Sotuv / Kirim) use **identical layout** but different gold-rail vs no-rail treatment (Kirim has gold top, Sotuv doesn't). Inconsistent. | Apply gold rail to both, OR neither. |
| 77 | P1 | `▲ 56% tezroq · 10% o'rtachadan` reads as two stacked metrics — **but it's one calculation** (current MTD vs avg projection). | Combine into a single one-line caption: "10% o'rtachadan tezroq". |
| 78 | P1 | `MIN / O'RTACHA / MAX` row uses uppercase tracking + tabular nums, but renders **without separator** — three numbers in a row without column-rule. | Add hairline vertical rules between them (`border-r border-border/30`). |
| 79 | P0 | The right-aligned tiny date stamp `2026-05-01 → 2026-05-02 · Kun 2/31` is **easy to miss** but it's the only context anchor for the whole page. | Pull to a section-title weight ("Davr: 1 → 2 May, kun 2/31") near the H1. |
| 80 | P1 | `Reja tahriri` (edit plan) button is a small gold outline pill far right — operators editing plans daily need it more prominent. | Promote to filled-gold button next to filters. |
| 81 | P2 | Year-pill row (`2y 3y 4y 5y 6y`) uses the same `.month-btn` style — but the labels are abbreviations (`2y`). Reads as code, not UI. | Spell out `2 yil`, `3 yil` or use icon + number. |
| 82 | P1 | No **"hozirgi MTD" anchor line** on the chart x-axis — currently just a diamond glyph. | Add a vertical dashed gold line at "today" + "MTD" label with `Day 2/31` caption. |

---

## IX. Admin: Audit / Users / Alerts / Ops (83–90)

| #  | Pri | Issue | Fix |
|----|-----|-------|-----|
| 83 | P1 | **Audit timeline** dot indicators on the left rail are good, but the dot color (`outlined circle`) doesn't change by action class. | Color the dot by action category (red for delete, amber for update, blue for create, neutral for read). Cheap signal. |
| 84 | P1 | Audit row's `TAFSILOTLAR` (details) is a `<details>` element — **the disclosure caret is a default browser triangle.** Breaks the editorial vibe. | Style `<details summary>` with custom chevron + DM Sans. |
| 85 | P0 | **Users page action buttons (`Tahrirlash` / `O'chirish`) clip at 375 px** — the trash icon is half off-screen. | Already partial fix in Session 6; pull actions into a dropdown menu (lucide `MoreHorizontal`) on mobile. |
| 86 | P1 | Bulk-from-rooms result modal renders **plaintext temp passwords** in IBM Plex Mono — good — but **no visual urgency** that these will not be shown again. | Add a critical-red banner: "Bu parollar faqat hozir ko'rsatiladi. Tepadan saqlang." |
| 87 | P1 | Alerts page empty state (`Hammasi joyida`) is good but the bell icon is **outlined-default** — could be more editorial (heraldic glyph, monogram). | Replace with a small custom illustration or a single Playfair `〈〉` flourish. |
| 88 | P1 | Alerts rule kinds dropdown (`dso_gt`, `debt_total_gt`, etc.) shows **raw enum keys** until i18n maps them. Visible during loading. | Render skeleton labels first, then map; never show raw enum. |
| 89 | P1 | Ops `BACKFILL` button is amber-gold but **no destructive-confirmation visual weight** — it kicks off a multi-hour job. | Add a confirmation modal with "This will enqueue N chunks for ~M minutes" + an explicit "Boshlash" verb. |
| 90 | P1 | Ops `OXIRGI RECENT` and `OXIRGI DEEP` cards use **`recent:2026-02-01..2026-05-02`** as a code-style timestamp string. Reads as a parameter, not a label. | Re-render as "Oxirgi: 1 Feb → 2 May" in DM Sans, mono only on the actual dates. |

---

## X. System / cross-cutting (91–100)

| #   | Pri | Issue | Fix |
|-----|-----|-------|-----|
| 91  | P0 | **No skeleton on initial mount of every page** — most pages flash a blank cream canvas for ~300ms before content renders. | Wrap each route's first-viewport in a layout-aware `.shimmer-skeleton` placeholder. |
| 92  | P0 | **Focus rings are missing site-wide** for keyboard navigation. shadcn defaults are stripped by Tailwind reset; no replacement. | Add a global `:focus-visible` style in `index.css`: `outline: 2px solid #D4A843; outline-offset: 2px`. |
| 93  | P1 | **No system-wide toast/notification surface.** Mutations like "log contact" or "edit user" should give a confirmation toast. | Add a `<Toaster />` (sonner or shadcn) at the root; standardize success/error/info treatments with the warm palette. |
| 94  | P1 | **No global command palette** (`Cmd+K`). For a 14-page admin console, this is the single biggest power-user gap. | Add a cmdk component: jump to page, search clients, search managers, search recent contacts. |
| 95  | P1 | **No dark mode walked yet** in the screenshots. Either the toggle works and looks similar (bad) or it's incomplete (worse). | Verify dark-mode walks of every page; the Almanac aesthetic in dark needs different rail-gold balance + ink-paper inversion. |
| 96  | P1 | **Loading "spinner" is a default spinning circle** in the few places it appears. Generic. | Match the brand: a Playfair-set `…` ellipsis that pulses, or a slow gold shimmer band. |
| 97  | P1 | **Currency formatting inconsistent**: `788,356`, `858 UZS`, `627,825 UZS`, `9.0%` — sometimes UZS, sometimes USD, sometimes implicit. | Lock down: `formatMoney(value, currency)` everywhere with `Intl.NumberFormat('uz-UZ')`; show currency code in muted small-caps suffix. |
| 98  | P1 | **No sticky table headers anywhere** — scroll a long table, headers vanish. | Add `position: sticky; top: 0` on `<thead>` for `.premium-table`. |
| 99  | P1 | **No keyboard shortcut help layer** — `?` to open shortcuts overlay is industry standard for admin tools. | Add a `?` hotkey → modal listing global + page-specific shortcuts. |
| 100 | P0 | **Date displays mix locales**: `02 MAY 2026`, `2 May`, `2026-05-02`, `1 May 2026 2 yozuv`, `29 Apr` — at least 4 formats. | Centralize: `formatDate(value, locale, format)` with locked formats per surface — long, short, ISO, with-time. Wire to i18next locale to switch UZ/RU/EN spellings. |

---

## Compositional gaps (already implicit above, called out)

These aren't on the numbered list but are worth treating as standalone projects:

- **Mobile card-list mode** for every table (#44, #85). Currently overflow-x-auto everywhere; that's a punt, not a design.
- **Dark mode pass** (#95) — needs to be a deliberate session, not a CSS toggle.
- **Global toast + confirmation system** (#93, #89) — every mutation should feel anchored.
- **Empty / loading / error states are inconsistent** across pages — the worklist's empty looks different from the dashboard's looks different from the data viewer's. Lock down 3 reusable composed templates.
- **Typography rhythm** — Playfair sizes vary 24/32/40 across H1s without obvious hierarchy. Define a 4-step Almanac scale (display / hero / section / caption) and use those tokens only.
- **Iconography is a mix** of lucide outline + emoji + custom glyphs. Pick lucide outline only; replace anywhere else.
- **Cyrillic/Latin script handling** (#25, #49) — neither font stack handles the mix gracefully. Test and fix the fallback chain.

---

## Priority summary

| Priority | Count | Theme |
|----------|-------|-------|
| P0       | 14    | Blocking: visual bugs, bad math (Dayslice projection), invisible inputs (search, focus rings), broken data viewer affordances, mobile clipping. |
| P1       | 70    | Quality: typography rhythm, color signal, hover states, empty states, keyboard nav, toasts, command palette. |
| P2       | 16    | Polish: micro-interactions, decorative consistency, copy tone. |

If you implement the **14 P0 items only**, the dashboard goes from "AI-built admin tool" to "deliberate operational console." The 70 P1 items raise it to "luxury-tier internal product." The 16 P2 items are aesthetic discipline — the difference between "designed" and "considered."

Suggested attack sequence:

1. **Round 1** (1 session, ~2h): P0 system items — focus rings (#92), skeleton (#91), date format (#100), search input chrome (#33), Dayslice projection bar (#75), filter focus (#51).
2. **Round 2** (1 session, ~3h): Dashboard recomposition (#19, #23, #32) + Worklist sort/badge fixes (#47, #50).
3. **Round 3** (1 session, ~2h): Comparison matrix palette (#67) + currency / negatives (#74, #97) + sticky headers (#98).
4. **Round 4** (1 session, ~3h): Mobile card-list (#44), dark mode pass (#95), command palette (#94).
5. **Round 5** (1 session, ~2h): Toast system (#93), confirmation modals (#89), empty states (#23, #43, #87).
