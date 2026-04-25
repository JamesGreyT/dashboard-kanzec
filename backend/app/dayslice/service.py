"""Day-slice scoreboard — recreates the Excel `Dashborad` sheet natively.

The shape is "for the calendar slice month-start → as-of date,
replayed across each year, sum revenue per (manager, year)".

Sotuv: groups by `deal_order.sales_manager`, sums `product_amount > 0`.
Kirim: payments have no `sales_manager` column, so we attribute each
payment to the **most-recent prior deal_order's** sales manager
(LATERAL DISTINCT ON pattern — same idiom YearlySnapshots used).

All functions are admin-gated upstream in router.py; ScopedUser
restriction flows through `_analytics.filters.clause()`.
"""
from __future__ import annotations

import asyncio
import calendar
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.filters import Filters, clause


# ---------------------------------------------------------------------------
# Scoreboard — manager × year matrix for the as-of slice
# ---------------------------------------------------------------------------


async def _grid_sotuv(
    session: AsyncSession,
    *,
    year_start: int, year_end: int,
    month: int, day_n: int,
    f: Filters,
) -> dict[str, dict[int, float]]:
    f_sql, f_params = clause(f)
    sql = f"""
    WITH years AS (SELECT generate_series(:y_start, :y_end) AS y),
    slices AS (
      SELECT y,
             make_date(y, :month, 1) AS s,
             make_date(y, :month, LEAST(:day_n,
               EXTRACT(DAY FROM (make_date(y, :month, 1)
                                 + INTERVAL '1 month - 1 day'))::int)) AS e
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
     WHERE TRUE {f_sql}
     GROUP BY 1, 2
    """
    rows = (await session.execute(text(sql), {
        "y_start": year_start, "y_end": year_end,
        "month": month, "day_n": day_n,
        **f_params,
    })).mappings().all()
    out: dict[str, dict[int, float]] = {}
    for r in rows:
        out.setdefault(r["manager"], {})[int(r["year"])] = float(r["revenue"] or 0)
    return out


