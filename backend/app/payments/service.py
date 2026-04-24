"""Payments analytics — aggregations served to /analytics/payments page.

Uses smartup_rep.payment for inflow and joins smartup_rep.deal_order
for velocity/DSO/collection-ratio calculations."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.filters import Filters, clause
from .._analytics.rfm import build_rfm_payments_sql
from .._analytics.windows import Granularity, Window, compare_periods


# ---------------------------------------------------------------------------
# Overview KPIs
# ---------------------------------------------------------------------------


async def overview(session: AsyncSession, window: Window, f: Filters) -> dict:
    cmp = compare_periods(window)
    f_sql, f_params = clause(f, manager_table="lp", room_on="")  # no manager filter on payment
    # Kirim + simple stats across current/mom/yoy
    sql = f"""
    WITH w AS (
      SELECT * FROM (VALUES
        ('current', CAST(:cur_s AS date), CAST(:cur_e AS date)),
        ('mom',     CAST(:mom_s AS date), CAST(:mom_e AS date)),
        ('yoy',     CAST(:yoy_s AS date), CAST(:yoy_e AS date))
      ) AS t(label, w_start, w_end)
    )
    SELECT w.label,
           COUNT(p.payment_id)             AS payments,
           COUNT(DISTINCT p.person_id)     AS payers,
           COALESCE(SUM(p.amount), 0)::numeric(18,2) AS receipts
      FROM w
      LEFT JOIN smartup_rep.payment p
        ON p.payment_date::date BETWEEN w.w_start AND w.w_end
      LEFT JOIN smartup_rep.legal_person lp
        ON lp.person_id = p.person_id
     WHERE TRUE {f_sql}
     GROUP BY w.label
    """
    rows = (await session.execute(text(sql), {
        "cur_s": window.start, "cur_e": window.end,
        "mom_s": cmp.mom.start, "mom_e": cmp.mom.end,
        "yoy_s": cmp.yoy.start, "yoy_e": cmp.yoy.end,
        **f_params,
    })).mappings().all()
    by = {r["label"]: r for r in rows}
    cur = by.get("current") or {"receipts": 0, "payments": 0, "payers": 0}
    mom = by.get("mom")     or {"receipts": 0, "payments": 0, "payers": 0}
    yoy = by.get("yoy")     or {"receipts": 0, "payments": 0, "payers": 0}
    avg = float(cur["receipts"]) / cur["payments"] if cur["payments"] else 0
    avg_prior = float(mom["receipts"]) / mom["payments"] if mom["payments"] else 0

    def _pct(c, p):
        return (float(c) / float(p) - 1.0) if p else None

    # DSO — rolling 12-month at window.end. Weighted average of
    # (payment_date − nearest prior delivery_date) across all paid
    # invoices in the trailing 12 months. Uses the composite index
    # idx_deal_order_person_date added in April 2026.
    dso = 0.0
    dso_row = (await session.execute(text(f"""
        SELECT COALESCE(
          SUM( (p.payment_date::date - pv.prev_delivery)::numeric * p.amount )
            / NULLIF(SUM(p.amount), 0),
          0)::numeric(18,2) AS dso
          FROM smartup_rep.payment p
          JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
          LEFT JOIN LATERAL (
            SELECT MAX(d2.delivery_date) AS prev_delivery
              FROM smartup_rep.deal_order d2
             WHERE d2.person_id = p.person_id::text
               AND d2.delivery_date <= p.payment_date::date
          ) pv ON TRUE
         WHERE p.payment_date >= (CAST(:w_e AS date) - INTERVAL '12 months')
           AND p.payment_date::date <= CAST(:w_e AS date)
           AND pv.prev_delivery IS NOT NULL
           {f_sql}
    """), {"w_e": window.end, **f_params})).mappings().first()
    if dso_row:
        dso = float(dso_row["dso"] or 0)

    # Collection ratio for the window: receipts in window / invoiced in window
    cr_row = (await session.execute(text(f"""
        WITH inv AS (
          SELECT COALESCE(SUM(d.product_amount), 0)::numeric(18,2) AS amt
            FROM smartup_rep.deal_order d
            JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
           WHERE d.delivery_date BETWEEN CAST(:w_s AS date) AND CAST(:w_e AS date)
           {f_sql}
        )
        SELECT (CAST(:cur_rcpt AS numeric) / NULLIF(inv.amt, 0))::numeric(10,4) AS cr,
               inv.amt AS invoiced
          FROM inv
    """), {"w_s": window.start, "w_e": window.end,
           "cur_rcpt": float(cur["receipts"]), **f_params})).mappings().first()
    collection_ratio = float(cr_row["cr"]) if cr_row and cr_row["cr"] is not None else None

    return {
        "window": {"from": str(window.start), "to": str(window.end)},
        "receipts": {"current": float(cur["receipts"]), "prior": float(mom["receipts"]),
                     "yoy": float(yoy["receipts"]),
                     "mom_pct": _pct(cur["receipts"], mom["receipts"]),
                     "yoy_pct": _pct(cur["receipts"], yoy["receipts"])},
        "payments": {"current": int(cur["payments"]), "prior": int(mom["payments"]),
                     "yoy": int(yoy["payments"]),
                     "mom_pct": _pct(cur["payments"], mom["payments"]),
                     "yoy_pct": _pct(cur["payments"], yoy["payments"])},
        "payers":   {"current": int(cur["payers"]),   "prior": int(mom["payers"]),
                     "yoy": int(yoy["payers"]),
                     "mom_pct": _pct(cur["payers"],   mom["payers"]),
                     "yoy_pct": _pct(cur["payers"],   yoy["payers"])},
        "avg_payment": {"current": avg, "prior": avg_prior,
                        "mom_pct": _pct(avg, avg_prior)},
        "dso": dso,
        "collection_ratio": collection_ratio,
    }


# ---------------------------------------------------------------------------
# Timeseries
# ---------------------------------------------------------------------------


async def timeseries(session: AsyncSession, window: Window, granularity: Granularity,
                     f: Filters) -> list[dict]:
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    trunc = {"day": "day", "week": "week", "month": "month", "quarter": "quarter"}[granularity]
    sql = f"""
    WITH buckets AS (
      SELECT DATE_TRUNC('{trunc}', p.payment_date)::date AS b,
             SUM(p.amount)::numeric(18,2) AS receipts
        FROM smartup_rep.payment p
        JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
       WHERE p.payment_date BETWEEN :w_s AND :w_e {f_sql}
       GROUP BY 1
    ),
    yoy AS (
      SELECT (DATE_TRUNC('{trunc}', p.payment_date - INTERVAL '1 year') + INTERVAL '1 year')::date AS b,
             SUM(p.amount)::numeric(18,2) AS receipts
        FROM smartup_rep.payment p
        JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
       WHERE p.payment_date BETWEEN (:w_s - INTERVAL '1 year') AND (:w_e - INTERVAL '1 year')
              {f_sql}
       GROUP BY 1
    )
    SELECT COALESCE(b.b, y.b) AS b,
           COALESCE(b.receipts, 0)::numeric(18,2) AS value,
           COALESCE(y.receipts, 0)::numeric(18,2) AS yoy
      FROM buckets b
      FULL OUTER JOIN yoy y ON b.b = y.b
     ORDER BY 1
    """
    rows = (await session.execute(text(sql), {
        "w_s": window.start, "w_e": window.end, **f_params,
    })).mappings().all()
    out = []
    window_size = 7 if granularity == "day" else 4 if granularity == "week" else 3
    vals: list[float] = []
    for r in rows:
        v = float(r["value"])
        vals.append(v)
        if len(vals) > window_size:
            vals.pop(0)
        ma = sum(vals) / len(vals) if vals else 0
        out.append({
            "date": r["b"].isoformat() if hasattr(r["b"], "isoformat") else str(r["b"]),
            "value": v,
            "ma": round(ma, 2),
            "yoy": float(r["yoy"]),
        })
    return out


# ---------------------------------------------------------------------------
# Method split (Касса vs Банк) + weekday pattern + day-of-month
# ---------------------------------------------------------------------------


async def method_split(session: AsyncSession, window: Window, f: Filters) -> list[dict]:
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    rows = (await session.execute(text(f"""
        SELECT COALESCE(p.payment_method, '(—)') AS method,
               COUNT(*) AS cnt,
               COALESCE(SUM(p.amount), 0)::numeric(18,2) AS amt
          FROM smartup_rep.payment p
          JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
         WHERE p.payment_date BETWEEN :w_s AND :w_e {f_sql}
         GROUP BY 1 ORDER BY 3 DESC
    """), {"w_s": window.start, "w_e": window.end, **f_params})).mappings().all()
    return [{"method": r["method"], "count": int(r["cnt"]), "amount": float(r["amt"])}
            for r in rows]


async def weekday_pattern(session: AsyncSession, window: Window, f: Filters) -> list[dict]:
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    rows = (await session.execute(text(f"""
        SELECT EXTRACT(ISODOW FROM p.payment_date)::int AS dow,
               COUNT(*) AS cnt,
               COALESCE(SUM(p.amount), 0)::numeric(18,2) AS amt
          FROM smartup_rep.payment p
          JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
         WHERE p.payment_date BETWEEN :w_s AND :w_e {f_sql}
         GROUP BY 1 ORDER BY 1
    """), {"w_s": window.start, "w_e": window.end, **f_params})).mappings().all()
    labels = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"]  # Mon-Sun in Uzbek short
    return [{"dow": int(r["dow"]), "label": labels[int(r["dow"]) - 1],
             "count": int(r["cnt"]), "amount": float(r["amt"])} for r in rows]


async def dom_pattern(session: AsyncSession, window: Window, f: Filters) -> list[dict]:
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    rows = (await session.execute(text(f"""
        SELECT EXTRACT(DAY FROM p.payment_date)::int AS d,
               COALESCE(SUM(p.amount), 0)::numeric(18,2) AS amt
          FROM smartup_rep.payment p
          JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
         WHERE p.payment_date BETWEEN :w_s AND :w_e {f_sql}
         GROUP BY 1 ORDER BY 1
    """), {"w_s": window.start, "w_e": window.end, **f_params})).mappings().all()
    return [{"day": int(r["d"]), "amount": float(r["amt"])} for r in rows]


# ---------------------------------------------------------------------------
# Velocity histogram (days from order to payment)
# ---------------------------------------------------------------------------


async def velocity(session: AsyncSession, window: Window, f: Filters) -> list[dict]:
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    rows = (await session.execute(text(f"""
        WITH paid AS (
          SELECT p.amount,
                 (p.payment_date::date - pv.prev_delivery) AS days
            FROM smartup_rep.payment p
            JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
            LEFT JOIN LATERAL (
              SELECT MAX(d2.delivery_date) AS prev_delivery
                FROM smartup_rep.deal_order d2
               WHERE d2.person_id = p.person_id::text
                 AND d2.delivery_date <= p.payment_date::date
            ) pv ON TRUE
           WHERE p.payment_date BETWEEN :w_s AND :w_e {f_sql}
             AND pv.prev_delivery IS NOT NULL
        )
        SELECT bucket, COUNT(*) AS cnt, COALESCE(SUM(amount), 0)::numeric(18,2) AS amt
          FROM (SELECT
                 CASE
                   WHEN days <= 0  THEN 'prepay'
                   WHEN days <= 7  THEN '1-7'
                   WHEN days <= 15 THEN '8-15'
                   WHEN days <= 30 THEN '16-30'
                   WHEN days <= 60 THEN '31-60'
                   WHEN days <= 90 THEN '61-90'
                   ELSE '91+'
                 END AS bucket, amount
                FROM paid) t
         GROUP BY bucket
    """), {"w_s": window.start, "w_e": window.end, **f_params})).mappings().all()
    order = ["prepay", "1-7", "8-15", "16-30", "31-60", "61-90", "91+"]
    by = {r["bucket"]: (int(r["cnt"]), float(r["amt"])) for r in rows}
    return [{"bucket": b, "count": by.get(b, (0, 0))[0], "amount": by.get(b, (0, 0))[1]}
            for b in order]


# ---------------------------------------------------------------------------
# Collection ratio monthly trend (paid-in-month / invoiced-in-month)
# ---------------------------------------------------------------------------


async def collection_ratio_trend(session: AsyncSession, window: Window, f: Filters) -> list[dict]:
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    rows = (await session.execute(text(f"""
        WITH months AS (
          SELECT generate_series(
            DATE_TRUNC('month', CAST(:w_s AS date)),
            DATE_TRUNC('month', CAST(:w_e AS date)),
            INTERVAL '1 month'
          )::date AS m
        ),
        inv AS (
          SELECT DATE_TRUNC('month', d.delivery_date)::date AS m,
                 SUM(d.product_amount)::numeric(18,2) AS invoiced
            FROM smartup_rep.deal_order d
            JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
           WHERE d.delivery_date BETWEEN :w_s AND :w_e {f_sql}
           GROUP BY 1
        ),
        pay AS (
          SELECT DATE_TRUNC('month', p.payment_date)::date AS m,
                 SUM(p.amount)::numeric(18,2) AS paid
            FROM smartup_rep.payment p
            JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
           WHERE p.payment_date BETWEEN :w_s AND :w_e {f_sql}
           GROUP BY 1
        )
        SELECT m.m, COALESCE(inv.invoiced, 0) AS invoiced, COALESCE(pay.paid, 0) AS paid
          FROM months m
          LEFT JOIN inv ON inv.m = m.m
          LEFT JOIN pay ON pay.m = m.m
         ORDER BY 1
    """), {"w_s": window.start, "w_e": window.end, **f_params})).mappings().all()
    return [{"month": r["m"].isoformat(),
             "invoiced": float(r["invoiced"]),
             "paid": float(r["paid"]),
             "ratio": (float(r["paid"]) / float(r["invoiced"])) if float(r["invoiced"]) else None}
            for r in rows]


# ---------------------------------------------------------------------------
# Ranked tables
# ---------------------------------------------------------------------------


async def payers_ranked(session: AsyncSession, window: Window, f: Filters,
                        sort: str, page: int, size: int, search: str) -> dict:
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    sort_key, _, dirraw = sort.partition(":")
    sort_dir = "ASC" if dirraw.lower() == "asc" else "DESC"
    order_col = {"receipts": "receipts", "payments": "payments",
                 "avg_payment": "avg_payment", "last_pay": "last_pay",
                 "first_pay": "first_pay", "name": "name",
                 "yoy_pct": "yoy_pct"}.get(sort_key, "receipts")
    search_clause = "AND lp.name ILIKE :q" if search else ""
    sql = f"""
    WITH cur AS (
      SELECT p.person_id,
             SUM(p.amount)::numeric(18,2) AS receipts,
             COUNT(*) AS payments,
             MIN(p.payment_date::date) AS first_pay,
             MAX(p.payment_date::date) AS last_pay
        FROM smartup_rep.payment p
        JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
       WHERE p.payment_date BETWEEN :w_s AND :w_e {f_sql}
       GROUP BY 1
    ),
    yoy AS (
      SELECT p.person_id, SUM(p.amount)::numeric(18,2) AS receipts
        FROM smartup_rep.payment p
        JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
       WHERE p.payment_date BETWEEN (:w_s - INTERVAL '1 year') AND (:w_e - INTERVAL '1 year')
         {f_sql}
       GROUP BY 1
    )
    SELECT c.person_id, lp.name, lp.direction, lp.region_name,
           c.receipts, c.payments,
           (c.receipts / NULLIF(c.payments, 0))::numeric(18,2) AS avg_payment,
           c.first_pay, c.last_pay,
           (CASE WHEN COALESCE(y.receipts, 0) = 0 THEN NULL
                 ELSE (c.receipts / y.receipts - 1) END)::numeric(10,4) AS yoy_pct,
           COUNT(*) OVER () AS _total
      FROM cur c
      JOIN smartup_rep.legal_person lp ON lp.person_id = c.person_id
      LEFT JOIN yoy y ON y.person_id = c.person_id
     WHERE TRUE {search_clause}
     ORDER BY {order_col} {sort_dir} NULLS LAST, lp.name ASC
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
    totals = (await session.execute(text(f"""
        SELECT SUM(p.amount)::numeric(18,2) AS receipts, COUNT(*) AS payments
          FROM smartup_rep.payment p
          JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
         WHERE p.payment_date BETWEEN :w_s AND :w_e {f_sql}
           AND (CAST(:q_null AS boolean) OR lp.name ILIKE :q)
    """), {"w_s": window.start, "w_e": window.end,
           "q": f"%{search}%" if search else "", "q_null": not search,
           **f_params})).mappings().first() or {"receipts": 0, "payments": 0}
    return {
        "rows": [{
            "person_id": str(r["person_id"]), "name": r["name"],
            "direction": r["direction"], "region": r["region_name"],
            "receipts": float(r["receipts"] or 0),
            "payments": int(r["payments"] or 0),
            "avg_payment": float(r["avg_payment"] or 0),
            "first_pay": r["first_pay"].isoformat() if r["first_pay"] else None,
            "last_pay":  r["last_pay"].isoformat() if r["last_pay"] else None,
            "yoy_pct": float(r["yoy_pct"]) if r["yoy_pct"] is not None else None,
        } for r in rows],
        "total": total, "page": page, "size": size,
        "sort": f"{sort_key}:{sort_dir.lower()}",
        "totals": {"receipts": float(totals["receipts"] or 0),
                   "payments": int(totals["payments"] or 0)},
    }


