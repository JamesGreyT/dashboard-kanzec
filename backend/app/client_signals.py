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


HIGH_RFM_SCORES = {"555", "554", "545", "544", "455", "454", "445"}


def is_high_rfm(rfm_score: str | None) -> bool:
    if not rfm_score:
        return False
    return str(rfm_score) in HIGH_RFM_SCORES


def compute_pay_probability(
    *,
    attention_state: str,
    deal_status: str,
    has_overdue_promise: bool,
    bucket_90_plus: float,
    bucket_61_90: float,
    velocity_ratio: float | None,
) -> float:
    """Rule-based probability that the client pays in the next 30 days.

    Starts at 0.80 and applies penalties for risk signals. Returns a value
    in [0.05, 0.95] so even pristine accounts have some default risk and
    even broken accounts have some recovery upside.
    """
    p = 0.80
    if attention_state == "recover_now":
        p -= 0.40
    elif attention_state == "collect_fast":
        p -= 0.20
    if has_overdue_promise:
        p -= 0.20
    if deal_status == "DEFAULT":
        p -= 0.30
    if bucket_90_plus > 0:
        p -= 0.20
    if bucket_61_90 > 0:
        p -= 0.10
    if velocity_ratio is not None and velocity_ratio < 0.7:
        p -= 0.10
    if attention_state == "grow":
        p += 0.05
    return max(0.05, min(0.95, p))


def compute_velocity_ratio(payments_90d: float, payments_180d: float) -> float | None:
    """Return payments_90d / payments_prior_90d, or None when prior window is empty."""
    prior = payments_180d - payments_90d
    if prior <= 0:
        return None
    return round(payments_90d / prior, 3)
