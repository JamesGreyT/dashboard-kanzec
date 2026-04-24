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


def _default_end_year() -> int:
    # Fiscal year ending 31 March — if today is April or later, the current FY
    # ends next March (i.e. end_year = this_year + 1). Jan-Mar is still the
    # previous FY (end_year = this_year).
    today = date.today()
    return today.year + 1 if today.month >= 4 else today.year


@router.get("/yearly")
async def yearly(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    end_year: int = Query(default=None, ge=2020, le=2040,
                          description="Latest FY end year (31 March of this year)."),
    years: int = Query(default=4, ge=1, le=8,
                       description="How many FYs to include (ending end_year)."),
    direction: str = Query(default="",
                           description="Comma-separated direction filter (empty = all)."),
) -> dict:
    if end_year is None:
        end_year = _default_end_year()
    dirs: list[str] | None = None
    if direction.strip():
        dirs = [s.strip() for s in direction.split(",") if s.strip()]
        if not dirs:
            dirs = None
    try:
        return await service.yearly_snapshots(
            session, end_year=end_year, years=years, direction_filter=dirs,
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
