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

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session
from ..scope import ScopedUser
from .._analytics.filters import Filters
from . import service
from .service import Slice

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


def _slice_from_params(
    as_of: date,
    slice_start: date | None,
    slice_end: date | None,
) -> Slice | None:
    """When both slice_start and slice_end are provided, return a custom
    Slice using their (month, day). Otherwise None → service uses
    Slice.anchor(as_of) (month-start → as-of)."""
    if slice_start is not None and slice_end is not None:
        return Slice.custom(slice_start, slice_end)
    return None


@router.get("/scoreboard")
async def scoreboard(
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    as_of: date = Query(default_factory=date.today),
    years: int = Query(default=4, ge=2, le=6),
    direction: str = Query(default=""),
    slice_start: date | None = Query(default=None),
    slice_end: date | None = Query(default=None),
) -> dict:
    _admin_or_403(user)
    filters = _parse_filters(scope, direction)
    sl = _slice_from_params(as_of, slice_start, slice_end)
    return await service.scoreboard(session, as_of=as_of, years=years, f=filters, sl=sl)


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
    slice_start: date | None = Query(default=None),
    slice_end: date | None = Query(default=None),
) -> dict:
    _admin_or_403(user)
    filters = _parse_filters(scope, direction)
    sl = _slice_from_params(as_of, slice_start, slice_end)
    return await service.region_pivot(session, as_of=as_of, f=filters, sl=sl)


@router.get("/drill")
async def drill(
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    measure: Literal["sotuv", "kirim"] = Query(...),
    manager: str = Query(...),
    year: int = Query(..., ge=2020, le=2100),
    as_of: date = Query(default_factory=date.today),
    direction: str = Query(default=""),
    slice_start: date | None = Query(default=None),
    slice_end: date | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
) -> dict:
    _admin_or_403(user)
    filters = _parse_filters(scope, direction)
    sl = _slice_from_params(as_of, slice_start, slice_end) or Slice.anchor(as_of)
    return await service.drill(
        session, measure=measure, manager=manager, year=year,
        sl=sl, f=filters, limit=limit,
    )


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
