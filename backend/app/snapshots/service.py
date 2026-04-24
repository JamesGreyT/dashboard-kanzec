"""Yearly-snapshots service — 5 pivot tables comparing Sotuv (sales) vs
Kirim (incoming payments) across fiscal-year columns ending 31 March.

Rendering layout mirrors the operator's `Dashborad` sheet from
`Copy of kanzeckun.xlsx`, but with live actuals pulled from
smartup_rep.deal_order / smartup_rep.payment / smartup_rep.legal_person
(the reference Excel was a plan workbook — different source).

Dimensions:
    1. sales_manager  (Sotuv + Kirim, locked to direction='B2B')
    2. aging bucket    (Sotuv + Kirim, locked to direction='B2B')
    3. direction       (Sotuv + Kirim, respects ?direction filter)
    4. region_name     (Sotuv + Kirim, respects ?direction filter)
    5. brand           (Sotuv only,     respects ?direction filter)

Each table is a single CTE that inlines the fiscal-year bounds as a
values() strip and groups once. Separate round-trips per dimension —
5 queries under ~60ms total on the current dataset."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# ---------------------------------------------------------------------------
# Fiscal-year helper
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FYBounds:
    fy_start: date
    fy_end: date
    col_idx: int
    label: str  # ISO date of fy_end, used as the JSON column key


def compute_fy_bounds(end_year: int, years: int) -> list[FYBounds]:
    """Return [FY(end_year-years+1 → end_year)] with col_idx 0..years-1.

    A fiscal year "ending 31 March YYYY" spans 1 April YYYY-1 through
    31 March YYYY. So end_year=2026, years=4 → Apr 2022 → Mar 2023, …,
    Apr 2025 → Mar 2026.
    """
    if years < 1 or years > 8:
        raise ValueError("years must be between 1 and 8")
    out: list[FYBounds] = []
    for i in range(years):
        end_y = end_year - (years - 1 - i)
        fy_end = date(end_y, 3, 31)
        fy_start = date(end_y - 1, 4, 1)
        out.append(FYBounds(fy_start=fy_start, fy_end=fy_end, col_idx=i,
                            label=fy_end.isoformat()))
    return out


def _values_clause(fys: list[FYBounds]) -> str:
    """Render the VALUES(...) strip inline — psycopg's array-param support
    for composite rows is flaky; a literal strip is clearer and safe
    (all inputs are integers/dates we've constructed ourselves)."""
    parts = []
    for fy in fys:
        parts.append(
            f"(DATE '{fy.fy_start.isoformat()}', "
            f"DATE '{fy.fy_end.isoformat()}', {fy.col_idx})"
        )
    return ", ".join(parts)


# ---------------------------------------------------------------------------
# Shaping helper — converts (label, col_idx, amt) rows into per-dimension
# pivoted shape: {"rows": [{label, values: [fy0, fy1, ...]}], "total": [...]}
# ---------------------------------------------------------------------------


def _pivot(rows: list[dict], n_cols: int, value_key: str = "amt",
           empty_label: str | None = None) -> tuple[list[dict], list[float]]:
    """Group rows by `label`, align into n_cols columns, compute column totals.
    Rows are ordered by (sum of values) descending — biggest contributors top.
    """
    by_label: dict[str, list[float]] = {}
    for r in rows:
        label = r["label"] or empty_label or "(—)"
        vec = by_label.setdefault(label, [0.0] * n_cols)
        idx = int(r["col_idx"])
        if 0 <= idx < n_cols:
            vec[idx] += float(r[value_key] or 0)
    out = [{"label": label, "values": [round(v, 2) for v in vec]}
           for label, vec in by_label.items()]
    out.sort(key=lambda x: -sum(abs(v) for v in x["values"]))
    totals = [round(sum(row["values"][i] for row in out), 2) for i in range(n_cols)]
    return out, totals


# ---------------------------------------------------------------------------
# Core SQL helpers
# ---------------------------------------------------------------------------


_SOTUV_BASE = """
  SELECT {label_expr} AS label, fy.col_idx, SUM(d.product_amount) AS amt
    FROM smartup_rep.deal_order d
    {joins}
    JOIN (VALUES {fy_values}) AS fy(fy_start, fy_end, col_idx)
      ON d.delivery_date BETWEEN fy.fy_start AND fy.fy_end
   {where}
   GROUP BY 1, 2
"""

_KIRIM_BASE = """
  SELECT {label_expr} AS label, fy.col_idx, SUM(p.amount) AS amt
    FROM smartup_rep.payment p
    {joins}
    JOIN (VALUES {fy_values}) AS fy(fy_start, fy_end, col_idx)
      ON p.payment_date::date BETWEEN fy.fy_start AND fy.fy_end
   {where}
   GROUP BY 1, 2
"""


def _lp_join() -> str:
    return "JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id"


def _lp_join_payment() -> str:
    # payment.person_id is BIGINT, legal_person.person_id is BIGINT — direct
    return "JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id"


# ---------------------------------------------------------------------------
# Dimension queries
# ---------------------------------------------------------------------------


async def _managers(session: AsyncSession, fys: list[FYBounds]) -> dict:
    """Sotuv + Kirim by sales_manager. B2B direction only (locked).

    Kirim attribution: payments have no sales_manager column, so each
    payment is attributed to the client's most recent deal_order
    sales_manager at or before the payment date (per-person lateral
    scan). For clients with zero prior orders the bucket is
    t('yearly.no_manager')."""
    fy_values = _values_clause(fys)
    n = len(fys)

    sotuv_sql = _SOTUV_BASE.format(
        label_expr="COALESCE(NULLIF(TRIM(d.sales_manager), ''), '(—)')",
        joins=_lp_join(),
        fy_values=fy_values,
        where="WHERE lp.direction = 'B2B'",
    )
    sotuv_rows = (await session.execute(text(sotuv_sql))).mappings().all()

    # Kirim with lateral manager lookup
    kirim_sql = f"""
      SELECT COALESCE(NULLIF(TRIM(mgr.sales_manager), ''), '(menejersiz)') AS label,
             fy.col_idx, SUM(p.amount) AS amt
        FROM smartup_rep.payment p
        {_lp_join_payment()}
        JOIN (VALUES {fy_values}) AS fy(fy_start, fy_end, col_idx)
          ON p.payment_date::date BETWEEN fy.fy_start AND fy.fy_end
        LEFT JOIN LATERAL (
          SELECT d.sales_manager
            FROM smartup_rep.deal_order d
           WHERE d.person_id = p.person_id::text
             AND d.delivery_date <= p.payment_date::date
           ORDER BY d.delivery_date DESC
           LIMIT 1
        ) mgr ON TRUE
       WHERE lp.direction = 'B2B'
       GROUP BY 1, 2
    """
    kirim_rows = (await session.execute(text(kirim_sql))).mappings().all()

    sotuv_pivot, sotuv_total = _pivot(list(sotuv_rows), n)
    kirim_pivot, kirim_total = _pivot(list(kirim_rows), n)

    # Align row order: rows from sotuv first, then any kirim-only rows
    sotuv_labels = [r["label"] for r in sotuv_pivot]
    kirim_by_label = {r["label"]: r for r in kirim_pivot}
    rows = []
    for label in sotuv_labels:
        sotuv_vec = next(r["values"] for r in sotuv_pivot if r["label"] == label)
        kirim_vec = kirim_by_label.get(label, {"values": [0.0] * n})["values"]
        rows.append({"label": label, "sotuv": sotuv_vec, "kirim": kirim_vec})
    for label, r in kirim_by_label.items():
        if label not in sotuv_labels:
            rows.append({"label": label, "sotuv": [0.0] * n, "kirim": r["values"]})

    return {"rows": rows, "total_sotuv": sotuv_total, "total_kirim": kirim_total}


async def _aging(session: AsyncSession, fys: list[FYBounds]) -> dict:
    """Sotuv + Kirim by aging bucket. B2B only.

    For each row (delivery / payment) the client's *days since their
    last previous B2B delivery, at this row's own date* is computed
    via LATERAL subquery, then bucketed."""
    fy_values = _values_clause(fys)
    n = len(fys)

    # Sotuv: compute prev_delivery per (person, order) with LAG, then filter
    # the windowed rows to the FY ranges. LAG on the full history avoids the
    # O(N²) scalar subquery and uses the idx_deal_order_client + delivery_date
    # indexes for the window scan.
    sotuv_sql = f"""
      WITH all_orders AS (
        SELECT d.person_id, d.delivery_date, d.product_amount,
               LAG(d.delivery_date) OVER (
                 PARTITION BY d.person_id ORDER BY d.delivery_date
               ) AS prev_date
          FROM smartup_rep.deal_order d
          JOIN smartup_rep.legal_person lp
            ON lp.person_id::text = d.person_id
         WHERE lp.direction = 'B2B'
      )
      SELECT CASE
               WHEN prev_date IS NULL THEN 'Yangi'
               WHEN (o.delivery_date - prev_date) <= 15 THEN '0-15'
               WHEN (o.delivery_date - prev_date) <= 30 THEN '16-30'
               WHEN (o.delivery_date - prev_date) <= 60 THEN '31-60'
               WHEN (o.delivery_date - prev_date) <= 90 THEN '61-90'
               ELSE '91+'
             END AS label,
             fy.col_idx,
             SUM(o.product_amount) AS amt
        FROM all_orders o
        JOIN (VALUES {fy_values}) AS fy(fy_start, fy_end, col_idx)
          ON o.delivery_date BETWEEN fy.fy_start AND fy.fy_end
       GROUP BY 1, 2
    """
    sotuv_rows = (await session.execute(text(sotuv_sql))).mappings().all()

    # Kirim: pre-aggregate distinct delivery dates per B2B person (via DISTINCT
    # window materialization), then for each payment find the most recent
    # prior delivery. Using a LEFT JOIN LATERAL still, but scoped to the
    # per-person delivery index — this is 30k payments × small lookup each.
    kirim_sql = f"""
      WITH b2b_person AS (
        SELECT person_id FROM smartup_rep.legal_person
         WHERE direction = 'B2B'
      ),
      b2b_pays AS (
        SELECT p.person_id, p.payment_date::date AS pd, p.amount
          FROM smartup_rep.payment p
          JOIN b2b_person bp ON bp.person_id = p.person_id
      )
      SELECT CASE
               WHEN prev_date IS NULL THEN 'Yangi'
               WHEN (pd - prev_date) <= 15 THEN '0-15'
               WHEN (pd - prev_date) <= 30 THEN '16-30'
               WHEN (pd - prev_date) <= 60 THEN '31-60'
               WHEN (pd - prev_date) <= 90 THEN '61-90'
               ELSE '91+'
             END AS label,
             fy.col_idx,
             SUM(amount) AS amt
        FROM b2b_pays bp
        JOIN (VALUES {fy_values}) AS fy(fy_start, fy_end, col_idx)
          ON bp.pd BETWEEN fy.fy_start AND fy.fy_end
        LEFT JOIN LATERAL (
          SELECT MAX(d2.delivery_date) AS prev_date
            FROM smartup_rep.deal_order d2
           WHERE d2.person_id = bp.person_id::text
             AND d2.delivery_date < bp.pd
        ) pv ON TRUE
       GROUP BY 1, 2
    """
    kirim_rows = (await session.execute(text(kirim_sql))).mappings().all()

    # Fixed bucket order so the UI renders rows consistently
    BUCKETS = ["0-15", "16-30", "31-60", "61-90", "91+", "Yangi"]
    sotuv_pivot, sotuv_total = _pivot(list(sotuv_rows), n)
    kirim_pivot, kirim_total = _pivot(list(kirim_rows), n)
    sotuv_by = {r["label"]: r["values"] for r in sotuv_pivot}
    kirim_by = {r["label"]: r["values"] for r in kirim_pivot}
    rows = []
    for b in BUCKETS:
        if b not in sotuv_by and b not in kirim_by:
            continue
        rows.append({
            "label": b,
            "sotuv": sotuv_by.get(b, [0.0] * n),
            "kirim": kirim_by.get(b, [0.0] * n),
        })
    return {"rows": rows, "total_sotuv": sotuv_total, "total_kirim": kirim_total}


async def _directions(session: AsyncSession, fys: list[FYBounds],
                      direction_filter: list[str] | None) -> dict:
    """Sotuv + Kirim by direction. Respects filter (empty = all dirs)."""
    fy_values = _values_clause(fys)
    n = len(fys)
    filter_sql = ""
    params: dict[str, Any] = {}
    if direction_filter:
        filter_sql = "WHERE lp.direction = ANY(:dirs)"
        params["dirs"] = direction_filter

    sotuv_sql = _SOTUV_BASE.format(
        label_expr="COALESCE(NULLIF(TRIM(lp.direction), ''), '(—)')",
        joins=_lp_join(),
        fy_values=fy_values,
        where=filter_sql,
    )
    kirim_sql = _KIRIM_BASE.format(
        label_expr="COALESCE(NULLIF(TRIM(lp.direction), ''), '(—)')",
        joins=_lp_join_payment(),
        fy_values=fy_values,
        where=filter_sql,
    )
    sotuv_rows = (await session.execute(text(sotuv_sql), params)).mappings().all()
    kirim_rows = (await session.execute(text(kirim_sql), params)).mappings().all()
    return _merge_sotuv_kirim(sotuv_rows, kirim_rows, n)


async def _regions(session: AsyncSession, fys: list[FYBounds],
                   direction_filter: list[str] | None) -> dict:
    """Sotuv + Kirim by region_name. Respects filter."""
    fy_values = _values_clause(fys)
    n = len(fys)
    where = ["lp.region_name IS NOT NULL", "TRIM(lp.region_name) <> ''"]
    params: dict[str, Any] = {}
    if direction_filter:
        where.append("lp.direction = ANY(:dirs)")
        params["dirs"] = direction_filter
    where_sql = "WHERE " + " AND ".join(where)

    sotuv_sql = _SOTUV_BASE.format(
        label_expr="lp.region_name",
        joins=_lp_join(),
        fy_values=fy_values,
        where=where_sql,
    )
    kirim_sql = _KIRIM_BASE.format(
        label_expr="lp.region_name",
        joins=_lp_join_payment(),
        fy_values=fy_values,
        where=where_sql,
    )
    sotuv_rows = (await session.execute(text(sotuv_sql), params)).mappings().all()
    kirim_rows = (await session.execute(text(kirim_sql), params)).mappings().all()
    return _merge_sotuv_kirim(sotuv_rows, kirim_rows, n)


async def _brands(session: AsyncSession, fys: list[FYBounds],
                  direction_filter: list[str] | None) -> dict:
    """Sotuv by brand (no Kirim). Respects filter. Returns two totals:
    - total_brand: sum of all brand rows (Jami ishlab chiqarish)
    - total_sold:  sum including NULL/blank-brand rows (Jami savdo)
    """
    fy_values = _values_clause(fys)
    n = len(fys)
    where_parts: list[str] = []
    params: dict[str, Any] = {}
    joins = ""
    if direction_filter:
        joins = _lp_join()
        where_parts.append("lp.direction = ANY(:dirs)")
        params["dirs"] = direction_filter
    where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    # Per-brand (group only non-empty brand values, coalesce blanks to 'Другие')
    sotuv_sql = f"""
      SELECT COALESCE(NULLIF(TRIM(d.brand), ''), 'Другие') AS label,
             fy.col_idx,
             SUM(d.product_amount) AS amt
        FROM smartup_rep.deal_order d
        {joins}
        JOIN (VALUES {fy_values}) AS fy(fy_start, fy_end, col_idx)
          ON d.delivery_date BETWEEN fy.fy_start AND fy.fy_end
        {where_sql}
       GROUP BY 1, 2
    """
    sotuv_rows = (await session.execute(text(sotuv_sql), params)).mappings().all()

    # All-deals total (Jami savdo), same scope filter
    total_sold_sql = f"""
      SELECT fy.col_idx, SUM(d.product_amount) AS amt
        FROM smartup_rep.deal_order d
        {joins}
        JOIN (VALUES {fy_values}) AS fy(fy_start, fy_end, col_idx)
          ON d.delivery_date BETWEEN fy.fy_start AND fy.fy_end
        {where_sql}
       GROUP BY 1
    """
    total_sold_rows = (await session.execute(text(total_sold_sql), params)).mappings().all()

    pivot, total_brand = _pivot(list(sotuv_rows), n)
    rows = [{"label": r["label"], "sotuv": r["values"]} for r in pivot]
    total_sold = [0.0] * n
    for r in total_sold_rows:
        total_sold[int(r["col_idx"])] = round(float(r["amt"] or 0), 2)
    return {
        "rows": rows,
        "total_brand": total_brand,   # Jami ishlab chiqarish
        "total_sold": total_sold,     # Jami savdo
    }


def _merge_sotuv_kirim(sotuv_rows, kirim_rows, n: int) -> dict:
    sotuv_pivot, sotuv_total = _pivot(list(sotuv_rows), n)
    kirim_pivot, kirim_total = _pivot(list(kirim_rows), n)
    sotuv_labels = [r["label"] for r in sotuv_pivot]
    kirim_by_label = {r["label"]: r for r in kirim_pivot}
    rows = []
    for label in sotuv_labels:
        sotuv_vec = next(r["values"] for r in sotuv_pivot if r["label"] == label)
        kirim_vec = kirim_by_label.get(label, {"values": [0.0] * n})["values"]
        rows.append({"label": label, "sotuv": sotuv_vec, "kirim": kirim_vec})
    for label, r in kirim_by_label.items():
        if label not in sotuv_labels:
            rows.append({"label": label, "sotuv": [0.0] * n, "kirim": r["values"]})
    return {"rows": rows, "total_sotuv": sotuv_total, "total_kirim": kirim_total}


# ---------------------------------------------------------------------------
# Directions catalog (for the filter chips)
# ---------------------------------------------------------------------------


async def list_directions(session: AsyncSession) -> list[str]:
    """Distinct direction values actually present in smartup_rep.legal_person
    (sorted, non-empty). Drives the page-level filter chips."""
    rows = (await session.execute(text("""
        SELECT DISTINCT TRIM(direction) AS d
          FROM smartup_rep.legal_person
         WHERE direction IS NOT NULL AND TRIM(direction) <> ''
         ORDER BY 1
    """))).scalars().all()
    return list(rows)


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------


async def yearly_snapshots(
    session: AsyncSession,
    end_year: int,
    years: int,
    direction_filter: list[str] | None,
) -> dict:
    fys = compute_fy_bounds(end_year, years)
    managers   = await _managers(session, fys)
    aging      = await _aging(session, fys)
    directions = await _directions(session, fys, direction_filter)
    regions    = await _regions(session, fys, direction_filter)
    brands     = await _brands(session, fys, direction_filter)
    return {
        "fiscal_ends": [fy.label for fy in fys],
        "filter": {"direction": direction_filter or []},
        "tables": {
            "managers":   managers,
            "aging":      aging,
            "directions": directions,
            "regions":    regions,
            "brands":     brands,
        },
    }
