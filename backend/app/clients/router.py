"""Client 360° HTTP surface — admin + viewer.

  GET /api/clients/intelligence  — paginated row table
  GET /api/clients/analytics     — page-level aggregates (KPI, heatmaps, queue)

Both share the same filter knobs except for `segment` (table-only).
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session
from ..scope import ScopedUser
from . import service


router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.get("/intelligence")
async def intelligence(
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    search: str | None = Query(default=None, max_length=100),
    segment: Literal[
        "all", "champions", "loyal", "at_risk",
        "hibernating", "debt_warning", "predicted",
    ] = Query(default="all"),
    manager: str | None = Query(default=None, max_length=100),
    region: str | None = Query(default=None, max_length=100),
    direction: str | None = Query(default=None, max_length=100),
    sort: Literal[
        "risk", "ltv", "outstanding", "recency",
        "trajectory", "next_buy", "name",
    ] = Query(default="risk"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=200),
) -> dict:
    del user
    return await service.intelligence(
        session,
        today=date.today(),
        search=search,
        segment=segment,
        manager=manager,
        region=region,
        direction=direction,
        sort=sort,
        page=page,
        size=size,
        scope=scope,
    )


@router.get("/analytics")
async def analytics(
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    manager: str | None = Query(default=None, max_length=100),
    region: str | None = Query(default=None, max_length=100),
    direction: str | None = Query(default=None, max_length=100),
) -> dict:
    del user
    return await service.analytics(
        session,
        today=date.today(),
        manager=manager,
        region=region,
        direction=direction,
        scope=scope,
    )
