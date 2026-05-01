"""Day-slice scoreboard — recreates the Excel `Dashborad` sheet natively.

Two modes of slicing the calendar:

  Anchor mode (default): "month-start (1st of as_of's month) → as_of",
  replayed across each year. Same shape the Excel uses.

  Custom mode: explicit (start_month, start_day) → (end_month, end_day),
  replayed across each year. Lets the operator ask "what did 1–10
  March look like across 4 years" or "1 Feb → 15 March across 4 years".

Sotuv: groups by `deal_order.sales_manager`, sums `product_amount`
**net of returns** — so a return line (negative product_amount) subtracts
from that manager-year cell. Excel `Dashborad` uses the same convention
(its SUMIFS doesn't filter on sign).
Kirim: payments have no `sales_manager` column, so we attribute each
payment to the **most-recent prior deal_order's** sales manager
(LATERAL DISTINCT ON pattern).

All functions are admin-gated upstream in router.py; ScopedUser
restriction flows through `_analytics.filters.clause()`.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.filters import Filters, clause, exclude_kirim_methods_clause


@dataclass(frozen=True)
class Slice:
    """A calendar window replayed across years.

    For each year `y`, the actual range is:
      start = make_date(y, start_month, start_day_clamped_to_month_end)
      end   = make_date(y, end_month,   end_day_clamped_to_month_end)
    """
    start_month: int
    start_day: int
    end_month: int
    end_day: int

    @classmethod
    def anchor(cls, as_of: date) -> "Slice":
        """Default slice: 1st of as_of's month → as_of's day, that month."""
        return cls(as_of.month, 1, as_of.month, as_of.day)

    @classmethod
    def custom(cls, start: date, end: date) -> "Slice":
        """Custom (month, day) slice — year is irrelevant; we use only
        the month-and-day across each year."""
        return cls(start.month, start.day, end.month, end.day)

    def label_for_year(self, y: int) -> tuple[date, date]:
        last_s = calendar.monthrange(y, self.start_month)[1]
        last_e = calendar.monthrange(y, self.end_month)[1]
        s = date(y, self.start_month, min(self.start_day, last_s))
        e = date(y, self.end_month,   min(self.end_day,   last_e))
        return s, e


# ---------------------------------------------------------------------------
# Helpers — slice CTE builder, used by every endpoint
# ---------------------------------------------------------------------------


def _slices_cte() -> str:
    """SQL fragment that builds a (year, s, e) row per year in
    [:y_start, :y_end] for the parametric slice. Days are clamped to
    each year's actual month-end (Feb 29 → Feb 28 in non-leap years)."""
    return """
    WITH years AS (SELECT generate_series((:y_start)::int, (:y_end)::int) AS y),
    slices AS (
      SELECT y,
             make_date(y, (:start_month)::int, LEAST((:start_day)::int,
               EXTRACT(DAY FROM (make_date(y, (:start_month)::int, 1)
                                 + INTERVAL '1 month - 1 day'))::int)) AS s,
             make_date(y, (:end_month)::int, LEAST((:end_day)::int,
               EXTRACT(DAY FROM (make_date(y, (:end_month)::int, 1)
                                 + INTERVAL '1 month - 1 day'))::int)) AS e
        FROM years
    )
    """


def _slice_params(year_start: int, year_end: int, sl: Slice) -> dict[str, int]:
    return {
        "y_start": year_start,
        "y_end":   year_end,
        "start_month": sl.start_month,
        "start_day":   sl.start_day,
        "end_month":   sl.end_month,
        "end_day":     sl.end_day,
    }


# ---------------------------------------------------------------------------
# Scoreboard — manager × year matrix for the slice
# ---------------------------------------------------------------------------


