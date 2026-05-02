from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.rfm import build_rfm_sql
from ..client_signals import compute_attention, compute_deal_status
from ..debt.service import _jsonify_mapping, _scope_fragments, get_client_detail
from ..scope import UserScope


@dataclass
class ClientListFilters:
    search: str = ""
    room_id: str = ""
    direction: str = ""
    region: str = ""
    view: str = "all"
    attention: str = ""
    deal_status: str = ""
    client_group: str = ""
    rfm_segment: str = ""
    last_purchase_bucket: int | None = None
    sort: str = ""


def _last90_window() -> tuple[date, date]:
    today = date.today()
    return today - timedelta(days=89), today


def _safe_int(v: Any) -> int:
    return int(str(v))


def _days_since(d: date | None, today: date) -> int | None:
    if d is None:
        return None
    return (today - d).days


def _weekly_series(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "week": r["week_start"].isoformat() if r.get("week_start") else None,
            "amount": float(r["amount"] or 0),
        }
        for r in rows
    ]


async def _fetch_rfm_map(session: AsyncSession) -> dict[str, dict[str, Any]]:
    start, end = _last90_window()
    sql = build_rfm_sql(window_start=start, window_end=end)
    rows = (await session.execute(text(sql))).mappings().all()
    return {str(r["person_id"]): dict(r) for r in rows}


