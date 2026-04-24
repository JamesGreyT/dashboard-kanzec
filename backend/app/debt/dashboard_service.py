"""Debt dashboard aggregates — extends the existing debt feature with
KPI strip, aging breakdowns, heatmaps, portfolio tables, and risk
scores. Worklist (existing) stays untouched and still serves
/api/debt/worklist for the operator action view."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# KPI strip
# ---------------------------------------------------------------------------


async def kpi_strip(session: AsyncSession) -> dict:
    """Total outstanding, #debtors, #over-90, largest single, wavg-age."""
    sql = """
    WITH base AS (
      SELECT d.person_id, d.delivery_date, d.product_amount,
             (CURRENT_DATE - d.delivery_date) AS age
        FROM smartup_rep.deal_order d
    ),
    per_client AS (
      SELECT person_id,
             SUM(product_amount) AS invoiced,
             MAX(delivery_date) AS last_order
        FROM base GROUP BY person_id
    ),
    pays AS (
      SELECT person_id::text AS person_id,
             SUM(amount) AS paid,
             MAX(payment_date)::date AS last_pay
        FROM smartup_rep.payment WHERE person_id IS NOT NULL
       GROUP BY person_id
    ),
    client_debt AS (
      SELECT lp.person_id::text AS pid,
             lp.name, lp.direction,
             COALESCE(pc.invoiced, 0) - COALESCE(pa.paid, 0) AS debt,
             pc.last_order, pa.last_pay
        FROM smartup_rep.legal_person lp
        LEFT JOIN per_client pc ON pc.person_id = lp.person_id::text
        LEFT JOIN pays pa ON pa.person_id = lp.person_id::text
    )
    SELECT
      (SELECT COALESCE(SUM(debt), 0)::numeric(18,2)
         FROM client_debt WHERE debt > 1)                     AS total_outstanding,
      (SELECT COUNT(*)    FROM client_debt WHERE debt > 1)    AS debtors,
      (SELECT COUNT(*)    FROM client_debt
         WHERE debt > 1
           AND (last_pay IS NULL OR last_pay < CURRENT_DATE - INTERVAL '90 days')
           AND (last_order IS NULL OR last_order < CURRENT_DATE - INTERVAL '90 days')) AS over_90,
      (SELECT MAX(debt)::numeric(18,2) FROM client_debt WHERE debt > 1)  AS largest,
      (SELECT COALESCE(SUM(b.product_amount * b.age) / NULLIF(SUM(b.product_amount), 0), 0)::numeric(10,1)
         FROM base b WHERE b.product_amount > 0)                  AS wavg_age_days
    """
    row = (await session.execute(text(sql))).mappings().first() or {}

    # Overdue promise count from app.debt_contact_log. This table lives
    # in the `app` schema; gracefully return 0 if the table doesn't
    # exist on this deployment.
    promises = 0
    try:
        pr = (await session.execute(text("""
            WITH latest AS (
              SELECT DISTINCT ON (person_id) person_id, outcome,
                     promised_amount, promised_by_date
                FROM app.debt_contact_log
               ORDER BY person_id, contacted_at DESC
            )
            SELECT COUNT(*) AS n
              FROM latest
             WHERE outcome = 'promised'
               AND promised_by_date IS NOT NULL
               AND promised_by_date < CURRENT_DATE
        """))).mappings().first() or {}
        promises = int(pr.get("n", 0))
    except Exception:  # noqa: BLE001
        promises = 0

    return {
        "total_outstanding": float(row.get("total_outstanding") or 0),
        "debtors":           int(row.get("debtors") or 0),
        "over_90":           int(row.get("over_90") or 0),
        "largest":           float(row.get("largest") or 0),
        "wavg_age_days":     float(row.get("wavg_age_days") or 0),
        "overdue_promises":  promises,
    }


# ---------------------------------------------------------------------------
# Aging pyramid ($+count per bucket, flat row-level aging)
# ---------------------------------------------------------------------------


