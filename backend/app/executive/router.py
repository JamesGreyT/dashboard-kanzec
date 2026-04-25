"""Executive briefing HTTP surface."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session
from .._analytics.windows import current_fy_bounds, resolve_window
from . import service
from . import risk_rules

router = APIRouter(prefix="/api/executive", tags=["executive"])


@router.get("/north-star")
async def north_star(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
) -> dict:
    if from_ is None and to is None:
        fy = current_fy_bounds(date.today())
        from datetime import date as _d
        from_, to = fy.start, min(fy.end, _d.today())
    window = resolve_window(from_=from_, to=to)
    return await service.north_star(session, window)


@router.get("/trajectory")
async def trajectory(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return await service.trajectory(session)


@router.get("/concentration")
async def concentration(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
) -> dict:
    if from_ is None and to is None:
        fy = current_fy_bounds(date.today())
        from datetime import date as _d
        from_, to = fy.start, min(fy.end, _d.today())
    window = resolve_window(from_=from_, to=to)
    return await service.concentration(session, window)


@router.get("/concentration-trend")
async def concentration_trend(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    quarters: int = Query(default=8, ge=4, le=20),
) -> dict:
    return {"series": await service.concentration_trend(session, quarters=quarters)}


@router.get("/manager-leverage")
async def manager_leverage(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
) -> dict:
    if from_ is None and to is None:
        fy = current_fy_bounds(date.today())
        from datetime import date as _d
        from_, to = fy.start, min(fy.end, _d.today())
    window = resolve_window(from_=from_, to=to)
    return await service.manager_leverage(session, window)


@router.get("/manager-productivity")
async def manager_productivity(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    months: int = Query(default=12, ge=6, le=24),
) -> dict:
    return await service.manager_productivity(session, months=months)


@router.get("/cash-conversion")
async def cash_conversion(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    months: int = Query(default=12, ge=6, le=24),
) -> dict:
    return await service.cash_conversion(session, months=months)


@router.get("/risk-flags")
async def risk_flags(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    today = date.today()
    fy = current_fy_bounds(today)
    flags = await risk_rules.evaluate_all(session, today=today, fy_s=fy.start, fy_e=fy.end)
    return {"flags": flags}
