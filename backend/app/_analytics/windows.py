"""Time-window helpers shared across Sales / Payments / Debt dashboards.

The analytics endpoints all accept `from=` and `to=` ISO query params, or
a symbolic `window=` shortcut. This module parses + defaults them, and
derives the *prior period* (same length immediately before the current
window) so every KPI card can show a MoM/YoY delta without the endpoint
having to re-implement the maths.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

Granularity = Literal["day", "week", "month", "quarter"]
WindowAlias = Literal[
    "today", "wtd", "mtd", "qtd", "ytd", "fy", "last7", "last30", "last90", "ltd",
]


@dataclass(frozen=True)
class Window:
    start: date
    end: date

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1


@dataclass(frozen=True)
class Compare:
    """Current window + prior period of the same length + same-window-last-year.

    `mom` is "same-length period immediately before current" (useful when
    the user picks 7-day / 30-day / custom windows). `yoy` is the same
    calendar dates shifted back 1 year (handles Feb-29 via _shift_year).
    """
    current: Window
    mom: Window
    yoy: Window


def _last_of_month(y: int, m: int) -> int:
    return calendar.monthrange(y, m)[1]


def _shift_year(d: date, years_back: int) -> date:
    y = d.year - years_back
    m = d.month
    return date(y, m, min(d.day, _last_of_month(y, m)))


def current_fy_bounds(today: date, end_month: int = 3, end_day: int = 31) -> Window:
    """Fiscal-year containing `today`, ending on (end_month, end_day).
    Default 31 March matches the operator's fiscal calendar.
    """
    this_end = date(today.year, end_month, min(end_day, _last_of_month(today.year, end_month)))
    if today <= this_end:
        start = date(today.year - 1, end_month, end_day) + timedelta(days=1)
        return Window(start=start, end=this_end)
    next_end = date(today.year + 1, end_month, min(end_day, _last_of_month(today.year + 1, end_month)))
    start = this_end + timedelta(days=1)
    return Window(start=start, end=next_end)


def resolve_window(
    *,
    from_: date | None,
    to: date | None,
    alias: WindowAlias | None = None,
    today: date | None = None,
) -> Window:
    """Pick a window. Priority: explicit `from`/`to` > `alias` > default.

    Default is last 90 days ending today. `alias` values map to common
    operator shortcuts. Invalid combinations (to < from, future dates
    beyond today) are clamped."""
    today = today or date.today()
    if from_ is not None and to is not None:
        if to < from_:
            from_, to = to, from_
        return Window(start=from_, end=min(to, today))
    if from_ is not None and to is None:
        return Window(start=from_, end=today)
    if alias is not None:
        return _alias_to_window(alias, today)
    # default
    return Window(start=today - timedelta(days=89), end=today)


def _alias_to_window(alias: WindowAlias, today: date) -> Window:
    if alias == "today":
        return Window(today, today)
    if alias == "last7":
        return Window(today - timedelta(days=6), today)
    if alias == "last30":
        return Window(today - timedelta(days=29), today)
    if alias == "last90":
        return Window(today - timedelta(days=89), today)
    if alias == "wtd":
        # week starts Monday
        monday = today - timedelta(days=today.weekday())
        return Window(monday, today)
    if alias == "mtd":
        return Window(date(today.year, today.month, 1), today)
    if alias == "qtd":
        q_start_month = ((today.month - 1) // 3) * 3 + 1
        return Window(date(today.year, q_start_month, 1), today)
    if alias == "ytd":
        return Window(date(today.year, 1, 1), today)
    if alias == "fy":
        fy = current_fy_bounds(today)
        return Window(fy.start, today)
    if alias == "ltd":
        # life-to-date — cap at a reasonable lower bound; callers clamp to data floor
        return Window(date(2000, 1, 1), today)
    raise ValueError(f"unknown alias {alias!r}")


def compare_periods(window: Window) -> Compare:
    """Return the MoM (prior same-length period) and YoY shifts of a window."""
    span = window.days
    prior_end = window.start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=span - 1)
    return Compare(
        current=window,
        mom=Window(prior_start, prior_end),
        yoy=Window(_shift_year(window.start, 1), _shift_year(window.end, 1)),
    )


def series_buckets(window: Window, granularity: Granularity) -> list[tuple[date, date]]:
    """Return inclusive (start, end) pairs for each bucket in the window.

    For `month`/`quarter` the first bucket starts at window.start and is
    truncated to the bucket's natural end (e.g. window.start=2026-01-15 +
    monthly → first bucket ends 2026-01-31, second starts 2026-02-01).
    The daily/weekly paths don't truncate; they walk in fixed strides.
    """
    out: list[tuple[date, date]] = []
    if granularity == "day":
        d = window.start
        while d <= window.end:
            out.append((d, d))
            d += timedelta(days=1)
        return out
    if granularity == "week":
        d = window.start
        while d <= window.end:
            end = min(d + timedelta(days=6), window.end)
            out.append((d, end))
            d = end + timedelta(days=1)
        return out
    if granularity == "month":
        d = window.start
        while d <= window.end:
            last = _last_of_month(d.year, d.month)
            end = min(date(d.year, d.month, last), window.end)
            out.append((d, end))
            d = end + timedelta(days=1)
        return out
    if granularity == "quarter":
        d = window.start
        while d <= window.end:
            q_end_month = ((d.month - 1) // 3) * 3 + 3
            last = _last_of_month(d.year, q_end_month)
            end = min(date(d.year, q_end_month, last), window.end)
            out.append((d, end))
            d = end + timedelta(days=1)
        return out
    raise ValueError(f"unknown granularity {granularity!r}")