async def _grid_sotuv(
    session: AsyncSession, *,
    year_start: int, year_end: int,
    sl: Slice, f: Filters,
) -> dict[str, dict[int, float]]:
    f_sql, f_params = clause(f)
    sql = f"""
    {_slices_cte()}
    SELECT COALESCE(NULLIF(TRIM(d.sales_manager), ''), '(—)') AS manager,
           sl.y AS year,
           SUM(d.product_amount)::numeric(18,2) AS revenue
      FROM slices sl
      JOIN smartup_rep.deal_order d
        ON d.delivery_date BETWEEN sl.s AND sl.e
      JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
     WHERE TRUE {f_sql}
     GROUP BY 1, 2
    """
    rows = (await session.execute(text(sql), {
        **_slice_params(year_start, year_end, sl),
        **f_params,
    })).mappings().all()
    out: dict[str, dict[int, float]] = {}
    for r in rows:
        out.setdefault(r["manager"], {})[int(r["year"])] = float(r["revenue"] or 0)
    return out


async def _grid_kirim(
    session: AsyncSession, *,
    year_start: int, year_end: int,
    sl: Slice, f: Filters,
) -> dict[str, dict[int, float]]:
    """Kirim grouped by manager-of-most-recent-prior-order (LATERAL)."""
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    bank_excl = exclude_kirim_methods_clause("p")
    sql = f"""
    {_slices_cte()}
    SELECT COALESCE(NULLIF(TRIM(rm.manager), ''), '(—)') AS manager,
           sl.y AS year,
           SUM(p.amount)::numeric(18,2) AS revenue
      FROM slices sl
      JOIN smartup_rep.payment p
        ON p.payment_date BETWEEN sl.s AND sl.e
      JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
      LEFT JOIN LATERAL (
        SELECT d.sales_manager AS manager
          FROM smartup_rep.deal_order d
         WHERE d.person_id = p.person_id::text
           AND d.delivery_date <= p.payment_date::date
         ORDER BY d.delivery_date DESC
         LIMIT 1
      ) rm ON TRUE
     WHERE TRUE {f_sql} {bank_excl}
     GROUP BY 1, 2
    """
    rows = (await session.execute(text(sql), {
        **_slice_params(year_start, year_end, sl),
        **f_params,
    })).mappings().all()
    out: dict[str, dict[int, float]] = {}
    for r in rows:
        out.setdefault(r["manager"], {})[int(r["year"])] = float(r["revenue"] or 0)
    return out


def _shape_grid(
    grid: dict[str, dict[int, float]],
    year_columns: list[int],
) -> dict[str, Any]:
    year_end = year_columns[-1]
    managers = sorted(grid.keys(), key=lambda m: -grid[m].get(year_end, 0))
    rows: list[dict[str, Any]] = []
    for m in managers:
        by_year = [grid[m].get(y, 0.0) for y in year_columns]
        cur = grid[m].get(year_end, 0)
        prev = grid[m].get(year_end - 1, 0)
        yoy = (cur / prev - 1) if prev else None
        rows.append({"manager": m, "by_year": by_year, "yoy_pct": yoy})
    total_by_year = [
        sum(r["by_year"][i] for r in rows)
        for i in range(len(year_columns))
    ]
    cur_t = total_by_year[-1] if total_by_year else 0
    prev_t = total_by_year[-2] if len(total_by_year) >= 2 else 0
    yoy_t = (cur_t / prev_t - 1) if prev_t else None
    return {
        "rows": rows,
        "totals": {"by_year": total_by_year, "yoy_pct": yoy_t},
    }


async def scoreboard(
    session: AsyncSession, *,
    as_of: date, years: int, f: Filters,
    sl: Slice | None = None,
) -> dict[str, Any]:
    sl = sl or Slice.anchor(as_of)
    year_end = as_of.year
    year_start = year_end - years + 1
    year_columns = list(range(year_start, year_end + 1))
    sotuv_grid = await _grid_sotuv(
        session, year_start=year_start, year_end=year_end, sl=sl, f=f,
    )
    kirim_grid = await _grid_kirim(
        session, year_start=year_start, year_end=year_end, sl=sl, f=f,
    )
    s_cur, e_cur = sl.label_for_year(year_end)
    return {
        "slice": {
            "month_start": s_cur.isoformat(),
            "as_of": e_cur.isoformat(),
            "day_n": e_cur.day,
            "month_days": calendar.monthrange(e_cur.year, e_cur.month)[1],
            "start_month": sl.start_month,
            "start_day":   sl.start_day,
            "end_month":   sl.end_month,
            "end_day":     sl.end_day,
            "is_custom":   not (sl.start_day == 1 and sl.start_month == sl.end_month),
        },
        "year_columns": year_columns,
        "sotuv": _shape_grid(sotuv_grid, year_columns),
        "kirim": _shape_grid(kirim_grid, year_columns),
    }