async def aging_pyramid(session: AsyncSession) -> list[dict]:
    sql = """
    WITH aged AS (
      SELECT d.person_id,
             d.product_amount,
             (CURRENT_DATE - d.delivery_date) AS age
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.product_amount > 0
    )
    SELECT bucket,
           COUNT(*)            AS rows,
           COUNT(DISTINCT person_id) AS clients,
           COALESCE(SUM(product_amount), 0)::numeric(18,2) AS amount
      FROM (
        SELECT person_id, product_amount,
          CASE
            WHEN age <= 15  THEN '0-15'
            WHEN age <= 30  THEN '16-30'
            WHEN age <= 60  THEN '31-60'
            WHEN age <= 90  THEN '61-90'
            WHEN age <= 180 THEN '91-180'
            WHEN age <= 365 THEN '181-365'
            ELSE '365+'
          END AS bucket
          FROM aged
      ) t
     GROUP BY bucket
    """
    rows = (await session.execute(text(sql))).mappings().all()
    order = ["0-15", "16-30", "31-60", "61-90", "91-180", "181-365", "365+"]
    by = {r["bucket"]: (int(r["rows"]), int(r["clients"]), float(r["amount"])) for r in rows}
    return [{
        "bucket": b,
        "rows":    by.get(b, (0, 0, 0))[0],
        "clients": by.get(b, (0, 0, 0))[1],
        "amount":  by.get(b, (0, 0, 0))[2],
    } for b in order]


# ---------------------------------------------------------------------------
# Aging trend — weekly 91+ outstanding over the last 26 weeks
# ---------------------------------------------------------------------------


async def aging_trend(session: AsyncSession, weeks: int = 26) -> list[dict]:
    """For each week-ending, compute the as-of-then outstanding > 90d."""
    sql = """
    WITH weeks_ AS (
      SELECT generate_series(
        DATE_TRUNC('week', CURRENT_DATE - INTERVAL :span)::date,
        DATE_TRUNC('week', CURRENT_DATE)::date,
        INTERVAL '1 week'
      )::date AS w
    ),
    ord AS (
      SELECT person_id, delivery_date, product_amount FROM smartup_rep.deal_order
    ),
    pay AS (
      SELECT person_id::text AS person_id, payment_date::date AS pd, amount FROM smartup_rep.payment
    )
    SELECT w.w AS week,
           COALESCE(SUM(o.product_amount) FILTER (WHERE o.delivery_date <= w.w - INTERVAL '90 days'), 0)::numeric(18,2) AS aged_invoiced,
           COALESCE(SUM(p.amount)         FILTER (WHERE p.pd <= w.w),                                   0)::numeric(18,2) AS all_paid,
           COALESCE(SUM(o.product_amount) FILTER (WHERE o.delivery_date <= w.w),                        0)::numeric(18,2) AS all_invoiced_asof
      FROM weeks_ w
      LEFT JOIN ord o ON o.delivery_date <= w.w
      LEFT JOIN pay p ON p.pd <= w.w
     GROUP BY w.w ORDER BY w.w
    """
    # Approximation: amount > 90d_aged_outstanding at week w =
    #   invoices_older_than_90d_before_w  minus  payments_up_to_w
    # This over-counts recent payments that would have cleared old invoices
    # but it's a reasonable weekly-trend proxy.
    rows = (await session.execute(text(sql), {"span": f"{weeks} weeks"})).mappings().all()
    out = []
    for r in rows:
        aged = float(r["aged_invoiced"])
        paid = float(r["all_paid"])
        out.append({
            "week": r["week"].isoformat(),
            "over_90_approx": max(0, aged - paid),
        })
    return out


# ---------------------------------------------------------------------------
# Region × aging heatmap
# ---------------------------------------------------------------------------


async def region_aging_heatmap(session: AsyncSession) -> dict:
    sql = """
    WITH aged AS (
      SELECT d.product_amount,
             lp.region_name AS region,
             (CURRENT_DATE - d.delivery_date) AS age
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.product_amount > 0
         AND lp.region_name IS NOT NULL
    )
    SELECT region,
           SUM(CASE WHEN age <= 30  THEN product_amount ELSE 0 END)::numeric(18,2) AS b_0_30,
           SUM(CASE WHEN age > 30  AND age <= 60  THEN product_amount ELSE 0 END)::numeric(18,2) AS b_31_60,
           SUM(CASE WHEN age > 60  AND age <= 90  THEN product_amount ELSE 0 END)::numeric(18,2) AS b_61_90,
           SUM(CASE WHEN age > 90  THEN product_amount ELSE 0 END)::numeric(18,2) AS b_91_plus
      FROM aged GROUP BY 1
     ORDER BY (SUM(product_amount)) DESC
    """
    rows = (await session.execute(text(sql))).mappings().all()
    return {
        "row_labels": [r["region"] for r in rows],
        "col_labels": ["0-30", "31-60", "61-90", "91+"],
        "values": [[float(r["b_0_30"]), float(r["b_31_60"]),
                    float(r["b_61_90"]), float(r["b_91_plus"])] for r in rows],
    }


