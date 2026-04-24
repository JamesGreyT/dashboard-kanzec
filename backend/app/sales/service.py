"""Sales analytics — SQL-backed aggregations served to /sales page.

All monetary numbers use `deal_order.product_amount` (which after the
ETL swap in April 2026 is the post-revaluation figure matching the
Smartup UI). Timestamps are derived from `delivery_date`."""
from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.filters import Filters, clause
from .._analytics.windows import Compare, Granularity, Window, compare_periods


# ---------------------------------------------------------------------------
# Overview — headline KPIs for the 4-card strip
# ---------------------------------------------------------------------------


async def overview(session: AsyncSession, window: Window, f: Filters) -> dict:
    cmp = compare_periods(window)
    f_sql, f_params = clause(f)
    # One query returns 3 window aggregates (current, mom, yoy) using
    # a VALUES strip so we reuse the join cost.
    sql = f"""
    WITH w AS (
      SELECT * FROM (VALUES
        ('current', CAST(:cur_s AS date), CAST(:cur_e AS date)),
        ('mom',     CAST(:mom_s AS date), CAST(:mom_e AS date)),
        ('yoy',     CAST(:yoy_s AS date), CAST(:yoy_e AS date))
      ) AS t(label, w_start, w_end)
    )
    SELECT w.label,
           COUNT(*)                                AS rows,
           COUNT(DISTINCT d.deal_id)               AS deals,
           COUNT(DISTINCT d.person_id)             AS clients,
           COALESCE(SUM(d.product_amount), 0)::numeric(18,2) AS revenue,
           COALESCE(SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END), 0)::numeric(18,2) AS returns
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
    cur = by.get("current") or {"revenue": 0, "deals": 0, "clients": 0, "rows": 0, "returns": 0}
    mom = by.get("mom")     or {"revenue": 0, "deals": 0, "clients": 0, "rows": 0, "returns": 0}
    yoy = by.get("yoy")     or {"revenue": 0, "deals": 0, "clients": 0, "rows": 0, "returns": 0}
    avg_deal = (float(cur["revenue"]) / cur["deals"]) if cur["deals"] else 0
    avg_mom = (float(mom["revenue"]) / mom["deals"]) if mom["deals"] else 0
    returns_pct = (
        abs(float(cur["returns"])) / float(cur["revenue"])
        if cur["revenue"] else 0
    )

    def _pct(c, p):
        return (float(c) / float(p) - 1.0) if p else None

    return {
        "window": {"from": str(window.start), "to": str(window.end)},
        "comparison": {
            "mom": {"from": str(cmp.mom.start), "to": str(cmp.mom.end)},
            "yoy": {"from": str(cmp.yoy.start), "to": str(cmp.yoy.end)},
        },
        "revenue":        {"current": float(cur["revenue"]), "prior": float(mom["revenue"]), "yoy": float(yoy["revenue"]),
                           "mom_pct": _pct(cur["revenue"], mom["revenue"]),
                           "yoy_pct": _pct(cur["revenue"], yoy["revenue"])},
        "deals":          {"current": int(cur["deals"]),   "prior": int(mom["deals"]),   "yoy": int(yoy["deals"]),
                           "mom_pct": _pct(cur["deals"],   mom["deals"]),
                           "yoy_pct": _pct(cur["deals"],   yoy["deals"])},
        "unique_clients": {"current": int(cur["clients"]), "prior": int(mom["clients"]), "yoy": int(yoy["clients"]),
                           "mom_pct": _pct(cur["clients"], mom["clients"]),
                           "yoy_pct": _pct(cur["clients"], yoy["clients"])},
        "avg_deal":       {"current": avg_deal,            "prior": avg_mom,
                           "mom_pct": _pct(avg_deal, avg_mom)},
        "returns_pct":    returns_pct,
    }


# ---------------------------------------------------------------------------
# Timeseries — daily/weekly/monthly revenue with 7d MA and YoY overlay
# ---------------------------------------------------------------------------


async def timeseries(session: AsyncSession, window: Window, granularity: Granularity,
                     f: Filters) -> list[dict]:
    f_sql, f_params = clause(f)
    trunc = {"day": "day", "week": "week", "month": "month", "quarter": "quarter"}[granularity]
    sql = f"""
    WITH buckets AS (
      SELECT DATE_TRUNC('{trunc}', d.delivery_date)::date AS b,
             SUM(d.product_amount)::numeric(18,2) AS revenue
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN :w_s AND :w_e {f_sql}
       GROUP BY 1
    ),
    yoy AS (
      SELECT DATE_TRUNC('{trunc}', d.delivery_date - INTERVAL '1 year')::date + INTERVAL '1 year' AS b,
             SUM(d.product_amount)::numeric(18,2) AS revenue
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN (:w_s - INTERVAL '1 year') AND (:w_e - INTERVAL '1 year')
              {f_sql}
       GROUP BY 1
    )
    SELECT COALESCE(b.b, y.b::date) AS b,
           COALESCE(b.revenue, 0)::numeric(18,2) AS revenue,
           COALESCE(y.revenue, 0)::numeric(18,2) AS yoy_revenue
      FROM buckets b
      FULL OUTER JOIN yoy y ON b.b = y.b::date
     ORDER BY 1
    """
    rows = (await session.execute(
        text(sql),
        {"w_s": window.start, "w_e": window.end, **f_params},
    )).mappings().all()
    out = []
    # Simple 7-bucket rolling mean
    window_size = 7 if granularity == "day" else 4 if granularity == "week" else 3
    vals: list[float] = []
    for r in rows:
        v = float(r["revenue"])
        vals.append(v)
        if len(vals) > window_size:
            vals.pop(0)
        ma = sum(vals) / len(vals) if vals else 0
        out.append({
            "date": r["b"].isoformat() if hasattr(r["b"], "isoformat") else str(r["b"]),
            "value": v,
            "ma": round(ma, 2),
            "yoy": float(r["yoy_revenue"]),
        })
    return out


# ---------------------------------------------------------------------------
# Shared ranked-table fetch — the `RankedTable` frontend primitive pages
# through these. Server-side sorting, server-side pagination.
# ---------------------------------------------------------------------------


_SORTABLE_CLIENT_COLS = {
    "revenue":    "revenue",
    "deals":      "deals",
    "qty":        "qty",
    "avg_deal":   "avg_deal",
    "last_order": "last_order",
    "first_order": "first_order",
    "yoy_pct":    "yoy_pct",
    "name":       "name",
}


async def clients_ranked(session: AsyncSession, window: Window, f: Filters,
                         sort: str, page: int, size: int, search: str) -> dict:
    f_sql, f_params = clause(f)
    sort_key, _, sort_dir_raw = sort.partition(":")
    sort_dir = "ASC" if sort_dir_raw.lower() == "asc" else "DESC"
    order_col = _SORTABLE_CLIENT_COLS.get(sort_key, "revenue")
    search_clause = "AND lp.name ILIKE :q" if search else ""
    sql = f"""
    WITH cur AS (
      SELECT d.person_id,
             SUM(d.product_amount)::numeric(18,2) AS revenue,
             COUNT(DISTINCT d.deal_id) AS deals,
             SUM(d.sold_quant)::numeric(18,2) AS qty,
             MAX(d.delivery_date) AS last_order
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN :w_s AND :w_e {f_sql}
       GROUP BY d.person_id
    ),
    yoy AS (
      SELECT d.person_id, SUM(d.product_amount)::numeric(18,2) AS revenue
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN (:w_s - INTERVAL '1 year') AND (:w_e - INTERVAL '1 year')
              {f_sql}
       GROUP BY d.person_id
    ),
    first_order AS (
      SELECT person_id, MIN(delivery_date) AS first_order
        FROM smartup_rep.deal_order
       GROUP BY person_id
    ),
    joined AS (
      SELECT lp.person_id, lp.name, lp.direction, lp.region_name,
             c.revenue, c.deals, c.qty, c.last_order,
             (c.revenue / NULLIF(c.deals, 0))::numeric(18,2) AS avg_deal,
             fo.first_order,
             (CASE WHEN COALESCE(y.revenue, 0) = 0 THEN NULL
                   ELSE (c.revenue / y.revenue - 1) END)::numeric(10,4) AS yoy_pct
        FROM cur c
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = c.person_id
        LEFT JOIN yoy y ON y.person_id = c.person_id
        LEFT JOIN first_order fo ON fo.person_id = c.person_id
       WHERE TRUE {search_clause}
    )
    SELECT *, COUNT(*) OVER () AS _total
      FROM joined
     ORDER BY {order_col} {sort_dir} NULLS LAST, name ASC
     LIMIT :limit OFFSET :offset
    """
    params: dict[str, Any] = {
        "w_s": window.start, "w_e": window.end,
        "limit": size, "offset": page * size,
        **f_params,
    }
    if search:
        params["q"] = f"%{search}%"
    rows = (await session.execute(text(sql), params)).mappings().all()
    total = int(rows[0]["_total"]) if rows else 0

    # Totals across the full filtered set (not just this page)
    totals_sql = f"""
    WITH cur AS (
      SELECT SUM(d.product_amount)::numeric(18,2) AS revenue,
             COUNT(DISTINCT d.deal_id) AS deals,
             SUM(d.sold_quant)::numeric(18,2) AS qty
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN :w_s AND :w_e {f_sql}
         AND (:q_null OR lp.name ILIKE :q)
    )
    SELECT * FROM cur
    """
    totals = (await session.execute(
        text(totals_sql),
        {"w_s": window.start, "w_e": window.end, "q": f"%{search}%" if search else "",
         "q_null": not search, **f_params},
    )).mappings().first() or {"revenue": 0, "deals": 0, "qty": 0}
    return {
        "rows": [
            {
                "person_id": str(r["person_id"]),
                "name": r["name"],
                "direction": r["direction"],
                "region": r["region_name"],
                "revenue": float(r["revenue"] or 0),
                "deals": int(r["deals"] or 0),
                "qty": float(r["qty"] or 0),
                "avg_deal": float(r["avg_deal"] or 0),
                "last_order": r["last_order"].isoformat() if r["last_order"] else None,
                "first_order": r["first_order"].isoformat() if r["first_order"] else None,
                "yoy_pct": float(r["yoy_pct"]) if r["yoy_pct"] is not None else None,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "size": size,
        "sort": f"{sort_key}:{sort_dir.lower()}",
        "totals": {
            "revenue": float(totals["revenue"] or 0),
            "deals":   int(totals["deals"] or 0),
            "qty":     float(totals["qty"] or 0),
        },
    }


async def managers_ranked(session: AsyncSession, window: Window, f: Filters,
                          sort: str, page: int, size: int, search: str) -> dict:
    return await _simple_rank(
        session, window, f, sort, page, size, search,
        dim_expr="COALESCE(NULLIF(TRIM(d.sales_manager), ''), '(—)')",
        label="sales_manager",
        extra_cols={"unique_clients": "COUNT(DISTINCT d.person_id)"},
    )


async def brands_ranked(session: AsyncSession, window: Window, f: Filters,
                        sort: str, page: int, size: int, search: str) -> dict:
    return await _simple_rank(
        session, window, f, sort, page, size, search,
        dim_expr="COALESCE(NULLIF(TRIM(d.brand), ''), 'Другие')",
        label="brand",
        extra_cols={"skus": "COUNT(DISTINCT d.product_id)"},
    )


async def regions_ranked(session: AsyncSession, window: Window, f: Filters,
                         sort: str, page: int, size: int, search: str) -> dict:
    return await _simple_rank(
        session, window, f, sort, page, size, search,
        dim_expr="COALESCE(NULLIF(TRIM(lp.region_name), ''), '(—)')",
        label="region",
        extra_cols={"unique_clients": "COUNT(DISTINCT d.person_id)"},
    )


async def _simple_rank(
    session: AsyncSession, window: Window, f: Filters,
    sort: str, page: int, size: int, search: str,
    *, dim_expr: str, label: str, extra_cols: dict[str, str],
) -> dict:
    """Generic "group by one dimension + sort" pattern shared by
    managers, brands, regions. Returns the same paginated shape."""
    f_sql, f_params = clause(f)
    sort_key, _, sort_dir_raw = sort.partition(":")
    sort_dir = "ASC" if sort_dir_raw.lower() == "asc" else "DESC"
    # Allow sort by any extra col plus revenue/deals/qty/label
    order_col = sort_key if sort_key in {"revenue", "deals", "qty", "label",
                                         *extra_cols.keys()} else "revenue"
    if order_col == "label":
        order_col = label
    extras_select = ", ".join(f"{expr} AS {col}" for col, expr in extra_cols.items())
    extras_select = (extras_select + ",") if extras_select else ""
    search_clause = f"AND {dim_expr} ILIKE :q" if search else ""
    sql = f"""
    WITH cur AS (
      SELECT {dim_expr} AS {label},
             SUM(d.product_amount)::numeric(18,2) AS revenue,
             COUNT(DISTINCT d.deal_id) AS deals,
             SUM(d.sold_quant)::numeric(18,2) AS qty,
             {extras_select}
             MAX(d.delivery_date) AS last_active
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN :w_s AND :w_e {f_sql}
       GROUP BY 1
    ),
    yoy AS (
      SELECT {dim_expr} AS {label},
             SUM(d.product_amount)::numeric(18,2) AS revenue
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN (:w_s - INTERVAL '1 year') AND (:w_e - INTERVAL '1 year') {f_sql}
       GROUP BY 1
    )
    SELECT c.*, COALESCE(y.revenue, 0)::numeric(18,2) AS yoy_revenue,
           (CASE WHEN COALESCE(y.revenue, 0) = 0 THEN NULL
                 ELSE (c.revenue / y.revenue - 1) END)::numeric(10,4) AS yoy_pct,
           COUNT(*) OVER () AS _total
      FROM cur c
      LEFT JOIN yoy y USING ({label})
     WHERE TRUE {search_clause}
     ORDER BY {order_col} {sort_dir} NULLS LAST, {label} ASC
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
    SELECT SUM(d.product_amount)::numeric(18,2) AS revenue,
           COUNT(DISTINCT d.deal_id) AS deals,
           SUM(d.sold_quant)::numeric(18,2) AS qty
      FROM smartup_rep.deal_order d
      JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
     WHERE d.delivery_date BETWEEN :w_s AND :w_e {f_sql}
    """
    totals = (await session.execute(
        text(totals_sql),
        {"w_s": window.start, "w_e": window.end, **f_params},
    )).mappings().first() or {"revenue": 0, "deals": 0, "qty": 0}
    return {
        "rows": [
            {
                "label": r[label],
                "revenue": float(r["revenue"] or 0),
                "deals": int(r["deals"] or 0),
                "qty": float(r["qty"] or 0),
                "yoy_pct": float(r["yoy_pct"]) if r["yoy_pct"] is not None else None,
                "last_active": r["last_active"].isoformat() if r["last_active"] else None,
                **{c: (int(r[c]) if r[c] is not None else 0) for c in extra_cols.keys()},
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "size": size,
        "sort": f"{sort_key}:{sort_dir.lower()}",
        "totals": {
            "revenue": float(totals["revenue"] or 0),
            "deals":   int(totals["deals"] or 0),
            "qty":     float(totals["qty"] or 0),
        },
    }


# ---------------------------------------------------------------------------
# Seasonality heatmap (FY rows × month columns)
# ---------------------------------------------------------------------------


async def seasonality_heatmap(session: AsyncSession, years: int = 4,
                              f: Filters | None = None) -> dict:
    from datetime import date as _date
    today = _date.today()
    # Latest FY end: the 31 March just past
    last_end_year = today.year if today.month >= 4 else today.year
    if today.month < 4:
        last_end_year = today.year
    # 4 × 12-month rows ending 31 Mar of (end_year-3, end_year-2, end_year-1, end_year)
    rows_out = []
    f_sql, f_params = clause(f or Filters())
    for i in range(years - 1, -1, -1):
        fy_end_year = last_end_year - i
        fy_start = _date(fy_end_year - 1, 4, 1)
        fy_end = _date(fy_end_year, 3, 31)
        sql = f"""
        SELECT EXTRACT(MONTH FROM d.delivery_date)::int AS m,
               SUM(d.product_amount)::numeric(18,2) AS revenue
          FROM smartup_rep.deal_order d
          JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
         WHERE d.delivery_date BETWEEN :s AND :e {f_sql}
         GROUP BY 1
        """
        rr = (await session.execute(
            text(sql), {"s": fy_start, "e": fy_end, **f_params},
        )).mappings().all()
        by_m = {int(r["m"]): float(r["revenue"] or 0) for r in rr}
        # Remap to fiscal-year month order: Apr=0 … Mar=11
        vec = [by_m.get(m, 0.0) for m in [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]]
        rows_out.append({"label": f"FY {fy_end_year - 1}-{str(fy_end_year)[2:]}",
                         "values": vec})
    return {
        "row_labels": [r["label"] for r in rows_out],
        "col_labels": ["Apr", "May", "Jun", "Jul", "Avg", "Sen",
                       "Okt", "Noy", "Dek", "Yan", "Fev", "Mart"],
        "values": [r["values"] for r in rows_out],
    }