async def prepayers_ranked(session: AsyncSession, f: Filters,
                           sort: str, page: int, size: int, search: str) -> dict:
    """Clients with net CREDIT balance (more paid than invoiced across
    all time). Ranked by credit magnitude descending."""
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    sort_dir = "ASC" if sort.endswith(":asc") else "DESC"
    search_clause = "AND lp.name ILIKE :q" if search else ""
    sql = f"""
    WITH orders AS (
      SELECT person_id, SUM(product_amount) AS invoiced
        FROM smartup_rep.deal_order WHERE person_id IS NOT NULL GROUP BY person_id
    ),
    pays AS (
      SELECT person_id::text AS person_id, SUM(amount) AS paid,
             MAX(payment_date)::date AS last_pay,
             COUNT(*) AS payments
        FROM smartup_rep.payment WHERE person_id IS NOT NULL GROUP BY person_id
    )
    SELECT lp.person_id, lp.name, lp.direction, lp.region_name,
           COALESCE(p.paid, 0)::numeric(18,2)        AS paid,
           COALESCE(o.invoiced, 0)::numeric(18,2)    AS invoiced,
           (COALESCE(p.paid, 0) - COALESCE(o.invoiced, 0))::numeric(18,2) AS credit,
           p.last_pay, p.payments,
           COUNT(*) OVER () AS _total
      FROM smartup_rep.legal_person lp
      LEFT JOIN orders o ON o.person_id = lp.person_id::text
      LEFT JOIN pays   p ON p.person_id = lp.person_id::text
     WHERE (COALESCE(p.paid, 0) - COALESCE(o.invoiced, 0)) > 1 {search_clause}
       {f_sql}
     ORDER BY credit {sort_dir}
     LIMIT :limit OFFSET :offset
    """
    params: dict[str, Any] = {"limit": size, "offset": page * size, **f_params}
    if search:
        params["q"] = f"%{search}%"
    rows = (await session.execute(text(sql), params)).mappings().all()
    total = int(rows[0]["_total"]) if rows else 0
    return {
        "rows": [{
            "person_id": str(r["person_id"]),
            "name": r["name"], "direction": r["direction"], "region": r["region_name"],
            "paid": float(r["paid"] or 0), "invoiced": float(r["invoiced"] or 0),
            "credit": float(r["credit"] or 0),
            "payments": int(r["payments"] or 0),
            "last_pay": r["last_pay"].isoformat() if r["last_pay"] else None,
        } for r in rows],
        "total": total, "page": page, "size": size, "sort": sort,
        "totals": {"credit": sum(float(r["credit"] or 0) for r in rows)},
    }