# ---------------------------------------------------------------------------
# Projection — Min / Mean / Max from same-month historical day-N completion
# ---------------------------------------------------------------------------


async def _per_year_mtd_and_full(
    session: AsyncSession, *,
    measure: str, year_start: int, year_end: int,
    month: int, day_n: int, f: Filters,
) -> dict[int, dict[str, float]]:
    if measure == "sotuv":
        f_sql, f_params = clause(f)
        sql = f"""
        WITH years AS (SELECT generate_series((:y_start)::int, (:y_end)::int) AS y),
        slices AS (
          SELECT y,
                 make_date(y, (:month)::int, 1) AS s,
                 make_date(y, (:month)::int, LEAST((:day_n)::int,
                   EXTRACT(DAY FROM (make_date(y, (:month)::int, 1)
                                     + INTERVAL '1 month - 1 day'))::int)) AS mtd_e,
                 (make_date(y, (:month)::int, 1) + INTERVAL '1 month - 1 day')::date AS month_e
            FROM years
        )
        SELECT sl.y AS year,
               COALESCE(SUM(d.product_amount)
                        FILTER (WHERE d.delivery_date BETWEEN sl.s AND sl.mtd_e),
                        0)::numeric(18,2) AS mtd,
               COALESCE(SUM(d.product_amount)
                        FILTER (WHERE d.delivery_date BETWEEN sl.s AND sl.month_e),
                        0)::numeric(18,2) AS month_total
          FROM slices sl
          LEFT JOIN smartup_rep.deal_order d
            ON d.delivery_date BETWEEN sl.s AND sl.month_e
          LEFT JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
         WHERE TRUE {f_sql}
         GROUP BY sl.y
         ORDER BY sl.y
        """
    else:
        f_sql, f_params = clause(f, manager_table="lp", room_on="")
        bank_excl = exclude_kirim_methods_clause("p")
        sql = f"""
        WITH years AS (SELECT generate_series((:y_start)::int, (:y_end)::int) AS y),
        slices AS (
          SELECT y,
                 make_date(y, (:month)::int, 1) AS s,
                 make_date(y, (:month)::int, LEAST((:day_n)::int,
                   EXTRACT(DAY FROM (make_date(y, (:month)::int, 1)
                                     + INTERVAL '1 month - 1 day'))::int)) AS mtd_e,
                 (make_date(y, (:month)::int, 1) + INTERVAL '1 month - 1 day')::date AS month_e
            FROM years
        )
        SELECT sl.y AS year,
               COALESCE(SUM(p.amount)
                        FILTER (WHERE p.payment_date BETWEEN sl.s AND sl.mtd_e),
                        0)::numeric(18,2) AS mtd,
               COALESCE(SUM(p.amount)
                        FILTER (WHERE p.payment_date BETWEEN sl.s AND sl.month_e),
                        0)::numeric(18,2) AS month_total
          FROM slices sl
          LEFT JOIN smartup_rep.payment p
            ON p.payment_date BETWEEN sl.s AND sl.month_e
          LEFT JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
         WHERE TRUE {f_sql} {bank_excl}
         GROUP BY sl.y
         ORDER BY sl.y
        """
    rows = (await session.execute(text(sql), {
        "y_start": year_start, "y_end": year_end,
        "month": month, "day_n": day_n,
        **f_params,
    })).mappings().all()
    return {int(r["year"]): {
        "mtd": float(r["mtd"] or 0),
        "month_total": float(r["month_total"] or 0),
    } for r in rows}


def _project(cur_mtd: float, ratios: list[float]) -> dict[str, float]:
    if not ratios or cur_mtd == 0:
        return {"min": cur_mtd, "mean": cur_mtd, "max": cur_mtd}
    return {
        "min":  cur_mtd / max(ratios),
        "mean": cur_mtd / (sum(ratios) / len(ratios)),
        "max":  cur_mtd / min(ratios),
    }