# ---------------------------------------------------------------------------
# Debt movement — weekly new-debt vs paid-down
# ---------------------------------------------------------------------------


async def debt_movement(session: AsyncSession, weeks: int = 26) -> list[dict]:
    sql = """
    WITH weeks_ AS (
      SELECT generate_series(
        DATE_TRUNC('week', CURRENT_DATE - INTERVAL :span)::date,
        DATE_TRUNC('week', CURRENT_DATE)::date,
        INTERVAL '1 week'
      )::date AS w
    ),
    inv AS (
      SELECT DATE_TRUNC('week', d.delivery_date)::date AS w,
             SUM(d.product_amount)::numeric(18,2) AS invoiced
        FROM smartup_rep.deal_order d
       WHERE d.delivery_date >= (CURRENT_DATE - INTERVAL :span)
       GROUP BY 1
    ),
    pay AS (
      SELECT DATE_TRUNC('week', p.payment_date)::date AS w,
             SUM(p.amount)::numeric(18,2) AS paid
        FROM smartup_rep.payment p
       WHERE p.payment_date >= (CURRENT_DATE - INTERVAL :span)
       GROUP BY 1
    )
    SELECT w.w,
           COALESCE(inv.invoiced, 0) AS invoiced,
           COALESCE(pay.paid, 0)     AS paid
      FROM weeks_ w
      LEFT JOIN inv ON inv.w = w.w
      LEFT JOIN pay ON pay.w = w.w
     ORDER BY w.w
    """
    rows = (await session.execute(text(sql), {"span": f"{weeks} weeks"})).mappings().all()
    return [{"week": r["w"].isoformat(),
             "invoiced": float(r["invoiced"] or 0),
             "paid":     float(r["paid"] or 0),
             "net":      float(r["invoiced"] or 0) - float(r["paid"] or 0)}
            for r in rows]


# ---------------------------------------------------------------------------
# Ranked debtor table (replaces worklist's list view for dashboard)
# ---------------------------------------------------------------------------


