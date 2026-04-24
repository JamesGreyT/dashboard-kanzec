"""Payments analytics HTTP surface."""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session
from .._analytics.filters import Filters
from .._analytics.windows import Granularity, resolve_window
from . import service

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _parse(from_: date | None, to: date | None, direction: str, region: str):
    return resolve_window(from_=from_, to=to), Filters.parse(direction=direction, region=region)


@router.get("/overview")
async def overview(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return await service.overview(session, w, f)


@router.get("/timeseries")
async def timeseries(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    granularity: Literal["day", "week", "month", "quarter"] = Query(default="day"),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    g: Granularity = granularity  # type: ignore[assignment]
    return {"series": await service.timeseries(session, w, g, f)}


@router.get("/method-split")
async def method_split(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return {"split": await service.method_split(session, w, f)}


@router.get("/weekday")
async def weekday(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return {"pattern": await service.weekday_pattern(session, w, f)}


@router.get("/velocity")
async def velocity(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return {"histogram": await service.velocity(session, w, f)}


@router.get("/collection-ratio")
async def collection_ratio(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return {"series": await service.collection_ratio_trend(session, w, f)}


@router.get("/payers")
async def payers(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="receipts:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return await service.payers_ranked(session, w, f, sort, page, size, search)


@router.get("/prepayers")
async def prepayers(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="credit:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    f = Filters.parse(direction=direction, region=region)
    return await service.prepayers_ranked(session, f, sort, page, size, search)


@router.get("/regularity")
async def regularity(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="receipts:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    f = Filters.parse(direction=direction, region=region)
    return await service.regularity(session, f, sort, page, size, search)


@router.get("/churned")
async def churned(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="receipts:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    f = Filters.parse(direction=direction, region=region)
    return await service.churned_ranked(session, f, sort, page, size, search)