async def projection(
    session: AsyncSession, *,
    as_of: date, years: int, f: Filters,
) -> dict[str, Any]:
    """Projection always uses the anchor slice (month-start → as-of) —
    custom-range projection isn't a meaningful concept."""
    year_end = as_of.year
    year_start = year_end - years + 1
    sotuv_per_year = await _per_year_mtd_and_full(
        session, measure="sotuv",
        year_start=year_start, year_end=year_end,
        month=as_of.month, day_n=as_of.day, f=f,
    )
    kirim_per_year = await _per_year_mtd_and_full(
        session, measure="kirim",
        year_start=year_start, year_end=year_end,
        month=as_of.month, day_n=as_of.day, f=f,
    )
    history: list[dict[str, Any]] = []
    sotuv_ratios: list[float] = []
    kirim_ratios: list[float] = []
    for y in range(year_start, year_end):
        s = sotuv_per_year.get(y, {"mtd": 0, "month_total": 0})
        k = kirim_per_year.get(y, {"mtd": 0, "month_total": 0})
        if s["month_total"] > 0:
            sr = s["mtd"] / s["month_total"]
            sotuv_ratios.append(sr)
            history.append({
                "year": y, "mtd": s["mtd"],
                "month_total": s["month_total"],
                "ratio": round(sr, 4),
            })
        if k["month_total"] > 0:
            kirim_ratios.append(k["mtd"] / k["month_total"])
    cur_sotuv = sotuv_per_year.get(year_end, {"mtd": 0})["mtd"]
    cur_kirim = kirim_per_year.get(year_end, {"mtd": 0})["mtd"]
    return {
        "slice": {
            "month_start": date(as_of.year, as_of.month, 1).isoformat(),
            "as_of": as_of.isoformat(),
            "day_n": as_of.day,
            "month_days": calendar.monthrange(as_of.year, as_of.month)[1],
        },
        "history": history,
        "current_mtd": {"sotuv": cur_sotuv, "kirim": cur_kirim},
        "projection": {
            "sotuv": _project(cur_sotuv, sotuv_ratios),
            "kirim": _project(cur_kirim, kirim_ratios),
        },
    }


# ---------------------------------------------------------------------------
# Region × manager pivot — current as-of slice only
# ---------------------------------------------------------------------------


async def region_pivot(
    session: AsyncSession, *,
    as_of: date, f: Filters,
    sl: Slice | None = None,
) -> dict[str, Any]:
    sl = sl or Slice.anchor(as_of)
    s, e = sl.label_for_year(as_of.year)
    f_sql, f_params = clause(f)
    sql = f"""
    SELECT COALESCE(NULLIF(TRIM(lp.region_name), ''), '(—)') AS region,
           COALESCE(NULLIF(TRIM(d.sales_manager), ''), '(—)') AS manager,
           SUM(d.product_amount)::numeric(18,2) AS revenue
      FROM smartup_rep.deal_order d
      JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
     WHERE d.delivery_date BETWEEN (:s)::date AND (:e)::date
       {f_sql}
     GROUP BY 1, 2
    """
    rows = (await session.execute(text(sql), {
        "s": s, "e": e, **f_params,
    })).mappings().all()

    grand_total = sum(float(r["revenue"] or 0) for r in rows)
    by_region: dict[str, dict[str, float]] = {}
    by_manager_total: dict[str, float] = {}
    for r in rows:
        region, manager = r["region"], r["manager"]
        rev = float(r["revenue"] or 0)
        if region == "(—)" or manager == "(—)":
            continue
        by_region.setdefault(region, {})[manager] = rev
        by_manager_total[manager] = by_manager_total.get(manager, 0) + rev

    region_totals = {r: sum(v.values()) for r, v in by_region.items()}
    row_labels = sorted(by_region.keys(), key=lambda r: -region_totals[r])
    col_labels = sorted(by_manager_total.keys(), key=lambda m: -by_manager_total[m])
    values = [
        [by_region[r].get(m, 0.0) for m in col_labels]
        for r in row_labels
    ]
    manager_totals = [by_manager_total[m] for m in col_labels]
    manager_share = [
        (t / grand_total) if grand_total > 0 else 0
        for t in manager_totals
    ]
    return {
        "slice": {"month_start": s.isoformat(), "as_of": e.isoformat()},
        "row_labels": row_labels,
        "col_labels": col_labels,
        "values": values,
        "manager_totals": manager_totals,
        "manager_share": manager_share,
        "grand_total": grand_total,
    }


