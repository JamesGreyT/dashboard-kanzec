"""Executive briefing — founder/CEO-grade aggregations across the
operator dashboards. Every function is deliberately one-shot (no
pagination, no per-row drilling). The page is meant to be read
cold in 30 seconds.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.windows import Window, current_fy_bounds


# ---------------------------------------------------------------------------
# North-star strip — Revenue (window) · Cash (window) · Outstanding · Net WC
# ---------------------------------------------------------------------------


async def north_star(session: AsyncSession, window: Window) -> dict:
    """Four numbers everyone should know.

    Revenue + Cash respect the window. Outstanding + Net WC are
    *as-of today* (it doesn't make sense to look at outstanding "in
    the past" — debt is a snapshot, not a flow)."""
    sql = """
    WITH rev AS (
      SELECT COALESCE(SUM(product_amount), 0)::numeric(18,2) AS revenue
        FROM smartup_rep.deal_order
       WHERE delivery_date BETWEEN :w_s AND :w_e
    ),
    cash AS (
      SELECT COALESCE(SUM(amount), 0)::numeric(18,2) AS cash
        FROM smartup_rep.payment
       WHERE payment_date BETWEEN :w_s AND :w_e
    ),
    per_client AS (
      SELECT d.person_id::text AS pid,
             SUM(d.product_amount) AS invoiced
        FROM smartup_rep.deal_order d
       GROUP BY d.person_id
    ),
    pays AS (
      SELECT p.person_id::text AS pid,
             SUM(p.amount) AS paid
        FROM smartup_rep.payment p
       WHERE p.person_id IS NOT NULL
       GROUP BY p.person_id
    ),
    debt AS (
      SELECT COALESCE(SUM(GREATEST(0, COALESCE(pc.invoiced, 0) - COALESCE(pa.paid, 0))), 0)::numeric(18,2) AS outstanding,
             COALESCE(SUM(GREATEST(0, COALESCE(pa.paid, 0) - COALESCE(pc.invoiced, 0))), 0)::numeric(18,2) AS prepay
        FROM smartup_rep.legal_person lp
        LEFT JOIN per_client pc ON pc.pid = lp.person_id::text
        LEFT JOIN pays pa       ON pa.pid = lp.person_id::text
    )
    SELECT rev.revenue, cash.cash, debt.outstanding, debt.prepay
      FROM rev, cash, debt
    """
    r = (await session.execute(text(sql), {
        "w_s": window.start, "w_e": window.end,
    })).mappings().first() or {}
    revenue = float(r.get("revenue") or 0)
    cash = float(r.get("cash") or 0)
    outstanding = float(r.get("outstanding") or 0)
    prepay = float(r.get("prepay") or 0)
    return {
        "window": {"from": str(window.start), "to": str(window.end)},
        "revenue":     revenue,
        "cash":        cash,
        "outstanding": outstanding,
        "prepay":      prepay,
        "net_wc":      outstanding - prepay,
    }


# ---------------------------------------------------------------------------
# Revenue trajectory — FY pacing vs prior FY + run-rate projection
# ---------------------------------------------------------------------------


async def trajectory(session: AsyncSession, today: date | None = None) -> dict:
    today = today or date.today()
    fy = current_fy_bounds(today)
    prior = current_fy_bounds(date(today.year - 1, today.month, min(today.day, 28)))
    sql = """
    WITH cur AS (
      SELECT DATE_TRUNC('week', delivery_date)::date AS w,
             SUM(product_amount)::numeric(18,2) AS revenue
        FROM smartup_rep.deal_order
       WHERE delivery_date BETWEEN :cur_s AND :today
       GROUP BY 1
    ),
    prior AS (
      SELECT DATE_TRUNC('week', delivery_date)::date AS w,
             SUM(product_amount)::numeric(18,2) AS revenue
        FROM smartup_rep.deal_order
       WHERE delivery_date BETWEEN :prior_s AND :prior_e
       GROUP BY 1
    ),
    cur_total AS (
      SELECT COALESCE(SUM(revenue), 0)::numeric(18,2) AS total FROM cur
    ),
    prior_total AS (
      SELECT COALESCE(SUM(revenue), 0)::numeric(18,2) AS total FROM prior
    ),
    cur_full_prior AS (
      SELECT COALESCE(SUM(product_amount), 0)::numeric(18,2) AS total
        FROM smartup_rep.deal_order
       WHERE delivery_date BETWEEN :prior_s AND :prior_e
    )
    SELECT
      (SELECT total FROM cur_total)        AS cur_total,
      (SELECT total FROM prior_total)      AS prior_same_period,
      (SELECT total FROM cur_full_prior)   AS prior_full_fy
    """
    r = (await session.execute(text(sql), {
        "cur_s": fy.start, "today": today,
        "prior_s": prior.start, "prior_e": prior.end,
    })).mappings().first() or {}

    series_sql = """
    SELECT DATE_TRUNC('week', delivery_date)::date AS w,
           SUM(product_amount)::numeric(18,2) AS revenue
      FROM smartup_rep.deal_order
     WHERE delivery_date BETWEEN :cur_s AND :today
     GROUP BY 1 ORDER BY 1
    """
    cur_rows = (await session.execute(text(series_sql), {
        "cur_s": fy.start, "today": today,
    })).mappings().all()

    prior_series_sql = """
    SELECT DATE_TRUNC('week', delivery_date)::date AS w,
           SUM(product_amount)::numeric(18,2) AS revenue
      FROM smartup_rep.deal_order
     WHERE delivery_date BETWEEN :prior_s AND :prior_e
     GROUP BY 1 ORDER BY 1
    """
    prior_rows = (await session.execute(text(prior_series_sql), {
        "prior_s": prior.start, "prior_e": prior.end,
    })).mappings().all()

    cur_total = float(r.get("cur_total") or 0)
    prior_same = float(r.get("prior_same_period") or 0)
    prior_full = float(r.get("prior_full_fy") or 0)

    # Run-rate projection: FY total / weeks elapsed × 52
    fy_days = (fy.end - fy.start).days + 1
    elapsed = (today - fy.start).days + 1
    run_rate_full_fy = cur_total * fy_days / max(elapsed, 1)

    # Build a unified series shape: (date, value, yoy) — yoy is the
    # prior-FY week shifted forward by 1 year so it lines up.
    prior_by_week: dict[date, float] = {r["w"]: float(r["revenue"] or 0) for r in prior_rows}
    series: list[dict[str, Any]] = []
    for r in cur_rows:
        w = r["w"]
        prior_w = date(w.year - 1, w.month, min(w.day, 28))
        # Find the closest prior-week match; fallback to 0
        yoy = prior_by_week.get(prior_w, 0.0)
        if yoy == 0.0:
            # search nearby (week boundaries shift by 1-2 days year over year)
            for delta in (-7, 7, -1, 1, -2, 2):
                cand = prior_w + timedelta(days=delta)
                if cand in prior_by_week:
                    yoy = prior_by_week[cand]
                    break
        series.append({"date": w.isoformat(), "value": float(r["revenue"] or 0), "yoy": yoy})

    return {
        "fy": {"from": str(fy.start), "to": str(fy.end)},
        "prior_fy": {"from": str(prior.start), "to": str(prior.end)},
        "elapsed_days": elapsed,
        "fy_days": fy_days,
        "cur_total": cur_total,
        "prior_same_period": prior_same,
        "prior_full_fy": prior_full,
        "run_rate_projection": run_rate_full_fy,
        "gap_to_prior_full": run_rate_full_fy - prior_full,
        "gap_to_prior_full_pct": (run_rate_full_fy / prior_full - 1.0) if prior_full else None,
        "series": series,
    }


# ---------------------------------------------------------------------------
# Customer concentration — Pareto curve, top-N share, Gini
# ---------------------------------------------------------------------------


async def concentration(session: AsyncSession, window: Window) -> dict:
    sql = """
    SELECT lp.person_id::text AS person_id, lp.name,
           SUM(d.product_amount)::numeric(18,2) AS revenue
      FROM smartup_rep.deal_order d
      JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
     WHERE d.delivery_date BETWEEN :w_s AND :w_e
       AND d.product_amount > 0
     GROUP BY lp.person_id, lp.name
    HAVING SUM(d.product_amount) > 0
     ORDER BY revenue DESC
    """
    rows = (await session.execute(text(sql), {
        "w_s": window.start, "w_e": window.end,
    })).mappings().all()
    revenues = [float(r["revenue"]) for r in rows]
    total = sum(revenues)
    n = len(revenues)
    if n == 0 or total == 0:
        return {
            "window": {"from": str(window.start), "to": str(window.end)},
            "total_clients": 0, "total_revenue": 0,
            "top_10_share": 0, "top_20_share": 0, "top_50_share": 0,
            "gini": 0,
            "pareto": [],
            "top_clients": [],
        }

    # Cumulative share for the Pareto curve (capped at first 100 points
    # so the chart isn't degenerate; the long tail is communicated
    # numerically via top-N shares).
    cum = 0.0
    pareto: list[dict[str, Any]] = []
    sample_step = max(1, n // 100)
    for i, v in enumerate(revenues):
        cum += v
        if i % sample_step == 0 or i == n - 1:
            pareto.append({
                "rank": i + 1,
                "rank_pct": (i + 1) / n,
                "cumulative_share": cum / total,
            })

    def share_top(k: int) -> float:
        return sum(revenues[:k]) / total

    # Gini via the standard discrete formula:
    # G = (Σ(2i - n - 1) · x_i) / (n · Σx)  where x is sorted ascending.
    asc = sorted(revenues)
    weighted = sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(asc))
    gini = weighted / (n * total) if total else 0

    return {
        "window": {"from": str(window.start), "to": str(window.end)},
        "total_clients": n,
        "total_revenue": total,
        "top_10_share": share_top(10),
        "top_20_share": share_top(20),
        "top_50_share": share_top(50),
        "gini": gini,
        "pareto": pareto,
        "top_clients": [{
            "rank": i + 1,
            "person_id": str(r["person_id"]),
            "name": r["name"],
            "revenue": float(r["revenue"]),
            "share": float(r["revenue"]) / total,
        } for i, r in enumerate(rows[:10])],
    }


async def concentration_trend(session: AsyncSession, quarters: int = 8) -> list[dict]:
    """Gini coefficient per quarter for the last `quarters` quarters."""
    sql = """
    WITH q AS (
      SELECT generate_series(
        DATE_TRUNC('quarter', CURRENT_DATE - (INTERVAL '3 month' * (:quarters - 1))),
        DATE_TRUNC('quarter', CURRENT_DATE),
        INTERVAL '3 month'
      )::date AS qstart
    ),
    per_client AS (
      SELECT q.qstart,
             d.person_id,
             SUM(d.product_amount) AS revenue
        FROM q
        JOIN smartup_rep.deal_order d
          ON d.delivery_date >= q.qstart
         AND d.delivery_date < (q.qstart + INTERVAL '3 month')
       WHERE d.product_amount > 0
       GROUP BY q.qstart, d.person_id
      HAVING SUM(d.product_amount) > 0
    )
    SELECT qstart,
           array_agg(revenue ORDER BY revenue ASC) AS revenues
      FROM per_client
     GROUP BY qstart
     ORDER BY qstart
    """
    rows = (await session.execute(text(sql), {"quarters": quarters})).mappings().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        revs = [float(v) for v in (r["revenues"] or [])]
        n = len(revs)
        total = sum(revs)
        if n == 0 or total == 0:
            out.append({"quarter": r["qstart"].isoformat(), "gini": 0, "clients": 0, "total": 0})
            continue
        weighted = sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(revs))
        gini = weighted / (n * total)
        out.append({"quarter": r["qstart"].isoformat(),
                    "gini": gini,
                    "clients": n,
                    "total": total})
    return out