async def regularity(session: AsyncSession, f: Filters,
                     sort: str, page: int, size: int, search: str) -> dict:
    """Classify every payer by their inter-payment gap pattern over the
    last 180 days. Class labels: daily (<2d), weekly (<10d), monthly
    (<35d), sporadic (<90d), churned (≥90d or no recent payment)."""
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    sort_dir = "ASC" if sort.endswith(":asc") else "DESC"
    order_col = {"avg_gap": "avg_gap", "payments": "payments",
                 "last_pay": "last_pay", "name": "name",
                 "receipts": "receipts"}.get(sort.split(":")[0], "receipts")
    search_clause = "AND lp.name ILIKE :q" if search else ""
    sql = f"""
    WITH recent AS (
      SELECT p.person_id, p.payment_date::date AS pd, p.amount
        FROM smartup_rep.payment p
        JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
       WHERE p.payment_date >= (CURRENT_DATE - INTERVAL '180 days')
       {f_sql}
    ),
    gaps AS (
      SELECT person_id, pd, amount,
             LAG(pd) OVER (PARTITION BY person_id ORDER BY pd) AS prev_pd
        FROM recent
    ),
    stats AS (
      SELECT person_id,
             SUM(amount)::numeric(18,2) AS receipts,
             COUNT(*) AS payments,
             MAX(pd) AS last_pay,
             AVG(pd - prev_pd) AS avg_gap
        FROM gaps GROUP BY person_id
    )
    SELECT s.person_id, lp.name, lp.direction, lp.region_name,
           s.receipts, s.payments, s.last_pay,
           s.avg_gap,
           CASE
             WHEN s.avg_gap IS NULL THEN 'sporadic'
             WHEN s.avg_gap < 2  THEN 'daily'
             WHEN s.avg_gap < 10 THEN 'weekly'
             WHEN s.avg_gap < 35 THEN 'monthly'
             WHEN s.avg_gap < 90 THEN 'sporadic'
             ELSE 'churned'
           END AS class,
           COUNT(*) OVER () AS _total
      FROM stats s
      JOIN smartup_rep.legal_person lp ON lp.person_id = s.person_id
     WHERE TRUE {search_clause}
     ORDER BY {order_col} {sort_dir} NULLS LAST, lp.name ASC
     LIMIT :limit OFFSET :offset
    """
    params: dict[str, Any] = {"limit": size, "offset": page * size, **f_params}
    if search:
        params["q"] = f"%{search}%"
    rows = (await session.execute(text(sql), params)).mappings().all()
    total = int(rows[0]["_total"]) if rows else 0
    return {
        "rows": [{
            "person_id": str(r["person_id"]), "name": r["name"],
            "direction": r["direction"], "region": r["region_name"],
            "receipts": float(r["receipts"] or 0),
            "payments": int(r["payments"] or 0),
            "last_pay": r["last_pay"].isoformat() if r["last_pay"] else None,
            "avg_gap": float(r["avg_gap"]) if r["avg_gap"] is not None else None,
            "class": r["class"],
        } for r in rows],
        "total": total, "page": page, "size": size, "sort": sort,
        "totals": {"receipts": sum(float(r["receipts"] or 0) for r in rows)},
    }