async def _fetch_base_rows(
    session: AsyncSession,
    *,
    scope: UserScope | None,
    person_id: int | None = None,
) -> list[dict[str, Any]]:
    person_f, scope_params = _scope_fragments(scope)
    start90, today = _last90_window()
    params: dict[str, Any] = {
        **scope_params,
        "last90_s": start90,
        "today": today,
        "default_term": 30,
    }
    person_where = ""
    if person_id is not None:
        params["pid_text"] = str(person_id)
        person_where = "WHERE u.person_id = :pid_text"

    sql = f"""
    WITH opening AS (
      SELECT person_id::text AS person_id, opening_debt, opening_credit
        FROM smartup_rep.opening_balance
       WHERE person_id IS NOT NULL
         {person_f}
    ),
    real_orders AS (
      SELECT person_id, delivery_date, deal_id, product_amount, room_id
        FROM smartup_rep.deal_order
       WHERE person_id IS NOT NULL
         {person_f}
    ),
    real_pay_events AS (
      SELECT person_id::text AS person_id, payment_date::date AS payment_date, amount, payment_method, payer
        FROM smartup_rep.payment
       WHERE person_id IS NOT NULL
         {person_f}
    ),
    universe AS (
      SELECT person_id FROM real_orders
      UNION
      SELECT person_id FROM real_pay_events
      UNION
      SELECT person_id FROM opening
    ),
    sales_all AS (
      SELECT person_id,
             COALESCE(SUM(GREATEST(product_amount, 0)), 0) AS gross_sales,
             COALESCE(SUM(GREATEST(-product_amount, 0)), 0) AS gross_returns,
             MIN(delivery_date) FILTER (WHERE product_amount > 0) AS first_order_date,
             MAX(delivery_date) FILTER (WHERE product_amount > 0) AS last_purchase_date,
             COUNT(DISTINCT deal_id) FILTER (WHERE product_amount > 0) AS lifetime_orders
        FROM real_orders
       GROUP BY person_id
    ),
    sales_90 AS (
      SELECT person_id,
             COALESCE(SUM(GREATEST(product_amount, 0)), 0) AS sales_90d,
             COUNT(DISTINCT deal_id) FILTER (WHERE product_amount > 0) AS orders_90d
        FROM real_orders
       WHERE delivery_date BETWEEN :last90_s AND :today
       GROUP BY person_id
    ),
    pay_all AS (
      SELECT person_id,
             COALESCE(SUM(amount), 0) AS lifetime_payments_amount,
             MAX(payment_date) AS last_payment_date,
             COUNT(*) AS lifetime_payments
        FROM real_pay_events
       GROUP BY person_id
    ),
    pay_90 AS (
      SELECT person_id,
             COALESCE(SUM(amount), 0) AS payments_90d
        FROM real_pay_events
       WHERE payment_date BETWEEN :last90_s AND :today
       GROUP BY person_id
    ),
    attribution AS (
      SELECT person_id, room_id, SUM(product_amount) AS room_invoiced
        FROM real_orders
       WHERE room_id IS NOT NULL
       GROUP BY person_id, room_id
    ),
    dominant_room AS (
      SELECT DISTINCT ON (person_id) person_id, room_id
        FROM attribution
       ORDER BY person_id, room_invoiced DESC, room_id
    ),
    contact_last AS (
      SELECT DISTINCT ON (person_id)
             person_id::text AS person_id,
             outcome AS last_contact_outcome,
             contacted_at::date AS last_contact_at,
             promised_amount AS last_promised_amount,
             promised_by_date AS last_promised_by_date,
             follow_up_date AS last_follow_up_date
        FROM app.debt_contact_log
       ORDER BY person_id, contacted_at DESC
    ),
    my_orders AS (
      SELECT person_id, delivery_date, deal_id, product_amount, false AS is_opening
        FROM real_orders
       WHERE product_amount > 0
      UNION ALL
      SELECT o.person_id,
             DATE '2022-09-13',
             'OPENING',
             o.opening_debt,
             true
        FROM opening o
       WHERE o.opening_debt > 0
    ),
    tot_pay AS (
      SELECT person_id, SUM(amt) AS paid_for_fifo
        FROM (
          SELECT person_id, amount AS amt
            FROM real_pay_events
          UNION ALL
          SELECT person_id, -product_amount AS amt
            FROM real_orders
           WHERE product_amount < 0
          UNION ALL
          SELECT person_id, opening_credit AS amt
            FROM opening
           WHERE opening_credit > 0
        ) z
       GROUP BY person_id
    ),
    ord_cumsum AS (
      SELECT person_id, delivery_date, deal_id, product_amount,
             SUM(product_amount) OVER (
               PARTITION BY person_id
               ORDER BY delivery_date, deal_id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS cum_invoiced
        FROM my_orders
    ),
    ord_unpaid AS (
      SELECT c.person_id,
             c.delivery_date,
             GREATEST(
               LEAST(c.product_amount, c.cum_invoiced - COALESCE(tp.paid_for_fifo, 0)),
               0
             ) AS unpaid_slice
        FROM ord_cumsum c
        LEFT JOIN tot_pay tp USING (person_id)
    ),
    aging AS (
      SELECT x.person_id,
             SUM(CASE WHEN x.age_days <= x.term_days THEN x.unpaid_slice ELSE 0 END) AS not_due,
             SUM(CASE WHEN x.age_days > x.term_days THEN x.unpaid_slice ELSE 0 END) AS overdue,
             SUM(CASE WHEN x.age_days > x.term_days AND x.age_days <= x.term_days + 30 THEN x.unpaid_slice ELSE 0 END) AS bucket_1_30,
             SUM(CASE WHEN x.age_days > x.term_days + 30 AND x.age_days <= x.term_days + 60 THEN x.unpaid_slice ELSE 0 END) AS bucket_31_60,
             SUM(CASE WHEN x.age_days > x.term_days + 60 AND x.age_days <= x.term_days + 90 THEN x.unpaid_slice ELSE 0 END) AS bucket_61_90,
             SUM(CASE WHEN x.age_days > x.term_days + 90 THEN x.unpaid_slice ELSE 0 END) AS bucket_90_plus
        FROM (
          SELECT ou.person_id,
                 ou.unpaid_slice,
                 (CURRENT_DATE - ou.delivery_date) AS age_days,
                 COALESCE(lp.instalment_days, :default_term) AS term_days
            FROM ord_unpaid ou
            LEFT JOIN smartup_rep.legal_person lp
              ON lp.person_id::text = ou.person_id
        ) x
       GROUP BY x.person_id
    ),
    payments_since_start AS (
      SELECT lp.person_id::text AS person_id,
             COALESCE(SUM(p.amount), 0) AS payments_since_start
        FROM smartup_rep.legal_person lp
        LEFT JOIN real_pay_events p
          ON p.person_id = lp.person_id::text
         AND lp.deal_deadline_start IS NOT NULL
         AND p.payment_date >= lp.deal_deadline_start
       GROUP BY lp.person_id::text
    )
    SELECT u.person_id,
           lp.name AS client_name,
           lp.tin,
           lp.region_name,
           lp.direction,
           lp.client_group,
           lp.deal_deadline_start,
           lp.deal_monthly_amount,
           COALESCE(lp.instalment_days, :default_term) AS instalment_days,
           COALESCE(sa.gross_sales, 0) + COALESCE(ob.opening_debt, 0) AS gross_invoiced,
           COALESCE(pa.lifetime_payments_amount, 0) + COALESCE(sa.gross_returns, 0) + COALESCE(ob.opening_credit, 0) AS gross_paid,
           COALESCE(ob.opening_debt, 0) AS opening_debt,
           COALESCE(ob.opening_credit, 0) AS opening_credit,
           COALESCE(sa.gross_sales, 0) AS lifetime_sales,
           COALESCE(sa.gross_returns, 0) AS lifetime_returns,
           COALESCE(pa.lifetime_payments_amount, 0) AS lifetime_payments_amount,
           COALESCE(sa90.sales_90d, 0) AS sales_90d,
           COALESCE(p90.payments_90d, 0) AS payments_90d,
           COALESCE(sa90.orders_90d, 0) AS orders_90d,
           CASE
             WHEN COALESCE(sa90.orders_90d, 0) = 0 THEN 0
             ELSE (COALESCE(sa90.sales_90d, 0) / NULLIF(sa90.orders_90d, 0))::numeric(18,2)
           END AS avg_order_90d,
           sa.first_order_date,
           sa.last_purchase_date,
           pa.last_payment_date,
           COALESCE(sa.lifetime_orders, 0) AS lifetime_orders,
           COALESCE(pa.lifetime_payments, 0) AS lifetime_payments,
           dr.room_id AS primary_room_id,
           rr.room_name AS manager,
           COALESCE(ag.not_due, 0) AS not_due,
           COALESCE(ag.overdue, 0) AS overdue_debt,
           COALESCE(ag.bucket_1_30, 0) AS bucket_1_30,
           COALESCE(ag.bucket_31_60, 0) AS bucket_31_60,
           COALESCE(ag.bucket_61_90, 0) AS bucket_61_90,
           COALESCE(ag.bucket_90_plus, 0) AS bucket_90_plus,
           (
             COALESCE(sa.gross_sales, 0)
             + COALESCE(ob.opening_debt, 0)
             - COALESCE(sa.gross_returns, 0)
             - COALESCE(pa.lifetime_payments_amount, 0)
             - COALESCE(ob.opening_credit, 0)
           ) AS current_debt,
           COALESCE(ps.payments_since_start, 0) AS payments_since_start,
           cl.last_contact_outcome,
           cl.last_contact_at,
           cl.last_promised_amount,
           cl.last_promised_by_date,
           CASE
             WHEN cl.last_promised_by_date IS NOT NULL AND cl.last_promised_by_date < CURRENT_DATE THEN TRUE
             ELSE FALSE
           END AS has_overdue_promise
      FROM universe u
      LEFT JOIN opening ob USING (person_id)
      LEFT JOIN sales_all sa USING (person_id)
      LEFT JOIN sales_90 sa90 USING (person_id)
      LEFT JOIN pay_all pa USING (person_id)
      LEFT JOIN pay_90 p90 USING (person_id)
      LEFT JOIN aging ag USING (person_id)
      LEFT JOIN smartup_rep.legal_person lp ON lp.person_id::text = u.person_id
      LEFT JOIN dominant_room dr USING (person_id)
      LEFT JOIN app.room rr ON rr.room_id = dr.room_id
      LEFT JOIN contact_last cl USING (person_id)
      LEFT JOIN payments_since_start ps USING (person_id)
      {person_where}
     ORDER BY lp.name
    """
    rows = (await session.execute(text(sql), params)).mappings().all()
    return [_jsonify_mapping(r) for r in rows]