# ---------------------------------------------------------------------------
# Manager leverage — revenue per manager + month×manager heatmap +
# hidden talent / hidden underperformer
# ---------------------------------------------------------------------------


async def manager_leverage(session: AsyncSession, window: Window) -> dict:
    sql = """
    WITH cur AS (
      SELECT COALESCE(NULLIF(d.sales_manager, ''), '—') AS manager,
             SUM(d.product_amount)::numeric(18,2) AS revenue,
             COUNT(DISTINCT d.deal_id) AS deals,
             COUNT(DISTINCT d.person_id) AS clients
        FROM smartup_rep.deal_order d
       WHERE d.delivery_date BETWEEN :w_s AND :w_e
       GROUP BY 1
      HAVING SUM(d.product_amount) > 0
    ),
    yoy AS (
      SELECT COALESCE(NULLIF(d.sales_manager, ''), '—') AS manager,
             SUM(d.product_amount)::numeric(18,2) AS revenue
        FROM smartup_rep.deal_order d
       WHERE d.delivery_date BETWEEN (:w_s - INTERVAL '1 year') AND (:w_e - INTERVAL '1 year')
       GROUP BY 1
    )
    SELECT c.manager, c.revenue, c.deals, c.clients,
           y.revenue AS prior_revenue,
           (CASE WHEN COALESCE(y.revenue, 0) = 0 THEN NULL
                 ELSE c.revenue / y.revenue - 1 END)::numeric(10,4) AS yoy_pct
      FROM cur c
      LEFT JOIN yoy y ON y.manager = c.manager
     ORDER BY c.revenue DESC
    """
    rows = (await session.execute(text(sql), {
        "w_s": window.start, "w_e": window.end,
    })).mappings().all()
    managers = [{
        "manager": r["manager"],
        "revenue": float(r["revenue"] or 0),
        "deals":   int(r["deals"] or 0),
        "clients": int(r["clients"] or 0),
        "prior_revenue": float(r["prior_revenue"] or 0),
        "yoy_pct": float(r["yoy_pct"]) if r["yoy_pct"] is not None else None,
    } for r in rows]

    # Hidden talent: top-quartile YoY growth ∩ bottom-half absolute revenue
    # Hidden underperformer: bottom-quartile YoY growth ∩ top-half abs rev
    by_yoy = sorted(
        [m for m in managers if m["yoy_pct"] is not None],
        key=lambda m: m["yoy_pct"],
    )
    by_rev = sorted(managers, key=lambda m: m["revenue"])
    rev_median = by_rev[len(by_rev) // 2]["revenue"] if by_rev else 0
    yoy_top_q = by_yoy[int(len(by_yoy) * 0.75)]["yoy_pct"] if by_yoy else None
    yoy_bot_q = by_yoy[int(len(by_yoy) * 0.25)]["yoy_pct"] if by_yoy else None

    hidden_talent: list[dict[str, Any]] = []
    hidden_under: list[dict[str, Any]] = []
    if yoy_top_q is not None and yoy_bot_q is not None:
        for m in managers:
            if m["yoy_pct"] is None:
                continue
            if m["yoy_pct"] >= yoy_top_q and m["revenue"] <= rev_median:
                hidden_talent.append(m)
            if m["yoy_pct"] <= yoy_bot_q and m["revenue"] >= rev_median:
                hidden_under.append(m)
    hidden_talent = sorted(hidden_talent, key=lambda m: -m["yoy_pct"])[:3]
    hidden_under = sorted(hidden_under, key=lambda m: m["yoy_pct"])[:3]

    return {
        "window": {"from": str(window.start), "to": str(window.end)},
        "managers": managers,
        "hidden_talent": hidden_talent,
        "hidden_underperformer": hidden_under,
    }


async def manager_productivity(session: AsyncSession, months: int = 12) -> dict:
    """Manager × month revenue heatmap for the last `months` months."""
    sql = """
    WITH spans AS (
      SELECT generate_series(
        DATE_TRUNC('month', CURRENT_DATE - (INTERVAL '1 month' * (:months - 1))),
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      )::date AS m
    ),
    grid AS (
      SELECT s.m,
             COALESCE(NULLIF(d.sales_manager, ''), '—') AS manager,
             COALESCE(SUM(d.product_amount), 0)::numeric(18,2) AS revenue
        FROM spans s
        LEFT JOIN smartup_rep.deal_order d
          ON DATE_TRUNC('month', d.delivery_date)::date = s.m
       WHERE d.product_amount > 0 OR d.product_amount IS NULL
       GROUP BY s.m, manager
    )
    SELECT manager, m, revenue
      FROM grid
     WHERE manager IS NOT NULL AND manager <> '—'
     ORDER BY manager, m
    """
    rows = (await session.execute(text(sql), {"months": months})).mappings().all()
    managers: list[str] = []
    months_seen: list[date] = []
    matrix: dict[tuple[str, date], float] = {}
    totals: dict[str, float] = {}
    for r in rows:
        m, mgr, rev = r["m"], r["manager"], float(r["revenue"] or 0)
        if mgr not in managers:
            managers.append(mgr)
            totals[mgr] = 0.0
        if m not in months_seen:
            months_seen.append(m)
        matrix[(mgr, m)] = rev
        totals[mgr] += rev
    months_seen.sort()
    # Sort managers by lifetime-window total descending.
    managers.sort(key=lambda mgr: -totals.get(mgr, 0))
    values: list[list[float]] = []
    for mgr in managers:
        row = [matrix.get((mgr, m), 0.0) for m in months_seen]
        values.append(row)
    return {
        "row_labels": managers,
        "col_labels": [m.isoformat() for m in months_seen],
        "values": values,
    }


# ---------------------------------------------------------------------------
# Cash conversion — DSO trend + net working capital trend
# ---------------------------------------------------------------------------


async def cash_conversion(session: AsyncSession, months: int = 12) -> dict:
    """Monthly DSO + net WC. DSO = (outstanding AR end-of-month / monthly
    sales) × days-in-month. Net WC = outstanding − prepayments,
    end-of-month."""
    # Per-bucket subqueries: simpler than a cross-join CTE and reads
    # cleanly for each metric.
    sql = """
    WITH months AS (
      SELECT (DATE_TRUNC('month', CURRENT_DATE - (INTERVAL '1 month' * gs))
              + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end,
             DATE_TRUNC('month', CURRENT_DATE - (INTERVAL '1 month' * gs))::date AS month_start
        FROM generate_series(0, :months - 1) AS gs
    )
    SELECT m.month_start, m.month_end,
           (SELECT COALESCE(SUM(d.product_amount), 0)::numeric(18,2)
              FROM smartup_rep.deal_order d
             WHERE d.delivery_date BETWEEN m.month_start AND m.month_end) AS month_revenue,
           (SELECT COALESCE(SUM(d.product_amount), 0)::numeric(18,2)
              FROM smartup_rep.deal_order d
             WHERE d.delivery_date <= m.month_end) AS invoiced_cum,
           (SELECT COALESCE(SUM(p.amount), 0)::numeric(18,2)
              FROM smartup_rep.payment p
             WHERE p.payment_date <= m.month_end) AS paid_cum
      FROM months m
     ORDER BY m.month_start
    """
    rows = (await session.execute(text(sql), {"months": months})).mappings().all()
    series: list[dict[str, Any]] = []
    for r in rows:
        invoiced = float(r["invoiced_cum"] or 0)
        paid = float(r["paid_cum"] or 0)
        outstanding = max(invoiced - paid, 0)
        prepay = max(paid - invoiced, 0)
        rev_m = float(r["month_revenue"] or 0)
        days = (r["month_end"] - r["month_start"]).days + 1
        # DSO: AR / monthly revenue × days_in_month. Cap at 365 to avoid
        # divide-by-zero amplifying a tiny month.
        dso = (outstanding / rev_m * days) if rev_m > 0 else None
        if dso is not None and dso > 365:
            dso = 365.0
        series.append({
            "date": r["month_start"].isoformat(),
            "outstanding": outstanding,
            "prepay": prepay,
            "net_wc": outstanding - prepay,
            "month_revenue": rev_m,
            "dso": dso,
        })
    return {"series": series}