async def _grid_kirim(
    session: AsyncSession,
    *,
    year_start: int, year_end: int,
    month: int, day_n: int,
    f: Filters,
) -> dict[str, dict[int, float]]:
    """Kirim grouped by *manager-of-most-recent-prior-order*. payment
    table has no sales_manager column, so we look up each payment's
    person_id in deal_order, take the manager of that client's latest
    deal_order at-or-before the payment date.

    Implementation: LATERAL JOIN per payment row. Postgres's planner
    keeps this fast because of idx_deal_order_person_date (composite)
    and idx_payment_date.
    """
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    sql = f"""
    WITH years AS (SELECT generate_series(:y_start, :y_end) AS y),
    slices AS (
      SELECT y,
             make_date(y, :month, 1) AS s,
             make_date(y, :month, LEAST(:day_n,
               EXTRACT(DAY FROM (make_date(y, :month, 1)
                                 + INTERVAL '1 month - 1 day'))::int)) AS e
        FROM years
    )
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
     WHERE TRUE {f_sql}
     GROUP BY 1, 2
    """
    rows = (await session.execute(text(sql), {
        "y_start": year_start, "y_end": year_end,
        "month": month, "day_n": day_n,
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
    """Pivot grid → row-major, sorted by current-year desc, with totals + YoY."""
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
    session: AsyncSession,
    *,
    as_of: date,
    years: int,
    f: Filters,
) -> dict[str, Any]:
    year_end = as_of.year
    year_start = year_end - years + 1
    year_columns = list(range(year_start, year_end + 1))
    sotuv_grid, kirim_grid = await asyncio.gather(
        _grid_sotuv(session, year_start=year_start, year_end=year_end,
                    month=as_of.month, day_n=as_of.day, f=f),
        _grid_kirim(session, year_start=year_start, year_end=year_end,
                    month=as_of.month, day_n=as_of.day, f=f),
    )
    return {
        "slice": {
            "month_start": date(as_of.year, as_of.month, 1).isoformat(),
            "as_of": as_of.isoformat(),
            "day_n": as_of.day,
            "month_days": calendar.monthrange(as_of.year, as_of.month)[1],
        },
        "year_columns": year_columns,
        "sotuv": _shape_grid(sotuv_grid, year_columns),
        "kirim": _shape_grid(kirim_grid, year_columns),
    }


# ---------------------------------------------------------------------------
# Projection — Min / Mean / Max from same-month historical day-N completion
# ---------------------------------------------------------------------------


async def _per_year_mtd_and_full(
    session: AsyncSession,
    *,
    measure: str,            # "sotuv" or "kirim"
    year_start: int, year_end: int,
    month: int, day_n: int,
    f: Filters,
) -> dict[int, dict[str, float]]:
    """For each year in [start, end], return {mtd, month_total} for the
    given measure. mtd = sum through day-N; month_total = sum through end of month."""
    if measure == "sotuv":
        f_sql, f_params = clause(f)
        sql = f"""
        WITH years AS (SELECT generate_series(:y_start, :y_end) AS y),
        slices AS (
          SELECT y,
                 make_date(y, :month, 1) AS s,
                 make_date(y, :month, LEAST(:day_n,
                   EXTRACT(DAY FROM (make_date(y, :month, 1)
                                     + INTERVAL '1 month - 1 day'))::int)) AS mtd_e,
                 (make_date(y, :month, 1) + INTERVAL '1 month - 1 day')::date AS month_e
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
           AND d.product_amount > 0
          LEFT JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
         WHERE TRUE {f_sql}
         GROUP BY sl.y
         ORDER BY sl.y
        """
    else:  # kirim
        f_sql, f_params = clause(f, manager_table="lp", room_on="")
        sql = f"""
        WITH years AS (SELECT generate_series(:y_start, :y_end) AS y),
        slices AS (
          SELECT y,
                 make_date(y, :month, 1) AS s,
                 make_date(y, :month, LEAST(:day_n,
                   EXTRACT(DAY FROM (make_date(y, :month, 1)
                                     + INTERVAL '1 month - 1 day'))::int)) AS mtd_e,
                 (make_date(y, :month, 1) + INTERVAL '1 month - 1 day')::date AS month_e
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
         WHERE TRUE {f_sql}
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
    """Given the current month-to-date and a list of historical
    (MTD/month_total) ratios, project month-end as (cur_mtd / ratio).
    Higher ratio → lower projection (more of the month was already done by day-N)."""
    if not ratios or cur_mtd == 0:
        return {"min": cur_mtd, "mean": cur_mtd, "max": cur_mtd}
    return {
        "min":  cur_mtd / max(ratios),                 # tightest: assumes day-N captured the most
        "mean": cur_mtd / (sum(ratios) / len(ratios)),
        "max":  cur_mtd / min(ratios),                 # loosest: assumes day-N captured the least
    }


async def projection(
    session: AsyncSession,
    *,
    as_of: date,
    years: int,
    f: Filters,
) -> dict[str, Any]:
    year_end = as_of.year
    year_start = year_end - years + 1
    sotuv_per_year, kirim_per_year = await asyncio.gather(
        _per_year_mtd_and_full(session, measure="sotuv",
                                year_start=year_start, year_end=year_end,
                                month=as_of.month, day_n=as_of.day, f=f),
        _per_year_mtd_and_full(session, measure="kirim",
                                year_start=year_start, year_end=year_end,
                                month=as_of.month, day_n=as_of.day, f=f),
    )

    history: list[dict[str, Any]] = []
    sotuv_ratios: list[float] = []
    kirim_ratios: list[float] = []
    for y in range(year_start, year_end):  # exclude current year
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
    session: AsyncSession,
    *,
    as_of: date,
    f: Filters,
) -> dict[str, Any]:
    f_sql, f_params = clause(f)
    sql = f"""
    SELECT COALESCE(NULLIF(TRIM(lp.region_name), ''), '(—)') AS region,
           COALESCE(NULLIF(TRIM(d.sales_manager), ''), '(—)') AS manager,
           SUM(d.product_amount)::numeric(18,2) AS revenue
      FROM smartup_rep.deal_order d
      JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
     WHERE d.delivery_date BETWEEN :s AND :e
       AND d.product_amount > 0
       {f_sql}
     GROUP BY 1, 2
    """
    s = date(as_of.year, as_of.month, 1)
    rows = (await session.execute(text(sql), {
        "s": s, "e": as_of, **f_params,
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
        "slice": {"month_start": s.isoformat(), "as_of": as_of.isoformat()},
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
    session: AsyncSession,
    *,
    year: int,
    month: int,
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
    session: AsyncSession,
    *,
    year: int,
    month: int,
    rows: list[dict[str, Any]],
    updated_by: str,
) -> dict[str, Any]:
    """Whole-month replace: delete rows in (year, month) not in payload,
    then upsert the rest."""
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