def _decorate_row(
    row: dict[str, Any],
    *,
    today: date,
    rfm: dict[str, Any] | None,
) -> dict[str, Any]:
    current_debt = float(row.get("current_debt") or 0)
    overdue_debt = float(row.get("overdue_debt") or 0)
    bucket_90_plus = float(row.get("bucket_90_plus") or 0)
    sales_90d = float(row.get("sales_90d") or 0)
    payments_90d = float(row.get("payments_90d") or 0)
    collection_ratio = (payments_90d / sales_90d * 100) if sales_90d > 0 else None

    last_purchase_date = date.fromisoformat(row["last_purchase_date"]) if row.get("last_purchase_date") else None
    last_payment_date = date.fromisoformat(row["last_payment_date"]) if row.get("last_payment_date") else None
    deadline_start = date.fromisoformat(row["deal_deadline_start"]) if row.get("deal_deadline_start") else None

    deal_status = compute_deal_status(
        client_group=row.get("client_group"),
        deal_deadline_start=deadline_start,
        deal_monthly_amount=float(row["deal_monthly_amount"]) if row.get("deal_monthly_amount") is not None else None,
        instalment_days=int(row["instalment_days"]) if row.get("instalment_days") is not None else None,
        current_debt=current_debt,
        overdue_debt=overdue_debt,
        payments_since_start=float(row.get("payments_since_start") or 0),
        today=today,
    )

    last_purchase_days = _days_since(last_purchase_date, today)
    last_payment_days = _days_since(last_payment_date, today)
    rfm_segment = rfm.get("segment") if rfm else None
    rfm_score = rfm.get("score") if rfm else None
    attention_state, attention_reason, attention_score = compute_attention(
        deal_status=deal_status,
        bucket_90_plus=bucket_90_plus,
        overdue_debt=overdue_debt,
        has_overdue_promise=bool(row.get("has_overdue_promise")),
        last_purchase_days=last_purchase_days,
        last_payment_days=last_payment_days,
        current_debt=current_debt,
        collection_ratio_90d=collection_ratio,
        rfm_segment=rfm_segment,
    )

    return {
        **row,
        "person_id": _safe_int(row["person_id"]),
        "deal_status": deal_status,
        "rfm_segment": rfm_segment,
        "rfm_score": rfm_score,
        "attention_state": attention_state,
        "attention_reason": attention_reason,
        "attention_score": attention_score,
        "last_purchase_days": last_purchase_days,
        "last_payment_days": last_payment_days,
        "collection_ratio_90d": round(collection_ratio, 1) if collection_ratio is not None else None,
    }


