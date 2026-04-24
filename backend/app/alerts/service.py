"""Alerts service — evaluator + CRUD helpers.

Evaluator design: for each enabled rule, compute the current value of
the underlying measure (DSO, total outstanding, max single debtor,
count of 90+ debtors) once per evaluation cycle, and if the current
value crosses the threshold AND there is no unread event for the
same rule within the last 6 hours, create a new event.

The 6-hour debounce prevents "alert storm" when a metric oscillates
around the threshold between two evaluations."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


DEBOUNCE_HOURS = 6


KIND_LABELS: dict[str, str] = {
    "dso_gt":              "DSO exceeds",
    "debt_total_gt":       "Total outstanding exceeds",
    "single_debtor_gt":    "Any single debtor exceeds",
    "over_90_count_gt":    "Debtors over 90 days exceeds",
    "revenue_drop_pct":    "Revenue (30d vs prior 30d) drop exceeds",
    "deal_count_drop_pct": "Deal count (30d vs prior 30d) drop exceeds",
}


async def current_value(session: AsyncSession, kind: str) -> float | None:
    if kind == "dso_gt":
        row = (await session.execute(text("""
            SELECT COALESCE(
              SUM( (p.payment_date::date - pv.prev_delivery)::numeric * p.amount )
                / NULLIF(SUM(p.amount), 0), 0)::numeric(18,2) AS dso
              FROM smartup_rep.payment p
              JOIN smartup_rep.legal_person lp ON lp.person_id = p.person_id
              LEFT JOIN LATERAL (
                SELECT MAX(d2.delivery_date) AS prev_delivery
                  FROM smartup_rep.deal_order d2
                 WHERE d2.person_id = p.person_id::text
                   AND d2.delivery_date <= p.payment_date::date
              ) pv ON TRUE
             WHERE p.payment_date >= (CURRENT_DATE - INTERVAL '12 months')
               AND pv.prev_delivery IS NOT NULL
        """))).mappings().first()
        return float(row["dso"] or 0) if row else None
    if kind == "debt_total_gt":
        row = (await session.execute(text("""
            WITH o AS (SELECT person_id, SUM(product_amount) inv FROM smartup_rep.deal_order
                        WHERE person_id IS NOT NULL GROUP BY 1),
                 p AS (SELECT person_id::text pid, SUM(amount) paid FROM smartup_rep.payment
                        WHERE person_id IS NOT NULL GROUP BY 1)
            SELECT COALESCE(SUM(
              CASE WHEN (COALESCE(o.inv,0) - COALESCE(p.paid,0)) > 1
                   THEN (COALESCE(o.inv,0) - COALESCE(p.paid,0)) ELSE 0 END
            ), 0)::numeric(18,2) AS total
              FROM smartup_rep.legal_person lp
              LEFT JOIN o ON o.person_id = lp.person_id::text
              LEFT JOIN p ON p.pid = lp.person_id::text
        """))).mappings().first()
        return float(row["total"] or 0) if row else None
    if kind == "single_debtor_gt":
        row = (await session.execute(text("""
            WITH o AS (SELECT person_id, SUM(product_amount) inv FROM smartup_rep.deal_order
                        WHERE person_id IS NOT NULL GROUP BY 1),
                 p AS (SELECT person_id::text pid, SUM(amount) paid FROM smartup_rep.payment
                        WHERE person_id IS NOT NULL GROUP BY 1)
            SELECT COALESCE(MAX(
              CASE WHEN (COALESCE(o.inv,0) - COALESCE(p.paid,0)) > 1
                   THEN (COALESCE(o.inv,0) - COALESCE(p.paid,0)) ELSE 0 END
            ), 0)::numeric(18,2) AS m
              FROM smartup_rep.legal_person lp
              LEFT JOIN o ON o.person_id = lp.person_id::text
              LEFT JOIN p ON p.pid = lp.person_id::text
        """))).mappings().first()
        return float(row["m"] or 0) if row else None
    if kind in ("revenue_drop_pct", "deal_count_drop_pct"):
        # Compare last 30 days vs prior 30 days. Drop percentage is
        # always positive: (prior - current) / prior when current < prior;
        # zero otherwise. Fires when the drop exceeds the threshold
        # (stored as percentage, e.g. 15 = 15%).
        sum_col = "SUM(d.product_amount)" if kind == "revenue_drop_pct" \
            else "COUNT(DISTINCT d.deal_id)"
        row = (await session.execute(text(f"""
            WITH w AS (
              SELECT 'current' AS lbl, (CURRENT_DATE - INTERVAL '30 days')::date AS s,
                     CURRENT_DATE AS e
              UNION ALL
              SELECT 'prior', (CURRENT_DATE - INTERVAL '60 days')::date,
                     (CURRENT_DATE - INTERVAL '31 days')::date
            )
            SELECT w.lbl, COALESCE({sum_col}, 0)::numeric(18,2) AS v
              FROM w
              LEFT JOIN smartup_rep.deal_order d
                ON d.delivery_date BETWEEN w.s AND w.e
             GROUP BY w.lbl
        """))).mappings().all()
        by = {r["lbl"]: float(r["v"]) for r in row}
        prior = by.get("prior", 0)
        current = by.get("current", 0)
        if prior <= 0:
            return 0.0
        drop_pct = ((prior - current) / prior) * 100.0
        return max(0.0, drop_pct)

    if kind == "over_90_count_gt":
        row = (await session.execute(text("""
            WITH o AS (SELECT person_id, SUM(product_amount) inv, MAX(delivery_date) lo
                        FROM smartup_rep.deal_order WHERE person_id IS NOT NULL GROUP BY 1),
                 p AS (SELECT person_id::text pid, SUM(amount) paid,
                              MAX(payment_date)::date lp
                        FROM smartup_rep.payment WHERE person_id IS NOT NULL GROUP BY 1)
            SELECT COUNT(*) AS n
              FROM smartup_rep.legal_person lp
              LEFT JOIN o ON o.person_id = lp.person_id::text
              LEFT JOIN p ON p.pid = lp.person_id::text
             WHERE (COALESCE(o.inv,0) - COALESCE(p.paid,0)) > 1
               AND (p.lp IS NULL OR p.lp < CURRENT_DATE - INTERVAL '90 days')
               AND (o.lo IS NULL OR o.lo < CURRENT_DATE - INTERVAL '90 days')
        """))).mappings().first()
        return float(row["n"] or 0) if row else None
    return None


async def evaluate_rules(session: AsyncSession) -> int:
    """Walk every enabled rule, compute current value, fire events for
    crossings (with 6-hour debounce). Returns number of events created."""
    rules = (await session.execute(text("""
        SELECT id, user_id, kind, threshold, label, enabled
          FROM app.alert_rule WHERE enabled = TRUE
    """))).mappings().all()
    if not rules:
        return 0

    # Cache current-value per kind to avoid duplicate queries if multiple
    # users subscribe to the same kind with different thresholds.
    values_by_kind: dict[str, float | None] = {}
    for r in rules:
        k = r["kind"]
        if k not in values_by_kind:
            values_by_kind[k] = await current_value(session, k)

    created = 0
    now = datetime.now(timezone.utc)
    for r in rules:
        v = values_by_kind.get(r["kind"])
        if v is None:
            continue
        if v <= float(r["threshold"]):
            continue
        # Debounce: skip if there's an event for this rule in the last N hours
        last = (await session.execute(text("""
            SELECT triggered_at FROM app.alert_event
             WHERE rule_id = :rid
             ORDER BY triggered_at DESC LIMIT 1
        """), {"rid": r["id"]})).mappings().first()
        if last:
            last_dt = last["triggered_at"]
            if isinstance(last_dt, datetime) and (now - last_dt) < timedelta(hours=DEBOUNCE_HOURS):
                continue
        label = r["label"] or KIND_LABELS.get(r["kind"], r["kind"])
        message = f"{label} {r['threshold']:.0f} (current {v:.1f})"
        await session.execute(text("""
            INSERT INTO app.alert_event (rule_id, triggered_at, value, message)
            VALUES (:rid, now(), :v, :m)
        """), {"rid": r["id"], "v": v, "m": message})
        created += 1
    if created:
        await session.commit()
    return created
