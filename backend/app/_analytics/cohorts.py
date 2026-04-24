"""Cohort-analysis SQL helper.

Generates a `month-of-first-event × months-since-first` grid for either
deal_order (client cohorts) or payment (payer cohorts). The SQL snippet
is parameterised by the fact table + date column + person key so the
same CTE logic powers both."""
from __future__ import annotations

from datetime import date


def build_cohort_sql(
    *,
    fact_table: str,
    date_col: str,
    person_col: str,
    person_cast_to_text: bool,
    amount_col: str | None = None,
    start_month: date,
    horizon_months: int,
) -> str:
    """Return a PostgreSQL query that yields columns:

        cohort_month      (first-event month, timestamp)
        months_since      (0..horizon)
        clients_total     (# clients in the cohort)
        clients_active    (# of them active in this bucket)
        amount_sum        (if amount_col, else 0)

    The SQL assumes `fact_table` exists in `smartup_rep` and `person_col`
    is either bigint or text. If `person_cast_to_text` is true, cast to
    text when grouping (needed because deal_order.person_id is text and
    payment.person_id is bigint in the current schema)."""
    key = f"{person_col}::text" if person_cast_to_text else person_col
    amount_select = f"SUM(f.{amount_col})" if amount_col else "0"
    return f"""
WITH base AS (
  SELECT {key}                                AS pid,
         DATE_TRUNC('month', f.{date_col})::date AS month,
         f.{amount_col if amount_col else date_col} AS amt
    FROM smartup_rep.{fact_table} f
   WHERE f.{date_col} >= '{start_month.isoformat()}'
     AND f.{person_col} IS NOT NULL
),
first_seen AS (
  SELECT pid, MIN(month) AS cohort_month FROM base GROUP BY 1
),
monthly AS (
  SELECT b.pid, b.month,
         (EXTRACT(YEAR FROM AGE(b.month, fs.cohort_month)) * 12 +
          EXTRACT(MONTH FROM AGE(b.month, fs.cohort_month)))::int AS months_since,
         fs.cohort_month
    FROM base b
    JOIN first_seen fs USING (pid)
),
cohort_sizes AS (
  SELECT cohort_month, COUNT(DISTINCT pid) AS clients_total
    FROM first_seen GROUP BY 1
)
SELECT m.cohort_month,
       m.months_since,
       cs.clients_total,
       COUNT(DISTINCT m.pid) AS clients_active,
       COALESCE({amount_select}, 0) AS amount_sum
  FROM monthly m
  JOIN cohort_sizes cs USING (cohort_month)
  LEFT JOIN base f ON f.pid = m.pid AND f.month = m.month
 WHERE m.months_since BETWEEN 0 AND {horizon_months}
 GROUP BY m.cohort_month, m.months_since, cs.clients_total
 ORDER BY m.cohort_month, m.months_since
"""