def _matches_view(row: dict[str, Any], view: str) -> bool:
    group = row.get("client_group")
    if view == "problem":
        return group in {"PROBLEM_DEADLINE", "PROBLEM_MONTHLY", "PROBLEM_UNDEFINED"}
    if view == "normal":
        return group == "NORMAL"
    if view == "closed":
        return group == "CLOSED"
    return True


def _apply_filters(rows: list[dict[str, Any]], filters: ClientListFilters) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    q = filters.search.lower().strip()
    for row in rows:
        if filters.room_id and row.get("primary_room_id") != filters.room_id:
            continue
        if filters.direction and row.get("direction") != filters.direction:
            continue
        if filters.region and filters.region.lower() not in str(row.get("region_name") or "").lower():
            continue
        if not _matches_view(row, filters.view):
            continue
        if filters.attention and row.get("attention_state") != filters.attention:
            continue
        if filters.deal_status and row.get("deal_status") != filters.deal_status:
            continue
        if filters.client_group and row.get("client_group") != filters.client_group:
            continue
        if filters.rfm_segment and row.get("rfm_segment") != filters.rfm_segment:
            continue
        if filters.last_purchase_bucket is not None:
            lp_days = row.get("last_purchase_days")
            if lp_days is None or int(lp_days) < filters.last_purchase_bucket:
                continue
        if q:
            haystack = " ".join(
                str(row.get(k) or "")
                for k in ("client_name", "tin", "manager", "region_name", "direction", "attention_reason")
            ).lower()
            if q not in haystack:
                continue
        out.append(row)
    return out


def _sort_rows(rows: list[dict[str, Any]], sort: str) -> list[dict[str, Any]]:
    sort_key, _, sort_dir_raw = sort.partition(":")
    sort_dir = sort_dir_raw.lower() if sort_dir_raw else "desc"
    reverse = sort_dir != "asc"

    if not sort_key:
        def key(row: dict[str, Any]) -> tuple[Any, ...]:
            return (
                row.get("attention_score") or 0,
                float(row.get("bucket_90_plus") or 0),
                float(row.get("overdue_debt") or 0),
                row.get("last_purchase_days") if row.get("last_purchase_days") is not None else -1,
                -(float(row.get("payments_90d") or 0)),
                float(row.get("sales_90d") or 0),
                str(row.get("client_name") or ""),
            )

        return sorted(rows, key=key, reverse=True)

    def pick(row: dict[str, Any]) -> Any:
        if sort_key in {"sales_90d", "payments_90d", "current_debt", "bucket_90_plus", "overdue_debt", "last_purchase_days", "last_payment_days", "attention_score"}:
            return float(row.get(sort_key) or 0)
        return str(row.get(sort_key) or "").lower()

    return sorted(rows, key=pick, reverse=reverse)


