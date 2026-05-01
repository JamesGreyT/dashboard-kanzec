"""Client 360° / Mijozlar 360° — persona-based per-client intelligence.

The page is table-only: a single paginated row table indexed by **persona**
(10 archetypes that map to operator action) plus the row's signal stack
(LTV, recency, debt, aging, predicted next-buy, last contact).

Persona resolution is mutually exclusive — the **highest urgency** persona
wins. Resolution order (top-down):

  1. debt_trap          — has any 90+ day overdue debt          → Escalate
  2. whale_at_risk      — top-decile LTV + recency > 60 days    → Call now
  3. lost               — last order > 365 days ago             → Archive
  4. sleeping           — historically active, gone 181-365 d   → Win-back
  5. one_hit            — exactly 1 lifetime order, > 180 days  → Reactivate
  6. rookie             — ≤3 lifetime orders, first ≤ 90 d ago  → Nurture
  7. champion           — top-decile LTV, recent (≤45 d), ≥4 ord → Retain
  8. loyal              — ≥6 orders + recent (≤45 d)            → Upsell
  9. bulk               — ≤3 orders BUT top-decile LTV          → Invest
 10. regular            — anyone else                            → Maintain

Sotuv aggregates are NET of returns. Bank payments are excluded from
"collected" via exclude_kirim_methods_clause(). Risk score (0-100) is a
composite signal — used as a sort key + filter ("high risk only"), but
not surfaced as a row visualization.

Two endpoints:

  GET /api/clients/intelligence   — paginated rows + persona_counts
  GET /api/clients/filter_options — distinct managers/regions/directions
                                    for toolbar dropdowns
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.filters import exclude_kirim_methods_clause
from ..scope import UserScope, clause_for_table


# ---------------------------------------------------------------------------
# Persona thresholds — single source of truth for the SQL CASE
# ---------------------------------------------------------------------------

THRESH_RECENT_DAYS = 45            # ≤ recent
THRESH_SLEEPING_LO = 181           # sleeping starts
THRESH_SLEEPING_HI = 365           # sleeping ends; lost begins after
THRESH_ONE_HIT_DAYS = 180          # one-hit-wonder cutoff
THRESH_ROOKIE_DAYS = 90            # rookie's first-order window
THRESH_ROOKIE_ORDERS = 3           # rookie's order ceiling
THRESH_LOYAL_ORDERS = 6            # loyal floor
THRESH_CHAMPION_ORDERS = 4         # champion order floor
THRESH_BULK_ORDERS = 3             # bulk's order ceiling
THRESH_WHALE_RECENCY = 60          # whale-at-risk recency floor
THRESH_HIGH_RISK = 60              # "high risk" filter cutoff
THRESH_TRAJECTORY_DEAD = 0.05      # ±5% deadband around flat


# Risk score weights — composite urgency signal, not a per-row visual
RISK_W_AGING_90 = 35
RISK_W_LATE_PAY = 25
RISK_W_RFM_SLIP = 15
RISK_W_RFM_LOST = 15
RISK_W_OVERDUE_PROMISE = 10


# Persona keys (must match frontend label keys)
PERSONA_KEYS = (
    "debt_trap",
    "whale_at_risk",
    "lost",
    "sleeping",
    "one_hit",
    "rookie",
    "champion",
    "loyal",
    "bulk",
    "regular",
)


# ---------------------------------------------------------------------------
# Scope helper
# ---------------------------------------------------------------------------


def _scope_subquery(scope: UserScope | None) -> tuple[str, dict[str, Any]]:
    """Return ('AND person_id IN (…)', params) restricting to the user's
    rooms via deal_order. Empty for unscoped users.

    We restrict at the outer SELECT (against the `scored` CTE) so the inner
    CTEs stay simple — the perf cost is one DISTINCT subquery."""
    if scope is None or not scope.is_scoped:
        return "", {}
    placeholders = ", ".join(f":_scope_r{i}" for i in range(len(scope.room_ids)))
    params = {f"_scope_r{i}": rid for i, rid in enumerate(scope.room_ids)}
    return (
        f"AND person_id::text IN ("
        f"  SELECT DISTINCT person_id FROM smartup_rep.deal_order"
        f"   WHERE room_id IN ({placeholders})"
        f")",
        params,
    )


# ---------------------------------------------------------------------------
# The big CTE bundle — produces one row per legal_person.person_id with
# every Client 360° signal. Persona is derived in the final `scored` CTE.
# ---------------------------------------------------------------------------


def _intelligence_cte_sql(*, today: date) -> str:
    bank_excl_p = exclude_kirim_methods_clause("p")
    today_iso = today.isoformat()
    twelve_mo = (today - timedelta(days=365)).isoformat()
    rfm_window = (today - timedelta(days=365)).isoformat()

    return f"""
    WITH
    -- ----- per-customer order aggregates (LTV, AOV, recency, sku_breadth)
    orders_agg AS (
      SELECT d.person_id::text                       AS person_id,
             SUM(d.product_amount)::numeric(18,2)    AS ltv,
             COUNT(DISTINCT d.deal_id)               AS order_count,
             MAX(d.delivery_date)                    AS last_order_date,
             MIN(d.delivery_date)                    AS first_order_date,
             COUNT(DISTINCT NULLIF(TRIM(d.brand), '')) AS sku_breadth
        FROM smartup_rep.deal_order d
       WHERE d.person_id IS NOT NULL
       GROUP BY d.person_id
    ),

    -- ----- LTV decile (1 = top 10%, used for whale/champion/bulk)
    ltv_ranked AS (
      SELECT person_id,
             NTILE(10) OVER (ORDER BY ltv DESC NULLS LAST) AS ltv_decile
        FROM orders_agg
    ),

    -- ----- 90-day-current vs 90-day-prior (trajectory text)
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

    -- ----- predictive cycle (≥3 orders required; below that NULL)
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
             AVG(gap_days)::int AS mean_gap_days
        FROM order_gaps
       WHERE gap_days IS NOT NULL
       GROUP BY person_id
      HAVING COUNT(*) >= 2  -- ≥2 gaps == ≥3 orders
    ),

    -- ----- payments (last-pay date + lifetime collected, bank excluded)
    payments_agg AS (
      SELECT p.person_id::text AS person_id,
             SUM(p.amount)::numeric(18,2) AS collected_total,
             MAX(p.payment_date)::date    AS last_payment_date
        FROM smartup_rep.payment p
       WHERE p.person_id IS NOT NULL
         {bank_excl_p}
       GROUP BY p.person_id
    ),

    -- ----- aging proxy: oldest-unpaid-age bucketing.
    -- Same approximation the current build uses; the rigorous FIFO version
    -- lives in the per-client dossier.
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

    -- ----- contact log: latest entry + promise reliability + overdue flag
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

    -- ----- RFM 12-month window — used to classify "slipping" customers
    -- via the segment alias inside the persona CASE
    rfm_base AS (
      SELECT d.person_id::text AS person_id,
             ('{today_iso}'::date - MAX(d.delivery_date)) AS days_since,
             COUNT(DISTINCT d.deal_id)                    AS deals_window,
             SUM(d.product_amount)::numeric(18,2)         AS revenue_window
        FROM smartup_rep.deal_order d
       WHERE d.delivery_date BETWEEN '{rfm_window}'::date AND '{today_iso}'::date
         AND d.person_id IS NOT NULL
       GROUP BY 1
    ),
    rfm AS (
      SELECT b.*,
             (6 - NTILE(5) OVER (ORDER BY b.days_since ASC)) AS r,
             NTILE(5) OVER (ORDER BY b.deals_window ASC)     AS f,
             NTILE(5) OVER (ORDER BY b.revenue_window ASC)   AS m
        FROM rfm_base b
    ),
    rfm_seg AS (
      SELECT person_id, r, f, m,
             CASE
               WHEN r <= 2 AND f >= 3 AND m >= 3 THEN 'At risk'
               WHEN r <= 2 AND f = 5 AND m = 5   THEN 'Cannot lose them'
               WHEN r = 2 AND f <= 2             THEN 'Hibernating'
               WHEN r = 1                         THEN 'Lost'
               ELSE 'Other'
             END AS rfm_class
        FROM rfm
    ),

    -- ----- raw per-customer signal block (pre-persona)
    base AS (
      SELECT
        lp.person_id::text                              AS person_id,
        lp.name,
        lp.tin,
        lp.client_group,
        lp.direction,
        lp.region_name                                  AS region,
        TRIM(SPLIT_PART(lp.room_names, ',', 1))         AS room,
        lp.main_phone                                   AS phone,

        oa.ltv, oa.order_count, oa.last_order_date, oa.first_order_date, oa.sku_breadth,
        ('{today_iso}'::date - oa.last_order_date)      AS recency_days,
        ('{today_iso}'::date - oa.first_order_date)     AS first_order_days,
        CASE WHEN oa.order_count > 0
             THEN (oa.ltv / oa.order_count)::numeric(18,2)
             ELSE 0 END                                 AS aov,

        lr.ltv_decile,

        CASE
          WHEN COALESCE(tr.rev_prev_90, 0) > 0
            THEN (COALESCE(tr.rev_curr_90, 0) / tr.rev_prev_90 - 1)::float8
          ELSE NULL
        END                                             AS trajectory_pct,

        ag.outstanding,
        ag.age_days                                     AS oldest_unpaid_age,
        CASE WHEN ag.outstanding > 0 AND ag.age_days BETWEEN 0  AND 29 THEN ag.outstanding ELSE 0 END::numeric(18,2) AS aging_b1_30,
        CASE WHEN ag.outstanding > 0 AND ag.age_days BETWEEN 30 AND 59 THEN ag.outstanding ELSE 0 END::numeric(18,2) AS aging_b31_60,
        CASE WHEN ag.outstanding > 0 AND ag.age_days BETWEEN 60 AND 89 THEN ag.outstanding ELSE 0 END::numeric(18,2) AS aging_b61_90,
        CASE WHEN ag.outstanding > 0 AND ag.age_days >= 90              THEN ag.outstanding ELSE 0 END::numeric(18,2) AS aging_b90_plus,

        ('{today_iso}'::date - pa.last_payment_date)    AS days_since_payment,

        rs.rfm_class,

        cy.mean_gap_days,
        CASE WHEN cy.mean_gap_days IS NOT NULL
             THEN (oa.last_order_date + cy.mean_gap_days * INTERVAL '1 day')::date
             ELSE NULL END                              AS predicted_next_buy,
        CASE WHEN cy.mean_gap_days IS NOT NULL
             THEN ('{today_iso}'::date
                   - (oa.last_order_date + cy.mean_gap_days * INTERVAL '1 day')::date)
             ELSE NULL END                              AS days_overdue_for_repeat,

        ll.contacted_at                                 AS last_contact_at,
        ll.outcome                                      AS last_contact_outcome,
        (ll.outcome = 'promised'
         AND ll.promised_by_date IS NOT NULL
         AND ll.promised_by_date < '{today_iso}'::date) AS has_overdue_promise

      FROM smartup_rep.legal_person lp
      LEFT JOIN orders_agg     oa  ON oa.person_id = lp.person_id::text
      LEFT JOIN ltv_ranked     lr  ON lr.person_id = lp.person_id::text
      LEFT JOIN trajectory     tr  ON tr.person_id = lp.person_id::text
      LEFT JOIN payments_agg   pa  ON pa.person_id = lp.person_id::text
      LEFT JOIN aging          ag  ON ag.person_id = lp.person_id::text
      LEFT JOIN rfm_seg        rs  ON rs.person_id = lp.person_id::text
      LEFT JOIN cycle          cy  ON cy.person_id = lp.person_id::text
      LEFT JOIN latest_log     ll  ON ll.person_id = lp.person_id::text
     WHERE oa.person_id IS NOT NULL  -- skip customers with zero orders ever
    ),

    -- ----- persona derivation + risk score (mutually exclusive, top-down)
    scored AS (
      SELECT b.*,
             CASE
               WHEN aging_b90_plus > 0
                    THEN 'debt_trap'
               WHEN ltv_decile = 1 AND recency_days > {THRESH_WHALE_RECENCY}
                    THEN 'whale_at_risk'
               WHEN recency_days > {THRESH_SLEEPING_HI}
                    THEN 'lost'
               WHEN recency_days BETWEEN {THRESH_SLEEPING_LO} AND {THRESH_SLEEPING_HI}
                    AND order_count >= 3
                    THEN 'sleeping'
               WHEN order_count = 1 AND recency_days > {THRESH_ONE_HIT_DAYS}
                    THEN 'one_hit'
               WHEN order_count <= {THRESH_ROOKIE_ORDERS}
                    AND first_order_days <= {THRESH_ROOKIE_DAYS}
                    THEN 'rookie'
               WHEN ltv_decile = 1
                    AND recency_days <= {THRESH_RECENT_DAYS}
                    AND order_count >= {THRESH_CHAMPION_ORDERS}
                    THEN 'champion'
               WHEN order_count >= {THRESH_LOYAL_ORDERS}
                    AND recency_days <= {THRESH_RECENT_DAYS}
                    THEN 'loyal'
               WHEN order_count <= {THRESH_BULK_ORDERS} AND ltv_decile = 1
                    THEN 'bulk'
               ELSE 'regular'
             END                                              AS persona,

             LEAST(100,
               {RISK_W_AGING_90}        * (CASE WHEN aging_b90_plus > 0 THEN 1 ELSE 0 END)
             + {RISK_W_LATE_PAY}        * (CASE WHEN outstanding > 0 AND days_since_payment > 60 THEN 1 ELSE 0 END)
             + {RISK_W_RFM_SLIP}        * (CASE WHEN rfm_class IN ('At risk', 'Cannot lose them', 'Hibernating') THEN 1 ELSE 0 END)
             + {RISK_W_RFM_LOST}        * (CASE WHEN rfm_class = 'Lost' THEN 1 ELSE 0 END)
             + {RISK_W_OVERDUE_PROMISE} * (CASE WHEN has_overdue_promise THEN 1 ELSE 0 END)
             )::int                                           AS risk_score
        FROM base b
    )
    """


# ---------------------------------------------------------------------------
# Row payload — the JSON shape the frontend renders
# ---------------------------------------------------------------------------


def _row_to_payload(r: dict) -> dict[str, Any]:
    return {
        "person_id": r["person_id"],
        "name": r["name"],
        "tin": r["tin"],
        "client_group": r["client_group"],
        "direction": r["direction"],
        "region": r["region"],
        "room": r["room"],
        "phone": r["phone"],
        "persona": r["persona"],
        "recency_days": int(r["recency_days"]) if r["recency_days"] is not None else None,
        "ltv": float(r["ltv"] or 0),
        "aov": float(r["aov"] or 0),
        "order_count": int(r["order_count"] or 0),
        "trajectory_pct": float(r["trajectory_pct"]) if r["trajectory_pct"] is not None else None,
        "sku_breadth": int(r["sku_breadth"] or 0),
        "outstanding": float(r["outstanding"] or 0),
        "aging": {
            "b1_30":   float(r["aging_b1_30"] or 0),
            "b31_60":  float(r["aging_b31_60"] or 0),
            "b61_90":  float(r["aging_b61_90"] or 0),
            "b90_plus": float(r["aging_b90_plus"] or 0),
        },
        "risk_score": int(r["risk_score"] or 0),
        "predicted_next_buy": r["predicted_next_buy"].isoformat() if r["predicted_next_buy"] else None,
        "days_overdue_for_repeat": int(r["days_overdue_for_repeat"]) if r["days_overdue_for_repeat"] is not None else None,
        "last_contact_at": r["last_contact_at"].isoformat() if r["last_contact_at"] else None,
        "last_contact_outcome": r["last_contact_outcome"],
    }


# ---------------------------------------------------------------------------
# Filter helpers — multi-select + toggle predicates
# ---------------------------------------------------------------------------


def _multi_in(values: list[str], param_prefix: str, column: str,
              params: dict[str, Any]) -> str:
    """Build an `AND column IN (...)` clause from a list, registering bindings.

    Empty list → no clause (returns ''). All values are bound, never inlined."""
    if not values:
        return ""
    placeholders = []
    for i, v in enumerate(values):
        key = f"{param_prefix}_{i}"
        params[key] = v
        placeholders.append(f":{key}")
    return f"AND {column} IN ({', '.join(placeholders)})"


def _persona_in(personas: list[str], params: dict[str, Any]) -> str:
    return _multi_in(personas, "_pers", "persona", params)


def _trajectory_clause(traj: str | None) -> str:
    """Map trajectory bucket (growing/flat/declining) to a SQL predicate.

    Anything NULL trajectory passes through `flat` since the operator's
    expectation is "no signal = neither growing nor declining"."""
    if not traj:
        return ""
    if traj == "growing":
        return f"AND trajectory_pct > {THRESH_TRAJECTORY_DEAD}"
    if traj == "declining":
        return f"AND trajectory_pct < -{THRESH_TRAJECTORY_DEAD}"
    if traj == "flat":
        return (
            f"AND (trajectory_pct IS NULL "
            f"     OR (trajectory_pct >= -{THRESH_TRAJECTORY_DEAD} "
            f"         AND trajectory_pct <= {THRESH_TRAJECTORY_DEAD}))"
        )
    return ""


# ---------------------------------------------------------------------------
# Sort whitelist
# ---------------------------------------------------------------------------


_VALID_SORTS = {
    "recency":     "recency_days ASC NULLS LAST",
    "ltv":         "ltv DESC NULLS LAST",
    "outstanding": "outstanding DESC NULLS LAST",
    "risk":        "risk_score DESC NULLS LAST",
    "next_buy":    "days_overdue_for_repeat DESC NULLS LAST",
    "last_contact": "last_contact_at DESC NULLS LAST",
    "name":        "name ASC",
}


# ---------------------------------------------------------------------------
# /api/clients/intelligence — paginated rows + persona counts
# ---------------------------------------------------------------------------


async def intelligence(
    session: AsyncSession,
    *,
    today: date,
    search: str | None,
    personas: list[str],
    managers: list[str],
    regions: list[str],
    directions: list[str],
    has_overdue_debt: bool,
    high_risk: bool,
    trajectory: str | None,
    sort: str,
    page: int,
    size: int,
    scope: UserScope | None = None,
) -> dict[str, Any]:
    cte_sql = _intelligence_cte_sql(today=today)

    # Outer WHERE on the `scored` CTE columns. We split into two parts:
    #   - secondary_where: text + manager + region + direction + toggles
    #     (these scope the universe before the persona ribbon does)
    #   - persona_where: applied on top for the row table only
    # Persona counts use secondary_where alone so the ribbon counts reflect
    # the operator's other filters but NOT the chosen personas.
    secondary_parts: list[str] = ["TRUE"]
    params: dict[str, Any] = {}

    if search:
        secondary_parts.append(
            "(name ILIKE :_search OR tin ILIKE :_search OR phone ILIKE :_search)"
        )
        params["_search"] = f"%{search.strip()}%"

    if managers:
        secondary_parts.append(_multi_in(managers, "_mgr", "room", params)[4:])  # strip leading 'AND '
    if regions:
        secondary_parts.append(_multi_in(regions, "_rgn", "region", params)[4:])
    if directions:
        secondary_parts.append(_multi_in(directions, "_dir", "direction", params)[4:])

    if has_overdue_debt:
        secondary_parts.append(
            "(aging_b90_plus > 0 OR (outstanding > 0 AND days_since_payment > 60))"
        )
    if high_risk:
        secondary_parts.append(f"risk_score >= {THRESH_HIGH_RISK}")

    traj_clause = _trajectory_clause(trajectory)
    if traj_clause:
        secondary_parts.append(traj_clause[4:])  # strip leading 'AND '

    scope_clause, scope_params = _scope_subquery(scope)
    if scope_clause:
        secondary_parts.append(scope_clause[4:])
        params.update(scope_params)

    secondary_where = " AND ".join(secondary_parts)

    # Persona filter on top
    persona_clause = _persona_in(personas, params)  # 'AND persona IN (...)' or ''
    full_where = secondary_where + " " + persona_clause

    order_by = _VALID_SORTS.get(sort, _VALID_SORTS["recency"])
    offset = max(0, page) * max(1, min(200, size))

    rows_sql = f"""
    {cte_sql}
    SELECT * FROM scored
     WHERE {full_where}
     ORDER BY {order_by}
     LIMIT :_lim OFFSET :_off
    """
    count_sql = f"""
    {cte_sql}
    SELECT COUNT(*) AS n FROM scored WHERE {full_where}
    """
    # Persona ribbon counts: secondary filters applied, persona filter NOT
    persona_count_sql = f"""
    {cte_sql}
    SELECT persona, COUNT(*) AS n FROM scored
     WHERE {secondary_where}
     GROUP BY persona
    """

    rows = (
        await session.execute(text(rows_sql),
                              {**params, "_lim": size, "_off": offset})
    ).mappings().all()
    total = (await session.execute(text(count_sql), params)).scalar_one()
    persona_rows = (await session.execute(text(persona_count_sql), params)).mappings().all()

    persona_counts = {k: 0 for k in PERSONA_KEYS}
    for r in persona_rows:
        persona_counts[r["persona"]] = int(r["n"])

    return {
        "rows": [_row_to_payload(dict(r)) for r in rows],
        "total": int(total),
        "page": page,
        "size": size,
        "persona_counts": persona_counts,
    }


# ---------------------------------------------------------------------------
# /api/clients/filter_options — universe of available manager/region/direction
# ---------------------------------------------------------------------------


async def filter_options(
    session: AsyncSession,
    *,
    scope: UserScope | None = None,
) -> dict[str, list[str]]:
    """Return the distinct manager/region/direction lists across the user's
    scoped legal_person base. The lists are independent of any current
    filter selection — they describe the universe of choices, so the
    operator can always pick another filter combination.

    Cached aggressively on the frontend (~5 min staleTime) since these
    rarely change.
    """
    scope_frag = ""
    params: dict[str, Any] = {}
    if scope is not None and scope.is_scoped:
        frag, p = clause_for_table(scope, "smartup_rep.legal_person")
        if frag:
            scope_frag = f"WHERE lp.{frag}"
            params.update(p)

    sql = f"""
    SELECT
      ARRAY(SELECT DISTINCT TRIM(SPLIT_PART(lp.room_names, ',', 1)) AS m
              FROM smartup_rep.legal_person lp
             {scope_frag} {'AND' if scope_frag else 'WHERE'}
                   COALESCE(TRIM(SPLIT_PART(lp.room_names, ',', 1)), '') <> ''
             ORDER BY m) AS managers,
      ARRAY(SELECT DISTINCT lp.region_name AS r
              FROM smartup_rep.legal_person lp
             {scope_frag} {'AND' if scope_frag else 'WHERE'}
                   COALESCE(lp.region_name, '') <> ''
             ORDER BY r) AS regions,
      ARRAY(SELECT DISTINCT lp.direction AS d
              FROM smartup_rep.legal_person lp
             {scope_frag} {'AND' if scope_frag else 'WHERE'}
                   COALESCE(lp.direction, '') <> ''
             ORDER BY d) AS directions
    """
    row = (await session.execute(text(sql), params)).mappings().one()
    return {
        "managers": list(row["managers"] or []),
        "regions": list(row["regions"] or []),
        "directions": list(row["directions"] or []),
    }
