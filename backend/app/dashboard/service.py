"""Dashboard overview — aggregates read from smartup_rep.* + smartup.* .

All date math happens in Asia/Tashkent to match the ETL's timezone convention.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_TZ = "Asia/Tashkent"


async def overview(session: AsyncSession) -> dict[str, Any]:
    today_sql = f"(now() AT TIME ZONE '{_TZ}')::date"

    # --- today: orders count + amount ----------------------------------------
    row = (
        await session.execute(
            text(f"""
                SELECT COUNT(DISTINCT deal_id) AS orders_count,
                       COALESCE(SUM(product_amount), 0) AS orders_amount
                  FROM smartup_rep.deal_order
                 WHERE delivery_date = {today_sql}
            """)
        )
    ).one()
    today_orders = {"count": int(row.orders_count), "amount": float(row.orders_amount)}

    yrow = (
        await session.execute(
            text(f"""
                SELECT COUNT(DISTINCT deal_id) AS orders_count,
                       COALESCE(SUM(product_amount), 0) AS orders_amount
                  FROM smartup_rep.deal_order
                 WHERE delivery_date = {today_sql} - 1
            """)
        )
    ).one()
    yest_orders = {"count": int(yrow.orders_count), "amount": float(yrow.orders_amount)}

    # --- today: payments sum -------------------------------------------------
    prow = (
        await session.execute(
            text(f"""
                SELECT COUNT(*) AS payments_count,
                       COALESCE(SUM(amount), 0) AS payments_amount
                  FROM smartup_rep.payment
                 WHERE (payment_date AT TIME ZONE '{_TZ}')::date = {today_sql}
            """)
        )
    ).one()
    today_payments = {"count": int(prow.payments_count), "amount": float(prow.payments_amount)}

    ypayrow = (
        await session.execute(
            text(f"""
                SELECT COALESCE(SUM(amount), 0) AS payments_amount
                  FROM smartup_rep.payment
                 WHERE (payment_date AT TIME ZONE '{_TZ}')::date = {today_sql} - 1
            """)
        )
    ).one()
    yest_payments = {"amount": float(ypayrow.payments_amount)}

    # --- last 7 days totals --------------------------------------------------
    wrow = (
        await session.execute(
            text(f"""
                SELECT COALESCE(SUM(product_amount), 0) AS total
                  FROM smartup_rep.deal_order
                 WHERE delivery_date >= {today_sql} - 6
            """)
        )
    ).one()
    week_orders_amount = float(wrow.total)

    # --- active clients (30d) ------------------------------------------------
    crow = (
        await session.execute(
            text(f"""
                SELECT COUNT(DISTINCT person_id) AS active_clients
                  FROM smartup_rep.deal_order
                 WHERE delivery_date >= {today_sql} - 29
                   AND person_id IS NOT NULL
            """)
        )
    ).one()
    active_clients_30d = int(crow.active_clients)

    # --- 30-day orders+payments series for the chart -----------------------
    series_rows = (
        await session.execute(
            text(f"""
                WITH d AS (
                  SELECT generate_series({today_sql} - 29, {today_sql}, interval '1 day')::date AS d
                ),
                o AS (
                  SELECT delivery_date AS d, COALESCE(SUM(product_amount),0) AS amt
                    FROM smartup_rep.deal_order
                   WHERE delivery_date >= {today_sql} - 29
                   GROUP BY 1
                ),
                p AS (
                  SELECT (payment_date AT TIME ZONE '{_TZ}')::date AS d,
                         COALESCE(SUM(amount),0) AS amt
                    FROM smartup_rep.payment
                   WHERE (payment_date AT TIME ZONE '{_TZ}')::date >= {today_sql} - 29
                   GROUP BY 1
                )
                SELECT d.d AS day,
                       COALESCE(o.amt,0) AS orders,
                       COALESCE(p.amt,0) AS payments
                  FROM d
                  LEFT JOIN o USING (d)
                  LEFT JOIN p USING (d)
                 ORDER BY d.d
            """)
        )
    ).all()
    series = [
        {"day": r.day.isoformat(), "orders": float(r.orders), "payments": float(r.payments)}
        for r in series_rows
    ]

    # --- worker health -------------------------------------------------------
    wh_rows = (
        await session.execute(
            text("""
                SELECT report_key,
                       MAX(finished_at) FILTER (WHERE status = 'complete' AND range_label LIKE 'recent:%%') AS last_recent_at,
                       MAX(finished_at) FILTER (WHERE status = 'complete' AND range_label LIKE 'deep:%%')   AS last_deep_at,
                       MAX(finished_at) FILTER (WHERE status = 'complete' AND range_label LIKE 'all:%%')    AS last_all_at,
                       (SELECT last_error FROM smartup.report_sync_progress rsp2
                          WHERE rsp2.report_key = rsp.report_key AND rsp2.status = 'error'
                          ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS last_error,
                       (SELECT finished_at FROM smartup.report_sync_progress rsp3
                          WHERE rsp3.report_key = rsp.report_key AND rsp3.status = 'error'
                          ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS last_error_at
                  FROM smartup.report_sync_progress rsp
                 GROUP BY report_key
                 ORDER BY report_key
            """)
        )
    ).all()
    worker_health = [
        {
            "key": r.report_key,
            "last_recent_at": r.last_recent_at.isoformat() if r.last_recent_at else None,
            "last_deep_at":   r.last_deep_at.isoformat()   if r.last_deep_at   else None,
            "last_all_at":    r.last_all_at.isoformat()    if r.last_all_at    else None,
            "last_error":     r.last_error,
            "last_error_at":  r.last_error_at.isoformat() if r.last_error_at else None,
        }
        for r in wh_rows
    ]

    # --- recent activity (today's orders + payments, mixed) ----------------
    act_rows = (
        await session.execute(
            text(f"""
                (
                  SELECT 'order' AS kind,
                         (delivery_date + COALESCE(LEFT(_ingested_at::text, 19)::time, '00:00:00'::time))
                           AT TIME ZONE 'UTC' AT TIME ZONE '{_TZ}' AS ts,
                         client_name AS subject,
                         product_amount AS amount
                    FROM smartup_rep.deal_order
                   WHERE delivery_date = {today_sql}
                   ORDER BY _ingested_at DESC
                   LIMIT 20
                )
                UNION ALL
                (
                  SELECT 'payment',
                         payment_date AT TIME ZONE '{_TZ}',
                         client_name,
                         amount
                    FROM smartup_rep.payment
                   WHERE (payment_date AT TIME ZONE '{_TZ}')::date = {today_sql}
                   ORDER BY payment_date DESC
                   LIMIT 20
                )
                ORDER BY ts DESC
                LIMIT 20
            """)
        )
    ).all()
    recent_activity = [
        {
            "kind":    r.kind,
            "ts":      r.ts.isoformat() if isinstance(r.ts, datetime) else str(r.ts),
            "subject": r.subject,
            "amount":  float(r.amount) if r.amount is not None else None,
        }
        for r in act_rows
    ]

    return {
        "today": {
            "orders": today_orders,
            "payments": today_payments,
        },
        "yesterday": {
            "orders": yest_orders,
            "payments": yest_payments,
        },
        "week": {
            "orders_amount": week_orders_amount,
        },
        "active_clients_30d": active_clients_30d,
        "series_30d": series,
        "worker_health": worker_health,
        "recent_activity": recent_activity,
    }