async def list_clients(
    session: AsyncSession,
    *,
    scope: UserScope | None,
    filters: ClientListFilters,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    today = date.today()
    base_rows = await _fetch_base_rows(session, scope=scope)
    rfm_map = await _fetch_rfm_map(session)

    decorated = [_decorate_row(r, today=today, rfm=rfm_map.get(str(r["person_id"]))) for r in base_rows]
    filtered = _apply_filters(decorated, filters)
    ordered = _sort_rows(filtered, filters.sort)
    page_rows = ordered[offset : offset + limit]

    summary = {
        "total_clients": len(filtered),
        "attention_critical": sum(1 for r in filtered if r["attention_state"] in {"recover_now", "collect_fast", "promise_watch"}),
        "attention_recovery": sum(1 for r in filtered if r["attention_state"] == "recover_now"),
        "attention_dormant": sum(1 for r in filtered if r["attention_state"] == "dormant"),
        "attention_growth": sum(1 for r in filtered if r["attention_state"] == "grow"),
        "sales_90d_total": round(sum(float(r.get("sales_90d") or 0) for r in filtered), 2),
        "payments_90d_total": round(sum(float(r.get("payments_90d") or 0) for r in filtered), 2),
        "current_debt_total": round(sum(float(r.get("current_debt") or 0) for r in filtered), 2),
        "overdue_debt_total": round(sum(float(r.get("overdue_debt") or 0) for r in filtered), 2),
    }

    rows = [
        {
            "person_id": r["person_id"],
            "client_name": r.get("client_name"),
            "tin": r.get("tin"),
            "manager": r.get("manager"),
            "region_name": r.get("region_name"),
            "direction": r.get("direction"),
            "client_group": r.get("client_group"),
            "deal_status": r.get("deal_status"),
            "rfm_segment": r.get("rfm_segment"),
            "rfm_score": r.get("rfm_score"),
            "attention_state": r.get("attention_state"),
            "attention_reason": r.get("attention_reason"),
            "attention_score": r.get("attention_score"),
            "last_purchase_date": r.get("last_purchase_date"),
            "last_purchase_days": r.get("last_purchase_days"),
            "last_payment_date": r.get("last_payment_date"),
            "last_payment_days": r.get("last_payment_days"),
            "sales_90d": float(r.get("sales_90d") or 0),
            "payments_90d": float(r.get("payments_90d") or 0),
            "current_debt": float(r.get("current_debt") or 0),
            "overdue_debt": float(r.get("overdue_debt") or 0),
            "bucket_90_plus": float(r.get("bucket_90_plus") or 0),
            "collection_ratio_90d": r.get("collection_ratio_90d"),
            "has_overdue_promise": bool(r.get("has_overdue_promise")),
        }
        for r in page_rows
    ]
    return {"summary": summary, "rows": rows, "total": len(filtered)}


async def get_client_intelligence(
    session: AsyncSession,
    *,
    scope: UserScope | None,
    person_id: int,
) -> dict[str, Any]:
    today = date.today()
    base_rows = await _fetch_base_rows(session, scope=scope, person_id=person_id)
    if not base_rows:
        return {}

    rfm_map = await _fetch_rfm_map(session)
    row = _decorate_row(base_rows[0], today=today, rfm=rfm_map.get(str(person_id)))
    detail = await get_client_detail(
        session,
        scope=scope,
        person_id=person_id,
        orders_offset=0,
        orders_limit=10,
        payments_offset=0,
        payments_limit=10,
    )
    if not detail:
        return {}

    start90, end90 = _last90_window()
    weekly_sql = """
    WITH weeks AS (
      SELECT generate_series(
        DATE_TRUNC('week', CAST(:start_date AS date))::date,
        DATE_TRUNC('week', CAST(:end_date AS date))::date,
        INTERVAL '1 week'
      )::date AS week_start
    ),
    order_weeks AS (
      SELECT DATE_TRUNC('week', delivery_date)::date AS week_start,
             COALESCE(SUM(GREATEST(product_amount, 0)), 0) AS amount
        FROM smartup_rep.deal_order
       WHERE person_id::text = :pid_text
         AND delivery_date BETWEEN :start_date AND :end_date
       GROUP BY 1
    ),
    payment_weeks AS (
      SELECT DATE_TRUNC('week', payment_date)::date AS week_start,
             COALESCE(SUM(amount), 0) AS amount
        FROM smartup_rep.payment
       WHERE person_id = :pid
         AND payment_date::date BETWEEN :start_date AND :end_date
       GROUP BY 1
    )
    SELECT w.week_start,
           COALESCE(o.amount, 0) AS sales_amount,
           COALESCE(p.amount, 0) AS payments_amount
      FROM weeks w
      LEFT JOIN order_weeks o USING (week_start)
      LEFT JOIN payment_weeks p USING (week_start)
     ORDER BY w.week_start
    """
    weekly_rows = (
        await session.execute(
            text(weekly_sql),
            {"start_date": start90, "end_date": end90, "pid": person_id, "pid_text": str(person_id)},
        )
    ).mappings().all()

    contact_log = detail.get("contact_log", [])
    latest_contact = contact_log[0] if contact_log else None

    return {
        "client": {
            "person_id": person_id,
            "client_name": row.get("client_name"),
            "tin": row.get("tin"),
            "manager": row.get("manager"),
            "region_name": row.get("region_name"),
            "direction": row.get("direction"),
            "client_group": row.get("client_group"),
            "deal_status": row.get("deal_status"),
            "rfm_segment": row.get("rfm_segment"),
            "rfm_score": row.get("rfm_score"),
            "attention_state": row.get("attention_state"),
            "attention_reason": row.get("attention_reason"),
        },
        "deal_profile": {
            "deal_deadline_start": row.get("deal_deadline_start"),
            "instalment_days": row.get("instalment_days"),
            "deal_monthly_amount": row.get("deal_monthly_amount"),
            "client_group": row.get("client_group"),
            "deal_status": row.get("deal_status"),
        },
        "signals_90d": {
            "sales_90d": float(row.get("sales_90d") or 0),
            "payments_90d": float(row.get("payments_90d") or 0),
            "collection_ratio_90d": row.get("collection_ratio_90d"),
            "orders_90d": int(row.get("orders_90d") or 0),
            "avg_order_90d": float(row.get("avg_order_90d") or 0),
            "last_purchase_date": row.get("last_purchase_date"),
            "last_purchase_days": row.get("last_purchase_days"),
            "last_payment_date": row.get("last_payment_date"),
            "last_payment_days": row.get("last_payment_days"),
            "sales_weekly_12w": _weekly_series([{"week_start": r["week_start"], "amount": r["sales_amount"]} for r in weekly_rows]),
            "payments_weekly_12w": _weekly_series([{"week_start": r["week_start"], "amount": r["payments_amount"]} for r in weekly_rows]),
        },
        "debt_all_time": {
            "current_debt": float(row.get("current_debt") or 0),
            "overdue_debt": float(row.get("overdue_debt") or 0),
            "bucket_1_30": float(row.get("bucket_1_30") or 0),
            "bucket_31_60": float(row.get("bucket_31_60") or 0),
            "bucket_61_90": float(row.get("bucket_61_90") or 0),
            "bucket_90_plus": float(row.get("bucket_90_plus") or 0),
            "opening_debt": float(row.get("opening_debt") or 0),
            "opening_credit": float(row.get("opening_credit") or 0),
            "gross_invoiced": float(row.get("gross_invoiced") or 0),
            "gross_paid": float(row.get("gross_paid") or 0),
        },
        "lifetime": {
            "first_order_date": row.get("first_order_date"),
            "last_order_date": row.get("last_purchase_date"),
            "last_payment_date": row.get("last_payment_date"),
            "lifetime_sales": float(row.get("lifetime_sales") or 0),
            "lifetime_payments": float(row.get("lifetime_payments_amount") or 0),
            "lifetime_orders": int(row.get("lifetime_orders") or 0),
        },
        "recent_orders": detail.get("orders", []),
        "recent_payments": detail.get("payments", []),
        "contact_summary": {
            "last_outcome": latest_contact.get("outcome") if latest_contact else row.get("last_contact_outcome"),
            "last_contact_at": latest_contact.get("contacted_at") if latest_contact else row.get("last_contact_at"),
            "has_overdue_promise": bool(row.get("has_overdue_promise")),
            "last_promised_amount": row.get("last_promised_amount"),
            "last_promised_by_date": row.get("last_promised_by_date"),
        },
    }
