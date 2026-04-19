"""Debt / Qarzlar service.

Reconstructs per-client accounts-receivable from the ETL-owned tables
(smartup_rep.deal_order + smartup_rep.payment) because Smartup's payment
rows don't carry a deal_id. FIFO aging — payments settle the oldest
outstanding orders first — produces the bucket amounts (0-30 / 30-60 /
60-90 / 90+).

Attribution note: during the Phase-2 spike ~78 % of `payment.payer` values
matched a `rooms.room_name` by case-insensitive exact match. The remainder
(e.g. "Yusupov Davron Dostonovich" ↔ room "Davron", "Yanvarov Sardor" ↔
"Sardor Yanvarov", "Qarshi Do'kon" ↔ "Qarshi") require fuzzy / alias
matching, which isn't worth the complexity yet. Today we attribute
collections by the client's *dominant room* (the room with the largest
share of the client's gross invoiced amount), which is stable and
explainable. A future alias table + fuzzy match can lift accuracy when
the business cares.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..scope import UserScope

log = logging.getLogger(__name__)

# Thresholds — ignore rounding noise.
_WORKLIST_MIN_OWED = Decimal("10")
_PREPAY_MIN_CREDIT = Decimal("10")

Outcome = Literal[
    "called", "no_answer", "promised", "rescheduled", "refused", "paid", "note",
]
OUTCOMES = {"called", "no_answer", "promised", "rescheduled", "refused", "paid", "note"}


def _scope_fragments(scope: UserScope | None) -> tuple[str, str, dict]:
    """Return (order_filter, client_filter, params) fragments to AND into the
    CTEs. `order_filter` restricts smartup_rep.deal_order rows to the user's
    rooms. `client_filter` is the same restriction expressed as a
    person_id IN (...) clause — applied to payment / log reads that don't
    carry room_id directly."""
    if not scope or not scope.is_scoped:
        return "", "", {}

    placeholders = ", ".join(f":_scope_r{i}" for i in range(len(scope.room_ids)))
    params = {f"_scope_r{i}": r for i, r in enumerate(scope.room_ids)}
    order_f = f"AND room_id IN ({placeholders})"
    client_f = (
        f"AND person_id::text IN ("
        f"  SELECT DISTINCT person_id FROM smartup_rep.deal_order "
        f"   WHERE room_id IN ({placeholders})"
        f")"
    )
    return order_f, client_f, params


def _priority(outstanding: float, days_since_payment: int | None, has_overdue: bool, aging_90: float) -> float:
    days = max(days_since_payment or 30, 30)
    score = outstanding * days / 30.0
    if has_overdue:
        score += 2.0 * outstanding
    if aging_90 > 0:
        score += 1.0 * outstanding
    return score


@dataclass
class WorklistFilters:
    sales_manager_room_id: str | None = None
    region: str | None = None
    category: str | None = None
    aging_bucket: str | None = None        # "0_30" | "30_60" | "60_90" | "90_plus"
    outcome: str | None = None             # any OUTCOMES value, or "none" for untouched
    overdue_promises_only: bool = False
    search: str | None = None


async def compute_worklist(
    session: AsyncSession,
    *,
    scope: UserScope | None,
    filters: WorklistFilters,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    """Return {summary, rows, total, by_collector}. Excludes clients with
    outstanding ≤ $10."""
    order_f, client_f, scope_params = _scope_fragments(scope)

    sql_core = f"""
    WITH my_orders AS (
      SELECT person_id, delivery_date, deal_id, product_amount, room_id
        FROM smartup_rep.deal_order
       WHERE person_id IS NOT NULL
         {order_f}
    ),
    agg AS (
      SELECT person_id,
             SUM(product_amount)::numeric AS gross_invoiced,
             MIN(delivery_date)            AS first_order_date,
             MAX(delivery_date)            AS last_order_date,
             COUNT(*)                      AS order_count
        FROM my_orders
       GROUP BY person_id
    ),
    pay AS (
      SELECT person_id::text AS person_id,
             SUM(amount)::numeric  AS gross_paid,
             MAX(payment_date)     AS last_payment_date,
             COUNT(*)              AS pay_count
        FROM smartup_rep.payment
       WHERE person_id IS NOT NULL
         {client_f}
       GROUP BY person_id::text
    ),
    ord_cumsum AS (
      SELECT o.person_id,
             o.delivery_date,
             o.product_amount,
             SUM(o.product_amount) OVER (
               PARTITION BY o.person_id
               ORDER BY o.delivery_date, o.deal_id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS cum_invoiced
        FROM my_orders o
    ),
    ord_unpaid AS (
      SELECT c.person_id,
             c.delivery_date,
             GREATEST(LEAST(c.product_amount,
                            c.cum_invoiced - COALESCE(p.gross_paid, 0)), 0) AS unpaid_slice
        FROM ord_cumsum c
        LEFT JOIN pay p USING (person_id)
    ),
    aging AS (
      SELECT person_id,
             SUM(CASE WHEN age_days BETWEEN   0 AND  29 THEN unpaid_slice ELSE 0 END) AS aging_0_30,
             SUM(CASE WHEN age_days BETWEEN  30 AND  59 THEN unpaid_slice ELSE 0 END) AS aging_30_60,
             SUM(CASE WHEN age_days BETWEEN  60 AND  89 THEN unpaid_slice ELSE 0 END) AS aging_60_90,
             SUM(CASE WHEN age_days >= 90                 THEN unpaid_slice ELSE 0 END) AS aging_90_plus
        FROM (SELECT *, (CURRENT_DATE - delivery_date) AS age_days FROM ord_unpaid) x
       GROUP BY person_id
    ),
    attribution AS (
      SELECT o.person_id,
             o.room_id,
             SUM(o.product_amount) AS room_invoiced
        FROM my_orders o
       GROUP BY o.person_id, o.room_id
    ),
    dominant_room AS (
      SELECT DISTINCT ON (person_id) person_id, room_id, room_invoiced
        FROM attribution
       ORDER BY person_id, room_invoiced DESC
    ),
    latest_log AS (
      SELECT DISTINCT ON (person_id)
             person_id, contacted_at, outcome, promised_amount,
             promised_by_date, follow_up_date, contacted_by
        FROM app.debt_contact_log
       ORDER BY person_id, contacted_at DESC
    )
    SELECT a.person_id,
           lp.name, lp.tin,
           lp.main_phone, lp.telegram, lp.address, lp.region_name,
           lp.group_name2         AS category,
           lp.owner_name,
           a.gross_invoiced,
           COALESCE(pp.gross_paid, 0) AS gross_paid,
           (a.gross_invoiced - COALESCE(pp.gross_paid, 0)) AS outstanding,
           a.last_order_date,
           a.order_count,
           pp.last_payment_date,
           pp.pay_count,
           (CURRENT_DATE - pp.last_payment_date::date) AS days_since_payment,
           COALESCE(ag.aging_0_30, 0)    AS aging_0_30,
           COALESCE(ag.aging_30_60, 0)   AS aging_30_60,
           COALESCE(ag.aging_60_90, 0)   AS aging_60_90,
           COALESCE(ag.aging_90_plus, 0) AS aging_90_plus,
           dr.room_id                AS primary_room_id,
           rr.room_name              AS primary_room_name,
           ll.outcome                AS last_contact_outcome,
           ll.contacted_at           AS last_contact_at,
           ll.promised_amount        AS last_promised_amount,
           ll.promised_by_date       AS last_promised_by_date,
           ll.follow_up_date         AS last_follow_up_date,
           u.username                AS last_contact_by,
           (ll.outcome = 'promised'
             AND ll.promised_by_date IS NOT NULL
             AND ll.promised_by_date < CURRENT_DATE) AS has_overdue_promise
      FROM agg a
      LEFT JOIN pay pp USING (person_id)
      LEFT JOIN aging ag USING (person_id)
      LEFT JOIN dominant_room dr USING (person_id)
      LEFT JOIN app.room rr ON rr.room_id = dr.room_id
      LEFT JOIN smartup_rep.legal_person lp ON lp.person_id::text = a.person_id
      LEFT JOIN latest_log ll ON ll.person_id::text = a.person_id
      LEFT JOIN app.user u ON u.id = ll.contacted_by
    """

    # Composable filters: apply as HAVING-equivalent in an outer query.
    outer_where: list[str] = [
        "(gross_invoiced - COALESCE(gross_paid, 0)) > :min_owed",
    ]
    outer_params: dict[str, Any] = {**scope_params, "min_owed": float(_WORKLIST_MIN_OWED)}

    if filters.sales_manager_room_id:
        outer_where.append("primary_room_id = :f_room")
        outer_params["f_room"] = filters.sales_manager_room_id
    if filters.region:
        outer_where.append("region_name ILIKE :f_region")
        outer_params["f_region"] = f"%{filters.region}%"
    if filters.category:
        outer_where.append("category ILIKE :f_category")
        outer_params["f_category"] = f"%{filters.category}%"
    if filters.aging_bucket:
        col = {
            "0_30": "aging_0_30",
            "30_60": "aging_30_60",
            "60_90": "aging_60_90",
            "90_plus": "aging_90_plus",
        }.get(filters.aging_bucket)
        if col:
            outer_where.append(f"{col} > 0")
    if filters.outcome:
        if filters.outcome == "none":
            outer_where.append("last_contact_outcome IS NULL")
        elif filters.outcome in OUTCOMES:
            outer_where.append("last_contact_outcome = :f_outcome")
            outer_params["f_outcome"] = filters.outcome
    if filters.overdue_promises_only:
        outer_where.append("has_overdue_promise = true")
    if filters.search:
        outer_where.append(
            "(name ILIKE :f_search OR tin ILIKE :f_search OR main_phone ILIKE :f_search)"
        )
        outer_params["f_search"] = f"%{filters.search}%"

    where_sql = " AND ".join(outer_where)

    # ---- Summary ----------------------------------------------------------
    summary_sql = f"""
        WITH base AS ({sql_core})
        SELECT
          COUNT(*)                            AS debtor_count,
          COUNT(*) FILTER (WHERE aging_90_plus > 0) AS debtor_over_90_count,
          COALESCE(SUM(outstanding), 0)       AS total_outstanding,
          COALESCE(SUM(aging_90_plus), 0)     AS total_over_90,
          COALESCE(SUM(CASE WHEN has_overdue_promise THEN outstanding ELSE 0 END), 0)
                                              AS total_overdue_promises
          FROM base
         WHERE {where_sql}
    """
    summary = (await session.execute(text(summary_sql), outer_params)).mappings().one()

    # ---- Rows (paginated) -------------------------------------------------
    # Sort by priority calculated inline — cheaper than computing in Python
    # because we want DB-side ordering for pagination consistency.
    rows_params = {**outer_params, "lim": limit, "off": offset}
    rows_sql = f"""
        WITH base AS ({sql_core}),
        ranked AS (
          SELECT *,
            -- simple priority that matches the Python formula in spirit:
            -- amount × staleness + overdue penalty + 90d penalty
            outstanding * GREATEST(COALESCE(days_since_payment, 30), 30) / 30.0
              + (CASE WHEN has_overdue_promise THEN 2.0 * outstanding ELSE 0 END)
              + (CASE WHEN aging_90_plus > 0 THEN 1.0 * outstanding ELSE 0 END)
              AS priority
            FROM base
           WHERE {where_sql}
        )
        SELECT * FROM ranked
         ORDER BY priority DESC NULLS LAST, outstanding DESC NULLS LAST
         LIMIT :lim OFFSET :off
    """
    rows = (await session.execute(text(rows_sql), rows_params)).mappings().all()

    # ---- By-collector rollup (dominant-room attribution) -----------------
    by_collector_sql = f"""
        WITH base AS ({sql_core})
        SELECT primary_room_id AS room_id,
               primary_room_name AS room_name,
               COUNT(*)                          AS debtors_count,
               COALESCE(SUM(outstanding), 0)     AS outstanding,
               COALESCE(SUM(aging_90_plus), 0)   AS over_90,
               (SELECT COALESCE(SUM(amount), 0)
                  FROM smartup_rep.payment p
                 WHERE p.person_id::text IN (SELECT b2.person_id FROM base b2 WHERE b2.primary_room_id = base.primary_room_id)
                   AND (p.payment_date AT TIME ZONE 'Asia/Tashkent')::date
                       >= date_trunc('month', (now() AT TIME ZONE 'Asia/Tashkent')::date)
               ) AS collected_mtd
          FROM base
         WHERE {where_sql}
           AND primary_room_id IS NOT NULL
         GROUP BY primary_room_id, primary_room_name
         ORDER BY outstanding DESC
    """
    by_collector = (await session.execute(text(by_collector_sql), outer_params)).mappings().all()

    return {
        "summary": _jsonify_mapping(summary),
        "rows": [_jsonify_mapping(r) for r in rows],
        "total": int(summary["debtor_count"]),
        "by_collector": [_jsonify_mapping(r) for r in by_collector],
    }


async def compute_prepayments(
    session: AsyncSession,
    *,
    scope: UserScope | None,
    search: str | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    """Clients who have paid more than they were invoiced."""
    order_f, client_f, scope_params = _scope_fragments(scope)
    params: dict[str, Any] = {
        **scope_params,
        "min_credit": float(_PREPAY_MIN_CREDIT),
        "lim": limit,
        "off": offset,
    }
    search_sql = ""
    if search:
        search_sql = " AND (lp.name ILIKE :q OR lp.tin ILIKE :q)"
        params["q"] = f"%{search}%"

    base_sql = f"""
        WITH agg AS (
          SELECT person_id, SUM(product_amount)::numeric AS gross_invoiced
            FROM smartup_rep.deal_order
           WHERE person_id IS NOT NULL
             {order_f}
           GROUP BY person_id
        ),
        pay AS (
          SELECT person_id::text AS person_id,
                 SUM(amount)::numeric AS gross_paid,
                 MAX(payment_date) AS last_payment_date
            FROM smartup_rep.payment
           WHERE person_id IS NOT NULL
             {client_f}
           GROUP BY person_id::text
        )
        SELECT a.person_id,
               lp.name, lp.tin, lp.region_name,
               a.gross_invoiced,
               p.gross_paid,
               (p.gross_paid - a.gross_invoiced) AS credit_balance,
               p.last_payment_date
          FROM agg a
          JOIN pay p USING (person_id)
          LEFT JOIN smartup_rep.legal_person lp ON lp.person_id::text = a.person_id
         WHERE (p.gross_paid - a.gross_invoiced) > :min_credit
         {search_sql}
    """
    count_sql = f"SELECT COUNT(*) AS n FROM ({base_sql}) s"
    total = int((await session.execute(text(count_sql), params)).scalar() or 0)

    rows_sql = f"{base_sql} ORDER BY credit_balance DESC LIMIT :lim OFFSET :off"
    rows = (await session.execute(text(rows_sql), params)).mappings().all()

    return {
        "rows": [_jsonify_mapping(r) for r in rows],
        "total": total,
    }


async def get_client_detail(
    session: AsyncSession,
    *,
    scope: UserScope | None,
    person_id: int,
) -> dict[str, Any]:
    order_f, client_f, scope_params = _scope_fragments(scope)
    params: dict[str, Any] = {**scope_params, "pid": person_id, "pid_text": str(person_id)}

    # Contact block (full legal_person row, scoped)
    contact = (
        await session.execute(
            text(
                f"""
                SELECT person_id, name, tin, short_name, code, main_phone, telegram,
                       address, post_address, delivery_addresses, region_country_name,
                       region_region_name, region_name, region_district_name,
                       region_town_name, group_name1 AS group1, group_name2 AS category,
                       group_name3 AS type3, owner_name, owner_short_name,
                       parent_name, state_name, note, latlng, created_on, modified_on
                  FROM smartup_rep.legal_person
                 WHERE person_id = :pid
                   {("AND " + _scope_person_filter(scope)) if scope and scope.is_scoped else ""}
                """
            ),
            params,
        )
    ).mappings().first()
    if contact is None:
        return {}

    # Orders timeline (last 20 leaf lines by delivery date)
    orders = (
        await session.execute(
            text(
                f"""
                SELECT delivery_date, deal_id, room_id, room_name,
                       sales_manager, product_name, sold_quant, product_amount
                  FROM smartup_rep.deal_order
                 WHERE person_id::text = :pid_text
                   {order_f.replace('AND ', ' AND ')}
                 ORDER BY delivery_date DESC, deal_id
                 LIMIT 50
                """
            ),
            params,
        )
    ).mappings().all()

    # Payments timeline
    payments = (
        await session.execute(
            text(
                """
                SELECT payment_date, amount, currency, payment_method, payer
                  FROM smartup_rep.payment
                 WHERE person_id = :pid
                 ORDER BY payment_date DESC
                 LIMIT 50
                """
            ),
            {"pid": person_id},
        )
    ).mappings().all()

    # Contact log
    log_rows = (
        await session.execute(
            text(
                """
                SELECT l.id, l.contacted_at, l.contacted_by, u.username AS contacted_by_name,
                       l.outcome, l.promised_amount, l.promised_by_date, l.follow_up_date, l.note
                  FROM app.debt_contact_log l
                  LEFT JOIN app.user u ON u.id = l.contacted_by
                 WHERE l.person_id = :pid
                 ORDER BY l.contacted_at DESC
                """
            ),
            {"pid": person_id},
        )
    ).mappings().all()

    # Aging snapshot (re-run mini-cte just for this client)
    aging = (
        await session.execute(
            text(
                f"""
                WITH my_orders AS (
                  SELECT delivery_date, deal_id, product_amount
                    FROM smartup_rep.deal_order
                   WHERE person_id::text = :pid_text
                     {order_f.replace('AND ', ' AND ')}
                ),
                pay_total AS (
                  SELECT COALESCE(SUM(amount), 0) AS gross_paid
                    FROM smartup_rep.payment
                   WHERE person_id = :pid
                ),
                cs AS (
                  SELECT delivery_date,
                         product_amount,
                         SUM(product_amount) OVER (
                           ORDER BY delivery_date, deal_id
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                         ) AS cum_invoiced
                    FROM my_orders
                ),
                unpaid AS (
                  SELECT cs.delivery_date,
                         GREATEST(LEAST(cs.product_amount,
                                        cs.cum_invoiced - (SELECT gross_paid FROM pay_total)), 0)
                           AS unpaid_slice
                    FROM cs
                )
                SELECT
                  (SELECT COALESCE(SUM(product_amount), 0) FROM my_orders)            AS gross_invoiced,
                  (SELECT gross_paid FROM pay_total)                                  AS gross_paid,
                  SUM(CASE WHEN (CURRENT_DATE - delivery_date) BETWEEN 0  AND 29  THEN unpaid_slice ELSE 0 END) AS aging_0_30,
                  SUM(CASE WHEN (CURRENT_DATE - delivery_date) BETWEEN 30 AND 59  THEN unpaid_slice ELSE 0 END) AS aging_30_60,
                  SUM(CASE WHEN (CURRENT_DATE - delivery_date) BETWEEN 60 AND 89  THEN unpaid_slice ELSE 0 END) AS aging_60_90,
                  SUM(CASE WHEN (CURRENT_DATE - delivery_date) >= 90              THEN unpaid_slice ELSE 0 END) AS aging_90_plus
                  FROM unpaid
                """
            ),
            params,
        )
    ).mappings().one()

    return {
        "contact": _jsonify_mapping(contact),
        "aging": _jsonify_mapping(aging),
        "orders": [_jsonify_mapping(r) for r in orders],
        "payments": [_jsonify_mapping(r) for r in payments],
        "contact_log": [_jsonify_mapping(r) for r in log_rows],
    }


def _scope_person_filter(scope: UserScope) -> str:
    """Used in get_client_detail to further guard the legal_person SELECT so
    a scoped user can't fetch a client outside their room assignments even
    with a hand-crafted person_id in the URL."""
    placeholders = ", ".join(f":_scope_r{i}" for i in range(len(scope.room_ids)))
    return (
        f"person_id::text IN ("
        f"  SELECT DISTINCT person_id FROM smartup_rep.deal_order "
        f"   WHERE room_id IN ({placeholders})"
        f")"
    )


# ---- Contact log CRUD ------------------------------------------------------


@dataclass
class ContactPayload:
    outcome: str
    promised_amount: float | None = None
    promised_by_date: date | None = None
    follow_up_date: date | None = None
    note: str | None = None


async def _assert_client_in_scope(
    session: AsyncSession, scope: UserScope | None, person_id: int
) -> None:
    """Raise ValueError if user is scoped and person_id is outside their rooms."""
    if not scope or not scope.is_scoped:
        return
    placeholders = ", ".join(f":_scope_r{i}" for i in range(len(scope.room_ids)))
    row = (
        await session.execute(
            text(
                f"""
                SELECT 1 FROM smartup_rep.deal_order
                 WHERE person_id::text = :pid
                   AND room_id IN ({placeholders})
                 LIMIT 1
                """
            ),
            {**{f"_scope_r{i}": r for i, r in enumerate(scope.room_ids)}, "pid": str(person_id)},
        )
    ).first()
    if row is None:
        raise PermissionError("client outside scope")


async def log_contact(
    session: AsyncSession,
    *,
    scope: UserScope | None,
    user_id: int,
    person_id: int,
    payload: ContactPayload,
) -> dict[str, Any]:
    if payload.outcome not in OUTCOMES:
        raise ValueError(f"unknown outcome {payload.outcome!r}")
    await _assert_client_in_scope(session, scope, person_id)

    result = await session.execute(
        text(
            """
            INSERT INTO app.debt_contact_log (
                person_id, contacted_by, outcome,
                promised_amount, promised_by_date, follow_up_date, note
            ) VALUES (
                :pid, :uid, :outcome,
                :promised_amount, :promised_by_date, :follow_up_date, :note
            )
            RETURNING id, person_id, contacted_at, contacted_by, outcome,
                      promised_amount, promised_by_date, follow_up_date, note
            """
        ),
        {
            "pid": person_id,
            "uid": user_id,
            "outcome": payload.outcome,
            "promised_amount": payload.promised_amount,
            "promised_by_date": payload.promised_by_date,
            "follow_up_date": payload.follow_up_date,
            "note": payload.note,
        },
    )
    row = result.mappings().one()
    return _jsonify_mapping(row)


async def get_contact_log_entry(
    session: AsyncSession, entry_id: int
) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text("SELECT * FROM app.debt_contact_log WHERE id = :id"),
            {"id": entry_id},
        )
    ).mappings().first()
    return _jsonify_mapping(row) if row else None


async def update_contact_log_entry(
    session: AsyncSession,
    *,
    entry_id: int,
    user_id: int,
    is_admin: bool,
    payload: ContactPayload,
) -> dict[str, Any]:
    row = (
        await session.execute(
            text("SELECT contacted_by FROM app.debt_contact_log WHERE id = :id"),
            {"id": entry_id},
        )
    ).first()
    if row is None:
        raise KeyError("entry not found")
    if not is_admin and row.contacted_by != user_id:
        raise PermissionError("not author")

    if payload.outcome not in OUTCOMES:
        raise ValueError(f"unknown outcome {payload.outcome!r}")

    await session.execute(
        text(
            """
            UPDATE app.debt_contact_log
               SET outcome = :outcome,
                   promised_amount = :promised_amount,
                   promised_by_date = :promised_by_date,
                   follow_up_date = :follow_up_date,
                   note = :note,
                   updated_at = now()
             WHERE id = :id
            """
        ),
        {
            "id": entry_id,
            "outcome": payload.outcome,
            "promised_amount": payload.promised_amount,
            "promised_by_date": payload.promised_by_date,
            "follow_up_date": payload.follow_up_date,
            "note": payload.note,
        },
    )
    return await get_contact_log_entry(session, entry_id) or {}


async def delete_contact_log_entry(
    session: AsyncSession,
    *,
    entry_id: int,
    user_id: int,
    is_admin: bool,
) -> None:
    row = (
        await session.execute(
            text("SELECT contacted_by FROM app.debt_contact_log WHERE id = :id"),
            {"id": entry_id},
        )
    ).first()
    if row is None:
        raise KeyError("entry not found")
    if not is_admin and row.contacted_by != user_id:
        raise PermissionError("not author")
    await session.execute(
        text("DELETE FROM app.debt_contact_log WHERE id = :id"),
        {"id": entry_id},
    )


# ---- Helpers ---------------------------------------------------------------


def _jsonify_mapping(row) -> dict[str, Any]:
    if row is None:
        return {}
    out: dict[str, Any] = {}
    for k, v in row.items():
        if isinstance(v, Decimal):
            out[k] = float(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, date):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out