# ---------------------------------------------------------------------------
# Plan persistence — whole-month replace
# ---------------------------------------------------------------------------


async def get_plan(
    session: AsyncSession, *, year: int, month: int,
) -> dict[str, Any]:
    sql = """
    SELECT manager, plan_sotuv, plan_kirim, updated_at, updated_by
      FROM app.dayslice_plan
     WHERE year = :y AND month = :m
     ORDER BY manager
    """
    rows = (await session.execute(text(sql), {"y": year, "m": month})).mappings().all()
    return {
        "year": year, "month": month,
        "rows": [{
            "manager": r["manager"],
            "plan_sotuv": float(r["plan_sotuv"]) if r["plan_sotuv"] is not None else None,
            "plan_kirim": float(r["plan_kirim"]) if r["plan_kirim"] is not None else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            "updated_by": r["updated_by"],
        } for r in rows],
    }


async def put_plan(
    session: AsyncSession, *,
    year: int, month: int,
    rows: list[dict[str, Any]], updated_by: str,
) -> dict[str, Any]:
    payload_managers = [r["manager"] for r in rows]
    if payload_managers:
        await session.execute(text("""
            DELETE FROM app.dayslice_plan
             WHERE year = :y AND month = :m
               AND manager <> ALL(:keep)
        """), {"y": year, "m": month, "keep": payload_managers})
    else:
        await session.execute(text("""
            DELETE FROM app.dayslice_plan WHERE year = :y AND month = :m
        """), {"y": year, "m": month})
    for r in rows:
        await session.execute(text("""
            INSERT INTO app.dayslice_plan
                   (year, month, manager, plan_sotuv, plan_kirim, updated_by, updated_at)
            VALUES (:y, :m, :mgr, :ps, :pk, :ub, now())
            ON CONFLICT (year, month, manager)
            DO UPDATE SET plan_sotuv = EXCLUDED.plan_sotuv,
                          plan_kirim = EXCLUDED.plan_kirim,
                          updated_by = EXCLUDED.updated_by,
                          updated_at = now()
        """), {
            "y": year, "m": month, "mgr": r["manager"],
            "ps": r.get("plan_sotuv"), "pk": r.get("plan_kirim"),
            "ub": updated_by,
        })
    await session.commit()
    return await get_plan(session, year=year, month=month)


# ---------------------------------------------------------------------------
# Drill — line items behind a single (manager, year, slice) cell
# ---------------------------------------------------------------------------


# `(—)` is our null-bucket label; convert back to "manager IS NULL or empty"
# so the SQL filter actually finds the rows.
_NULL_MGR = "(—)"


