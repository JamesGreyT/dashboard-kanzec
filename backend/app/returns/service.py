"""Returns analytics — every aggregation here is built on the same
inferred convention: a row in `smartup_rep.deal_order` with negative
`product_amount` (and matching negative `sold_quant`) is a return.

Caveats baked into the queries:
- No return-specific date — we use `delivery_date` as the return date.
- No pair-back to original sale — we cannot say "this return reverses
  that sale". We only have brand/manager/client/region of the return.
- No return reason. We classify by dimensions, not motive.

Return rate denominators always use *forward* sales (positive
product_amount) over the same window/dimension, so a 5% return rate
means $5 of returns per $100 of forward sales — not per $100 net.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.filters import Filters, clause
from .._analytics.windows import Window, compare_periods


# ---------------------------------------------------------------------------
# Overview KPI strip
# ---------------------------------------------------------------------------


async def overview(session: AsyncSession, window: Window, f: Filters) -> dict:
    cmp = compare_periods(window)
    f_sql, f_params = clause(f)
    sql = f"""
    WITH w AS (
      SELECT * FROM (VALUES
        ('current', CAST(:cur_s AS date), CAST(:cur_e AS date)),
        ('mom',     CAST(:mom_s AS date), CAST(:mom_e AS date)),
        ('yoy',     CAST(:yoy_s AS date), CAST(:yoy_e AS date))
      ) AS t(label, w_start, w_end)
    )
    SELECT w.label,
           COALESCE(SUM(CASE WHEN d.product_amount < 0
                             THEN d.product_amount ELSE 0 END), 0)::numeric(18,2) AS returns,
           COALESCE(SUM(CASE WHEN d.product_amount > 0
                             THEN d.product_amount ELSE 0 END), 0)::numeric(18,2) AS forward,
           COALESCE(COUNT(*) FILTER (WHERE d.product_amount < 0), 0) AS return_lines,
           COALESCE(COUNT(DISTINCT d.deal_id) FILTER (WHERE d.product_amount < 0), 0) AS return_deals
      FROM w
      LEFT JOIN smartup_rep.deal_order d
        ON d.delivery_date BETWEEN w.w_start AND w.w_end
      LEFT JOIN smartup_rep.legal_person lp
        ON lp.person_id::text = d.person_id
     WHERE TRUE {f_sql}
     GROUP BY w.label
    """
    params: dict[str, Any] = {
        "cur_s": window.start, "cur_e": window.end,
        "mom_s": cmp.mom.start, "mom_e": cmp.mom.end,
        "yoy_s": cmp.yoy.start, "yoy_e": cmp.yoy.end,
        **f_params,
    }
    rows = (await session.execute(text(sql), params)).mappings().all()
    by = {r["label"]: r for r in rows}
    cur = by.get("current") or {"returns": 0, "forward": 0, "return_lines": 0, "return_deals": 0}
    mom = by.get("mom")     or {"returns": 0, "forward": 0, "return_lines": 0, "return_deals": 0}
    yoy = by.get("yoy")     or {"returns": 0, "forward": 0, "return_lines": 0, "return_deals": 0}
    cur_returns = abs(float(cur["returns"]))
    mom_returns = abs(float(mom["returns"]))
    yoy_returns = abs(float(yoy["returns"]))
    rate = (cur_returns / float(cur["forward"])) if cur["forward"] else 0
    avg_ticket = (cur_returns / int(cur["return_lines"])) if cur["return_lines"] else 0

    def _pct(c, p):
        return (float(c) / float(p) - 1.0) if p else None

    return {
        "window": {"from": str(window.start), "to": str(window.end)},
        "returns":      {"current": cur_returns, "prior": mom_returns, "yoy": yoy_returns,
                         "mom_pct": _pct(cur_returns, mom_returns),
                         "yoy_pct": _pct(cur_returns, yoy_returns)},
        "rate":         {"current": rate},
        "return_lines": {"current": int(cur["return_lines"]), "prior": int(mom["return_lines"]),
                         "mom_pct": _pct(cur["return_lines"], mom["return_lines"])},
        "avg_ticket":   {"current": avg_ticket},
    }


# ---------------------------------------------------------------------------
# Monthly timeline — forward $ vs returns $ side by side
# ---------------------------------------------------------------------------


async def timeline(session: AsyncSession, window: Window, f: Filters) -> list[dict]:
    f_sql, f_params = clause(f)
    sql = f"""
    SELECT DATE_TRUNC('month', d.delivery_date)::date AS bucket,
           SUM(CASE WHEN d.product_amount > 0 THEN d.product_amount ELSE 0 END)::numeric(18,2) AS forward,
           ABS(SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END))::numeric(18,2) AS returns
      FROM smartup_rep.deal_order d
      JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
     WHERE d.delivery_date BETWEEN :w_s AND :w_e {f_sql}
     GROUP BY 1
     ORDER BY 1
    """
    rows = (await session.execute(text(sql), {
        "w_s": window.start, "w_e": window.end, **f_params,
    })).mappings().all()
    return [{
        "date": r["bucket"].isoformat(),
        "forward": float(r["forward"] or 0),
        "returns": float(r["returns"] or 0),
        "rate": (float(r["returns"] or 0) / float(r["forward"])) if r["forward"] else 0,
    } for r in rows]


# ---------------------------------------------------------------------------
# Brand × month heatmap (return rate %)
#
# Caps brand count via a final ORDER BY total_returns DESC (we render
# the full set; the frontend can scroll if there are 126 of them).
# ---------------------------------------------------------------------------


async def brand_heatmap(session: AsyncSession, months: int, f: Filters) -> dict:
    f_sql, f_params = clause(f)
    sql = f"""
    WITH spans AS (
      SELECT generate_series(
        DATE_TRUNC('month', CURRENT_DATE - (INTERVAL '1 month' * (:months - 1))),
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      )::date AS m
    ),
    brand_lines AS (
      SELECT COALESCE(NULLIF(d.brand, ''), '—') AS brand,
             DATE_TRUNC('month', d.delivery_date)::date AS m,
             SUM(CASE WHEN d.product_amount > 0 THEN d.product_amount ELSE 0 END)::numeric(18,2) AS forward,
             ABS(SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END))::numeric(18,2) AS returns
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date >= DATE_TRUNC('month', CURRENT_DATE - (INTERVAL '1 month' * (:months - 1)))
         {f_sql}
       GROUP BY 1, 2
    ),
    brand_totals AS (
      SELECT brand,
             SUM(forward)::numeric(18,2) AS forward_total,
             SUM(returns)::numeric(18,2) AS returns_total
        FROM brand_lines
       GROUP BY 1
       HAVING SUM(returns) > 0
    )
    SELECT bt.brand, bt.forward_total, bt.returns_total,
           s.m,
           bl.forward, bl.returns
      FROM brand_totals bt
      CROSS JOIN spans s
      LEFT JOIN brand_lines bl ON bl.brand = bt.brand AND bl.m = s.m
     ORDER BY bt.returns_total DESC, bt.brand, s.m
    """
    rows = (await session.execute(text(sql), {"months": months, **f_params})).mappings().all()
    by_brand: dict[str, dict[str, Any]] = {}
    months_seen: list[date] = []
    for r in rows:
        b = r["brand"]
        if b not in by_brand:
            by_brand[b] = {
                "brand": b,
                "forward_total": float(r["forward_total"] or 0),
                "returns_total": float(r["returns_total"] or 0),
                "rate_total": (float(r["returns_total"] or 0) / float(r["forward_total"]))
                              if r["forward_total"] else 0,
                "cells": {},
            }
        if r["m"] is not None:
            if r["m"] not in months_seen:
                months_seen.append(r["m"])
            fwd = float(r["forward"] or 0)
            ret = float(r["returns"] or 0)
            by_brand[b]["cells"][r["m"].isoformat()] = {
                "forward": fwd,
                "returns": ret,
                "rate": (ret / fwd) if fwd else 0,
            }
    months_seen.sort()
    col_labels = [m.isoformat() for m in months_seen]
    brands = list(by_brand.values())
    # Build dense matrix in row order
    values_rate: list[list[float]] = []
    values_amt: list[list[float]] = []
    for b in brands:
        rate_row: list[float] = []
        amt_row: list[float] = []
        for ml in col_labels:
            cell = b["cells"].get(ml)
            rate_row.append(cell["rate"] if cell else 0)
            amt_row.append(cell["returns"] if cell else 0)
        values_rate.append(rate_row)
        values_amt.append(amt_row)
    return {
        "row_labels": [b["brand"] for b in brands],
        "col_labels": col_labels,
        "values_rate": values_rate,
        "values_amount": values_amt,
        "totals": [
            {"brand": b["brand"], "forward": b["forward_total"],
             "returns": b["returns_total"], "rate": b["rate_total"]}
            for b in brands
        ],
    }


# ---------------------------------------------------------------------------
# Ranked clients (full list, paginated, sortable)
# ---------------------------------------------------------------------------


_CLIENT_SORT_COLS = {
    "returns": "returns",
    "rate": "rate",
    "lines": "lines",
    "last_return": "last_return",
    "name": "name",
}


async def clients_ranked(session: AsyncSession, window: Window, f: Filters,
                         sort: str, page: int, size: int, search: str) -> dict:
    f_sql, f_params = clause(f)
    sort_key, _, sort_dir_raw = sort.partition(":")
    sort_dir = "ASC" if sort_dir_raw.lower() == "asc" else "DESC"
    order_col = _CLIENT_SORT_COLS.get(sort_key, "returns")
    search_clause = "AND lp.name ILIKE :q" if search else ""
    sql = f"""
    WITH per_client AS (
      SELECT d.person_id,
             SUM(CASE WHEN d.product_amount > 0 THEN d.product_amount ELSE 0 END)::numeric(18,2) AS forward,
             ABS(SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END))::numeric(18,2) AS returns,
             COUNT(*) FILTER (WHERE d.product_amount < 0) AS lines,
             MAX(CASE WHEN d.product_amount < 0 THEN d.delivery_date END) AS last_return,
             MAX(d.sales_manager) FILTER (WHERE d.product_amount < 0) AS manager
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN :w_s AND :w_e {f_sql}
       GROUP BY d.person_id
       HAVING SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END) < 0
    ),
    joined AS (
      SELECT lp.person_id, lp.name, lp.direction, lp.region_name,
             c.manager,
             c.forward, c.returns, c.lines, c.last_return,
             (CASE WHEN c.forward = 0 THEN NULL
                   ELSE c.returns / c.forward END)::numeric(10,4) AS rate
        FROM per_client c
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = c.person_id
       WHERE TRUE {search_clause}
    )
    SELECT *, COUNT(*) OVER () AS _total
      FROM joined
     ORDER BY {order_col} {sort_dir} NULLS LAST, name ASC
     LIMIT :limit OFFSET :offset
    """
    params: dict[str, Any] = {
        "w_s": window.start, "w_e": window.end,
        "limit": size, "offset": page * size, **f_params,
    }
    if search:
        params["q"] = f"%{search}%"
    rows = (await session.execute(text(sql), params)).mappings().all()
    total = int(rows[0]["_total"]) if rows else 0

    totals_sql = f"""
    SELECT
      ABS(SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END))::numeric(18,2) AS returns,
      SUM(CASE WHEN d.product_amount > 0 THEN d.product_amount ELSE 0 END)::numeric(18,2) AS forward,
      COUNT(*) FILTER (WHERE d.product_amount < 0) AS lines
    FROM smartup_rep.deal_order d
    JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
    WHERE d.delivery_date BETWEEN :w_s AND :w_e {f_sql}
      AND (:q_null OR lp.name ILIKE :q)
    """
    totals = (await session.execute(text(totals_sql), {
        "w_s": window.start, "w_e": window.end,
        "q": f"%{search}%" if search else "",
        "q_null": not search,
        **f_params,
    })).mappings().first() or {"returns": 0, "forward": 0, "lines": 0}
    fwd_t = float(totals["forward"] or 0)
    ret_t = float(totals["returns"] or 0)
    return {
        "rows": [{
            "person_id": str(r["person_id"]),
            "name": r["name"],
            "direction": r["direction"],
            "region": r["region_name"],
            "manager": r["manager"],
            "forward": float(r["forward"] or 0),
            "returns": float(r["returns"] or 0),
            "rate": float(r["rate"] or 0),
            "lines": int(r["lines"] or 0),
            "last_return": r["last_return"].isoformat() if r["last_return"] else None,
        } for r in rows],
        "total": total, "page": page, "size": size,
        "sort": f"{sort_key}:{sort_dir.lower()}",
        "totals": {
            "returns": ret_t,
            "forward": fwd_t,
            "rate": (ret_t / fwd_t) if fwd_t else 0,
            "lines": int(totals["lines"] or 0),
        },
    }


# ---------------------------------------------------------------------------
# Ranked regions
# ---------------------------------------------------------------------------


_REGION_SORT_COLS = {
    "returns": "returns",
    "rate": "rate",
    "lines": "lines",
    "label": "label",
}


async def regions_ranked(session: AsyncSession, window: Window, f: Filters,
                         sort: str, page: int, size: int, search: str) -> dict:
    f_sql, f_params = clause(f)
    sort_key, _, sort_dir_raw = sort.partition(":")
    sort_dir = "ASC" if sort_dir_raw.lower() == "asc" else "DESC"
    order_col = _REGION_SORT_COLS.get(sort_key, "returns")
    search_clause = "AND COALESCE(lp.region_name, '—') ILIKE :q" if search else ""
    sql = f"""
    WITH cur AS (
      SELECT COALESCE(NULLIF(lp.region_name, ''), '—') AS label,
             SUM(CASE WHEN d.product_amount > 0 THEN d.product_amount ELSE 0 END)::numeric(18,2) AS forward,
             ABS(SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END))::numeric(18,2) AS returns,
             COUNT(*) FILTER (WHERE d.product_amount < 0) AS lines
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN :w_s AND :w_e {f_sql}
       GROUP BY 1
       HAVING SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END) < 0
    ),
    yoy AS (
      SELECT COALESCE(NULLIF(lp.region_name, ''), '—') AS label,
             ABS(SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END))::numeric(18,2) AS returns
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN (:w_s - INTERVAL '1 year') AND (:w_e - INTERVAL '1 year') {f_sql}
       GROUP BY 1
    ),
    joined AS (
      SELECT c.label, c.forward, c.returns, c.lines,
             (CASE WHEN c.forward = 0 THEN NULL ELSE c.returns / c.forward END)::numeric(10,4) AS rate,
             (CASE WHEN COALESCE(y.returns, 0) = 0 THEN NULL
                   ELSE c.returns / y.returns - 1 END)::numeric(10,4) AS yoy_pct
        FROM cur c
        LEFT JOIN yoy y ON y.label = c.label
       WHERE TRUE {search_clause}
    )
    SELECT *, COUNT(*) OVER () AS _total
      FROM joined
     ORDER BY {order_col} {sort_dir} NULLS LAST, label ASC
     LIMIT :limit OFFSET :offset
    """
    params: dict[str, Any] = {
        "w_s": window.start, "w_e": window.end,
        "limit": size, "offset": page * size, **f_params,
    }
    if search:
        params["q"] = f"%{search}%"
    rows = (await session.execute(text(sql), params)).mappings().all()
    total = int(rows[0]["_total"]) if rows else 0
    return {
        "rows": [{
            "label": r["label"],
            "forward": float(r["forward"] or 0),
            "returns": float(r["returns"] or 0),
            "rate": float(r["rate"] or 0),
            "lines": int(r["lines"] or 0),
            "yoy_pct": float(r["yoy_pct"]) if r["yoy_pct"] is not None else None,
        } for r in rows],
        "total": total, "page": page, "size": size,
        "sort": f"{sort_key}:{sort_dir.lower()}",
    }
