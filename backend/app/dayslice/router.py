"""Day-slice scoreboard HTTP surface — admin-only.

Five endpoints:
  GET  /api/dayslice/scoreboard       manager × year matrix
  GET  /api/dayslice/projection       Min/Mean/Max month-end projection
  GET  /api/dayslice/region-pivot     region × manager grid
  GET  /api/dayslice/plan             monthly plan (rows)
  PUT  /api/dayslice/plan             whole-month replace (admin)

Direction filter defaults to B2B+Export server-side (matches the
Excel `kunsotuvkirim` convention — excludes Цех / DOKON / MATERIAL).
"""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session
from ..scope import ScopedUser
from .._analytics.filters import Filters
from . import service

router = APIRouter(prefix="/api/dayslice", tags=["dayslice"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _admin_or_403(user) -> None:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")


def _parse_filters(scope: ScopedUser, direction: str) -> Filters:
    """Default to B2B+Export when no explicit direction is passed."""
    eff = direction.strip() or "B2B,Export"
    return Filters.parse(direction=eff, scope_rooms=scope.room_ids)


class PlanRow(BaseModel):
    manager: str
    plan_sotuv: float | None = None
    plan_kirim: float | None = None


class PlanPayload(BaseModel):
    rows: list[PlanRow]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/scoreboard")
async def scoreboard(
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    as_of: date = Query(default_factory=date.today),
    years: int = Query(default=4, ge=2, le=6),
    direction: str = Query(default=""),
) -> dict:
    _admin_or_403(user)
    filters = _parse_filters(scope, direction)
    return await service.scoreboard(session, as_of=as_of, years=years, f=filters)


@router.get("/projection")
async def projection(
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    as_of: date = Query(default_factory=date.today),
    years: int = Query(default=4, ge=2, le=6),
    direction: str = Query(default=""),
) -> dict:
    _admin_or_403(user)
    filters = _parse_filters(scope, direction)
    return await service.projection(session, as_of=as_of, years=years, f=filters)


@router.get("/region-pivot")
async def region_pivot(
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    as_of: date = Query(default_factory=date.today),
    direction: str = Query(default=""),
) -> dict:
    _admin_or_403(user)
    filters = _parse_filters(scope, direction)
    return await service.region_pivot(session, as_of=as_of, f=filters)


@router.get("/plan")
async def get_plan(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
) -> dict:
    _admin_or_403(user)
    return await service.get_plan(session, year=year, month=month)


@router.put("/plan")
async def put_plan(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    payload: PlanPayload,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
) -> dict:
    _admin_or_403(user)
    rows = [r.model_dump() for r in payload.rows]
    return await service.put_plan(
        session, year=year, month=month, rows=rows,
        updated_by=user.username,
    )