async def debtors_ranked(session: AsyncSession, sort: str, page: int, size: int,
                         search: str, direction_csv: str = "",
                         stale_only: bool = False,
                         stale_days: int = 90) -> dict:
    dirs = [s.strip() for s in direction_csv.split(",") if s.strip()]
    sort_dir = "ASC" if sort.endswith(":asc") else "DESC"
    order_col = {
        "debt": "debt", "name": "name", "last_order": "last_order",
        "last_pay": "last_pay", "invoiced": "invoiced",
        "days_since_order": "days_since_order",
    }.get(sort.split(":")[0], "debt")
    extra_filter = []
    params: dict[str, Any] = {"limit": size, "offset": page * size}
    if dirs:
        extra_filter.append("AND lp.direction = ANY(:dirs)")
        params["dirs"] = dirs
    if stale_only:
        extra_filter.append("AND (last_order IS NULL OR last_order < CURRENT_DATE - :stale_days_interval)")
        params["stale_days_interval"] = f"{stale_days} days"
    if search:
        extra_filter.append("AND lp.name ILIKE :q")
        params["q"] = f"%{search}%"
    extra_sql = "\n".join(extra_filter)

    sql = f"""
    WITH ord AS (
      SELECT person_id,
             SUM(product_amount) AS invoiced,
             SUM(CASE WHEN (CURRENT_DATE - delivery_date) <= 30 THEN product_amount ELSE 0 END)::numeric(18,2) AS a0_30,
             SUM(CASE WHEN (CURRENT_DATE - delivery_date) BETWEEN 31 AND 60 THEN product_amount ELSE 0 END)::numeric(18,2) AS a31_60,
             SUM(CASE WHEN (CURRENT_DATE - delivery_date) BETWEEN 61 AND 90 THEN product_amount ELSE 0 END)::numeric(18,2) AS a61_90,
             SUM(CASE WHEN (CURRENT_DATE - delivery_date) > 90 THEN product_amount ELSE 0 END)::numeric(18,2) AS a91_plus,
             MAX(delivery_date) AS last_order
        FROM smartup_rep.deal_order WHERE person_id IS NOT NULL
       GROUP BY person_id
    ),
    pay AS (
      SELECT person_id::text AS person_id,
             SUM(amount) AS paid,
             MAX(payment_date)::date AS last_pay
        FROM smartup_rep.payment WHERE person_id IS NOT NULL
       GROUP BY person_id
    ),
    merged AS (
      SELECT lp.person_id::text AS pid, lp.name, lp.direction, lp.region_name,
             COALESCE(o.invoiced, 0)::numeric(18,2) AS invoiced,
             COALESCE(p.paid, 0)::numeric(18,2)     AS paid,
             (COALESCE(o.invoiced, 0) - COALESCE(p.paid, 0))::numeric(18,2) AS debt,
             o.last_order, p.last_pay,
             (CURRENT_DATE - o.last_order) AS days_since_order,
             o.a0_30, o.a31_60, o.a61_90, o.a91_plus
        FROM smartup_rep.legal_person lp
        LEFT JOIN ord o ON o.person_id = lp.person_id::text
        LEFT JOIN pay p ON p.person_id = lp.person_id::text
       WHERE (COALESCE(o.invoiced, 0) - COALESCE(p.paid, 0)) > 1 {extra_sql}
    )
    SELECT *, COUNT(*) OVER () AS _total
      FROM merged
     ORDER BY {order_col} {sort_dir} NULLS LAST, name ASC
     LIMIT :limit OFFSET :offset
    """
    rows = (await session.execute(text(sql), params)).mappings().all()
    total = int(rows[0]["_total"]) if rows else 0

    totals_sql = f"""
    WITH ord AS (
      SELECT person_id, SUM(product_amount) AS invoiced, MAX(delivery_date) AS last_order
        FROM smartup_rep.deal_order WHERE person_id IS NOT NULL GROUP BY person_id
    ),
    pay AS (
      SELECT person_id::text AS person_id, SUM(amount) AS paid
        FROM smartup_rep.payment WHERE person_id IS NOT NULL GROUP BY person_id
    ),
    merged AS (
      SELECT (COALESCE(o.invoiced, 0) - COALESCE(p.paid, 0))::numeric(18,2) AS debt,
             lp.person_id, lp.name, lp.direction, o.last_order
        FROM smartup_rep.legal_person lp
        LEFT JOIN ord o ON o.person_id = lp.person_id::text
        LEFT JOIN pay p ON p.person_id = lp.person_id::text
       WHERE (COALESCE(o.invoiced, 0) - COALESCE(p.paid, 0)) > 1 {extra_sql}
    )
    SELECT SUM(debt)::numeric(18,2) AS debt, COUNT(*) AS n FROM merged
    """
    totals = (await session.execute(text(totals_sql), params)).mappings().first() or {"debt": 0, "n": 0}

    return {
        "rows": [{
            "person_id": str(r["pid"]), "name": r["name"],
            "direction": r["direction"], "region": r["region_name"],
            "invoiced": float(r["invoiced"] or 0),
            "paid":     float(r["paid"] or 0),
            "debt":     float(r["debt"] or 0),
            "last_order": r["last_order"].isoformat() if r["last_order"] else None,
            "last_pay":   r["last_pay"].isoformat()   if r["last_pay"]   else None,
            "days_since_order": int(r["days_since_order"]) if r["days_since_order"] is not None else None,
            "aging": {
                "a0_30":    float(r["a0_30"] or 0),
                "a31_60":   float(r["a31_60"] or 0),
                "a61_90":   float(r["a61_90"] or 0),
                "a91_plus": float(r["a91_plus"] or 0),
            },
        } for r in rows],
        "total": total, "page": page, "size": size, "sort": sort,
        "totals": {"debt": float(totals["debt"] or 0)},
    }


