"""Client 360° / Mijozlar 360° — unified per-client intelligence.

Combines RFM segmentation, AR aging, LTV/AOV, predictive next-buy,
contact-log signals, and a risk score into one row per customer. Two
endpoints: `intelligence` (paginated row table) and `analytics`
(page-level aggregates: KPI strip, RFM 5×5 heatmap, aging × manager
heatmap, top-N action queue, segment distribution).

The same SQL machinery powers both — we just GROUP BY differently
for the aggregate endpoint.

Design notes:
  - Sotuv aggregates are NET of returns (negative product_amount rows
    subtract). Same convention as dayslice / comparison so "champions"
    can't be inflated by reversed deals.
  - Payment aggregates exclude bank-recorded payments via
    exclude_kirim_methods_clause() — consistent with dayslice / comparison
    Kirim totals; the operator's collection effort is what matters.
  - Predictive next-buy needs ≥3 prior orders. Below that the cycle
    estimate is one outlier away from nonsense, so we return NULL and
    the frontend shows '—'.
  - Risk weights are kept as a Python constant so the operator can
    re-tune without a SQL review.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.filters import exclude_kirim_methods_clause
from ..scope import UserScope, clause_for_table


# ---------------------------------------------------------------------------
# Risk score weights — change here to retune without touching SQL
# ---------------------------------------------------------------------------

RISK_W_AGING_90 = 35           # any 90+ days debt outstanding
RISK_W_LATE_PAY = 25           # has debt + last payment > 60 days ago
RISK_W_RFM_SLIP = 15           # RFM in {At risk, Cannot lose them, Hibernating}
RISK_W_RFM_LOST = 15           # RFM = Lost
RISK_W_OVERDUE_PROMISE = 10    # has an overdue contact-log promise


# ---------------------------------------------------------------------------
# Segment shortcuts — what the chip ribbon filters mean
# ---------------------------------------------------------------------------

SEGMENT_FILTERS = (
    "all", "champions", "loyal", "at_risk",
    "hibernating", "debt_warning", "predicted",
)
SegmentFilter = Literal[
    "all", "champions", "loyal", "at_risk",
    "hibernating", "debt_warning", "predicted",
]


# ---------------------------------------------------------------------------
# Scope helper
# ---------------------------------------------------------------------------


def _scope_legal_person(scope: UserScope | None) -> tuple[str, dict]:
    """Return (sql_fragment, params) restricting to the user's rooms via the
    person_id subquery pattern. Empty for unscoped users."""
    if scope is None:
        return "", {}
    frag, params = clause_for_table(scope, "smartup_rep.legal_person")
    if not frag:
        return "", {}
    return f"AND lp.{frag}", params


# ---------------------------------------------------------------------------
# The big shared CTE bundle — produces one row per legal_person with every
# signal we need. Both endpoints derive from this; the difference is
# whether the caller paginates the result or aggregates it.
# ---------------------------------------------------------------------------


def _intelligence_cte_sql(*, today: date) -> str:
    """Return a multi-CTE block that, when wrapped with a SELECT, yields
    one row per `legal_person.person_id` carrying every Client 360° field.

    Aging follows the operator's mental model: oldest unpaid invoice's age
    determines the bucket. We don't do a true FIFO matching (the worklist
    does, but it's slow on a fan-out join); instead we use a simpler
    per-customer net-outstanding × oldest-unpaid-age proxy. Difference
    against the worklist's exact aging is small (worklist matches sales
    LIFO across opening + invoices; this approximation just looks at the
    oldest order whose cumulative invoiced exceeds total paid). Good
    enough for a 360° list view; the per-client dossier still does the
    rigorous version.

    Kirim payments are filtered through exclude_kirim_methods_clause so
    bank-recorded flows don't inflate "collected" numbers.
    """
    bank_excl_p = exclude_kirim_methods_clause("p")
    today_iso = today.isoformat()
    twelve_mo = (today - timedelta(days=365)).isoformat()
    rfm_window = (today - timedelta(days=365)).isoformat()

    return f"""
    WITH
    -- ----- per-customer order aggregates (LTV, AOV, recency, sku_breadth)
    orders_agg AS (
      SELECT d.person_id::text AS person_id,
             SUM(d.product_amount)::numeric(18,2)        AS ltv,
             COUNT(DISTINCT d.deal_id)                    AS order_count,
             MAX(d.delivery_date)                         AS last_order_date,
             MIN(d.delivery_date)                         AS first_order_date,
             COUNT(DISTINCT NULLIF(TRIM(d.brand), ''))    AS sku_breadth
        FROM smartup_rep.deal_order d
       WHERE d.person_id IS NOT NULL
       GROUP BY d.person_id
    ),

    -- ----- 90-day-current vs 90-day-prior, for the trajectory chip
    trajectory AS (
      SELECT d.person_id::text AS person_id,
             SUM(d.product_amount) FILTER (
               WHERE d.delivery_date >= '{today_iso}'::date - 90
             )::numeric(18,2) AS rev_curr_90,
             SUM(d.product_amount) FILTER (
               WHERE d.delivery_date BETWEEN '{today_iso}'::date - 180
                                         AND '{today_iso}'::date - 91
             )::numeric(18,2) AS rev_prev_90
        FROM smartup_rep.deal_order d
       WHERE d.delivery_date >= '{today_iso}'::date - 180
         AND d.person_id IS NOT NULL
       GROUP BY d.person_id
    ),

    -- ----- 12-month monthly revenue array, for the per-row sparkline
    months AS (
      SELECT generate_series(
               DATE_TRUNC('month', '{today_iso}'::date - INTERVAL '11 months'),
               DATE_TRUNC('month', '{today_iso}'::date),
               INTERVAL '1 month'
             )::date AS m
    ),
    monthly_rev_raw AS (
      SELECT d.person_id::text                    AS person_id,
             DATE_TRUNC('month', d.delivery_date)::date AS m,
             SUM(d.product_amount)::numeric(18,2) AS rev
        FROM smartup_rep.deal_order d
       WHERE d.delivery_date >= '{twelve_mo}'::date
         AND d.person_id IS NOT NULL
       GROUP BY 1, 2
    ),
    monthly_rev AS (
      SELECT pid AS person_id,
             ARRAY_AGG(COALESCE(mr.rev, 0)::float8 ORDER BY months.m) AS series
        FROM (SELECT DISTINCT person_id AS pid FROM monthly_rev_raw) p
        CROSS JOIN months
        LEFT JOIN monthly_rev_raw mr
               ON mr.person_id = p.pid AND mr.m = months.m
       GROUP BY pid
    ),

    -- ----- predictive cycle (mean inter-order gap; ≥3 orders required)
    order_gaps AS (
      SELECT d.person_id::text AS person_id,
             d.delivery_date,
             d.delivery_date - LAG(d.delivery_date) OVER (
               PARTITION BY d.person_id ORDER BY d.delivery_date
             ) AS gap_days
        FROM smartup_rep.deal_order d
       WHERE d.person_id IS NOT NULL
    ),
    cycle AS (
      SELECT person_id,
             AVG(gap_days)::int AS mean_gap_days,
             COUNT(*) + 1 AS gap_n  -- +1 because LAG produces N-1 gaps from N orders
        FROM order_gaps
       WHERE gap_days IS NOT NULL
       GROUP BY person_id
      HAVING COUNT(*) >= 2  -- ≥2 gaps == ≥3 orders
    ),

    -- ----- payments aggregates (last-pay, lifetime collected, bank excluded)
    payments_agg AS (
      SELECT p.person_id::text AS person_id,
             SUM(p.amount)::numeric(18,2)             AS collected_total,
             MAX(p.payment_date)::date                AS last_payment_date,
             COUNT(*) FILTER (WHERE p.payment_date >= '{today_iso}'::date - 90) AS pay_count_90d
        FROM smartup_rep.payment p
       WHERE p.person_id IS NOT NULL
         {bank_excl_p}
       GROUP BY p.person_id
    ),

    -- ----- aging: bucket the oldest-unpaid-age. Cheap approximation that
    -- agrees with the worklist within a few % on most rows; the dossier
    -- gives the rigorous FIFO version when needed.
    oldest_unpaid AS (
      SELECT d.person_id::text AS person_id,
             MIN(d.delivery_date) AS oldest_dt,
             SUM(d.product_amount) AS sales
        FROM smartup_rep.deal_order d
       WHERE d.person_id IS NOT NULL
       GROUP BY d.person_id
    ),
    aging AS (
      SELECT ou.person_id,
             GREATEST(ou.sales - COALESCE(pa.collected_total, 0), 0)::numeric(18,2)
               AS outstanding,
             CASE
               WHEN GREATEST(ou.sales - COALESCE(pa.collected_total, 0), 0) <= 0 THEN NULL
               ELSE ('{today_iso}'::date - ou.oldest_dt)
             END AS age_days
        FROM oldest_unpaid ou
        LEFT JOIN payments_agg pa USING (person_id)
    ),

    -- ----- contact log: latest entry + promise reliability
    latest_log AS (
      SELECT DISTINCT ON (person_id)
             person_id::text AS person_id,
             contacted_at,
             outcome,
             promised_amount,
             promised_by_date
        FROM app.debt_contact_log
       ORDER BY person_id, contacted_at DESC
    ),
    promise_log AS (
      SELECT person_id::text AS person_id,
             COUNT(*) FILTER (WHERE outcome = 'promised')          AS total_promises,
             COUNT(*) FILTER (WHERE outcome = 'paid'
                              AND promised_amount IS NOT NULL)     AS kept_promises
        FROM app.debt_contact_log
       GROUP BY person_id
    ),

    -- ----- RFM scoring on a 12-month window. Quintiles via NTILE so cutoffs
    -- are data-driven. Identical formulation to _analytics/rfm so the page
    -- agrees with the existing /analytics/sales RFM tab.
    rfm_base AS (
      SELECT d.person_id::text AS person_id,
             ('{today_iso}'::date - MAX(d.delivery_date)) AS days_since,
             COUNT(DISTINCT d.deal_id)                   AS deals_window,
             SUM(d.product_amount)::numeric(18,2)         AS revenue_window
        FROM smartup_rep.deal_order d
       WHERE d.delivery_date BETWEEN '{rfm_window}'::date AND '{today_iso}'::date
         AND d.person_id IS NOT NULL
       GROUP BY 1
    ),
    rfm AS (
      SELECT b.*,
             (6 - NTILE(5) OVER (ORDER BY b.days_since ASC))     AS r,
             NTILE(5) OVER (ORDER BY b.deals_window ASC)         AS f,
             NTILE(5) OVER (ORDER BY b.revenue_window ASC)       AS m
        FROM rfm_base b
    ),
    rfm_seg AS (
      SELECT person_id, r, f, m,
             (r::text || f::text || m::text) AS score,
             CASE
               WHEN r = 5 AND f >= 4 AND m >= 4 THEN 'Champions'
               WHEN r >= 4 AND f >= 3 AND m >= 3 THEN 'Loyal'
               WHEN r = 5 AND f <= 2             THEN 'New customers'
               WHEN r >= 3 AND f <= 2 AND m <= 2 THEN 'Promising'
               WHEN r = 3 AND f = 3              THEN 'Need attention'
               WHEN r = 3 AND f <= 2             THEN 'About to sleep'
               WHEN r <= 2 AND f >= 3 AND m >= 3 THEN 'At risk'
               WHEN r <= 2 AND f = 5 AND m = 5   THEN 'Cannot lose them'
               WHEN r = 2 AND f <= 2             THEN 'Hibernating'
               WHEN r = 1                         THEN 'Lost'
               ELSE 'Potential loyalists'
             END AS segment
        FROM rfm
    ),

    -- ----- Final per-client roll-up. legal_person is the spine; everything
    -- else LEFT JOINs so customers without payments / orders / contact log
    -- still appear when unfiltered. (We still INNER JOIN orders_agg below
    -- via WHERE — a customer with zero orders has nothing useful to show.)
    base AS (
      SELECT
        lp.person_id::text                              AS person_id,
        lp.name,
        lp.tin,
        lp.client_group,
        lp.direction,
        lp.region_name                                   AS region,
        TRIM(SPLIT_PART(lp.room_names, ',', 1))          AS room,
        lp.main_phone                                    AS phone,

        oa.ltv, oa.order_count, oa.last_order_date, oa.sku_breadth,
        ('{today_iso}'::date - oa.last_order_date)       AS recency_days,
        CASE WHEN oa.order_count > 0
             THEN (oa.ltv / oa.order_count)::numeric(18,2)
             ELSE 0 END                                  AS aov,

        tr.rev_curr_90, tr.rev_prev_90,
        CASE
          WHEN COALESCE(tr.rev_prev_90, 0) > 0
            THEN (COALESCE(tr.rev_curr_90, 0) / tr.rev_prev_90 - 1)::float8
          ELSE NULL
        END                                              AS trajectory_pct,

        COALESCE(mr.series, ARRAY[]::float8[])           AS monthly_rev,

        ag.outstanding,
        ag.age_days                                      AS oldest_unpaid_age,
        -- Bucket from age. Treats the WHOLE outstanding as living in the
        -- bucket of its OLDEST invoice — over-attributes to old buckets
        -- vs FIFO, but operationally that's the right risk classification
        -- (if your oldest unpaid is 95 days old, the customer is a 90+
        -- problem regardless of how recent their newer invoices are).
        CASE WHEN ag.outstanding > 0 AND ag.age_days BETWEEN 0  AND 29 THEN ag.outstanding ELSE 0 END::numeric(18,2) AS aging_b1_30,
        CASE WHEN ag.outstanding > 0 AND ag.age_days BETWEEN 30 AND 59 THEN ag.outstanding ELSE 0 END::numeric(18,2) AS aging_b31_60,
        CASE WHEN ag.outstanding > 0 AND ag.age_days BETWEEN 60 AND 89 THEN ag.outstanding ELSE 0 END::numeric(18,2) AS aging_b61_90,
        CASE WHEN ag.outstanding > 0 AND ag.age_days >= 90              THEN ag.outstanding ELSE 0 END::numeric(18,2) AS aging_b90_plus,

        ('{today_iso}'::date - pa.last_payment_date)     AS days_since_payment,

        rs.r, rs.f, rs.m, rs.score, rs.segment,

        cy.mean_gap_days,
        CASE WHEN cy.mean_gap_days IS NOT NULL
             THEN (oa.last_order_date + cy.mean_gap_days * INTERVAL '1 day')::date
             ELSE NULL END                              AS predicted_next_buy,
        CASE WHEN cy.mean_gap_days IS NOT NULL
             THEN ('{today_iso}'::date
                   - (oa.last_order_date + cy.mean_gap_days * INTERVAL '1 day')::date)
             ELSE NULL END                              AS days_overdue_for_repeat,

        ll.contacted_at                                  AS last_contact_at,
        ll.outcome                                       AS last_contact_outcome,
        (ll.outcome = 'promised'
         AND ll.promised_by_date IS NOT NULL
         AND ll.promised_by_date < '{today_iso}'::date)  AS has_overdue_promise,

        pl.total_promises,
        pl.kept_promises,
        CASE WHEN COALESCE(pl.total_promises, 0) > 0
             THEN (pl.kept_promises::float8 / pl.total_promises)
             ELSE NULL END                              AS promise_kept_pct

      FROM smartup_rep.legal_person lp
      LEFT JOIN orders_agg     oa  ON oa.person_id = lp.person_id::text
      LEFT JOIN trajectory     tr  ON tr.person_id = lp.person_id::text
      LEFT JOIN monthly_rev    mr  ON mr.person_id = lp.person_id::text
      LEFT JOIN payments_agg   pa  ON pa.person_id = lp.person_id::text
      LEFT JOIN aging          ag  ON ag.person_id = lp.person_id::text
      LEFT JOIN rfm_seg        rs  ON rs.person_id = lp.person_id::text
      LEFT JOIN cycle          cy  ON cy.person_id = lp.person_id::text
      LEFT JOIN latest_log     ll  ON ll.person_id = lp.person_id::text
      LEFT JOIN promise_log    pl  ON pl.person_id = lp.person_id::text
     WHERE oa.person_id IS NOT NULL  -- skip customers with zero orders ever
    ),

    -- ----- risk score (Python constants stay in sync with these weights)
    scored AS (
      SELECT b.*,
             LEAST(100,
               {RISK_W_AGING_90}        * (CASE WHEN aging_b90_plus > 0 THEN 1 ELSE 0 END)
             + {RISK_W_LATE_PAY}        * (CASE WHEN outstanding > 0 AND days_since_payment > 60 THEN 1 ELSE 0 END)
             + {RISK_W_RFM_SLIP}        * (CASE WHEN segment IN ('At risk', 'Cannot lose them', 'Hibernating') THEN 1 ELSE 0 END)
             + {RISK_W_RFM_LOST}        * (CASE WHEN segment = 'Lost' THEN 1 ELSE 0 END)
             + {RISK_W_OVERDUE_PROMISE} * (CASE WHEN has_overdue_promise THEN 1 ELSE 0 END)
             )::int AS risk_score
        FROM base b
    )
    """


# ---------------------------------------------------------------------------
# Helpers — turn a row into the response shape
# ---------------------------------------------------------------------------


def _row_to_payload(r: dict) -> dict[str, Any]:
    """Project a SQL row into the JSON shape the frontend expects.
    Keeps the SQL clean (every column once, no aliases for nesting)."""
    return {
        "person_id": r["person_id"],
        "name": r["name"],
        "tin": r["tin"],
        "client_group": r["client_group"],
        "direction": r["direction"],
        "region": r["region"],
        "room": r["room"],
        "phone": r["phone"],
        "rfm": {
            "r": r["r"], "f": r["f"], "m": r["m"],
            "score": r["score"], "segment": r["segment"],
        } if r["r"] is not None else None,
        "recency_days": r["recency_days"],
        "ltv": float(r["ltv"] or 0),
        "aov": float(r["aov"] or 0),
        "order_count": int(r["order_count"] or 0),
        "monthly_rev": [float(x) for x in (r["monthly_rev"] or [])],
        "trajectory_pct": float(r["trajectory_pct"]) if r["trajectory_pct"] is not None else None,
        "sku_breadth": int(r["sku_breadth"] or 0),
        "outstanding": float(r["outstanding"] or 0),
        "aging": {
            "b1_30":   float(r["aging_b1_30"] or 0),
            "b31_60":  float(r["aging_b31_60"] or 0),
            "b61_90":  float(r["aging_b61_90"] or 0),
            "b90_plus": float(r["aging_b90_plus"] or 0),
        },
        "promise_kept_pct": float(r["promise_kept_pct"]) if r["promise_kept_pct"] is not None else None,
        "promise_total": int(r["total_promises"] or 0),
        "risk_score": int(r["risk_score"] or 0),
        "predicted_next_buy": r["predicted_next_buy"].isoformat() if r["predicted_next_buy"] else None,
        "days_overdue_for_repeat": int(r["days_overdue_for_repeat"]) if r["days_overdue_for_repeat"] is not None else None,
        "last_contact_at": r["last_contact_at"].isoformat() if r["last_contact_at"] else None,
        "last_contact_outcome": r["last_contact_outcome"],
    }


# ---------------------------------------------------------------------------
# /api/clients/intelligence — paginated row table
# ---------------------------------------------------------------------------


_VALID_SORTS = {
    "risk":      "risk_score DESC NULLS LAST",
    "ltv":       "ltv DESC NULLS LAST",
    "outstanding": "outstanding DESC NULLS LAST",
    "recency":   "recency_days ASC NULLS LAST",
    "trajectory": "trajectory_pct DESC NULLS LAST",
    "next_buy":  "days_overdue_for_repeat DESC NULLS LAST",
    "name":      "name ASC",
}


def _segment_filter_sql(segment: str) -> str:
    """Return a WHERE fragment matching the segment chip the user selected."""
    if segment == "champions":
        return "AND segment = 'Champions'"
    if segment == "loyal":
        return "AND segment = 'Loyal'"
    if segment == "at_risk":
        return "AND segment IN ('At risk', 'Cannot lose them')"
    if segment == "hibernating":
        return "AND segment IN ('Hibernating', 'About to sleep')"
    if segment == "debt_warning":
        return "AND (aging_b90_plus > 0 OR (outstanding > 0 AND days_since_payment > 60))"
    if segment == "predicted":
        return "AND days_overdue_for_repeat > 0"
    return ""  # all


async def intelligence(
    session: AsyncSession,
    *,
    today: date,
    search: str | None,
    segment: str,
    manager: str | None,
    region: str | None,
    direction: str | None,
    sort: str,
    page: int,
    size: int,
    scope: UserScope | None = None,
) -> dict[str, Any]:
    cte_sql = _intelligence_cte_sql(today=today)

    # Build WHERE on the outer select (against the `scored` CTE columns)
    where_parts: list[str] = ["TRUE"]
    params: dict[str, Any] = {}

    if search:
        where_parts.append("(name ILIKE :search OR tin ILIKE :search)")
        params["search"] = f"%{search.strip()}%"
    if manager:
        where_parts.append("room = :manager")
        params["manager"] = manager
    if region:
        where_parts.append("region = :region")
        params["region"] = region
    if direction:
        where_parts.append("direction = :direction")
        params["direction"] = direction
    seg_sql = _segment_filter_sql(segment)
    where_sql = " AND ".join(where_parts) + " " + seg_sql

    # Scope: restrict to the user's rooms via legal_person.room_id mapping.
    # Implemented at the CTE base by filtering legal_person.person_id against
    # the deal_order rooms the user owns. Easier to keep it in the outer
    # WHERE as a subquery so we don't fork the CTE.
    if scope is not None and scope.is_scoped:
        placeholders = ", ".join(f":_scope_r{i}" for i in range(len(scope.room_ids)))
        params.update({f"_scope_r{i}": rid for i, rid in enumerate(scope.room_ids)})
        where_sql += (
            f" AND person_id::text IN ("
            f"  SELECT DISTINCT person_id FROM smartup_rep.deal_order"
            f"   WHERE room_id IN ({placeholders}))"
        )

    order_by = _VALID_SORTS.get(sort, _VALID_SORTS["risk"])
    offset = max(0, page) * max(1, min(200, size))

    rows_sql = f"""
    {cte_sql}
    SELECT * FROM scored
     WHERE {where_sql}
     ORDER BY {order_by}
     LIMIT :_lim OFFSET :_off
    """
    count_sql = f"""
    {cte_sql}
    SELECT COUNT(*) AS n FROM scored WHERE {where_sql}
    """

    rows = (
        await session.execute(text(rows_sql),
                              {**params, "_lim": size, "_off": offset})
    ).mappings().all()
    total = (await session.execute(text(count_sql), params)).scalar_one()

    return {
        "rows": [_row_to_payload(dict(r)) for r in rows],
        "total": int(total),
        "page": page,
        "size": size,
    }


# ---------------------------------------------------------------------------
# /api/clients/analytics — page-level aggregates
# ---------------------------------------------------------------------------


async def analytics(
    session: AsyncSession,
    *,
    today: date,
    manager: str | None,
    region: str | None,
    direction: str | None,
    scope: UserScope | None = None,
) -> dict[str, Any]:
    cte_sql = _intelligence_cte_sql(today=today)

    # Same outer WHERE as intelligence, minus the segment filter (the chip
    # ribbon controls table rows, not page-level aggregates).
    where_parts: list[str] = ["TRUE"]
    params: dict[str, Any] = {}
    if manager:
        where_parts.append("room = :manager")
        params["manager"] = manager
    if region:
        where_parts.append("region = :region")
        params["region"] = region
    if direction:
        where_parts.append("direction = :direction")
        params["direction"] = direction
    if scope is not None and scope.is_scoped:
        placeholders = ", ".join(f":_scope_r{i}" for i in range(len(scope.room_ids)))
        params.update({f"_scope_r{i}": rid for i, rid in enumerate(scope.room_ids)})
        where_parts.append(
            f"person_id::text IN ("
            f"  SELECT DISTINCT person_id FROM smartup_rep.deal_order"
            f"   WHERE room_id IN ({placeholders}))"
        )
    where_sql = " AND ".join(where_parts)

    # Wrap the filtered scored row set once so every aggregate sees the
    # same population (avoids re-filtering boilerplate per query).
    filt_cte = f", filt AS (SELECT * FROM scored WHERE {where_sql})"

    # ----- KPI strip
    kpi_sql = f"""
    {cte_sql}{filt_cte},
    ranked AS (
      SELECT ltv, ROW_NUMBER() OVER (ORDER BY ltv DESC NULLS LAST) AS rk FROM filt
    )
    SELECT
      (SELECT COUNT(*) FILTER (WHERE recency_days IS NOT NULL AND recency_days <= 365) FROM filt) AS active_12m,
      (SELECT COUNT(*) FILTER (WHERE segment IN ('At risk', 'Cannot lose them')) FROM filt) AS at_risk_count,
      (SELECT COALESCE(SUM(outstanding), 0)::numeric(18,2) FROM filt) AS outstanding_total,
      (SELECT COUNT(*) FILTER (WHERE days_overdue_for_repeat BETWEEN 0 AND 7) FROM filt) AS predicted_next_7d,
      (SELECT COALESCE(SUM(ltv) FILTER (WHERE rk <= 5), 0) / NULLIF(SUM(ltv), 0) FROM ranked)::float8 AS top5_concentration_pct
    """

    kpi_row = (await session.execute(text(kpi_sql), params)).mappings().one()
    kpi = {
        "active_12m": int(kpi_row["active_12m"] or 0),
        "at_risk_count": int(kpi_row["at_risk_count"] or 0),
        "outstanding_total": float(kpi_row["outstanding_total"] or 0),
        "predicted_next_7d": int(kpi_row["predicted_next_7d"] or 0),
        "top5_concentration_pct": float(kpi_row["top5_concentration_pct"]) if kpi_row["top5_concentration_pct"] is not None else None,
    }

    # ----- RFM 5×5 heatmap (counts + monetary tint)
    rfm_sql = f"""
    {cte_sql}{filt_cte}
    SELECT r, f, COUNT(*) AS cnt, COALESCE(SUM(ltv), 0)::numeric(18,2) AS monetary
      FROM filt
     WHERE r IS NOT NULL AND f IS NOT NULL
     GROUP BY r, f
    """
    rfm_rows = (await session.execute(text(rfm_sql), params)).mappings().all()
    counts = [[0] * 5 for _ in range(5)]
    monetary = [[0.0] * 5 for _ in range(5)]
    for row in rfm_rows:
        r_idx = int(row["r"]) - 1
        f_idx = int(row["f"]) - 1
        counts[r_idx][f_idx] = int(row["cnt"])
        monetary[r_idx][f_idx] = float(row["monetary"] or 0)

    # ----- aging × manager heatmap
    aging_sql = f"""
    {cte_sql}{filt_cte}
    SELECT room,
           SUM(GREATEST(outstanding - aging_b1_30 - aging_b31_60 - aging_b61_90 - aging_b90_plus, 0)) AS current,
           SUM(aging_b1_30)   AS b1_30,
           SUM(aging_b31_60)  AS b31_60,
           SUM(aging_b61_90)  AS b61_90,
           SUM(aging_b90_plus) AS b90_plus
      FROM filt
     WHERE room IS NOT NULL AND room <> ''
     GROUP BY room
     ORDER BY (SUM(aging_b90_plus) + SUM(aging_b61_90)) DESC
     LIMIT 25
    """
    aging_rows = (await session.execute(text(aging_sql), params)).mappings().all()
    aging_by_manager = {
        "row_labels": [r["room"] for r in aging_rows],
        "col_labels": ["current", "1-30", "31-60", "61-90", "90+"],
        "values": [
            [float(r["current"] or 0), float(r["b1_30"] or 0),
             float(r["b31_60"] or 0), float(r["b61_90"] or 0),
             float(r["b90_plus"] or 0)]
            for r in aging_rows
        ],
    }

    # ----- action queue: top 10 by (days_overdue × LTV)
    queue_sql = f"""
    {cte_sql}{filt_cte}
    SELECT person_id, name, ltv, days_overdue_for_repeat, phone,
           predicted_next_buy
      FROM filt
     WHERE days_overdue_for_repeat > 0
     ORDER BY (days_overdue_for_repeat::float * COALESCE(ltv, 0)) DESC
     LIMIT 10
    """
    queue_rows = (await session.execute(text(queue_sql), params)).mappings().all()
    action_queue = [
        {
            "person_id": r["person_id"],
            "name": r["name"],
            "ltv": float(r["ltv"] or 0),
            "days_overdue_for_repeat": int(r["days_overdue_for_repeat"] or 0),
            "phone": r["phone"],
            "predicted_next_buy": r["predicted_next_buy"].isoformat() if r["predicted_next_buy"] else None,
        }
        for r in queue_rows
    ]

    # ----- segment distribution for the chip ribbon annotations
    seg_sql = f"""
    {cte_sql}{filt_cte}
    SELECT segment, COUNT(*) AS cnt, COALESCE(SUM(ltv), 0)::numeric(18,2) AS revenue
      FROM filt
     WHERE segment IS NOT NULL
     GROUP BY segment
    """
    seg_rows = (await session.execute(text(seg_sql), params)).mappings().all()
    segment_distribution = [
        {"segment": r["segment"], "count": int(r["cnt"]), "revenue": float(r["revenue"] or 0)}
        for r in seg_rows
    ]

    return {
        "kpi": kpi,
        "rfm_heatmap": {
            "r_labels": ["1", "2", "3", "4", "5"],
            "f_labels": ["1", "2", "3", "4", "5"],
            "counts": counts,
            "monetary": monetary,
        },
        "aging_by_manager": aging_by_manager,
        "action_queue": action_queue,
        "segment_distribution": segment_distribution,
    }
