"""Rule-based risk scan run from the Executive page.

Each rule is a pure async function `(session, today, fy_start, fy_end)
→ list[RiskFlag]`. The evaluator runs them in parallel and concatenates
the results. Rules return zero or more flags — empty list = nothing
worth flagging.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import date
from typing import Any, Callable, Awaitable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class RiskFlag:
    kind: str
    severity: str  # "warn" | "high"
    message_uz: str
    message_ru: str
    message_en: str
    drill_to: str | None = None
    metric: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


RuleFn = Callable[[AsyncSession, date, date, date], Awaitable[list[RiskFlag]]]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fmt_money(n: float) -> str:
    if abs(n) >= 1_000_000:
        return f"${n / 1_000_000:.1f}M"
    if abs(n) >= 1000:
        return f"${n / 1000:.0f}k"
    return f"${n:.0f}"


def _fmt_pct(n: float) -> str:
    return f"{n * 100:.1f}%"


# ---------------------------------------------------------------------------
# Rule: any single client > 10% of FY revenue
# ---------------------------------------------------------------------------


async def _r_client_concentration(session: AsyncSession,
                                  today: date, fy_s: date, fy_e: date) -> list[RiskFlag]:
    sql = """
    WITH per_client AS (
      SELECT lp.person_id, lp.name,
             SUM(d.product_amount) AS revenue
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN :fy_s AND :today
         AND d.product_amount > 0
       GROUP BY lp.person_id, lp.name
    ),
    total AS (
      SELECT SUM(revenue) AS t FROM per_client
    )
    SELECT pc.name, pc.revenue, pc.revenue / NULLIF(t.t, 0) AS share
      FROM per_client pc, total t
     WHERE pc.revenue / NULLIF(t.t, 0) > 0.10
     ORDER BY pc.revenue DESC
    """
    rows = (await session.execute(text(sql), {"fy_s": fy_s, "today": today})).mappings().all()
    flags: list[RiskFlag] = []
    for r in rows:
        share = float(r["share"] or 0)
        flags.append(RiskFlag(
            kind="client_concentration",
            severity="high" if share > 0.20 else "warn",
            message_uz=f"{r['name']} — yillik tushumning {_fmt_pct(share)} qismini hosil qiladi.",
            message_ru=f"{r['name']} — генерирует {_fmt_pct(share)} годовой выручки.",
            message_en=f"{r['name']} accounts for {_fmt_pct(share)} of FY revenue.",
            drill_to="/analytics/sales",
            metric=share,
        ))
    return flags


# ---------------------------------------------------------------------------
# Rule: any single manager > 25% of FY revenue
# ---------------------------------------------------------------------------


async def _r_manager_concentration(session: AsyncSession,
                                   today: date, fy_s: date, fy_e: date) -> list[RiskFlag]:
    sql = """
    WITH per_manager AS (
      SELECT COALESCE(NULLIF(d.sales_manager, ''), '—') AS manager,
             SUM(d.product_amount) AS revenue
        FROM smartup_rep.deal_order d
       WHERE d.delivery_date BETWEEN :fy_s AND :today
         AND d.product_amount > 0
       GROUP BY 1
    ),
    total AS (
      SELECT SUM(revenue) AS t FROM per_manager
    )
    SELECT pm.manager, pm.revenue, pm.revenue / NULLIF(t.t, 0) AS share
      FROM per_manager pm, total t
     WHERE pm.revenue / NULLIF(t.t, 0) > 0.25
     ORDER BY pm.revenue DESC
    """
    rows = (await session.execute(text(sql), {"fy_s": fy_s, "today": today})).mappings().all()
    flags: list[RiskFlag] = []
    for r in rows:
        share = float(r["share"] or 0)
        flags.append(RiskFlag(
            kind="manager_concentration",
            severity="high" if share > 0.40 else "warn",
            message_uz=f"Menejer {r['manager']} — yillik tushumning {_fmt_pct(share)} qismi.",
            message_ru=f"Менеджер {r['manager']} — {_fmt_pct(share)} годовой выручки.",
            message_en=f"Manager {r['manager']} runs {_fmt_pct(share)} of FY revenue.",
            drill_to="/analytics/sales",
            metric=share,
        ))
    return flags


# ---------------------------------------------------------------------------
# Rule: any region MoM revenue drop > 30%
# ---------------------------------------------------------------------------


async def _r_region_drop(session: AsyncSession,
                         today: date, fy_s: date, fy_e: date) -> list[RiskFlag]:
    sql = """
    WITH cur AS (
      SELECT COALESCE(NULLIF(lp.region_name, ''), '—') AS region,
             SUM(d.product_amount) AS revenue
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN (CURRENT_DATE - INTERVAL '30 days') AND CURRENT_DATE
         AND d.product_amount > 0
       GROUP BY 1
    ),
    prior AS (
      SELECT COALESCE(NULLIF(lp.region_name, ''), '—') AS region,
             SUM(d.product_amount) AS revenue
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN (CURRENT_DATE - INTERVAL '60 days')
                                 AND (CURRENT_DATE - INTERVAL '31 days')
         AND d.product_amount > 0
       GROUP BY 1
    )
    SELECT c.region, c.revenue AS cur, p.revenue AS prior,
           (c.revenue / NULLIF(p.revenue, 0) - 1) AS mom_pct
      FROM cur c JOIN prior p ON p.region = c.region
     WHERE p.revenue > 1000
       AND (c.revenue / NULLIF(p.revenue, 0) - 1) < -0.30
     ORDER BY mom_pct ASC
    """
    rows = (await session.execute(text(sql))).mappings().all()
    flags: list[RiskFlag] = []
    for r in rows:
        mom = float(r["mom_pct"] or 0)
        flags.append(RiskFlag(
            kind="region_drop",
            severity="high" if mom < -0.50 else "warn",
            message_uz=f"{r['region']} — oyma-oy {_fmt_pct(mom)} pasayish.",
            message_ru=f"{r['region']} — падение {_fmt_pct(mom)} месяц-к-месяцу.",
            message_en=f"{r['region']} dropped {_fmt_pct(mom)} MoM.",
            drill_to="/analytics/sales",
            metric=mom,
        ))
    return flags


# ---------------------------------------------------------------------------
# Rule: any brand with returns > 8% of forward revenue (last 90d)
# ---------------------------------------------------------------------------


async def _r_brand_returns(session: AsyncSession,
                           today: date, fy_s: date, fy_e: date) -> list[RiskFlag]:
    sql = """
    SELECT COALESCE(NULLIF(d.brand, ''), '—') AS brand,
           SUM(CASE WHEN d.product_amount > 0 THEN d.product_amount ELSE 0 END) AS forward,
           ABS(SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END)) AS returns
      FROM smartup_rep.deal_order d
     WHERE d.delivery_date BETWEEN (CURRENT_DATE - INTERVAL '90 days') AND CURRENT_DATE
     GROUP BY 1
    HAVING SUM(CASE WHEN d.product_amount > 0 THEN d.product_amount ELSE 0 END) > 5000
       AND ABS(SUM(CASE WHEN d.product_amount < 0 THEN d.product_amount ELSE 0 END))
           / NULLIF(SUM(CASE WHEN d.product_amount > 0 THEN d.product_amount ELSE 0 END), 0) > 0.08
     ORDER BY returns DESC
    """
    rows = (await session.execute(text(sql))).mappings().all()
    flags: list[RiskFlag] = []
    for r in rows:
        rate = float(r["returns"] or 0) / float(r["forward"] or 1)
        flags.append(RiskFlag(
            kind="brand_returns",
            severity="high" if rate > 0.15 else "warn",
            message_uz=f"{r['brand']} — qaytarish {_fmt_pct(rate)} (oxirgi 90 kun).",
            message_ru=f"{r['brand']} — возвраты {_fmt_pct(rate)} (последние 90 дней).",
            message_en=f"{r['brand']} returns at {_fmt_pct(rate)} (last 90d).",
            drill_to="/analytics/returns",
            metric=rate,
        ))
    return flags


# ---------------------------------------------------------------------------
# Rule: any manager whose book is > 50% over-90
# ---------------------------------------------------------------------------


async def _r_manager_aged_book(session: AsyncSession,
                               today: date, fy_s: date, fy_e: date) -> list[RiskFlag]:
    sql = """
    WITH per_client AS (
      SELECT d.person_id, d.sales_manager,
             SUM(d.product_amount) AS invoiced,
             MAX(d.delivery_date) AS last_order
        FROM smartup_rep.deal_order d
       GROUP BY d.person_id, d.sales_manager
    ),
    pays AS (
      SELECT person_id::text AS pid,
             SUM(amount) AS paid,
             MAX(payment_date)::date AS last_pay
        FROM smartup_rep.payment WHERE person_id IS NOT NULL
       GROUP BY person_id
    ),
    debt AS (
      SELECT pc.sales_manager AS manager,
             COALESCE(pc.invoiced, 0) - COALESCE(pa.paid, 0) AS debt,
             pc.last_order, pa.last_pay
        FROM per_client pc LEFT JOIN pays pa ON pa.pid = pc.person_id::text
       WHERE COALESCE(pc.invoiced, 0) - COALESCE(pa.paid, 0) > 1
    )
    SELECT manager,
           SUM(debt) AS total_book,
           SUM(CASE WHEN last_pay IS NULL OR last_pay < CURRENT_DATE - INTERVAL '90 days'
                    THEN debt ELSE 0 END) AS over_90
      FROM debt
     WHERE manager IS NOT NULL AND manager <> ''
     GROUP BY manager
    HAVING SUM(debt) > 5000
       AND SUM(CASE WHEN last_pay IS NULL OR last_pay < CURRENT_DATE - INTERVAL '90 days'
                    THEN debt ELSE 0 END) / SUM(debt) > 0.50
     ORDER BY over_90 DESC
    """
    rows = (await session.execute(text(sql))).mappings().all()
    flags: list[RiskFlag] = []
    for r in rows:
        share = float(r["over_90"] or 0) / float(r["total_book"] or 1)
        flags.append(RiskFlag(
            kind="manager_aged_book",
            severity="high" if share > 0.70 else "warn",
            message_uz=f"{r['manager']} — qarz portfelining {_fmt_pct(share)} 90 kundan oshgan.",
            message_ru=f"{r['manager']} — {_fmt_pct(share)} долгового портфеля старше 90 дней.",
            message_en=f"{r['manager']} — {_fmt_pct(share)} of book is over-90.",
            drill_to="/collection/debt",
            metric=share,
        ))
    return flags


# ---------------------------------------------------------------------------
# Rule: prior-FY-only clients (paid >0 last FY, $0 this FY)
# ---------------------------------------------------------------------------


async def _r_lost_clients(session: AsyncSession,
                          today: date, fy_s: date, fy_e: date) -> list[RiskFlag]:
    prior_s = date(fy_s.year - 1, fy_s.month, fy_s.day)
    prior_e = date(fy_e.year - 1, fy_e.month, fy_e.day)
    sql = """
    WITH prior AS (
      SELECT lp.person_id, lp.name,
             SUM(d.product_amount) AS revenue
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN :prior_s AND :prior_e
         AND d.product_amount > 0
       GROUP BY lp.person_id, lp.name
      HAVING SUM(d.product_amount) > 1000
    ),
    cur AS (
      SELECT lp.person_id::text AS pid
        FROM smartup_rep.deal_order d
        JOIN smartup_rep.legal_person lp ON lp.person_id::text = d.person_id
       WHERE d.delivery_date BETWEEN :fy_s AND :today
         AND d.product_amount > 0
       GROUP BY lp.person_id
    ),
    prior_total AS (
      SELECT SUM(revenue) AS t FROM prior
    ),
    lost AS (
      SELECT p.name, p.revenue
        FROM prior p
       WHERE p.person_id::text NOT IN (SELECT pid FROM cur)
    )
    SELECT
      (SELECT SUM(l.revenue) FROM lost l) AS lost_revenue,
      (SELECT COUNT(*) FROM lost) AS lost_count,
      (SELECT t FROM prior_total) AS prior_total
    """
    r = (await session.execute(text(sql), {
        "prior_s": prior_s, "prior_e": prior_e,
        "fy_s": fy_s, "today": today,
    })).mappings().first() or {}
    lost_rev = float(r.get("lost_revenue") or 0)
    lost_count = int(r.get("lost_count") or 0)
    prior_total = float(r.get("prior_total") or 0)
    if prior_total <= 0 or lost_rev <= 0:
        return []
    share = lost_rev / prior_total
    if share < 0.05:
        return []
    return [RiskFlag(
        kind="lost_clients",
        severity="high" if share > 0.15 else "warn",
        message_uz=f"O'tgan yili sotib olib, hozir to'xtagan mijozlar — {lost_count} ta, {_fmt_money(lost_rev)} ({_fmt_pct(share)}).",
        message_ru=f"Прошлогодних клиентов без заказов — {lost_count}, на {_fmt_money(lost_rev)} ({_fmt_pct(share)}).",
        message_en=f"{lost_count} clients ({_fmt_pct(share)} of last FY revenue, {_fmt_money(lost_rev)}) bought last FY but $0 this FY.",
        drill_to="/analytics/sales",
        metric=share,
    )]


# ---------------------------------------------------------------------------
# Rule: any client with outstanding > 6× their trailing-12-month revenue
# ---------------------------------------------------------------------------


async def _r_overextended(session: AsyncSession,
                          today: date, fy_s: date, fy_e: date) -> list[RiskFlag]:
    sql = """
    WITH per_client AS (
      SELECT d.person_id::text AS pid,
             SUM(d.product_amount) AS invoiced,
             SUM(CASE WHEN d.delivery_date >= CURRENT_DATE - INTERVAL '12 months'
                       AND d.product_amount > 0
                      THEN d.product_amount ELSE 0 END) AS ttm_revenue
        FROM smartup_rep.deal_order d
       GROUP BY d.person_id
    ),
    pays AS (
      SELECT person_id::text AS pid, SUM(amount) AS paid
        FROM smartup_rep.payment WHERE person_id IS NOT NULL
       GROUP BY person_id
    ),
    debt AS (
      SELECT lp.person_id::text AS pid, lp.name,
             COALESCE(pc.invoiced, 0) - COALESCE(pa.paid, 0) AS outstanding,
             pc.ttm_revenue
        FROM smartup_rep.legal_person lp
        LEFT JOIN per_client pc ON pc.pid = lp.person_id::text
        LEFT JOIN pays pa ON pa.pid = lp.person_id::text
    )
    SELECT name, outstanding, ttm_revenue,
           outstanding / NULLIF(ttm_revenue, 0) AS ratio
      FROM debt
     WHERE outstanding > 5000
       AND ttm_revenue > 0
       AND outstanding / NULLIF(ttm_revenue, 0) > 6
     ORDER BY ratio DESC
     LIMIT 5
    """
    rows = (await session.execute(text(sql))).mappings().all()
    flags: list[RiskFlag] = []
    for r in rows:
        ratio = float(r["ratio"] or 0)
        flags.append(RiskFlag(
            kind="overextended",
            severity="high" if ratio > 12 else "warn",
            message_uz=f"{r['name']} — qarzi yillik aylanmadan {ratio:.1f}× yuqori.",
            message_ru=f"{r['name']} — задолженность {ratio:.1f}× от годового оборота.",
            message_en=f"{r['name']} owes {ratio:.1f}× their TTM revenue.",
            drill_to="/collection/debt",
            metric=ratio,
        ))
    return flags


# ---------------------------------------------------------------------------
# Registry + evaluator
# ---------------------------------------------------------------------------


_RULES: list[RuleFn] = [
    _r_client_concentration,
    _r_manager_concentration,
    _r_region_drop,
    _r_brand_returns,
    _r_manager_aged_book,
    _r_lost_clients,
    _r_overextended,
]


async def evaluate_all(session: AsyncSession,
                       today: date, fy_s: date, fy_e: date) -> list[dict[str, Any]]:
    """Run all rules sequentially (single shared session — concurrent
    use of the same AsyncSession is unsafe)."""
    flags: list[RiskFlag] = []
    for rule in _RULES:
        try:
            flags.extend(await rule(session, today, fy_s, fy_e))
        except Exception:  # noqa: BLE001
            # A rule that breaks should never take down the page.
            # Swallow + continue. Could log here later.
            pass
    # Sort by severity (high first), then by metric magnitude descending.
    sev_order = {"high": 0, "warn": 1}
    flags.sort(key=lambda f: (sev_order.get(f.severity, 9), -(f.metric or 0)))
    return [f.to_dict() for f in flags]