async def drill(
    session: AsyncSession, *,
    measure: str,            # "sotuv" or "kirim"
    manager: str,
    year: int,
    sl: Slice,
    f: Filters,
    limit: int = 500,
) -> dict[str, Any]:
    """Line-item lookup behind a single cell of the scoreboard. Returns
    the same rows that summed into that cell, ordered by date desc.

    For Sotuv: deal_order rows (date, deal_id, client, brand, product, qty, amount).
    For Kirim: payment rows (date, client, method, amount) plus the
    attributed manager (most-recent prior order).
    """
    # Resolve the slice for this specific year (same clamping as the grid)
    s, e = sl.label_for_year(year)

    if measure == "sotuv":
        f_sql, f_params = clause(f)
        if manager == _NULL_MGR:
            mgr_sql = "AND (d.sales_manager IS NULL OR TRIM(d.sales_manager) = '')"
            mgr_params: dict[str, Any] = {}
        else:
            mgr_sql = "AND TRIM(d.sales_manager) = :mgr"
            mgr_params = {"mgr": manager}
        sql = f"""
        SELECT d.delivery_date::date AS dt,
               d.deal_id,
               lp.name AS client_name,
               lp.region_name,
               lp.direction,
               d.brand,
               d.product_name,
               d.sold_quant::numeric(18,2) AS qty,
               d.product_amount::numeric(18,2) AS amount
          FROM smartup_rep.deal_order d
          JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
         WHERE d.delivery_date BETWEEN (:s)::date AND (:e)::date
           {mgr_sql}
           {f_sql}
         ORDER BY d.delivery_date DESC, d.deal_id
         LIMIT :limit
        """
        params = {"s": s, "e": e, "limit": limit, **f_params, **mgr_params}
        rows = (await session.execute(text(sql), params)).mappings().all()
        # Total across the full slice (not capped by LIMIT). Includes
        # returns (negative rows), so this nets to the scoreboard cell.
        total_sql = f"""
        SELECT COALESCE(SUM(d.product_amount), 0)::numeric(18,2) AS total,
               COUNT(*) AS n,
               COUNT(*) FILTER (WHERE d.product_amount < 0) AS returns_n,
               COALESCE(SUM(d.product_amount)
                        FILTER (WHERE d.product_amount < 0), 0)::numeric(18,2)
                                                  AS returns_total
          FROM smartup_rep.deal_order d
          JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
         WHERE d.delivery_date BETWEEN (:s)::date AND (:e)::date
           {mgr_sql}
           {f_sql}
        """
        total = (await session.execute(text(total_sql), params)).mappings().first() or {}
        return {
            "measure": "sotuv",
            "manager": manager, "year": year,
            "slice": {"from": s.isoformat(), "to": e.isoformat()},
            "total": float(total.get("total") or 0),       # NET (sales − returns)
            "row_count": int(total.get("n") or 0),
            "returns_count": int(total.get("returns_n") or 0),
            "returns_total": float(total.get("returns_total") or 0),  # negative
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

    # measure == "kirim"
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    bank_excl = exclude_kirim_methods_clause("p")
    if manager == _NULL_MGR:
        mgr_sql = "AND (rm.manager IS NULL OR TRIM(rm.manager) = '')"
        mgr_params = {}
    else:
        mgr_sql = "AND TRIM(rm.manager) = :mgr"
        mgr_params = {"mgr": manager}
    sql = f"""
    SELECT p.payment_date::date AS dt,
           p.payment_id,
           lp.name AS client_name,
           lp.region_name,
           lp.direction,
           p.payment_method,
           p.amount::numeric(18,2) AS amount,
           rm.manager AS attributed_manager
      FROM smartup_rep.payment p
      JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
      LEFT JOIN LATERAL (
        SELECT d.sales_manager AS manager
          FROM smartup_rep.deal_order d
         WHERE d.person_id = p.person_id::text
           AND d.delivery_date <= p.payment_date::date
         ORDER BY d.delivery_date DESC
         LIMIT 1
      ) rm ON TRUE
     WHERE p.payment_date BETWEEN (:s)::date AND (:e)::date
       {mgr_sql}
       {f_sql}
       {bank_excl}
     ORDER BY p.payment_date DESC, p.payment_id
     LIMIT :limit
    """
    params = {"s": s, "e": e, "limit": limit, **f_params, **mgr_params}
    rows = (await session.execute(text(sql), params)).mappings().all()
    total_sql = f"""
    SELECT COALESCE(SUM(p.amount), 0)::numeric(18,2) AS total,
           COUNT(*) AS n
      FROM smartup_rep.payment p
      JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
      LEFT JOIN LATERAL (
        SELECT d.sales_manager AS manager
          FROM smartup_rep.deal_order d
         WHERE d.person_id = p.person_id::text
           AND d.delivery_date <= p.payment_date::date
         ORDER BY d.delivery_date DESC
         LIMIT 1
      ) rm ON TRUE
     WHERE p.payment_date BETWEEN (:s)::date AND (:e)::date
       {mgr_sql}
       {f_sql}
       {bank_excl}
    """
    total = (await session.execute(text(total_sql), params)).mappings().first() or {}
    return {
        "measure": "kirim",
        "manager": manager, "year": year,
        "slice": {"from": s.isoformat(), "to": e.isoformat()},
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