# ---------------------------------------------------------------------------
# Manager portfolios — every manager's outstanding
# ---------------------------------------------------------------------------


async def manager_portfolios(session: AsyncSession) -> list[dict]:
    sql = """
    WITH ord_per_person AS (
      SELECT person_id, SUM(product_amount) AS invoiced, MAX(delivery_date) AS last_order
        FROM smartup_rep.deal_order WHERE person_id IS NOT NULL GROUP BY person_id
    ),
    pay_per_person AS (
      SELECT person_id::text AS person_id, SUM(amount) AS paid
        FROM smartup_rep.payment WHERE person_id IS NOT NULL GROUP BY person_id
    ),
    last_mgr AS (
      SELECT DISTINCT ON (person_id) person_id,
             sales_manager, delivery_date
        FROM smartup_rep.deal_order WHERE person_id IS NOT NULL
       ORDER BY person_id, delivery_date DESC
    ),
    per_client AS (
      SELECT lm.sales_manager AS manager,
             (COALESCE(o.invoiced, 0) - COALESCE(p.paid, 0))::numeric(18,2) AS debt,
             (CURRENT_DATE - o.last_order) AS days_since_order,
             CASE WHEN (CURRENT_DATE - o.last_order) > 90 THEN 1 ELSE 0 END AS is_over_90
        FROM smartup_rep.legal_person lp
        LEFT JOIN ord_per_person o ON o.person_id = lp.person_id::text
        LEFT JOIN pay_per_person p ON p.person_id = lp.person_id::text
        LEFT JOIN last_mgr lm      ON lm.person_id = lp.person_id::text
       WHERE (COALESCE(o.invoiced, 0) - COALESCE(p.paid, 0)) > 1
    )
    SELECT COALESCE(NULLIF(TRIM(manager), ''), '(—)') AS manager,
           COUNT(*)                          AS clients,
           SUM(debt)::numeric(18,2)          AS outstanding,
           SUM(CASE WHEN is_over_90 = 1 THEN debt ELSE 0 END)::numeric(18,2) AS over_90_amt,
           SUM(is_over_90)                   AS over_90_clients,
           MAX(debt)::numeric(18,2)          AS largest
      FROM per_client
     GROUP BY 1
     ORDER BY outstanding DESC NULLS LAST
    """
    rows = (await session.execute(text(sql))).mappings().all()
    return [{
        "manager": r["manager"],
        "clients": int(r["clients"] or 0),
        "outstanding": float(r["outstanding"] or 0),
        "over_90_amount": float(r["over_90_amt"] or 0),
        "over_90_clients": int(r["over_90_clients"] or 0),
        "largest": float(r["largest"] or 0),
        "over_90_pct": (float(r["over_90_amt"] or 0) / float(r["outstanding"] or 1))
                       if float(r["outstanding"] or 0) > 0 else 0,
    } for r in rows]


# ---------------------------------------------------------------------------
# Risk score — heuristic per-debtor, every row scored
# ---------------------------------------------------------------------------


