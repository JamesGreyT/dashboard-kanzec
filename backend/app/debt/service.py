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


def _scope_fragments(scope: UserScope | None) -> tuple[str, dict]:
    """Return (person_filter, params) fragment to AND into deal_order /
    payment / legal_person queries.

    The fence is **person-based**: "clients you have sold to at least once".
    Both deal_order (gross_invoiced) and payment (gross_paid) get filtered
    by the same person set so aging math stays consistent and prepayments
    don't become false positives (where an all-rooms payment appears as
    credit against only-my-room's invoiced amount).

    Admins / zero-room users pass through unscoped ("", {}).
    """
    if not scope or not scope.is_scoped:
        return "", {}

    placeholders = ", ".join(f":_scope_r{i}" for i in range(len(scope.room_ids)))
    params = {f"_scope_r{i}": r for i, r in enumerate(scope.room_ids)}
    person_f = (
        f"AND person_id::text IN ("
        f"  SELECT DISTINCT person_id FROM smartup_rep.deal_order "
        f"   WHERE room_id IN ({placeholders})"
        f")"
    )
    return person_f, params


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
    direction: str | None = None           # exact match against legal_person.direction
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
    person_f, scope_params = _scope_fragments(scope)

    # Opening balances (pre-2022 AR/AP) are merged into `my_orders` / `pay`
    # as synthetic rows dated 2022-09-13 — one day before our first
    # deal_order row. FIFO aging then naturally buckets opening AR into 90+
    # (since the synthetic date is ~4 years old), and opening AP (credit)
    # offsets the oldest unpaid invoice exactly like a real payment would.
    # The synthetic row_count is excluded from order_count / pay_count so
    # we don't mislead the UI about how many real transactions exist.
    sql_core = f"""
    WITH opening AS (
      SELECT person_id::text AS person_id,
             opening_debt,
             opening_credit
        FROM smartup_rep.opening_balance
       WHERE person_id IS NOT NULL
    ),
    real_orders AS (
      SELECT person_id, delivery_date, deal_id, product_amount, room_id
        FROM smartup_rep.deal_order
       WHERE person_id IS NOT NULL
         {person_f}
    ),
    my_orders AS (
      SELECT person_id, delivery_date, deal_id, product_amount, room_id,
             false AS is_opening
        FROM real_orders
      UNION ALL
      SELECT o.person_id,
             DATE '2022-09-13'      AS delivery_date,
             'OPENING'              AS deal_id,
             o.opening_debt         AS product_amount,
             NULL::text             AS room_id,
             true                   AS is_opening
        FROM opening o
       WHERE o.opening_debt > 0
         AND o.person_id IN (SELECT DISTINCT person_id FROM real_orders)
    ),
    agg AS (
      SELECT person_id,
             SUM(product_amount)::numeric AS gross_invoiced,
             MIN(delivery_date)            AS first_order_date,
             -- last_order_date + order_count track REAL orders only; the
             -- synthetic opening row shouldn't read as "activity".
             MAX(delivery_date) FILTER (WHERE NOT is_opening) AS last_order_date,
             COUNT(*) FILTER (WHERE NOT is_opening)            AS order_count,
             SUM(product_amount) FILTER (WHERE is_opening)     AS opening_debt
        FROM my_orders
       GROUP BY person_id
    ),
    pay AS (
      SELECT person_id,
             SUM(amount)::numeric  AS gross_paid,
             MAX(payment_date) FILTER (WHERE NOT is_opening) AS last_payment_date,
             COUNT(*) FILTER (WHERE NOT is_opening)          AS pay_count,
             SUM(amount) FILTER (WHERE is_opening)           AS opening_credit
        FROM (
          SELECT person_id::text AS person_id, amount, payment_date,
                 false AS is_opening
            FROM smartup_rep.payment
           WHERE person_id IS NOT NULL
             {person_f}
          UNION ALL
          SELECT person_id, opening_credit AS amount,
                 TIMESTAMP '2022-09-13 00:00:00' AS payment_date,
                 true AS is_opening
            FROM opening
           WHERE opening_credit > 0
        ) u
       GROUP BY person_id
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
      -- Tiebreak on room_id so the ordering is deterministic when two rooms
      -- have identical invoiced amounts for the same client.
      SELECT DISTINCT ON (person_id) person_id, room_id, room_invoiced
        FROM attribution
       ORDER BY person_id, room_invoiced DESC, room_id
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
           lp.direction           AS direction,
           lp.owner_name,
           a.gross_invoiced,
           COALESCE(pp.gross_paid, 0) AS gross_paid,
           (a.gross_invoiced - COALESCE(pp.gross_paid, 0)) AS outstanding,
           COALESCE(a.opening_debt, 0)   AS opening_debt,
           COALESCE(pp.opening_credit, 0) AS opening_credit,
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
    if filters.direction:
        outer_where.append("direction = :f_direction")
        outer_params["f_direction"] = filters.direction
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
    # Only include rooms the requesting user can legitimately see — admins
    # get all, scoped users get only their assigned rooms. Prevents a
    # cross-room client from surfacing another collector's room in the
    # requester's rollup even though our person-fenced scope lets us see
    # the client.
    by_collector_room_filter = ""
    if scope and scope.is_scoped:
        by_collector_room_filter = (
            "AND primary_room_id IN ("
            + ", ".join(f":_scope_r{i}" for i in range(len(scope.room_ids)))
            + ")"
        )

    by_collector_sql = f"""
        WITH base AS ({sql_core}),
        filtered AS (
          SELECT * FROM base WHERE {where_sql}
        )
        SELECT primary_room_id AS room_id,
               primary_room_name AS room_name,
               COUNT(*)                          AS debtors_count,
               COALESCE(SUM(outstanding), 0)     AS outstanding,
               COALESCE(SUM(aging_90_plus), 0)   AS over_90,
               (SELECT COALESCE(SUM(amount), 0)
                  FROM smartup_rep.payment p
                 WHERE p.person_id::text IN (
                           SELECT f2.person_id FROM filtered f2
                            WHERE f2.primary_room_id = filtered.primary_room_id
                       )
                   AND (p.payment_date AT TIME ZONE 'Asia/Tashkent')::date
                       >= date_trunc('month', (now() AT TIME ZONE 'Asia/Tashkent')::date)
               ) AS collected_mtd
          FROM filtered
         WHERE primary_room_id IS NOT NULL
           {by_collector_room_filter}
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
    person_f, scope_params = _scope_fragments(scope)
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

    # Opening balances are folded in so prepayment truly means "paid more than
    # they ever owed us, including pre-2022 carryover." Synthesize opening
    # rows directly into the source feeds — same pattern as compute_worklist
    # — so clients whose ONLY balance is an opening credit (no post-2022
    # activity) still surface here. FULL OUTER JOIN catches the edge cases.
    base_sql = f"""
        WITH opening AS (
          SELECT person_id::text AS person_id, opening_debt, opening_credit
            FROM smartup_rep.opening_balance
           WHERE person_id IS NOT NULL
        ),
        agg AS (
          SELECT person_id, SUM(amt)::numeric AS gross_invoiced
            FROM (
              SELECT person_id, product_amount AS amt
                FROM smartup_rep.deal_order
               WHERE person_id IS NOT NULL
                 {person_f}
              UNION ALL
              SELECT person_id, opening_debt AS amt
                FROM opening WHERE opening_debt > 0
            ) u GROUP BY person_id
        ),
        pay AS (
          SELECT person_id,
                 SUM(amt)::numeric AS gross_paid,
                 MAX(pd) FILTER (WHERE NOT is_opening) AS last_payment_date
            FROM (
              SELECT person_id::text AS person_id, amount AS amt,
                     payment_date AS pd, false AS is_opening
                FROM smartup_rep.payment
               WHERE person_id IS NOT NULL
                 {person_f}
              UNION ALL
              SELECT person_id, opening_credit AS amt,
                     TIMESTAMP '2022-09-13 00:00:00' AS pd,
                     true AS is_opening
                FROM opening WHERE opening_credit > 0
            ) u GROUP BY person_id
        )
        SELECT COALESCE(a.person_id, p.person_id) AS person_id,
               lp.name, lp.tin, lp.region_name,
               COALESCE(a.gross_invoiced, 0) AS gross_invoiced,
               COALESCE(p.gross_paid,     0) AS gross_paid,
               (COALESCE(p.gross_paid, 0) - COALESCE(a.gross_invoiced, 0)) AS credit_balance,
               p.last_payment_date
          FROM agg a
          FULL OUTER JOIN pay p USING (person_id)
          LEFT JOIN smartup_rep.legal_person lp
                 ON lp.person_id::text = COALESCE(a.person_id, p.person_id)
         WHERE (COALESCE(p.gross_paid, 0) - COALESCE(a.gross_invoiced, 0)) > :min_credit
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
    orders_offset: int = 0,
    orders_limit: int = 50,
    payments_offset: int = 0,
    payments_limit: int = 50,
) -> dict[str, Any]:
    person_f, scope_params = _scope_fragments(scope)
    params: dict[str, Any] = {**scope_params, "pid": person_id, "pid_text": str(person_id)}

    # Contact block (full legal_person row, scoped). We scope the target row
    # itself — person_f already uses `person_id::text IN (...)`, so an ANDed
    # `person_id = :pid` narrows to the single row when in scope, or zero
    # when out of scope.
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
                   {person_f}
                """
            ),
            params,
        )
    ).mappings().first()
    if contact is None:
        return {}

    # Orders timeline — scope already asserted via contact fetch; show every
    # order for this client (cross-room context is intentional, see
    # _scope_fragments docstring). Returns paged + totals so the FE can
    # render a count chip, a sum strip, and pagination when > limit.
    orders_meta = (
        await session.execute(
            text(
                """
                SELECT COUNT(*)                            AS n,
                       COALESCE(SUM(product_amount), 0)    AS sum_amount
                  FROM smartup_rep.deal_order
                 WHERE person_id::text = :pid_text
                """
            ),
            {"pid_text": str(person_id)},
        )
    ).mappings().one()
    orders = (
        await session.execute(
            text(
                """
                SELECT delivery_date, deal_id, room_id, room_name,
                       sales_manager, product_name, sold_quant, product_amount
                  FROM smartup_rep.deal_order
                 WHERE person_id::text = :pid_text
                 ORDER BY delivery_date DESC, deal_id
                 LIMIT :lim OFFSET :off
                """
            ),
            {"pid_text": str(person_id), "lim": orders_limit, "off": orders_offset},
        )
    ).mappings().all()

    # Payments timeline + totals
    payments_meta = (
        await session.execute(
            text(
                """
                SELECT COUNT(*)                    AS n,
                       COALESCE(SUM(amount), 0)    AS sum_amount
                  FROM smartup_rep.payment
                 WHERE person_id = :pid
                """
            ),
            {"pid": person_id},
        )
    ).mappings().one()
    payments = (
        await session.execute(
            text(
                """
                SELECT payment_date, amount, currency, payment_method, payer
                  FROM smartup_rep.payment
                 WHERE person_id = :pid
                 ORDER BY payment_date DESC
                 LIMIT :lim OFFSET :off
                """
            ),
            {"pid": person_id, "lim": payments_limit, "off": payments_offset},
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

    # Aging snapshot — scope already validated above. No additional room
    # filter on orders; we show the client's full books (same as the
    # person-fenced worklist semantics).
    # Opening balance is synthesized into my_orders / pay_total exactly
    # like compute_worklist does, so per-client aging buckets stay
    # consistent with the worklist row for this person.
    aging = (
        await session.execute(
            text(
                """
                WITH opening AS (
                  SELECT opening_debt, opening_credit
                    FROM smartup_rep.opening_balance
                   WHERE person_id = :pid
                ),
                my_orders AS (
                  SELECT delivery_date, deal_id, product_amount, false AS is_opening
                    FROM smartup_rep.deal_order
                   WHERE person_id::text = :pid_text
                  UNION ALL
                  SELECT DATE '2022-09-13', 'OPENING', opening_debt, true
                    FROM opening WHERE opening_debt > 0
                ),
                pay_total AS (
                  SELECT COALESCE(
                           (SELECT SUM(amount) FROM smartup_rep.payment WHERE person_id = :pid),
                           0
                         )
                         + COALESCE((SELECT opening_credit FROM opening), 0) AS gross_paid
                ),
                cs AS (
                  SELECT delivery_date,
                         product_amount,
                         is_opening,
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
                  COALESCE((SELECT opening_debt   FROM opening), 0)                   AS opening_debt,
                  COALESCE((SELECT opening_credit FROM opening), 0)                   AS opening_credit,
                  SUM(CASE WHEN (CURRENT_DATE - delivery_date) BETWEEN 0  AND 29  THEN unpaid_slice ELSE 0 END) AS aging_0_30,
                  SUM(CASE WHEN (CURRENT_DATE - delivery_date) BETWEEN 30 AND 59  THEN unpaid_slice ELSE 0 END) AS aging_30_60,
                  SUM(CASE WHEN (CURRENT_DATE - delivery_date) BETWEEN 60 AND 89  THEN unpaid_slice ELSE 0 END) AS aging_60_90,
                  SUM(CASE WHEN (CURRENT_DATE - delivery_date) >= 90              THEN unpaid_slice ELSE 0 END) AS aging_90_plus
                  FROM unpaid
                """
            ),
            {"pid_text": str(person_id), "pid": person_id},
        )
    ).mappings().one()

    return {
        "contact": _jsonify_mapping(contact),
        "aging": _jsonify_mapping(aging),
        "orders": [_jsonify_mapping(r) for r in orders],
        "orders_total": int(orders_meta["n"]),
        "orders_sum": float(orders_meta["sum_amount"]),
        "payments": [_jsonify_mapping(r) for r in payments],
        "payments_total": int(payments_meta["n"]),
        "payments_sum": float(payments_meta["sum_amount"]),
        "contact_log": [_jsonify_mapping(r) for r in log_rows],
    }


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


_LEDGER_MIN_OWED = Decimal("10")
DEFAULT_TERM_DAYS = 30  # matches the Params sheet in KanzecAR_CONTINUOUS_FIXED.xlsx


@dataclass
class LedgerFilters:
    sales_manager_room_id: str | None = None
    region: str | None = None
    category: str | None = None
    direction: str | None = None           # exact match against legal_person.direction
    client_group: str | None = None        # exact match against legal_person.client_group
    overdue_only: bool = False
    search: str | None = None


async def compute_ledger(
    session: AsyncSession,
    *,
    scope: UserScope | None,
    filters: LedgerFilters,
    limit: int,
    offset: int,
    term_days: int = DEFAULT_TERM_DAYS,
) -> dict[str, Any]:
    """Per-client debt ledger — mirrors the 'Data' sheet in
    KanzecAR_CONTINUOUS_FIXED.xlsx. Columns map 1:1 onto the spreadsheet:

      ClientName | Nehca kun? | Boshlang'ich qarz | Boshlang'ich kredit
      Sotuv      | Vozrat     | To'lov            | TotalCredits
      TotalDebt  | Qarz       | Muddati tugamagan | Muddati o'tgan
      1-30 | 31-60 | 61-90 | 90+ | Overdue0 | Overdue30 | Overdue60 | Overdue90
      Meneger

    FIFO aging — payments settle oldest invoices first. Overdue buckets are
    measured from `delivery_date + term_days` (the due date), matching how
    accountants read the report. Opening balances ride along the same way
    the worklist uses them: synthetic $opening_debt invoice dated
    2022-09-13 and synthetic $opening_credit payment of the same date.
    """
    person_f, scope_params = _scope_fragments(scope)
    params: dict[str, Any] = {
        **scope_params,
        "min_owed": float(_LEDGER_MIN_OWED),
        "default_term": int(DEFAULT_TERM_DAYS),
    }
    # term_days is no longer a single bound parameter — each row uses
    # legal_person.instalment_days (NOT NULL, default 30 in the schema).
    # The function still accepts term_days for backward compatibility but
    # it is intentionally unused in the SQL.
    _ = term_days

    filter_sqls: list[str] = []
    if filters.sales_manager_room_id:
        filter_sqls.append("primary_room_id = :f_room")
        params["f_room"] = filters.sales_manager_room_id
    if filters.region:
        filter_sqls.append("region_name ILIKE :f_region")
        params["f_region"] = f"%{filters.region}%"
    if filters.category:
        filter_sqls.append("category ILIKE :f_category")
        params["f_category"] = f"%{filters.category}%"
    if filters.direction:
        filter_sqls.append("direction = :f_direction")
        params["f_direction"] = filters.direction
    if filters.client_group:
        filter_sqls.append("client_group = :f_client_group")
        params["f_client_group"] = filters.client_group
    if filters.overdue_only:
        filter_sqls.append("overdue > 0")
    if filters.search:
        filter_sqls.append("(client_name ILIKE :f_search OR tin ILIKE :f_search)")
        params["f_search"] = f"%{filters.search}%"
    filter_sql = (" AND " + " AND ".join(filter_sqls)) if filter_sqls else ""

    core = f"""
    WITH opening AS (
      SELECT person_id::text AS person_id, opening_debt, opening_credit
        FROM smartup_rep.opening_balance
       WHERE person_id IS NOT NULL
    ),
    real_orders AS (
      SELECT person_id, delivery_date, deal_id, product_amount, room_id
        FROM smartup_rep.deal_order
       WHERE person_id IS NOT NULL
         {person_f}
    ),
    -- Gross per-client: sotuv = SUM of positive product_amount (real sales);
    -- vozrat = SUM of |negative product_amount| (returns). Smartup exports
    -- returns as negative rows in the same `deal_order` feed.
    client_gross AS (
      SELECT person_id,
             SUM(GREATEST(product_amount, 0))  AS sotuv,
             SUM(GREATEST(-product_amount, 0)) AS vozrat,
             MAX(delivery_date)                AS last_order_date,
             COUNT(*)                          AS order_count
        FROM real_orders
       GROUP BY person_id
    ),
    real_pay AS (
      SELECT person_id::text AS person_id,
             SUM(amount)          AS tolov,
             MAX(payment_date)    AS last_payment_date,
             COUNT(*)             AS pay_count
        FROM smartup_rep.payment
       WHERE person_id IS NOT NULL
         {person_f}
       GROUP BY person_id::text
    ),
    -- Sum of payments since each problem-client's deal_deadline_start.
    -- Used by the deal_status CASE below: for PROBLEM_MONTHLY clients we
    -- compare this to (months_elapsed × deal_monthly_amount). The JOIN
    -- against legal_person is on text-keys to match the rest of the file.
    monthly_paid AS (
      SELECT p.person_id::text AS person_id,
             SUM(p.amount) AS paid_since_epoch
        FROM smartup_rep.payment p
        JOIN smartup_rep.legal_person lp
          ON lp.person_id::text = p.person_id::text
       WHERE p.person_id IS NOT NULL
         AND lp.deal_deadline_start IS NOT NULL
         AND p.payment_date >= lp.deal_deadline_start
         {person_f}
       GROUP BY p.person_id::text
    ),
    -- Universe of debtors: anyone with orders OR with an opening balance
    -- (even a client with only $X opening debt and no post-2022 activity
    -- should appear — they still owe us).
    universe AS (
      SELECT person_id FROM client_gross
      UNION
      SELECT person_id FROM opening WHERE opening_debt > 0 OR opening_credit > 0
    ),
    -- FIFO invoice ledger: positive real invoices only + synthetic opening.
    -- Returns (negative product_amount rows) are NOT invoices; they flow
    -- into the paid side so cumulative_invoiced stays monotonic. Otherwise
    -- FIFO's unpaid_slice formula (GREATEST(LEAST(amt, cum - paid), 0))
    -- would silently drop the return credit and over-state unpaid.
    my_orders AS (
      SELECT person_id, delivery_date, deal_id, product_amount, false AS is_opening
        FROM real_orders
       WHERE product_amount > 0
      UNION ALL
      SELECT u.person_id, DATE '2022-09-13', 'OPENING',
             o.opening_debt, true
        FROM universe u
        JOIN opening o USING (person_id)
       WHERE o.opening_debt > 0
    ),
    -- Total credits against FIFO: real payments + returns + opening_credit.
    tot_pay AS (
      SELECT person_id, SUM(amt) AS paid_for_fifo
        FROM (
          SELECT person_id::text AS person_id, amount AS amt
            FROM smartup_rep.payment
           WHERE person_id IS NOT NULL
             {person_f}
          UNION ALL
          SELECT person_id, -product_amount AS amt
            FROM real_orders
           WHERE product_amount < 0
          UNION ALL
          SELECT u.person_id, o.opening_credit AS amt
            FROM universe u JOIN opening o USING (person_id)
           WHERE o.opening_credit > 0
        ) u GROUP BY person_id
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
      SELECT c.person_id, c.delivery_date,
             GREATEST(
               LEAST(c.product_amount,
                     c.cum_invoiced - COALESCE(tp.paid_for_fifo, 0)),
               0
             ) AS unpaid_slice
        FROM ord_cumsum c
        LEFT JOIN tot_pay tp USING (person_id)
    ),
    aging AS (
      -- age_days = how old the invoice is. Due date = delivery_date + term_days.
      -- overdue_days = age_days - term_days. >0 means past due. term_days is
      -- read per-client from legal_person.instalment_days (NOT NULL, default
      -- 30 in the schema). Orphan person_ids (no legal_person row) fall back
      -- to :default_term.
      SELECT x.person_id,
             SUM(CASE WHEN x.age_days <= x.term_days                                  THEN x.unpaid_slice ELSE 0 END) AS not_due,
             SUM(CASE WHEN x.age_days >  x.term_days                                  THEN x.unpaid_slice ELSE 0 END) AS overdue,
             SUM(CASE WHEN x.age_days >  x.term_days      AND x.age_days <= x.term_days + 30 THEN x.unpaid_slice ELSE 0 END) AS bucket_1_30,
             SUM(CASE WHEN x.age_days >  x.term_days + 30 AND x.age_days <= x.term_days + 60 THEN x.unpaid_slice ELSE 0 END) AS bucket_31_60,
             SUM(CASE WHEN x.age_days >  x.term_days + 60 AND x.age_days <= x.term_days + 90 THEN x.unpaid_slice ELSE 0 END) AS bucket_61_90,
             SUM(CASE WHEN x.age_days >  x.term_days + 90                             THEN x.unpaid_slice ELSE 0 END) AS bucket_90_plus
        FROM (
          SELECT ou.person_id, ou.unpaid_slice,
                 (CURRENT_DATE - ou.delivery_date)                AS age_days,
                 COALESCE(lp.instalment_days, :default_term)      AS term_days
            FROM ord_unpaid ou
            LEFT JOIN smartup_rep.legal_person lp
              ON lp.person_id::text = ou.person_id
        ) x
       GROUP BY x.person_id
    ),
    -- Attribute each client to their dominant sales room (by invoice value).
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
    )
    SELECT u.person_id,
           lp.name                                AS client_name,
           lp.tin,
           lp.region_name,
           lp.group_name2                         AS category,
           lp.direction                           AS direction,
           lp.client_group                        AS client_group,
           lp.deal_deadline_start                 AS deal_deadline_start,
           lp.deal_monthly_amount                 AS deal_monthly_amount,
           COALESCE(lp.instalment_days, :default_term) AS term_days,
           COALESCE(ob.opening_debt, 0)           AS opening_debt,
           COALESCE(ob.opening_credit, 0)         AS opening_credit,
           COALESCE(cg.sotuv, 0)                  AS sotuv,
           COALESCE(cg.vozrat, 0)                 AS vozrat,
           COALESCE(rp.tolov, 0)                  AS tolov,
           (COALESCE(cg.vozrat, 0)
              + COALESCE(rp.tolov, 0)
              + COALESCE(ob.opening_credit, 0))   AS total_credits,
           (COALESCE(cg.sotuv, 0)
              + COALESCE(ob.opening_debt, 0))     AS total_debt,
           (COALESCE(cg.sotuv, 0)
              + COALESCE(ob.opening_debt, 0)
              - COALESCE(cg.vozrat, 0)
              - COALESCE(rp.tolov, 0)
              - COALESCE(ob.opening_credit, 0))   AS qarz,
           COALESCE(ag.not_due, 0)                AS not_due,
           COALESCE(ag.overdue, 0)                AS overdue,
           COALESCE(ag.bucket_1_30, 0)            AS bucket_1_30,
           COALESCE(ag.bucket_31_60, 0)           AS bucket_31_60,
           COALESCE(ag.bucket_61_90, 0)           AS bucket_61_90,
           COALESCE(ag.bucket_90_plus, 0)         AS bucket_90_plus,
           COALESCE(ag.overdue, 0)                AS overdue_0,
           (COALESCE(ag.bucket_31_60, 0)
              + COALESCE(ag.bucket_61_90, 0)
              + COALESCE(ag.bucket_90_plus, 0))   AS overdue_30,
           (COALESCE(ag.bucket_61_90, 0)
              + COALESCE(ag.bucket_90_plus, 0))   AS overdue_60,
           COALESCE(ag.bucket_90_plus, 0)         AS overdue_90,
           cg.last_order_date,
           rp.last_payment_date,
           dr.room_id                             AS primary_room_id,
           rr.room_name                           AS manager,
           -- Deal status: computed live from client_group +
           -- deal_deadline_start + instalment_days + the payment ledger.
           --
           -- PROBLEM_MONTHLY math: months_elapsed since deal_deadline_start
           -- × deal_monthly_amount = expected_paid; if the actual payment
           -- sum since that date is below the threshold the client is
           -- BEHIND, otherwise ON_TRACK.
           --
           -- See plan in
           -- C:/Users/Ilhom/.claude/plans/based-on-backend-and-witty-puzzle.md
           CASE
             WHEN lp.client_group = 'CLOSED' THEN 'CLOSED'
             WHEN (COALESCE(cg.sotuv, 0)
                    + COALESCE(ob.opening_debt, 0)
                    - COALESCE(cg.vozrat, 0)
                    - COALESCE(rp.tolov, 0)
                    - COALESCE(ob.opening_credit, 0)) <= 0 THEN 'FULFILLED'
             WHEN lp.client_group = 'NORMAL' THEN
               CASE WHEN COALESCE(ag.overdue, 0) > 0 THEN 'OVERDUE' ELSE 'ON_TRACK' END
             WHEN lp.client_group = 'PROBLEM_DEADLINE'
                  AND lp.deal_deadline_start IS NOT NULL
                  AND lp.instalment_days IS NOT NULL THEN
               CASE
                 WHEN CURRENT_DATE > (lp.deal_deadline_start + (lp.instalment_days || ' days')::interval)::date
                      THEN 'DEFAULT'
                 ELSE 'ON_TRACK'
               END
             WHEN lp.client_group = 'PROBLEM_MONTHLY'
                  AND lp.deal_deadline_start IS NOT NULL
                  AND lp.deal_monthly_amount IS NOT NULL
                  AND lp.deal_monthly_amount > 0 THEN
               CASE
                 WHEN COALESCE(mp.paid_since_epoch, 0)
                      >= (
                        GREATEST(
                          0,
                          (DATE_PART('year',  age(CURRENT_DATE, lp.deal_deadline_start)) * 12
                           + DATE_PART('month', age(CURRENT_DATE, lp.deal_deadline_start)))
                        ) * lp.deal_monthly_amount
                      )
                   THEN 'ON_TRACK'
                 ELSE 'BEHIND'
               END
             ELSE 'UNKNOWN'
           END                                    AS deal_status
      FROM universe u
      LEFT JOIN client_gross cg USING (person_id)
      LEFT JOIN real_pay     rp USING (person_id)
      LEFT JOIN opening      ob USING (person_id)
      LEFT JOIN aging        ag USING (person_id)
      LEFT JOIN dominant_room dr USING (person_id)
      LEFT JOIN app.room rr ON rr.room_id = dr.room_id
      LEFT JOIN smartup_rep.legal_person lp ON lp.person_id::text = u.person_id
      LEFT JOIN monthly_paid mp USING (person_id)
    """

    where_tail = f"qarz > :min_owed {filter_sql}"

    count_sql = f"""
        WITH base AS ({core})
        SELECT COUNT(*) AS n FROM base WHERE {where_tail}
    """
    total = int((await session.execute(text(count_sql), params)).scalar() or 0)

    rows_sql = f"""
        WITH base AS ({core})
        SELECT * FROM base WHERE {where_tail}
         ORDER BY qarz DESC NULLS LAST
         LIMIT :lim OFFSET :off
    """
    rows_params = {**params, "lim": limit, "off": offset}
    rows = (
        await session.execute(text(rows_sql), rows_params)
    ).mappings().all()

    # Summary: grand totals across the filtered set (ignoring pagination).
    summary_sql = f"""
        WITH base AS ({core})
        SELECT
          COUNT(*)                         AS debtor_count,
          COALESCE(SUM(qarz), 0)           AS total_qarz,
          COALESCE(SUM(sotuv), 0)          AS total_sotuv,
          COALESCE(SUM(tolov), 0)          AS total_tolov,
          COALESCE(SUM(overdue), 0)        AS total_overdue,
          COALESCE(SUM(bucket_90_plus), 0) AS total_over_90,
          COALESCE(SUM(opening_debt), 0)   AS total_opening_debt,
          COALESCE(SUM(opening_credit), 0) AS total_opening_credit
        FROM base WHERE {where_tail}
    """
    summary = (await session.execute(text(summary_sql), params)).mappings().one()

    return {
        "rows": [_jsonify_mapping(r) for r in rows],
        "total": total,
        "summary": _jsonify_mapping(summary),
        "default_term_days": int(DEFAULT_TERM_DAYS),
    }


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
