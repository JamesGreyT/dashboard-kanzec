"""Client 360° HTTP surface — admin + viewer.

  GET /api/clients/intelligence    — paginated row table + persona counts
  GET /api/clients/filter_options  — distinct manager/region/direction values

The page is table-only; the previous /analytics endpoint (KPI strip,
heatmaps, action queue) was retired with the redesign.
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


def _split_csv(raw: str | None) -> list[str]:
    """Split a comma-separated query param into a clean list. Empty → []."""
    if not raw:
        return []
    return [x.strip() for x in raw.split(",") if x.strip()]


@router.get("/intelligence")
async def intelligence(
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    search: str | None = Query(default=None, max_length=100),
    persona: str | None = Query(default=None, max_length=200,
                                description="Comma-separated persona keys"),
    manager: str | None = Query(default=None, max_length=400,
                                description="Comma-separated manager (room) names"),
    region: str | None = Query(default=None, max_length=400,
                               description="Comma-separated region names"),
    direction: str | None = Query(default=None, max_length=200,
                                  description="Comma-separated direction values"),
    has_overdue_debt: bool = Query(default=False),
    high_risk: bool = Query(default=False),
    trajectory: Literal["growing", "flat", "declining"] | None = Query(default=None),
    sort: Literal[
        "recency", "ltv", "outstanding", "risk", "next_buy", "last_contact", "name",
    ] = Query(default="recency"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=200),
) -> dict:
    del user
    return await service.intelligence(
        session,
        today=date.today(),
        search=search,
        personas=_split_csv(persona),
        managers=_split_csv(manager),
        regions=_split_csv(region),
        directions=_split_csv(direction),
        has_overdue_debt=has_overdue_debt,
        high_risk=high_risk,
        trajectory=trajectory,
        sort=sort,
        page=page,
        size=size,
        scope=scope,
    )


@router.get("/filter_options")
async def filter_options(
    user: CurrentUser,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    del user
    return await service.filter_options(session, scope=scope)