async def risk_scores(session: AsyncSession, page: int = 0, size: int = 50,
                      search: str = "") -> dict:
    """Compute a 0-100 risk score per outstanding client.

    Heuristic (higher = worse):
      - 40 × min(1, aged_share)      where aged_share = (>90d share of debt)
      - 25 × min(1, debt / $10,000)  larger debt = more risk
      - 20 × min(1, days_since_pay / 180)
      - 15 × 1 if never paid, 0 otherwise
    """
    search_clause = "AND lp.name ILIKE :q" if search else ""
    sql = f"""
    WITH ord AS (
      SELECT person_id, SUM(product_amount) AS invoiced,
             MAX(delivery_date) AS last_order,
             SUM(CASE WHEN (CURRENT_DATE - delivery_date) > 90 THEN product_amount ELSE 0 END) AS aged_invoiced
        FROM smartup_rep.deal_order WHERE person_id IS NOT NULL GROUP BY person_id
    ),
    pay AS (
      SELECT person_id::text AS person_id,
             SUM(amount) AS paid,
             MAX(payment_date)::date AS last_pay
        FROM smartup_rep.payment WHERE person_id IS NOT NULL GROUP BY person_id
    ),
    base AS (
      SELECT lp.person_id, lp.name, lp.direction, lp.region_name,
             (COALESCE(o.invoiced, 0) - COALESCE(p.paid, 0)) AS debt,
             (o.aged_invoiced / NULLIF(o.invoiced, 0)) AS aged_share,
             (CURRENT_DATE - p.last_pay) AS days_since_pay,
             CASE WHEN p.paid IS NULL THEN 1 ELSE 0 END AS never_paid
        FROM smartup_rep.legal_person lp
        LEFT JOIN ord o ON o.person_id = lp.person_id::text
        LEFT JOIN pay p ON p.person_id = lp.person_id::text
       WHERE (COALESCE(o.invoiced, 0) - COALESCE(p.paid, 0)) > 1 {search_clause}
    )
    SELECT b.*,
           LEAST(100,
             40 * LEAST(1.0, COALESCE(aged_share, 0))
           + 25 * LEAST(1.0, debt / 10000.0)
           + 20 * LEAST(1.0, COALESCE(days_since_pay, 180)::numeric / 180)
           + 15 * never_paid
           )::numeric(5,1) AS risk_score,
           COUNT(*) OVER () AS _total
      FROM base
     ORDER BY risk_score DESC NULLS LAST, debt DESC
     LIMIT :limit OFFSET :offset
    """
    params: dict[str, Any] = {"limit": size, "offset": page * size}
    if search:
        params["q"] = f"%{search}%"
    rows = (await session.execute(text(sql), params)).mappings().all()
    total = int(rows[0]["_total"]) if rows else 0
    return {
        "rows": [{
            "person_id": str(r["person_id"]),
            "name": r["name"], "direction": r["direction"], "region": r["region_name"],
            "debt": float(r["debt"] or 0),
            "aged_share": float(r["aged_share"] or 0) if r["aged_share"] is not None else 0,
            "days_since_pay": int(r["days_since_pay"]) if r["days_since_pay"] is not None else None,
            "never_paid": bool(r["never_paid"]),
            "risk_score": float(r["risk_score"] or 0),
        } for r in rows],
        "total": total, "page": page, "size": size, "sort": "risk_score:desc",
        "totals": {"debt": sum(float(r["debt"] or 0) for r in rows)},
    }


# ---------------------------------------------------------------------------
# Promise statistics (from app.debt_contact_log — degrades gracefully)
# ---------------------------------------------------------------------------


async def promise_stats(session: AsyncSession) -> dict:
    try:
        rows = (await session.execute(text("""
            WITH latest AS (
              SELECT DISTINCT ON (person_id) person_id, outcome,
                     promised_amount, promised_by_date, contacted_at
                FROM app.debt_contact_log
               ORDER BY person_id, contacted_at DESC
            )
            SELECT outcome, COUNT(*) AS n,
                   COALESCE(SUM(promised_amount), 0)::numeric(18,2) AS promised_amt,
                   COUNT(*) FILTER (WHERE promised_by_date IS NOT NULL AND promised_by_date < CURRENT_DATE) AS overdue
              FROM latest
             GROUP BY outcome
        """))).mappings().all()
        return {"by_outcome": [dict(r) for r in rows]}
    except Exception:  # noqa: BLE001
        return {"by_outcome": []}


# ---------------------------------------------------------------------------
# Broken-promise debtors (≥2 broken/rescheduled outcomes)
# ---------------------------------------------------------------------------


async def broken_promise_debtors(session: AsyncSession) -> list[dict]:
    try:
        rows = (await session.execute(text("""
            SELECT cl.person_id,
                   lp.name, lp.direction, lp.region_name,
                   COUNT(*) FILTER (WHERE cl.outcome IN ('rescheduled', 'refused')) AS broken,
                   COUNT(*) FILTER (WHERE cl.outcome = 'promised')                   AS promised,
                   MAX(cl.contacted_at) AS last_contact
              FROM app.debt_contact_log cl
              JOIN smartup_rep.legal_person lp ON lp.person_id::text = cl.person_id::text
             GROUP BY cl.person_id, lp.name, lp.direction, lp.region_name
            HAVING COUNT(*) FILTER (WHERE cl.outcome IN ('rescheduled', 'refused')) >= 2
             ORDER BY broken DESC, last_contact DESC
             LIMIT 200
        """))).mappings().all()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []
