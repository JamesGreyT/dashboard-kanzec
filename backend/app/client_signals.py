from __future__ import annotations

from datetime import date, timedelta


def compute_deal_status(
    *,
    client_group: str | None,
    deal_deadline_start: date | None,
    deal_monthly_amount: float | None,
    instalment_days: int | None,
    current_debt: float,
    overdue_debt: float,
    payments_since_start: float | None = None,
    today: date | None = None,
) -> str:
    today = today or date.today()
    term_days = instalment_days or 30

    if client_group == "CLOSED":
        return "CLOSED"
    if current_debt <= 0:
        return "FULFILLED"
    if client_group == "NORMAL":
        return "OVERDUE" if overdue_debt > 0 else "ON_TRACK"
    if client_group == "PROBLEM_DEADLINE":
        if deal_deadline_start is None:
            return "UNKNOWN"
        deadline = deal_deadline_start + timedelta(days=term_days)
        return "DEFAULT" if today > deadline else "ON_TRACK"
    if client_group == "PROBLEM_MONTHLY":
        if deal_deadline_start is None or not deal_monthly_amount or deal_monthly_amount <= 0:
            return "UNKNOWN"
        months_elapsed = max(
            0,
            (today.year - deal_deadline_start.year) * 12 + (today.month - deal_deadline_start.month),
        )
        expected_paid = months_elapsed * deal_monthly_amount
        paid = payments_since_start or 0.0
        return "ON_TRACK" if paid >= expected_paid else "BEHIND"
    return "UNKNOWN"


def compute_attention(
    *,
    deal_status: str,
    bucket_90_plus: float,
    overdue_debt: float,
    has_overdue_promise: bool,
    last_purchase_days: int | None,
    last_payment_days: int | None,
    current_debt: float,
    collection_ratio_90d: float | None,
    rfm_segment: str | None,
) -> tuple[str, str, int]:
    if deal_status == "DEFAULT":
        return "recover_now", "Deal in default", 600
    if bucket_90_plus > 0:
        return "recover_now", "90+ overdue debt", 600
    if overdue_debt > 0:
        if deal_status == "BEHIND":
            return "collect_fast", "Behind monthly plan", 500
        return "collect_fast", "Overdue debt", 500
    if has_overdue_promise:
        return "promise_watch", "Promise overdue", 400
    if last_purchase_days is not None and last_purchase_days >= 60:
        return "dormant", f"No purchase in {last_purchase_days} days", 300

    healthy_segments = {"Champions", "Loyal", "Potential Loyalist", "Potential loyalists", "Loyal customers"}
    if (
        current_debt <= 10
        and last_purchase_days is not None
        and last_purchase_days <= 30
        and rfm_segment in healthy_segments
    ):
        return "grow", "Healthy payer, high RFM", 100

    if last_payment_days is None or last_payment_days >= 45:
        return "monitor", "No recent payment", 200
    if collection_ratio_90d is not None and collection_ratio_90d < 50:
        return "monitor", "Weak payments recently", 200
    return "monitor", "Monitor account", 200
