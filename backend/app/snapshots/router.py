"""Yearly snapshots HTTP surface — one read-only endpoint returning the 5
pivoted tables for the Analytics > Yearly page. All roles may read."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session
from . import service

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


@router.get("/yearly")
async def yearly(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    end_date: date | None = Query(default=None,
        description="Anchor date for the newest 12-month window (ISO). "
                    "Defaults to today. Each prior column ends on the same "
                    "calendar day 1, 2, … years earlier."),
    years: int = Query(default=4, ge=1, le=8,
                       description="How many 12-month windows to include."),
    direction: str = Query(default="",
                           description="Comma-separated direction filter (empty = all)."),
) -> dict:
    if end_date is None:
        end_date = date.today()
    dirs: list[str] | None = None
    if direction.strip():
        dirs = [s.strip() for s in direction.split(",") if s.strip()]
        if not dirs:
            dirs = None
    try:
        return await service.yearly_snapshots(
            session, end_date=end_date, years=years, direction_filter=dirs,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None


@router.get("/directions")
async def directions(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Distinct direction values in the DB — drives the filter chip UI."""
    return {"directions": await service.list_directions(session)}