async def rfm_payments(session: AsyncSession, window: Window, f: Filters,
                       page: int = 0, size: int = 50,
                       sort: str = "receipts:desc", search: str = "",
                       segment: str = "") -> dict:
    """Payment-side RFM segmentation."""
    sql = build_rfm_payments_sql(window_start=window.start, window_end=window.end)
    rows_all = (await session.execute(text(sql))).mappings().all()

    def passes_view(r):
        if f.direction and (r.get("direction") not in f.direction): return False
        if f.region and (r.get("region_name") not in f.region): return False
        if search and (search.lower() not in (r.get("name") or "").lower()): return False
        return True

    view_rows = [r for r in rows_all if passes_view(r)]
    if segment:
        rows = [r for r in view_rows if (r.get("segment") or "") == segment]
    else:
        rows = view_rows
    total = len(rows)

    sort_key, _, sort_dir_raw = sort.partition(":")
    sort_dir = "asc" if sort_dir_raw.lower() == "asc" else "desc"
    key_map = {
        "name": lambda r: (r.get("name") or "").lower(),
        "receipts": lambda r: float(r.get("receipts") or 0),
        "payments": lambda r: int(r.get("payments") or 0),
        "last_pay_date": lambda r: r.get("last_pay_date") or date.min,
        "days_since": lambda r: int(r.get("days_since") or 0),
        "r": lambda r: int(r.get("r") or 0),
        "f": lambda r: int(r.get("f") or 0),
        "m": lambda r: int(r.get("m") or 0),
    }
    key_fn = key_map.get(sort_key, key_map["receipts"])
    rows.sort(key=key_fn, reverse=(sort_dir == "desc"))

    page_rows = rows[page * size : page * size + size]

    # Chip distribution stays based on the un-segment-filtered population.
    segment_counts: dict[str, int] = {}
    segment_revenue: dict[str, float] = {}
    for r in view_rows:
        seg = r.get("segment") or "—"
        segment_counts[seg] = segment_counts.get(seg, 0) + 1
        segment_revenue[seg] = segment_revenue.get(seg, 0.0) + float(r.get("receipts") or 0)

    return {
        "rows": [{
            "person_id": str(r["person_id"]),
            "name": r.get("name"),
            "direction": r.get("direction"),
            "region": r.get("region_name"),
            "last_pay_date": r["last_pay_date"].isoformat() if r.get("last_pay_date") else None,
            "days_since": int(r.get("days_since") or 0),
            "payments": int(r.get("payments") or 0),
            "receipts": float(r.get("receipts") or 0),
            "r": int(r.get("r") or 0),
            "f": int(r.get("f") or 0),
            "m": int(r.get("m") or 0),
            "score": r.get("score"),
            "segment": r.get("segment"),
        } for r in page_rows],
        "total": total, "page": page, "size": size,
        "sort": f"{sort_key}:{sort_dir}",
        "totals": {"receipts": sum(float(r.get("receipts") or 0) for r in rows),
                   "payments": sum(int(r.get("payments") or 0) for r in rows)},
        "segment_distribution": [
            {"segment": k, "clients": v, "receipts": round(segment_revenue.get(k, 0), 2)}
            for k, v in sorted(segment_counts.items(), key=lambda kv: -kv[1])
        ],
    }


