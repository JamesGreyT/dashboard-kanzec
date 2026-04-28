"""Comparison page HTTP surface — admin + viewer.

Two endpoints per measure:
  GET  /api/comparison/{measure}        matrix (dimension × bucket)
  GET  /api/comparison/{measure}/drill  line items behind one cell

Both endpoints share dimension/mode/year/month query semantics so the
frontend builds one URLSearchParams for both. Brand and model dimensions
are rejected for Kirim with 400 — payments have no product context.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from .._analytics.filters import Filters
from ..auth.deps import CurrentUser
from ..db import get_session
from ..scope import ScopedUser
from . import service
from .service import (
    BucketSpec,
    Dimension,
    KIRIM_DIMENSIONS,
    Measure,
    Mode,
    SOTUV_DIMENSIONS,
)


router = APIRouter(prefix="/api/comparison", tags=["comparison"])


def _validate_dimension(measure: Measure, dimension: Dimension) -> None:
    allowed = SOTUV_DIMENSIONS if measure == "sotuv" else KIRIM_DIMENSIONS
    if dimension not in allowed:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"dimension {dimension!r} not valid for measure {measure!r}",
        )


def _build_spec(
    mode: Mode,
    year_end: int,
    years: int,
    year: int,
    month: int,
) -> BucketSpec:
    if mode == "yearly":
        return BucketSpec.yearly(year_end=year_end, years=years)
    if mode == "monthly":
        return BucketSpec.monthly(year=year)
    return BucketSpec.daily(year=year, month=month)


@router.get("/{measure}")
async def comparison(
    measure: Literal["sotuv", "kirim"],
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    dimension: Literal["manager", "direction", "brand", "model", "region"] = Query(
        "manager"
    ),
    mode: Literal["yearly", "monthly", "daily"] = Query("yearly"),
    year_end: int = Query(default_factory=lambda: date.today().year, ge=2020, le=2100),
    years: int = Query(4, ge=2, le=6),
    year: int = Query(default_factory=lambda: date.today().year, ge=2020, le=2100),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    direction: str = Query(""),
    region: str = Query(""),
    manager: str = Query(""),
    with_plan: bool = Query(False),
) -> dict:
    # CurrentUser is unused inside this handler but its import gates the
    # endpoint behind a valid Bearer token — same convention as DaySlice.
    del user
    _validate_dimension(measure, dimension)
    spec = _build_spec(mode, year_end, years, year, month)
    f = Filters.parse(
        direction=direction, region=region, manager=manager,
        scope_rooms=scope.room_ids,
    )
    # Plan overlay only meaningful for the manager dimension; silently
    # ignore the flag for everything else so callers can leave the
    # query param on across dimension switches.
    return await service.comparison(
        session,
        measure=measure,
        dimension=dimension,
        spec=spec,
        f=f,
        with_plan=with_plan and dimension == "manager",
    )


@router.get("/{measure}/drill")
async def drill(
    measure: Literal["sotuv", "kirim"],
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    dimension: Literal["manager", "direction", "brand", "model", "region"] = Query(...),
    dimension_value: str = Query(...),
    mode: Literal["yearly", "monthly", "daily"] = Query(...),
    bucket: str = Query(..., description="The column label this cell lives under"),
    year_end: int = Query(default_factory=lambda: date.today().year, ge=2020, le=2100),
    years: int = Query(4, ge=2, le=6),
    year: int = Query(default_factory=lambda: date.today().year, ge=2020, le=2100),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    direction: str = Query(""),
    region: str = Query(""),
    manager: str = Query(""),
    limit: int = Query(500, ge=1, le=5000),
) -> dict:
    del user
    _validate_dimension(measure, dimension)
    spec = _build_spec(mode, year_end, years, year, month)
    f = Filters.parse(
        direction=direction, region=region, manager=manager,
        scope_rooms=scope.room_ids,
    )
    return await service.drill(
        session,
        measure=measure,
        dimension=dimension,
        dimension_value=dimension_value,
        spec=spec,
        bucket_label=bucket,
        f=f,
        limit=limit,
    )
