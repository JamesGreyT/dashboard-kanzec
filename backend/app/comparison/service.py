"""Comparison page — generic dimension × time-bucket pivot for Sotuv & Kirim.

A single matrix shape covers three time grains (yearly / monthly / daily) and
five dimensions (manager / direction / brand / model / region). The service
also surfaces the analytical layer the operator needs on top of raw numbers:
column-share %, rank movement vs. previous period, and (for the manager
dimension only) plan vs. fakt overlay sourced from `app.dayslice_plan`.

Sotuv aggregates `deal_order.product_amount` net of returns (negative rows),
matching the Excel `Dashborad` SUMIFS convention. Kirim attributes each
payment to the most-recent prior `deal_order.sales_manager` via a LATERAL
join — verbatim with `dayslice.service._grid_kirim` so manager attribution
stays consistent across the two pages.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.filters import Filters, clause, exclude_kirim_methods_clause


Mode = Literal["yearly", "monthly", "daily"]
Dimension = Literal["manager", "direction", "brand", "model", "region"]
Measure = Literal["sotuv", "kirim"]

NULL_BUCKET = "(—)"

# Brand and model live on `deal_order` only — payments have no product
# context, and forcing a LATERAL join just to attribute brand to a payment
# would be noise. Reject those values for Kirim at the router boundary.
KIRIM_DIMENSIONS: tuple[Dimension, ...] = ("manager", "direction", "region")
SOTUV_DIMENSIONS: tuple[Dimension, ...] = (
    "manager", "direction", "brand", "model", "region",
)


@dataclass(frozen=True)
class BucketSpec:
    """Resolved time-bucket request — what the SQL layer consumes."""
    mode: Mode
    year_start: int
    year_end: int
    year: int                # for monthly/daily
    month: int               # for daily

    @classmethod
    def yearly(cls, year_end: int, years: int) -> "BucketSpec":
        return cls(mode="yearly",
                   year_start=year_end - years + 1, year_end=year_end,
                   year=year_end, month=1)

    @classmethod
    def monthly(cls, year: int) -> "BucketSpec":
        return cls(mode="monthly",
                   year_start=year, year_end=year,
                   year=year, month=1)

    @classmethod
    def daily(cls, year: int, month: int) -> "BucketSpec":
        return cls(mode="daily",
                   year_start=year, year_end=year,
                   year=year, month=month)

    def column_labels(self) -> list[str]:
        """Human-readable column headers in the response payload."""
        if self.mode == "yearly":
            return [str(y) for y in range(self.year_start, self.year_end + 1)]
        if self.mode == "monthly":
            return [str(m) for m in range(1, 13)]
        days = calendar.monthrange(self.year, self.month)[1]
        return [str(d) for d in range(1, days + 1)]


# ---------------------------------------------------------------------------
# Bucket CTE — generates one (label, s, e) row per output column
# ---------------------------------------------------------------------------


def _buckets_cte(spec: BucketSpec) -> tuple[str, dict[str, Any]]:
    """SQL fragment + bind params for a `buckets(label, s, e)` CTE.

    Each row covers the inclusive date range that one column should sum
    over. Days clamp to each month's actual length (Feb 29 → 28 in non-
    leap years), so callers don't have to think about month-end edges.
    """
    # `make_date` is `make_date(integer, integer, integer)`; Python ints
    # bind as PG bigint and the function lookup fails without explicit
    # `::int` casts. Same pattern as dayslice/service.py:_slices_cte.
    if spec.mode == "yearly":
        sql = """
        WITH buckets AS (
          SELECT y::text AS label,
                 make_date(y, 1, 1)   AS s,
                 make_date(y, 12, 31) AS e
            FROM generate_series((:y_start)::int, (:y_end)::int) AS y
        )
        """
        return sql, {"y_start": spec.year_start, "y_end": spec.year_end}

    if spec.mode == "monthly":
        sql = """
        WITH buckets AS (
          SELECT m::text AS label,
                 make_date((:y)::int, m, 1) AS s,
                 (make_date((:y)::int, m, 1)
                    + INTERVAL '1 month - 1 day')::date AS e
            FROM generate_series(1, 12) AS m
        )
        """
        return sql, {"y": spec.year}

    # daily
    sql = """
    WITH buckets AS (
      SELECT d::text AS label,
             make_date((:y)::int, (:m)::int, d) AS s,
             make_date((:y)::int, (:m)::int, d) AS e
        FROM generate_series(
               1,
               EXTRACT(DAY FROM (make_date((:y)::int, (:m)::int, 1)
                                 + INTERVAL '1 month - 1 day'))::int
             ) AS d
    )
    """
    return sql, {"y": spec.year, "m": spec.month}


# ---------------------------------------------------------------------------
# Dimension expressions — what we GROUP BY
# ---------------------------------------------------------------------------


def _dim_expr_sotuv(dim: Dimension) -> str:
    """Returns the SQL expression for the dimension column on a Sotuv query.

    All expressions trim and coalesce empty strings to the explicit null
    bucket so totals tie regardless of source-data hygiene.
    """
    null = f"'{NULL_BUCKET}'"
    if dim == "manager":
        return f"COALESCE(NULLIF(TRIM(d.sales_manager),''), {null})"
    if dim == "direction":
        return f"COALESCE(NULLIF(TRIM(lp.direction),''), {null})"
    if dim == "brand":
        return f"COALESCE(NULLIF(TRIM(d.brand),''), {null})"
    if dim == "model":
        return f"COALESCE(NULLIF(TRIM(d.model),''), {null})"
    if dim == "region":
        return f"COALESCE(NULLIF(TRIM(lp.region_name),''), {null})"
    raise ValueError(f"unknown dimension: {dim}")


def _dim_expr_kirim(dim: Dimension) -> str:
    """Kirim equivalents. Manager attribution comes from
    `legal_person.room_names` (the customer's assigned room) — one stable
    manager per customer, not per-deal. A small minority of customers carry
    a comma-separated list of rooms; we attribute to the FIRST so totals
    tie."""
    null = f"'{NULL_BUCKET}'"
    if dim == "manager":
        return (
            "COALESCE(NULLIF(TRIM(SPLIT_PART(lp.room_names, ',', 1)),''), "
            f"{null})"
        )
    if dim == "direction":
        return f"COALESCE(NULLIF(TRIM(lp.direction),''), {null})"
    if dim == "region":
        return f"COALESCE(NULLIF(TRIM(lp.region_name),''), {null})"
    raise ValueError(f"dimension {dim!r} is not valid for Kirim")


# ---------------------------------------------------------------------------
# Grid loaders — return {dim_value: {bucket_label: amount}}
# ---------------------------------------------------------------------------


async def _sotuv_grid(
    session: AsyncSession, *,
    spec: BucketSpec, dim: Dimension, f: Filters,
) -> dict[str, dict[str, float]]:
    cte_sql, cte_params = _buckets_cte(spec)
    f_sql, f_params = clause(f)
    dim_expr = _dim_expr_sotuv(dim)
    sql = f"""
    {cte_sql}
    SELECT {dim_expr} AS dim,
           b.label    AS bucket,
           SUM(d.product_amount)::numeric(18,2) AS revenue
      FROM buckets b
      JOIN smartup_rep.deal_order   d  ON d.delivery_date BETWEEN b.s AND b.e
      JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
     WHERE TRUE {f_sql}
     GROUP BY 1, 2
    """
    rows = (await session.execute(text(sql), {**cte_params, **f_params})).mappings().all()
    out: dict[str, dict[str, float]] = {}
    for r in rows:
        out.setdefault(r["dim"], {})[str(r["bucket"])] = float(r["revenue"] or 0)
    return out


async def _kirim_grid(
    session: AsyncSession, *,
    spec: BucketSpec, dim: Dimension, f: Filters,
) -> dict[str, dict[str, float]]:
    cte_sql, cte_params = _buckets_cte(spec)
    # Kirim manager filter targets legal_person.room_names directly — same
    # expression we GROUP BY in _dim_expr_kirim. Room-scope goes via the
    # person_id subquery (room_on="") since payment has no room_id column.
    f_sql, f_params = clause(
        f,
        manager_expr="TRIM(SPLIT_PART(lp.room_names, ',', 1))",
        room_on="",
    )
    dim_expr = _dim_expr_kirim(dim)

    bank_excl = exclude_kirim_methods_clause("p")
    sql = f"""
    {cte_sql}
    SELECT {dim_expr} AS dim,
           b.label    AS bucket,
           SUM(p.amount)::numeric(18,2) AS revenue
      FROM buckets b
      JOIN smartup_rep.payment      p  ON p.payment_date::date BETWEEN b.s AND b.e
      LEFT JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
     WHERE TRUE {f_sql} {bank_excl}
     GROUP BY 1, 2
    """
    rows = (await session.execute(text(sql), {**cte_params, **f_params})).mappings().all()
    out: dict[str, dict[str, float]] = {}
    for r in rows:
        out.setdefault(r["dim"], {})[str(r["bucket"])] = float(r["revenue"] or 0)
    return out


# ---------------------------------------------------------------------------
# Plan overlay — Sotuv only, manager dimension only
# ---------------------------------------------------------------------------


async def _attach_plan(
    session: AsyncSession, *,
    spec: BucketSpec, dim: Dimension, measure: Measure,
) -> dict[str, dict[str, float]]:
    """Pull `app.dayslice_plan` rows that overlap the bucket window and
    fold them into the same `{manager: {bucket_label: plan_value}}` shape
    the value grid uses.

    Daily mode returns an empty overlay — a monthly plan doesn't divide
    cleanly into days, and faking a flat daily plan would lie. Yearly
    mode sums the 12 monthly plan rows of each year to get an annual
    plan total.
    """
    if dim != "manager" or spec.mode == "daily":
        return {}

    plan_col = "plan_sotuv" if measure == "sotuv" else "plan_kirim"

    if spec.mode == "yearly":
        sql = f"""
            SELECT manager, year::text AS bucket, SUM({plan_col})::float AS plan
              FROM app.dayslice_plan
             WHERE year BETWEEN :y_start AND :y_end
               AND {plan_col} IS NOT NULL
             GROUP BY manager, year
        """
        params = {"y_start": spec.year_start, "y_end": spec.year_end}
    else:  # monthly
        sql = f"""
            SELECT manager, month::text AS bucket, {plan_col}::float AS plan
              FROM app.dayslice_plan
             WHERE year = :y
               AND {plan_col} IS NOT NULL
        """
        params = {"y": spec.year}

    rows = (await session.execute(text(sql), params)).mappings().all()
    out: dict[str, dict[str, float]] = {}
    for r in rows:
        if r["plan"] is None:
            continue
        out.setdefault(r["manager"], {})[str(r["bucket"])] = float(r["plan"])
    return out


# ---------------------------------------------------------------------------
# Shape — turn the grid into the response payload
# ---------------------------------------------------------------------------


def _delta_pct(curr: float, prev: float) -> float | None:
    """`(curr / prev - 1)`. Returns None when prev is zero — the frontend
    renders that as an em-dash. Don't return 0 or +inf; both mislead."""
    if prev == 0:
        return None
    return (curr / prev) - 1.0


def _shape_matrix(
    grid: dict[str, dict[str, float]],
    *,
    columns: list[str],
    plan_grid: dict[str, dict[str, float]],
) -> dict[str, Any]:
    """Build the response payload.

    Sort rows by the LAST column desc; the null bucket always sinks to
    the bottom regardless of value (operator needs to know it's there
    but not have it elbow real rows out of the top of the table).

    `rank_now` and `rank_prev` are 1-indexed positions in the last and
    second-to-last column ordering, used by the rank-shift chip in the
    frontend. The null bucket has no rank.
    """
    last = columns[-1]
    prev = columns[-2] if len(columns) >= 2 else None

    real_dims = [d for d in grid if d != NULL_BUCKET]
    null_dims = [d for d in grid if d == NULL_BUCKET]

    real_dims.sort(key=lambda d: -grid[d].get(last, 0))
    rank_now = {d: i + 1 for i, d in enumerate(real_dims)}
    if prev is not None:
        prev_sorted = sorted(real_dims, key=lambda d: -grid[d].get(prev, 0))
        rank_prev = {d: i + 1 for i, d in enumerate(prev_sorted)}
    else:
        rank_prev = {}

    column_totals = [
        sum(grid[d].get(c, 0) for d in grid)
        for c in columns
    ]

    def _row_for(dim_label: str) -> dict[str, Any]:
        values = [grid[dim_label].get(c, 0.0) for c in columns]
        share_pct = [
            (v / column_totals[i]) if column_totals[i] else 0.0
            for i, v in enumerate(values)
        ]
        plan_row = plan_grid.get(dim_label, {})
        plan_values: list[float | None] = (
            [plan_row.get(c) for c in columns] if plan_grid else []
        )
        plan_index = (
            [
                (v / p) if (p and v is not None) else None
                for v, p in zip(values, plan_values)
            ]
            if plan_values else []
        )
        is_null = dim_label == NULL_BUCKET
        return {
            "label": dim_label,
            "values": values,
            "share_pct": share_pct,
            "trend_delta_pct": _delta_pct(
                values[-1], values[-2] if len(values) >= 2 else 0
            ),
            "rank_now": None if is_null else rank_now.get(dim_label),
            "rank_prev": None if is_null else rank_prev.get(dim_label),
            "plan": plan_values,
            "plan_index_pct": plan_index,
        }

    rows = [_row_for(d) for d in real_dims] + [_row_for(d) for d in null_dims]

    # Totals row aggregates the plan side too — gives the operator a
    # "company plan vs fakt" line that ties to PlanGridEditable's footer.
    if plan_grid:
        plan_totals: list[float | None] = []
        plan_index_totals: list[float | None] = []
        for c, col_total in zip(columns, column_totals):
            plan_sum = sum(
                p for p in (plan_grid[d].get(c) for d in plan_grid)
                if p is not None
            )
            plan_totals.append(plan_sum if plan_sum > 0 else None)
            plan_index_totals.append(
                (col_total / plan_sum) if plan_sum > 0 else None
            )
    else:
        plan_totals = []
        plan_index_totals = []

    totals = {
        "label": "Jami",
        "values": column_totals,
        "share_pct": [1.0 if t else 0.0 for t in column_totals],
        "trend_delta_pct": _delta_pct(
            column_totals[-1], column_totals[-2] if len(column_totals) >= 2 else 0
        ),
        "rank_now": None,
        "rank_prev": None,
        "plan": plan_totals,
        "plan_index_pct": plan_index_totals,
    }

    return {"columns": columns, "rows": rows, "totals": totals}


# ---------------------------------------------------------------------------
# Public API consumed by router
# ---------------------------------------------------------------------------


async def comparison(
    session: AsyncSession, *,
    measure: Measure,
    dimension: Dimension,
    spec: BucketSpec,
    f: Filters,
    with_plan: bool,
) -> dict[str, Any]:
    if measure == "sotuv":
        grid = await _sotuv_grid(session, spec=spec, dim=dimension, f=f)
    else:
        grid = await _kirim_grid(session, spec=spec, dim=dimension, f=f)

    plan_grid = (
        await _attach_plan(
            session, spec=spec, dim=dimension, measure=measure,
        )
        if with_plan else {}
    )
    columns = spec.column_labels()
    payload = _shape_matrix(grid, columns=columns, plan_grid=plan_grid)
    payload["mode"] = spec.mode
    payload["dimension"] = dimension
    payload["measure"] = measure
    return payload


# ---------------------------------------------------------------------------
# Drill — line items behind one (dimension_value, bucket) cell
# ---------------------------------------------------------------------------


def _bucket_range(spec: BucketSpec, bucket_label: str) -> tuple[str, str]:
    """Resolve (s, e) ISO dates for one column of the matrix. Used by
    drill so the cell-click slice matches the SUM the cell displayed."""
    if spec.mode == "yearly":
        y = int(bucket_label)
        last = calendar.monthrange(y, 12)[1]
        return f"{y}-01-01", f"{y}-12-{last:02d}"
    if spec.mode == "monthly":
        m = int(bucket_label)
        last = calendar.monthrange(spec.year, m)[1]
        return f"{spec.year}-{m:02d}-01", f"{spec.year}-{m:02d}-{last:02d}"
    d = int(bucket_label)
    return (
        f"{spec.year}-{spec.month:02d}-{d:02d}",
        f"{spec.year}-{spec.month:02d}-{d:02d}",
    )


def _dim_predicate(
    dim: Dimension, dim_value: str, *, measure: Measure,
) -> tuple[str, dict[str, Any]]:
    """Return (sql_fragment, params) restricting the drill query to one
    dimension value. The null bucket label `(—)` is translated back into
    `IS NULL OR TRIM = ''` so we actually find the source rows."""
    is_null = dim_value == NULL_BUCKET
    expr_for = _dim_expr_sotuv if measure == "sotuv" else _dim_expr_kirim
    expr = expr_for(dim)
    if is_null:
        # The COALESCE(NULLIF(TRIM(...))) shape collapses to NULL bucket
        # exactly when the raw column is null/empty/whitespace — match
        # that condition explicitly so EXPLAIN can use the index.
        if dim == "manager":
            # Sotuv keys off d.sales_manager; Kirim keys off the customer's
            # first-listed room from legal_person.room_names. Both reduce to
            # NULL/empty when the operator hasn't filled the field.
            if measure == "sotuv":
                col = "d.sales_manager"
            else:
                col = "SPLIT_PART(lp.room_names, ',', 1)"
        elif dim == "direction":
            col = "lp.direction"
        elif dim == "brand":
            col = "d.brand"
        elif dim == "model":
            col = "d.model"
        elif dim == "region":
            col = "lp.region_name"
        else:
            raise ValueError(f"unknown dim: {dim}")
        return f"AND ({col} IS NULL OR TRIM({col}) = '')", {}
    return f"AND {expr} = :_dim_val", {"_dim_val": dim_value}


async def drill(
    session: AsyncSession, *,
    measure: Measure,
    dimension: Dimension,
    dimension_value: str,
    spec: BucketSpec,
    bucket_label: str,
    f: Filters,
    limit: int = 500,
) -> dict[str, Any]:
    """Line-item lookup behind one (dimension_value, bucket) cell.

    Returns the same shape `dayslice.service.drill` returns so the
    existing DrillPanel can render it without forking. `manager` field
    is repurposed as the dimension value so the panel header reads
    "Sotuv line items · {label} · {bucket}" naturally.
    """
    s, e = _bucket_range(spec, bucket_label)
    pred_sql, pred_params = _dim_predicate(
        dimension, dimension_value, measure=measure,
    )

    if measure == "sotuv":
        f_sql, f_params = clause(f)
        sql = f"""
        SELECT d.delivery_date::date AS dt,
               d.deal_id,
               lp.name AS client_name,
               lp.region_name,
               lp.direction,
               d.brand,
               d.product_name,
               d.sold_quant::numeric(18,2)    AS qty,
               d.product_amount::numeric(18,2) AS amount
          FROM smartup_rep.deal_order   d
          JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
         WHERE d.delivery_date BETWEEN (:s)::date AND (:e)::date
           {pred_sql}
           {f_sql}
         ORDER BY d.delivery_date DESC, d.deal_id
         LIMIT :limit
        """
        params = {"s": s, "e": e, "limit": limit, **pred_params, **f_params}
        rows = (await session.execute(text(sql), params)).mappings().all()
        total_sql = f"""
        SELECT COALESCE(SUM(d.product_amount), 0)::numeric(18,2) AS total,
               COUNT(*) AS n,
               COUNT(*) FILTER (WHERE d.product_amount < 0) AS returns_n,
               COALESCE(SUM(d.product_amount)
                        FILTER (WHERE d.product_amount < 0), 0)::numeric(18,2)
                        AS returns_total
          FROM smartup_rep.deal_order   d
          JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
         WHERE d.delivery_date BETWEEN (:s)::date AND (:e)::date
           {pred_sql}
           {f_sql}
        """
        total = (await session.execute(text(total_sql), params)).mappings().first() or {}
        return {
            "measure": "sotuv",
            "manager": dimension_value,   # reused field; see docstring
            "year": int(spec.year_end if spec.mode == "yearly" else spec.year),
            "slice": {"from": s, "to": e},
            "total": float(total.get("total") or 0),
            "row_count": int(total.get("n") or 0),
            "returns_count": int(total.get("returns_n") or 0),
            "returns_total": float(total.get("returns_total") or 0),
            "rows": [{
                "date": r["dt"].isoformat(),
                "deal_id": r["deal_id"],
                "client": r["client_name"],
                "region": r["region_name"],
                "direction": r["direction"],
                "brand": r["brand"],
                "product": r["product_name"],
                "qty": float(r["qty"] or 0),
                "amount": float(r["amount"] or 0),
            } for r in rows],
            "limit": limit,
        }

    # measure == "kirim" — customer-room attribution via legal_person.room_names
    room_expr = "TRIM(SPLIT_PART(lp.room_names, ',', 1))"
    f_sql, f_params = clause(f, manager_expr=room_expr, room_on="")
    bank_excl = exclude_kirim_methods_clause("p")
    sql = f"""
    SELECT p.payment_date::date AS dt,
           p.payment_id,
           lp.name AS client_name,
           lp.region_name,
           lp.direction,
           p.payment_method,
           p.amount::numeric(18,2) AS amount,
           {room_expr} AS attributed_manager
      FROM smartup_rep.payment      p
      LEFT JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
     WHERE p.payment_date::date BETWEEN (:s)::date AND (:e)::date
       {pred_sql}
       {f_sql}
       {bank_excl}
     ORDER BY p.payment_date DESC, p.payment_id
     LIMIT :limit
    """
    params = {"s": s, "e": e, "limit": limit, **pred_params, **f_params}
    rows = (await session.execute(text(sql), params)).mappings().all()
    total_sql = f"""
    SELECT COALESCE(SUM(p.amount), 0)::numeric(18,2) AS total,
           COUNT(*) AS n
      FROM smartup_rep.payment      p
      LEFT JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
     WHERE p.payment_date::date BETWEEN (:s)::date AND (:e)::date
       {pred_sql}
       {f_sql}
       {bank_excl}
    """
    total = (await session.execute(text(total_sql), params)).mappings().first() or {}
    return {
        "measure": "kirim",
        "manager": dimension_value,
        "year": int(spec.year_end if spec.mode == "yearly" else spec.year),
        "slice": {"from": s, "to": e},
        "total": float(total.get("total") or 0),
        "row_count": int(total.get("n") or 0),
        "rows": [{
            "date": r["dt"].isoformat(),
            "payment_id": r["payment_id"],
            "client": r["client_name"],
            "region": r["region_name"],
            "direction": r["direction"],
            "method": r["payment_method"],
            "amount": float(r["amount"] or 0),
            "attributed_manager": r["attributed_manager"],
        } for r in rows],
        "limit": limit,
    }