async def churned_ranked(session: AsyncSession, f: Filters,
                         sort: str, page: int, size: int, search: str) -> dict:
    """Clients who paid in the trailing 12-24 months but NOT in the
    trailing 12 months. Ranked by how much they USED to pay."""
    f_sql, f_params = clause(f, manager_table="lp", room_on="")
    sort_dir = "ASC" if sort.endswith(":asc") else "DESC"
    search_clause = "AND lp.name ILIKE :q" if search else ""
    sql = f"""
    WITH prior AS (
      SELECT p.person_id, SUM(p.amount) AS receipts, MAX(p.payment_date)::date AS last_pay
        FROM smartup_rep.payment p
        JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
       WHERE p.payment_date < (CURRENT_DATE - INTERVAL '12 months')
         AND p.payment_date >= (CURRENT_DATE - INTERVAL '24 months')
         {f_sql}
       GROUP BY 1
    ),
    current_12 AS (
      SELECT DISTINCT p.person_id FROM smartup_rep.payment p
       WHERE p.payment_date >= (CURRENT_DATE - INTERVAL '12 months')
    )
    SELECT pr.person_id, lp.name, lp.direction, lp.region_name,
           pr.receipts::numeric(18,2) AS receipts, pr.last_pay,
           (CURRENT_DATE - pr.last_pay) AS days_since,
           COUNT(*) OVER () AS _total
      FROM prior pr
      JOIN smartup_rep.legal_person lp ON lp.person_id = pr.person_id
     WHERE pr.person_id NOT IN (SELECT person_id FROM current_12 WHERE person_id IS NOT NULL)
       {search_clause}
     ORDER BY receipts {sort_dir}
     LIMIT :limit OFFSET :offset
    """
    params: dict[str, Any] = {"limit": size, "offset": page * size, **f_params}
    if search:
        params["q"] = f"%{search}%"
    rows = (await session.execute(text(sql), params)).mappings().all()
    total = int(rows[0]["_total"]) if rows else 0
    return {
        "rows": [{
            "person_id": str(r["person_id"]), "name": r["name"],
            "direction": r["direction"], "region": r["region_name"],
            "receipts": float(r["receipts"] or 0),
            "last_pay": r["last_pay"].isoformat() if r["last_pay"] else None,
            "days_since": int(r["days_since"] or 0),
        } for r in rows],
        "total": total, "page": page, "size": size, "sort": sort,
        "totals": {"receipts": sum(float(r["receipts"] or 0) for r in rows)},
    }
