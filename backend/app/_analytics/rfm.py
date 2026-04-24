"""RFM (Recency · Frequency · Monetary) segmentation.

For each client in the window, compute:
    R_score — 5 = most recent; 1 = oldest (inverse of days-since-last-order)
    F_score — 5 = most frequent; 1 = least
    M_score — 5 = highest monetary; 1 = lowest

Mapped to a segment label per the standard 10-segment taxonomy
(Champions / Loyal customers / Potential loyalists / New customers /
Promising / Need attention / About to sleep / At risk / Can't lose them /
Hibernating / Lost).

The scoring is done in SQL via NTILE(5) so cutoffs are data-driven
(quintiles of the current population), not hardcoded thresholds."""
from __future__ import annotations

from datetime import date


def build_rfm_sql(*, window_start: date, window_end: date) -> str:
    """Return a query that yields columns: person_id, name, last_order_date,
    days_since, deals, revenue, r, f, m, score (concat), segment."""
    return f"""
WITH base AS (
  SELECT d.person_id::text AS person_id,
         MAX(d.delivery_date) AS last_order_date,
         ('{window_end.isoformat()}'::date - MAX(d.delivery_date)) AS days_since,
         COUNT(DISTINCT d.deal_id) AS deals,
         SUM(d.product_amount)::numeric(18,2) AS revenue
    FROM smartup_rep.deal_order d
   WHERE d.delivery_date BETWEEN '{window_start.isoformat()}' AND '{window_end.isoformat()}'
     AND d.person_id IS NOT NULL
   GROUP BY 1
),
scored AS (
  SELECT b.*,
         (6 - NTILE(5) OVER (ORDER BY b.days_since ASC))    AS r,
         NTILE(5) OVER (ORDER BY b.deals ASC)               AS f,
         NTILE(5) OVER (ORDER BY b.revenue ASC)             AS m
    FROM base b
)
SELECT s.person_id, lp.name, lp.direction, lp.region_name,
       s.last_order_date, s.days_since, s.deals, s.revenue,
       s.r, s.f, s.m,
       (s.r::text || s.f::text || s.m::text) AS score,
       CASE
         WHEN s.r = 5 AND s.f >= 4 AND s.m >= 4 THEN 'Champions'
         WHEN s.r >= 4 AND s.f >= 3 AND s.m >= 3 THEN 'Loyal'
         WHEN s.r = 5 AND s.f <= 2                THEN 'New customers'
         WHEN s.r >= 3 AND s.f <= 2 AND s.m <= 2  THEN 'Promising'
         WHEN s.r = 3 AND s.f = 3                 THEN 'Need attention'
         WHEN s.r = 3 AND s.f <= 2                THEN 'About to sleep'
         WHEN s.r <= 2 AND s.f >= 3 AND s.m >= 3  THEN 'At risk'
         WHEN s.r <= 2 AND s.f = 5 AND s.m = 5    THEN 'Cannot lose them'
         WHEN s.r = 2 AND s.f <= 2                THEN 'Hibernating'
         WHEN s.r = 1                              THEN 'Lost'
         ELSE 'Potential loyalists'
       END AS segment
  FROM scored s
  JOIN smartup_rep.legal_person lp ON lp.person_id::text = s.person_id
 ORDER BY s.revenue DESC
"""
